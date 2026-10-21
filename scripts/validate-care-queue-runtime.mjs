import 'dotenv/config'
import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PrismaClient } from '@prisma/client'
import { assertLocalGraphqlEndpoint, assertSafeRuntimeDatabase, beginDisposableCleanup, endDisposableCleanup } from './lib/runtime-guard.mjs'

const endpoint = process.env.OPENFRONT_GRAPHQL_URL
const databaseUrl = process.env.DATABASE_URL
const credentialsPath = process.env.OPENFRONT_RUNTIME_ADMIN_PATH
if (!credentialsPath) throw new Error('OPENFRONT_RUNTIME_ADMIN_PATH is required')
assertLocalGraphqlEndpoint(endpoint, 'care queue proof')
assertSafeRuntimeDatabase(databaseUrl, 'care queue proof')

const prisma = new PrismaClient()
const runId = randomUUID().replaceAll('-', '').slice(0, 12)
const prefix = `runtime-queue-${runId}`
const created = {
  patientIds: [],
  appointmentIds: [],
  encounterIds: [],
  ticketIds: [],
  outboxIds: [],
  auditIds: [],
}

async function raw(query, variables = {}, cookie) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`GraphQL HTTP ${response.status}`)
  return response.json()
}
function errors(payload) {
  return payload.errors?.flatMap(error => [error.message, error.extensions?.originalError?.message]).filter(Boolean).join('; ') || ''
}
async function gql(name, query, variables = {}, cookie) {
  const payload = await raw(query, variables, cookie)
  if (payload.errors?.length) throw new Error(`${name}: ${errors(payload)}`)
  return payload.data
}
async function denied(name, query, variables, cookie, expected) {
  const payload = await raw(query, variables, cookie)
  const errorText = errors(payload)
  const productionMasked = process.env.NODE_ENV === 'production' && errorText.includes('Unexpected error')
  if (!payload.errors?.length || (expected && !productionMasked && !errorText.includes(expected))) {
    throw new Error(`${name} was not denied: ${errorText || JSON.stringify(payload)}`)
  }
}
async function authenticate() {
  const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'))
  const data = await gql(
    'authenticate',
    'mutation($email:String!,$password:String!){authenticateUserWithPassword(email:$email,password:$password){... on UserAuthenticationWithPasswordSuccess{sessionToken}}}',
    { email: credentials.email || credentials.identity, password: credentials.password },
  )
  const token = data.authenticateUserWithPassword?.sessionToken
  if (!token) throw new Error('Runtime admin authentication failed')
  return `keystonejs-session=${token}`
}

const arriveMutation = 'mutation($id:ID!,$key:String!,$reason:String){arriveAppointment(appointmentId:$id,idempotencyKey:$key,reasonCode:$reason){id status reasonCode transitionVersion replayed}}'
const directCheckInMutation = 'mutation($key:String!,$id:ID!,$version:Int!){transitionAppointment(operationKey:$key,appointmentId:$id,toStatus:"checked_in",expectedVersion:$version){id status}}'
const moveMutation = 'mutation($key:String!,$id:ID!,$status:String!,$version:Int!,$encounterId:ID){transitionCareQueue(operationKey:$key,ticketId:$id,toStatus:$status,expectedVersion:$version,encounterId:$encounterId){id status transitionVersion}}'

async function snapshot() {
  return {
    patients: await prisma.patient.count(),
    appointments: await prisma.appointment.count(),
    encounters: await prisma.encounter.count(),
    tickets: await prisma.careQueueTicket.count(),
    outbox: await prisma.clinicalOutboxEvent.count(),
    audits: await prisma.clinicalAuditLog.count(),
  }
}

let baseline
try {
  baseline = await snapshot()
  const cookie = await authenticate()
  const facility = await prisma.facility.findFirst({ where: { status: 'active' } })
  const provider = await prisma.provider.findFirst({ where: { status: 'active', facilities: { some: { id: facility?.id } } } })
  const appointmentType = await prisma.appointmentType.findFirst({ where: { status: 'bookable', providers: { some: { id: provider?.id } } } })
  if (!facility || !provider || !appointmentType) throw new Error('Canonical scheduling references missing')

  const [patient, otherPatient] = await Promise.all([
    prisma.patient.create({ data: { firstName: 'Runtime', lastName: 'Queue', email: `${prefix}@example.test`, facilities: { connect: [{ id: facility.id }] } } }),
    prisma.patient.create({ data: { firstName: 'Runtime', lastName: 'Other Queue', email: `${prefix}-other@example.test`, facilities: { connect: [{ id: facility.id }] } } }),
  ])
  created.patientIds.push(patient.id, otherPatient.id)
  const [encounter, mismatchedEncounter] = await Promise.all([
    prisma.encounter.create({ data: { encounterNumber: `ENC-${prefix}`, status: 'in_progress', transitionVersion: 1, operationKeyHash: createHash('sha256').update(`${prefix}-encounter-key`).digest('hex'), requestHash: createHash('sha256').update(`${prefix}-encounter-request`).digest('hex'), actorReference: 'runtime-validator', patientId: patient.id, providerId: provider.id, facilityId: facility.id, startedAt: new Date() } }),
    prisma.encounter.create({ data: { encounterNumber: `ENC-${prefix}-OTHER`, status: 'in_progress', transitionVersion: 1, operationKeyHash: createHash('sha256').update(`${prefix}-other-encounter-key`).digest('hex'), requestHash: createHash('sha256').update(`${prefix}-other-encounter-request`).digest('hex'), actorReference: 'runtime-validator', patientId: otherPatient.id, providerId: provider.id, facilityId: facility.id, startedAt: new Date() } }),
  ])
  created.encounterIds.push(encounter.id, mismatchedEncounter.id)

  const makeAppointment = async suffix => {
    const startsAt = new Date(Date.now() + 86_400_000 + created.appointmentIds.length * 3_600_000)
    const appointment = await prisma.appointment.create({
      data: {
        appointmentNumber: `APT-${prefix}-${suffix}`,
        bookingLockKey: `${prefix}-${suffix}`,
        status: 'confirmed',
        patientId: patient.id,
        providerId: provider.id,
        facilityId: facility.id,
        appointmentTypeId: appointmentType.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + appointmentType.durationMinutes * 60_000),
      },
    })
    created.appointmentIds.push(appointment.id)
    return appointment
  }

  const appointment = await makeAppointment('race')
  const idempotencyKey = `${prefix}-idempotency-arrival`
  const arrivals = await Promise.all([
    raw(arriveMutation, { id: appointment.id, key: idempotencyKey, reason: ' Scheduled Visit ' }, cookie),
    raw(arriveMutation, { id: appointment.id, key: idempotencyKey, reason: ' Scheduled Visit ' }, cookie),
  ])
  if (
    arrivals.some(payload => payload.errors?.length) ||
    new Set(arrivals.map(payload => payload.data.arriveAppointment.id)).size !== 1 ||
    arrivals.filter(payload => payload.data.arriveAppointment.replayed).length !== 1
  ) {
    throw new Error(`Arrival replay/concurrency failed: ${JSON.stringify(arrivals)}`)
  }
  const ticket = arrivals[0].data.arriveAppointment
  created.ticketIds.push(ticket.id)
  if (ticket.reasonCode !== 'scheduled_visit') throw new Error('Arrival reason normalization did not persist')
  const checkedInAppointment = await prisma.appointment.findUnique({ where: { id: appointment.id }, select: { status: true, transitionVersion: true, checkInAt: true } })
  if (checkedInAppointment?.status !== 'checked_in' || checkedInAppointment.transitionVersion !== 2 || !checkedInAppointment.checkInAt) throw new Error('Atomic arrival did not transition the appointment exactly once')
  await denied('direct appointment check-in bypass', directCheckInMutation, { key: `${prefix}-direct-checkin`, id: appointment.id, version: 2 }, cookie, 'atomic care-queue arrival')
  await denied('different arrival operation identity', arriveMutation, { id: appointment.id, key: `${prefix}-different-arrival-operation`, reason: 'scheduled_visit' }, cookie, 'different arrival operation')

  const calledTransitions = await Promise.all([
    raw(moveMutation, { key: `${prefix}-called-a`, id: ticket.id, status: 'called', version: 1 }, cookie),
    raw(moveMutation, { key: `${prefix}-called-b`, id: ticket.id, status: 'called', version: 1 }, cookie),
  ])
  if (calledTransitions.filter(payload => !payload.errors?.length).length !== 1 || calledTransitions.filter(payload => payload.errors?.length).length !== 1) {
    throw new Error('Queue call concurrency was not exactly once')
  }

  await denied(
    'cross-patient encounter handoff',
    moveMutation,
    { key: `${prefix}-cross-patient-handoff`, id: ticket.id, status: 'in_care', version: 2, encounterId: mismatchedEncounter.id },
    cookie,
    'queue patient and facility',
  )
  const unchangedAfterMismatch = await prisma.careQueueTicket.findUnique({ where: { id: ticket.id } })
  if (unchangedAfterMismatch?.status !== 'called' || unchangedAfterMismatch.transitionVersion !== 2 || unchangedAfterMismatch.encounterId) {
    throw new Error('Rejected encounter handoff changed the queue ticket')
  }

  const inCare = await gql('valid encounter handoff', moveMutation, { key: `${prefix}-valid-handoff`, id: ticket.id, status: 'in_care', version: 2, encounterId: encounter.id }, cookie)
  if (inCare.transitionCareQueue.status !== 'in_care' || inCare.transitionCareQueue.transitionVersion !== 3) {
    throw new Error('Queue handoff did not enter care')
  }
  const completions = await Promise.all([
    raw(moveMutation, { key: `${prefix}-completed-a`, id: ticket.id, status: 'completed', version: 3 }, cookie),
    raw(moveMutation, { key: `${prefix}-completed-b`, id: ticket.id, status: 'completed', version: 3 }, cookie),
  ])
  if (completions.filter(payload => !payload.errors?.length).length !== 1 || completions.filter(payload => payload.errors?.length).length !== 1) {
    throw new Error('Queue completion concurrency was not exactly once')
  }

  const reconciliationAppointment = await makeAppointment('reconcile')
  await prisma.appointment.update({ where: { id: reconciliationAppointment.id }, data: { status: 'checked_in', transitionVersion: 2, checkInAt: new Date(Date.now() - 60_000) } })
  const reconciliationKey = `${prefix}-arrival-reconciliation`
  const reconciled = await gql('repair checked-in appointment queue handoff', arriveMutation, { id: reconciliationAppointment.id, key: reconciliationKey, reason: 'scheduled_visit' }, cookie)
  const repairedTicket = reconciled.arriveAppointment
  created.ticketIds.push(repairedTicket.id)
  const replayedRepair = await gql('replay repaired queue handoff', arriveMutation, { id: reconciliationAppointment.id, key: reconciliationKey, reason: 'scheduled_visit' }, cookie)
  if (repairedTicket.status !== 'waiting' || repairedTicket.replayed || replayedRepair.arriveAppointment.id !== repairedTicket.id || !replayedRepair.arriveAppointment.replayed) throw new Error('Checked-in appointment reconciliation did not create/replay one queue ticket')
  const repairedAppointment = await prisma.appointment.findUnique({ where: { id: reconciliationAppointment.id }, select: { status: true, transitionVersion: true, checkInAt: true } })
  const repairAudit = await prisma.clinicalAuditLog.findFirst({ where: { appointmentId: reconciliationAppointment.id, eventType: 'appointment.arrival_reconciled' } })
  const repairOutbox = await prisma.clinicalOutboxEvent.findFirst({ where: { appointmentId: reconciliationAppointment.id, eventType: 'appointment.arrival_reconciled' } })
  if (repairedAppointment?.status !== 'checked_in' || repairedAppointment.transitionVersion !== 3 || !repairedAppointment.checkInAt || !repairAudit || !repairOutbox) throw new Error('Checked-in queue handoff repair lacks transition or audit/outbox evidence')

  const failedAppointment = await makeAppointment('rollback')
  const failed = await raw(arriveMutation, { id: failedAppointment.id, key: `${prefix}-idempotency-rollback`, reason: 'x'.repeat(100) }, cookie)
  if (!failed.errors?.length) throw new Error('Invalid hook input did not fail')
  const rolledBack = await prisma.appointment.findUnique({ where: { id: failedAppointment.id } })
  if (rolledBack?.status !== 'confirmed' || await prisma.careQueueTicket.count({ where: { appointmentId: failedAppointment.id } }) !== 0) {
    throw new Error('Hook failure did not roll back appointment and ticket')
  }

  const queueEvents = await prisma.clinicalOutboxEvent.findMany({ where: { aggregateId: ticket.id } })
  const queueAudits = (await prisma.clinicalAuditLog.findMany({ where: { patientId: patient.id, eventType: { startsWith: 'queue.' } } })).filter(row => row.metadata?.aggregateId === ticket.id)
  created.outboxIds.push(...queueEvents.map(row => row.id))
  created.auditIds.push(...queueAudits.map(row => row.id))
  if (queueEvents.length !== 4 || queueAudits.length !== 4) {
    throw new Error(`Expected arrival/called/in-care/completed audit and outbox pairs, got ${queueAudits.length}/${queueEvents.length}`)
  }

  const dispatched = await gql('inspect internal outbox', 'mutation{dispatchClinicalOutbox(limit:10){claimed delivered}}', {}, cookie)
  if (
    dispatched.dispatchClinicalOutbox.claimed !== 0 || dispatched.dispatchClinicalOutbox.delivered !== 0 ||
    await prisma.clinicalOutboxEvent.count({ where: { id: { in: queueEvents.map(row => row.id) }, deliveryMode: 'internal', status: 'recorded' } }) !== 4
  ) {
    throw new Error('Internal queue events were mislabeled as transport deliveries')
  }

  const anonymous = await gql('anonymous boundary', 'query{careQueueTickets{id} clinicalOutboxEvents{id}}')
  if (anonymous.careQueueTickets.length || anonymous.clinicalOutboxEvents.length) throw new Error('Anonymous queue/outbox rows leaked')
  for (const operation of ['createCareQueueTicket', 'updateCareQueueTicket', 'deleteCareQueueTicket', 'createClinicalOutboxEvent', 'updateClinicalOutboxEvent', 'deleteClinicalOutboxEvent']) {
    await denied(operation, `mutation{${operation}(data:{}){id}}`, {}, cookie)
  }

  console.log(JSON.stringify({
    result: 'hooked-care-queue-passed',
    arrivalReplay: true,
    transitionConcurrency: true,
    patientEncounterHandoff: true,
    crossPatientEncounterDenied: true,
    hookFailureRollback: true,
    checkedInHandoffReconciliation: true,
    auditOutboxPairs: 4,
    internalEventLedgerRecordedWithoutFakeDelivery: true,
    anonymousPhiDenied: true,
    rawQueueMutationsOmitted: true,
  }))
} finally {
  const triggerBypass = await beginDisposableCleanup(prisma)
  try {
    await prisma.clinicalOutboxEvent.deleteMany({ where: { OR: [{ id: { in: created.outboxIds } }, { patientId: { in: created.patientIds } }] } })
    await prisma.careQueueTicket.deleteMany({ where: { id: { in: created.ticketIds } } })
    await prisma.clinicalAuditLog.deleteMany({ where: { OR: [{ id: { in: created.auditIds } }, { patientId: { in: created.patientIds }, eventType: { startsWith: 'queue.' } }] } })
    await prisma.appointment.deleteMany({ where: { id: { in: created.appointmentIds } } })
    await prisma.encounter.deleteMany({ where: { id: { in: created.encounterIds } } })
    await prisma.patient.deleteMany({ where: { id: { in: created.patientIds } } })
  } finally {
    await endDisposableCleanup(prisma, triggerBypass)
    const final = await snapshot()
    await prisma.$disconnect()
    if (baseline && JSON.stringify(final) !== JSON.stringify(baseline)) {
      throw new Error(`Care queue cleanup mismatch ${JSON.stringify({ baseline, final })}`)
    }
    console.log('Disposable care queue cleanup passed; canonical counts restored.')
  }
}

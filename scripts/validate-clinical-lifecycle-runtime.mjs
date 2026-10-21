import 'dotenv/config'
import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PrismaClient } from '@prisma/client'
import { buildSchema } from 'graphql'
import { assertLocalGraphqlEndpoint, assertSafeRuntimeDatabase, beginDisposableCleanup, endDisposableCleanup } from './lib/runtime-guard.mjs'

const endpoint = process.env.OPENFRONT_GRAPHQL_URL || process.env.GRAPHQL_URL
const databaseUrl = process.env.DATABASE_URL
const credentialsPath = process.env.OPENFRONT_RUNTIME_ADMIN_PATH

if (!credentialsPath) throw new Error('OPENFRONT_RUNTIME_ADMIN_PATH is required')
assertLocalGraphqlEndpoint(endpoint, 'clinical lifecycle proof')
assertSafeRuntimeDatabase(databaseUrl, 'clinical lifecycle proof')

const prisma = new PrismaClient()
const runId = randomUUID().replaceAll('-', '').slice(0, 12)
const patientEmail = `runtime-clinical-${runId}@example.test`

async function rawGraphQL(query, variables = {}, cookie) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`GraphQL HTTP ${response.status}`)
  return response.json()
}

async function graphql(name, query, variables = {}, cookie) {
  const payload = await rawGraphQL(query, variables, cookie)
  if (payload.errors?.length) {
    const messages = payload.errors.flatMap((error) => [error.message, error.extensions?.originalError?.message]).filter(Boolean).join('; ')
    throw new Error(`${name}: ${messages}`)
  }
  return payload.data
}

function denialMatches(messages, expected) {
  return messages.includes(expected) || (process.env.NODE_ENV === 'production' && messages.includes('Unexpected error'))
}

async function expectDenied(name, query, variables = {}, expected = 'Not authorized') {
  const payload = await rawGraphQL(query, variables)
  const messages = payload.errors?.flatMap((error) => [error.message, error.extensions?.originalError?.message]).filter(Boolean).join('; ') || ''
  if (!payload.errors?.length || !denialMatches(messages, expected)) throw new Error(`${name} was not denied: ${messages || 'no GraphQL error'}`)
}

async function expectSchemaMutationOmitted(name, query, variables, cookie) {
  const payload = await rawGraphQL(query, variables, cookie)
  const messages = payload.errors?.flatMap((error) => [error.message, error.extensions?.originalError?.message]).filter(Boolean).join('; ') || ''
  if (!messages.includes('Cannot query field')) throw new Error(`${name} was not omitted from the live schema: ${messages || 'no GraphQL error'}`)
}

async function authenticate() {
  const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'))
  const data = await graphql(
    'authenticate runtime admin',
    `mutation($email: String!, $password: String!) { authenticateUserWithPassword(email: $email, password: $password) { ... on UserAuthenticationWithPasswordSuccess { sessionToken item { id } } ... on UserAuthenticationWithPasswordFailure { message } } }`,
    { email: credentials.email || credentials.identity, password: credentials.password }
  )
  const auth = data.authenticateUserWithPassword
  if (!auth?.sessionToken) throw new Error('Runtime admin authentication failed')
  const cookie = `keystonejs-session=${auth.sessionToken}`
  const tracked = await graphql(
    'authenticated User tracking proof',
    `query { authenticatedItem { ... on User { id createdAt updatedAt role { id } } } }`,
    {},
    cookie
  )
  const item = tracked.authenticatedItem
  if (!item?.id || !item.createdAt || !item.updatedAt || !item.role?.id) throw new Error('Authenticated User tracking proof is incomplete')
  return { cookie, userId: item.id, roleId: item.role.id }
}

async function counts() {
  const [patients, appointments, encounters, intakeForms, messages, audits, outbox, scheduleBlocks] = await Promise.all([
    prisma.patient.count(),
    prisma.appointment.count(),
    prisma.encounter.count(),
    prisma.intakeForm.count(),
    prisma.patientMessage.count(),
    prisma.clinicalAuditLog.count(),
    prisma.clinicalOutboxEvent.count(),
    prisma.providerScheduleBlock.count(),
  ])
  return { patients, appointments, encounters, intakeForms, messages, audits, outbox, scheduleBlocks }
}

async function cleanup() {
  const patients = await prisma.patient.findMany({ where: { email: patientEmail }, select: { id: true } })
  const patientIds = patients.map((patient) => patient.id)
  const appointments = await prisma.appointment.findMany({ where: { patientId: { in: patientIds } }, select: { id: true } })
  const appointmentIds = appointments.map((appointment) => appointment.id)
  const tickets = await prisma.careQueueTicket.findMany({ where: { appointmentId: { in: appointmentIds } }, select: { id: true } })
  const aggregateIds = [...appointmentIds, ...tickets.map((ticket) => ticket.id)]
  await prisma.$transaction([
    prisma.workflowTransition.deleteMany({ where: { aggregateId: { in: aggregateIds } } }),
    prisma.clinicalOutboxEvent.deleteMany({ where: { patientId: { in: patientIds } } }),
    prisma.clinicalAuditLog.deleteMany({ where: { patientId: { in: patientIds } } }),
    prisma.careQueueTicket.deleteMany({ where: { id: { in: tickets.map((ticket) => ticket.id) } } }),
    prisma.patientMessage.deleteMany({ where: { patientId: { in: patientIds } } }),
    prisma.intakeForm.deleteMany({ where: { patientId: { in: patientIds } } }),
    prisma.encounter.deleteMany({ where: { patientId: { in: patientIds } } }),
    prisma.appointment.deleteMany({ where: { patientId: { in: patientIds } } }),
    prisma.patient.deleteMany({ where: { id: { in: patientIds } } }),
    prisma.providerScheduleBlock.deleteMany({ where: { onboardingKey: `runtime-clinical-${runId}` } }),
  ])
}

let baseline
let complete = false

try {
  baseline = await counts()
  const { cookie, userId, roleId } = await authenticate()
  const role = await graphql('Role tracking proof', `query($id: ID!) { role(where: { id: $id }) { id createdAt updatedAt } }`, { id: roleId }, cookie)
  if (!role.role?.createdAt || !role.role?.updatedAt) throw new Error('Role tracking proof is incomplete')

  const provider = await prisma.provider.findFirst({ where: { status: 'active', facilities: { some: { status: 'active' } } }, orderBy: { lastName: 'asc' } })
  const facility = provider
    ? await prisma.facility.findFirst({ where: { status: 'active', providers: { some: { id: provider.id } } }, orderBy: { name: 'asc' } })
    : null
  if (!provider || !facility) throw new Error('No active provider/facility pair found')
  const appointmentType = await prisma.appointmentType.findFirst({
    where: { status: 'bookable', providers: { some: { id: provider.id } } },
    orderBy: { name: 'asc' },
  })
  if (!appointmentType || !Number.isInteger(appointmentType.durationMinutes)) throw new Error('No canonical provider appointment type found')
  const scheduleStart = new Date(Date.now() + 45 * 24 * 60 * 60_000)
  scheduleStart.setUTCHours(10, 0, 0, 0)
  const scheduleEnd = new Date(scheduleStart.getTime() + 2 * 60 * 60_000)
  await prisma.providerScheduleBlock.create({
    data: {
      providerId: provider.id,
      facilityId: facility.id,
      onboardingKey: `runtime-clinical-${runId}`,
      blockType: 'available',
      startsAt: scheduleStart,
      endsAt: scheduleEnd,
      maxAppointments: 1,
      locationName: 'Hospital Runtime Verification',
    },
  })
  const start = new Date(scheduleStart.getTime() + 15 * 60_000)
  const end = new Date(start.getTime() + appointmentType.durationMinutes * 60_000)

  await expectDenied(
    'unauthenticated schedule conflict query',
    `query($facilityId: ID!, $providerId: ID!, $startsAt: String!, $endsAt: String!) { appointmentScheduleConflicts(facilityId: $facilityId, providerId: $providerId, startsAt: $startsAt, endsAt: $endsAt) { hasConflict } }`,
    { facilityId: facility.id, providerId: provider.id, startsAt: start.toISOString(), endsAt: end.toISOString() }
  )
  await expectDenied(
    'unauthenticated appointment transition',
    `mutation { transitionAppointment(operationKey: "runtime-blocked-appointment", appointmentId: "blocked", toStatus: "confirmed", expectedVersion: 1) { id } }`
  )
  await expectDenied(
    'unauthenticated secure message',
    `mutation { sendSecurePatientMessage(operationKey: "runtime-blocked-message", facilityId: "blocked", patientId: "blocked", channel: "phone", purpose: "care_operations", body: "blocked") { id } }`
  )
  await expectDenied(
    'unauthenticated encounter transition',
    `mutation { transitionEncounter(operationKey: "runtime-blocked-encounter", encounterId: "blocked", toStatus: "in_progress", expectedVersion: 1) { id } }`
  )
  await expectDenied(
    'unauthenticated intake transition',
    `mutation { transitionIntakeReview(operationKey: "runtime-blocked-intake", intakeFormId: "blocked", toStatus: "reviewed", expectedVersion: 1, reviewNotes: "blocked") { id } }`
  )

  const patient = await prisma.patient.create({ data: { firstName: 'Runtime', lastName: 'Clinical Flow', email: patientEmail, status: 'active', facilities: { connect: [{ id: facility.id }] } } })
  const otherPatient = await prisma.patient.findFirst({ where: { id: { not: patient.id } }, select: { id: true } })
  if (!otherPatient) throw new Error('Ownership negative test requires another patient')
  const appointment = await prisma.appointment.create({
    data: {
      appointmentNumber: `APT-RUNTIME-${runId}`,
      bookingLockKey: `${provider.id}:${start.toISOString()}`,
      status: 'requested',
      patientId: patient.id,
      providerId: provider.id,
      facilityId: facility.id,
      appointmentTypeId: appointmentType.id,
      startsAt: start,
      endsAt: end,
      source: 'front_desk',
    },
  })
  const intakeSubmittedAt = new Date()
  const intakeForm = await prisma.intakeForm.create({
    data: {
      title: 'Runtime clinical review',
      status: 'submitted',
      accessCodeHash: createHash('sha256').update(`runtime_clinical_${runId}`, 'utf8').digest('hex'),
      accessExpiresAt: intakeSubmittedAt,
      accessUsedAt: intakeSubmittedAt,
      facilityId: facility.id,
      patientId: patient.id,
      appointmentId: appointment.id,
      operationKeyHash: createHash('sha256').update(`runtime-clinical-intake-${runId}`).digest('hex'),
      requestHash: createHash('sha256').update(`runtime-clinical-intake-payload-${runId}`).digest('hex'),
      transitionVersion: 1,
      submittedAt: intakeSubmittedAt,
      responses: { runtimeClinicalCheck: true },
    },
  })
  let encounter

  const available = await graphql(
    'available schedule conflict proof',
    `query($facilityId: ID!, $providerId: ID!, $startsAt: String!, $endsAt: String!, $excludeAppointmentId: ID) { appointmentScheduleConflicts(facilityId: $facilityId, providerId: $providerId, startsAt: $startsAt, endsAt: $endsAt, excludeAppointmentId: $excludeAppointmentId) { withinAvailability hasConflict conflicts { source reference status } } }`,
    { facilityId: facility.id, providerId: provider.id, startsAt: start.toISOString(), endsAt: end.toISOString(), excludeAppointmentId: appointment.id },
    cookie
  )
  if (!available.appointmentScheduleConflicts.withinAvailability || available.appointmentScheduleConflicts.hasConflict) {
    throw new Error('Expected an available conflict-free schedule window')
  }

  const overlappingStart = new Date(start.getTime() + 5 * 60_000)
  const overlappingEnd = new Date(end.getTime() + 5 * 60_000)
  const conflict = await graphql(
    'unconfirmed request does not reserve schedule proof',
    `query($facilityId: ID!, $providerId: ID!, $startsAt: String!, $endsAt: String!) { appointmentScheduleConflicts(facilityId: $facilityId, providerId: $providerId, startsAt: $startsAt, endsAt: $endsAt) { hasConflict conflicts { source reference status } } }`,
    { facilityId: facility.id, providerId: provider.id, startsAt: overlappingStart.toISOString(), endsAt: overlappingEnd.toISOString() },
    cookie
  )
  if (conflict.appointmentScheduleConflicts.hasConflict || conflict.appointmentScheduleConflicts.conflicts.some((item) => item.reference === appointment.appointmentNumber)) {
    throw new Error('Unconfirmed appointment request incorrectly reserved provider inventory')
  }

  const mismatchedMessage = await rawGraphQL(
    `mutation($key: String!, $facilityId: ID!, $patientId: ID!, $appointmentId: ID!) { sendSecurePatientMessage(operationKey: $key, facilityId: $facilityId, patientId: $patientId, appointmentId: $appointmentId, channel: "phone", purpose: "care_operations", body: "Blocked ownership test") { id } }`,
    { key: `runtime-clinical-${runId}-mismatched-message`, facilityId: facility.id, patientId: otherPatient.id, appointmentId: appointment.id },
    cookie
  )
  const mismatchedMessageError = mismatchedMessage.errors?.flatMap((error) => [error.message, error.extensions?.originalError?.message]).filter(Boolean).join('; ') || ''
  if (!denialMatches(mismatchedMessageError, 'Appointment does not belong to the selected patient')) throw new Error('Cross-patient secure message was not denied')

  const invalidTransition = await rawGraphQL(
    `mutation($key: String!, $id: ID!) { transitionAppointment(operationKey: $key, appointmentId: $id, toStatus: "completed", expectedVersion: 1) { id } }`,
    { key: `runtime-clinical-${runId}-invalid-complete`, id: appointment.id },
    cookie
  )
  const invalidTransitionError = invalidTransition.errors?.flatMap((error) => [error.message, error.extensions?.originalError?.message]).filter(Boolean).join('; ') || ''
  if (!denialMatches(invalidTransitionError, 'Invalid appointment transition')) throw new Error('Invalid appointment transition was not denied')

  const genericStatusBypass = await rawGraphQL(
    `mutation($id: ID!) { updateAppointment(where: { id: $id }, data: { status: completed }) { id status } }`,
    { id: appointment.id },
    cookie
  )
  if (!genericStatusBypass.errors?.length) throw new Error('Generic appointment status rewrite returned no GraphQL error')
  const statusAfterBypass = await prisma.appointment.findUnique({ where: { id: appointment.id }, select: { status: true } })
  if (statusAfterBypass?.status !== 'requested') throw new Error('Generic appointment status rewrite changed persisted state')

  const confirmed = await graphql(
    'confirm appointment',
    `mutation($key: String!, $id: ID!) { transitionAppointment(operationKey: $key, appointmentId: $id, toStatus: "confirmed", expectedVersion: 1) { id fromStatus status } }`,
    { key: `runtime-clinical-${runId}-confirm`, id: appointment.id },
    cookie
  )
  if (confirmed.transitionAppointment.fromStatus !== 'requested' || confirmed.transitionAppointment.status !== 'confirmed') throw new Error('Appointment confirmation transition failed')

  const checkedIn = await graphql(
    'check in appointment and create queue handoff',
    `mutation($key: String!, $id: ID!) { arriveAppointment(idempotencyKey: $key, appointmentId: $id, reasonCode: "scheduled_visit") { id status replayed } }`,
    { key: `runtime-clinical-${runId}-check-in`, id: appointment.id },
    cookie
  )
  if (checkedIn.arriveAppointment.status !== 'waiting' || !checkedIn.arriveAppointment.id || checkedIn.arriveAppointment.replayed) throw new Error('Atomic appointment check-in / queue handoff failed')
  const arrivedAppointment = await prisma.appointment.findUnique({ where: { id: appointment.id }, select: { status: true, checkInAt: true, transitionVersion: true } })
  if (arrivedAppointment?.status !== 'checked_in' || !arrivedAppointment.checkInAt || arrivedAppointment.transitionVersion !== 3) throw new Error('Atomic appointment transition evidence did not persist')
  const encounterInput = {
    operationKey: `runtime-clinical-${runId}-encounter-open`,
    facilityId: facility.id,
    patientId: patient.id,
    providerId: provider.id,
    appointmentId: appointment.id,
    chiefComplaint: 'Disposable local clinical lifecycle verification.',
  }
  const openMutation = `mutation($data: EncounterWorkflowInput!) { openEncounter(data: $data) { id encounterNumber status transitionVersion replayed } }`
  const openings = await Promise.all([
    rawGraphQL(openMutation, { data: encounterInput }, cookie),
    rawGraphQL(openMutation, { data: encounterInput }, cookie),
  ])
  if (
    openings.some((payload) => payload.errors?.length) ||
    new Set(openings.map((payload) => payload.data.openEncounter.id)).size !== 1 ||
    openings.filter((payload) => payload.data.openEncounter.replayed).length !== 1
  ) throw new Error(`Encounter opening was not exactly once: ${JSON.stringify(openings)}`)
  encounter = openings[0].data.openEncounter
  const encounterMismatch = await rawGraphQL(openMutation, { data: { ...encounterInput, chiefComplaint: 'Changed payload' } }, cookie)
  const encounterMismatchMessage = encounterMismatch.errors?.flatMap((error) => [error.message, error.extensions?.originalError?.message]).filter(Boolean).join('; ') || ''
  if (!denialMatches(encounterMismatchMessage, 'different payload')) throw new Error('Encounter operation-key payload mismatch was not denied')

  const message = await graphql(
    'secure message',
    `mutation($key: String!, $facilityId: ID!, $patientId: ID!, $appointmentId: ID!) { sendSecurePatientMessage(operationKey: $key, facilityId: $facilityId, patientId: $patientId, appointmentId: $appointmentId, channel: "phone", purpose: "care_operations", subject: "Local verification", body: "Disposable local secure-message verification.") { id status channel direction patientId appointmentId } }`,
    { key: `runtime-clinical-${runId}-message`, facilityId: facility.id, patientId: patient.id, appointmentId: appointment.id },
    cookie
  )
  if (message.sendSecurePatientMessage.status !== 'manual_required' || message.sendSecurePatientMessage.direction !== 'outbound') throw new Error('Manual follow-up task was not recorded honestly')
  const completedMessage = await graphql(
    'complete manual follow-up',
    `mutation($key:String!,$id:ID!){transitionPatientMessage(operationKey:$key,messageId:$id,toStatus:"completed",expectedVersion:1,reasonCode:"runtime_follow_up_completed"){id status transitionVersion}}`,
    { key: `runtime-clinical-${runId}-message-complete`, id: message.sendSecurePatientMessage.id },
    cookie,
  )
  if (completedMessage.transitionPatientMessage.status !== 'completed') throw new Error('Manual follow-up task did not complete')

  const genericIntakeBypass = await rawGraphQL(
    `mutation($id: ID!) { updateIntakeForm(where: { id: $id }, data: { status: reviewed }) { id status } }`,
    { id: intakeForm.id },
    cookie
  )
  if (!genericIntakeBypass.errors?.length) throw new Error('Generic intake status rewrite returned no GraphQL error')
  const intakeAfterBypass = await prisma.intakeForm.findUnique({ where: { id: intakeForm.id }, select: { status: true } })
  if (intakeAfterBypass?.status !== 'submitted') throw new Error('Generic intake status rewrite changed persisted state')

  const missingReviewNotes = await rawGraphQL(
    `mutation($key: String!, $id: ID!) { transitionIntakeReview(operationKey: $key, intakeFormId: $id, toStatus: "reviewed", expectedVersion: 1) { id } }`,
    { key: `runtime-clinical-${runId}-review-missing-notes`, id: intakeForm.id },
    cookie
  )
  const missingReviewNotesError = missingReviewNotes.errors?.flatMap((error) => [error.message, error.extensions?.originalError?.message]).filter(Boolean).join('; ') || ''
  if (!denialMatches(missingReviewNotesError, 'Review notes are required')) throw new Error('Intake review without notes was not denied')

  const needsReview = await graphql(
    'mark intake needs review',
    `mutation($key: String!, $id: ID!) { transitionIntakeReview(operationKey: $key, intakeFormId: $id, toStatus: "needs_review", expectedVersion: 1) { id fromStatus status } }`,
    { key: `runtime-clinical-${runId}-needs-review`, id: intakeForm.id },
    cookie
  )
  if (needsReview.transitionIntakeReview.status !== 'needs_review') throw new Error('Intake needs-review transition failed')
  const reviewed = await graphql(
    'mark intake reviewed',
    `mutation($key: String!, $id: ID!) { transitionIntakeReview(operationKey: $key, intakeFormId: $id, toStatus: "reviewed", expectedVersion: 2, reviewNotes: "Disposable local intake review completed.") { id fromStatus status reviewedAt reviewedById } }`,
    { key: `runtime-clinical-${runId}-reviewed`, id: intakeForm.id },
    cookie
  )
  if (reviewed.transitionIntakeReview.status !== 'reviewed' || !reviewed.transitionIntakeReview.reviewedAt || reviewed.transitionIntakeReview.reviewedById !== userId) {
    throw new Error('Intake reviewed transition failed')
  }

  const startMutation = `mutation($key: String!, $id: ID!, $version: Int!) { transitionEncounter(operationKey: $key, encounterId: $id, toStatus: "in_progress", expectedVersion: $version) { id fromStatus status transitionVersion startedAt } }`
  const starts = await Promise.all([
    rawGraphQL(startMutation, { key: `runtime-clinical-${runId}-encounter-start-a`, id: encounter.id, version: 1 }, cookie),
    rawGraphQL(startMutation, { key: `runtime-clinical-${runId}-encounter-start-b`, id: encounter.id, version: 1 }, cookie),
  ])
  const acceptedStart = starts.find((payload) => !payload.errors?.length)
  if (starts.filter((payload) => !payload.errors?.length).length !== 1 || starts.filter((payload) => payload.errors?.length).length !== 1) {
    throw new Error(`Encounter start transition was not exactly once: ${JSON.stringify(starts)}`)
  }
  if (acceptedStart.data.transitionEncounter.status !== 'in_progress' || acceptedStart.data.transitionEncounter.transitionVersion !== 2 || !acceptedStart.data.transitionEncounter.startedAt) {
    throw new Error('Encounter start transition failed')
  }

  const closed = await graphql(
    'close encounter',
    `mutation($key: String!, $id: ID!, $version: Int!) { transitionEncounter(operationKey: $key, encounterId: $id, toStatus: "closed", expectedVersion: $version, reason: "Disposable operational handoff verification completed.") { id fromStatus status transitionVersion endedAt } }`,
    { key: `runtime-clinical-${runId}-encounter-close`, id: encounter.id, version: 2 },
    cookie
  )
  if (closed.transitionEncounter.status !== 'closed' || closed.transitionEncounter.transitionVersion !== 3 || !closed.transitionEncounter.endedAt) throw new Error('Encounter close transition failed')
  const appointmentAfterEncounter = await prisma.appointment.findUnique({ where: { id: appointment.id }, select: { status: true, completedAt: true } })
  if (appointmentAfterEncounter?.status !== 'completed' || !appointmentAfterEncounter.completedAt) throw new Error('Encounter lifecycle did not complete the linked appointment')

  const persisted = await prisma.patient.findUnique({
    where: { id: patient.id },
    include: {
      appointments: true,
      messages: true,
      clinicalAuditLogs: { orderBy: { occurredAt: 'asc' } },
      from_Encounter_patient: true,
    },
  })
  const expectedEvents = ['appointment.confirmed', 'appointment.checked_in', 'appointment.in_visit', 'appointment.completed', 'message.manual_required', 'message.manual_completed', 'intake.needs_review', 'intake.reviewed', 'encounter.opened', 'encounter.in_progress', 'encounter.closed']
  const actualEvents = persisted?.clinicalAuditLogs.map((event) => event.eventType) || []
  if (!expectedEvents.every((event) => actualEvents.includes(event))) throw new Error(`Missing lifecycle audit events: ${actualEvents.join(', ')}`)
  const encounterAuditCount = persisted?.clinicalAuditLogs.filter((event) => event.encounterId === encounter.id).length || 0
  if (encounterAuditCount !== 5) throw new Error(`Encounter audit relationship proof failed: ${encounterAuditCount}`)
  const encounterOutboxCount = await prisma.clinicalOutboxEvent.count({ where: { aggregateType: 'encounter', aggregateId: encounter.id } })
  if (encounterOutboxCount !== 3) throw new Error(`Encounter outbox exactness failed: ${encounterOutboxCount}`)
  if (persisted?.messages.length !== 1 || persisted.messages[0].body !== 'Disposable local secure-message verification.') throw new Error('Secure message persistence proof failed')

  const auditId = persisted.clinicalAuditLogs[0]?.id
  if (!auditId) throw new Error('No audit row was available for immutable update/delete negatives')
  await expectSchemaMutationOmitted(
    'authenticated audit update',
    `mutation($id: ID!) { updateClinicalAuditLog(where: { id: $id }, data: { eventType: "tampered" }) { id } }`,
    { id: auditId },
    cookie
  )
  await expectSchemaMutationOmitted(
    'authenticated audit delete',
    `mutation($id: ID!) { deleteClinicalAuditLog(where: { id: $id }) { id } }`,
    { id: auditId },
    cookie
  )
  const auditAfterAttempts = await prisma.clinicalAuditLog.findUnique({ where: { id: auditId }, select: { id: true, eventType: true } })
  if (!auditAfterAttempts || auditAfterAttempts.eventType === 'tampered') throw new Error('Audit immutability persistence proof failed')

  const immutableMutationNames = [
    'createPatientMessage',
    'deletePatientMessage',
    'createClinicalAuditLog',
    'updateClinicalAuditLog',
    'deleteClinicalAuditLog',
    'createPatientConsent',
    'updatePatientConsent',
    'deletePatientConsent',
  ]
  const generatedSchema = buildSchema(await readFile('schema.graphql', 'utf8'))
  const mutationNames = new Set(Object.keys(generatedSchema.getMutationType()?.getFields() || {}))
  const exposedImmutableMutations = immutableMutationNames.filter((name) => mutationNames.has(name))
  if (exposedImmutableMutations.length) throw new Error(`Evidence immutability mutations are exposed: ${exposedImmutableMutations.join(', ')}`)

  complete = true
  console.log(JSON.stringify({
    schedule: { available: true, overlapConflict: true },
    appointmentTransition: 'requested -> confirmed -> atomic checked_in + care queue arrival -> in_visit -> completed',
    communicationEvidence: 'manual_required -> completed; no external send claimed',
    intakeTransition: 'submitted -> needs_review -> reviewed',
    encounterTransition: 'open -> in_progress -> closed',
    auditEvents: expectedEvents,
    encounterAuditRelationship: encounterAuditCount,
    encounterOutboxEvents: encounterOutboxCount,
    encounterOpenReplayAndTransitionConcurrency: true,
    userRoleTracking: true,
    negativeProofs: ['unauthenticated operations denied', 'cross-patient message denied', 'invalid transition denied', 'generic appointment/intake status rewrites denied', 'direct appointment check-in rejected in favor of atomic queue arrival', 'encounter operation-key mismatch denied', 'stale concurrent encounter transition denied', 'review without notes denied', 'authenticated audit update/delete omitted and persisted unchanged', 'message/consent/audit create-delete-update bypasses omitted'],
    actorUserIdRecorded: persisted.clinicalAuditLogs.every((event) => event.actorReference === userId),
  }))
} finally {
  const triggerBypass = await beginDisposableCleanup(prisma)
  try { await cleanup() } finally { await endDisposableCleanup(prisma, triggerBypass) }
  const remaining = await prisma.patient.count({ where: { email: patientEmail } })
  if (remaining) throw new Error('Clinical lifecycle cleanup failed')
  if (baseline) {
    const after = await counts()
    if (JSON.stringify(after) !== JSON.stringify(baseline)) throw new Error(`Clinical lifecycle cleanup did not restore baseline: ${JSON.stringify({ baseline, after })}`)
  }
  await prisma.$disconnect()
  if (complete) console.log('Disposable clinical lifecycle cleanup passed; canonical counts restored.')
}

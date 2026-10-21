import 'dotenv/config'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PrismaClient } from '@prisma/client'
import { assertLocalGraphqlEndpoint, assertSafeRuntimeDatabase, beginDisposableCleanup, endDisposableCleanup } from './lib/runtime-guard.mjs'

const endpoint = process.env.OPENFRONT_GRAPHQL_URL || process.env.GRAPHQL_URL
const databaseUrl = process.env.DATABASE_URL
const credentialsPath = process.env.OPENFRONT_RUNTIME_ADMIN_PATH

if (!credentialsPath) throw new Error('OPENFRONT_RUNTIME_ADMIN_PATH is required')
assertLocalGraphqlEndpoint(endpoint, 'scheduling proof')
assertSafeRuntimeDatabase(databaseUrl, 'scheduling proof')

const prisma = new PrismaClient()
const runId = randomUUID().replaceAll('-', '').slice(0, 12)
const prefix = `runtime-scheduling-${runId}`
const password = `RuntimeScheduling-${runId}-Password!`
const created = {
  roleIds: [],
  userIds: [],
  facilityIds: [],
  providerIds: [],
  appointmentTypeIds: [],
  patientIds: [],
  integrationIds: [],
}

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

function errorMessages(payload) {
  return payload.errors
    ?.flatMap((error) => [error.message, error.extensions?.originalError?.message])
    .filter(Boolean)
    .join('; ') || ''
}

async function graphql(name, query, variables = {}, cookie) {
  const payload = await rawGraphQL(query, variables, cookie)
  if (payload.errors?.length) throw new Error(`${name}: ${errorMessages(payload)}`)
  return payload.data
}

async function expectDenied(name, query, variables, cookie, expected) {
  const payload = await rawGraphQL(query, variables, cookie)
  const messages = errorMessages(payload)
  const productionMasked = process.env.NODE_ENV === 'production' && messages.includes('Unexpected error')
  if (!payload.errors?.length || (expected && !productionMasked && !messages.includes(expected))) {
    throw new Error(`${name} was not denied as expected: ${messages || JSON.stringify(payload)}`)
  }
}

async function authenticate(email, userPassword = password) {
  const data = await graphql(
    `authenticate ${email}`,
    `mutation($email: String!, $password: String!) {
      authenticateUserWithPassword(email: $email, password: $password) {
        ... on UserAuthenticationWithPasswordSuccess { sessionToken item { id } }
        ... on UserAuthenticationWithPasswordFailure { message }
      }
    }`,
    { email, password: userPassword },
  )
  const token = data.authenticateUserWithPassword?.sessionToken
  if (!token) throw new Error(`Authentication failed for ${email}`)
  return `keystonejs-session=${token}`
}

async function createUser(adminCookie, { name, email, roleId, facilityIds = [] }) {
  const data = await graphql(
    `create ${email}`,
    `mutation($data: UserCreateInput!) { createUser(data: $data) { id } }`,
    {
      data: {
        name,
        email,
        password,
        role: { connect: { id: roleId } },
        facilities: facilityIds.length ? { connect: facilityIds.map((id) => ({ id })) } : undefined,
      },
    },
    adminCookie,
  )
  created.userIds.push(data.createUser.id)
  return data.createUser
}

async function snapshotCounts() {
  const [roles, users, facilities, providers, appointmentTypes, scheduleBlocks, patients, appointments, intakes, messages, consents, audits] = await Promise.all([
    prisma.role.count(),
    prisma.user.count(),
    prisma.facility.count(),
    prisma.provider.count(),
    prisma.appointmentType.count(),
    prisma.providerScheduleBlock.count(),
    prisma.patient.count(),
    prisma.appointment.count(),
    prisma.intakeForm.count(),
    prisma.patientMessage.count(),
    prisma.patientConsent.count(),
    prisma.clinicalAuditLog.count(),
  ])
  return { roles, users, facilities, providers, appointmentTypes, scheduleBlocks, patients, appointments, intakes, messages, consents, audits }
}

async function cleanup() {
  const disposablePatients = await prisma.patient.findMany({
    where: {
      OR: [
        { id: { in: created.patientIds } },
        { email: { startsWith: `${prefix}-` } },
      ],
    },
    select: { id: true },
  })
  const patientIds = disposablePatients.map((patient) => patient.id)
  const appointments = await prisma.appointment.findMany({ where: { patientId: { in: patientIds } }, select: { id: true } })
  const appointmentIds = appointments.map((appointment) => appointment.id)

  await prisma.$transaction([
    prisma.clinicalOutboxEvent.deleteMany({ where: { OR: [{ patientId: { in: patientIds } }, { appointmentId: { in: appointmentIds } }] } }),
    prisma.clinicalAuditLog.deleteMany({ where: { OR: [{ patientId: { in: patientIds } }, { appointmentId: { in: appointmentIds } }] } }),
    prisma.patientConsent.deleteMany({ where: { patientId: { in: patientIds } } }),
    prisma.patientMessage.deleteMany({ where: { patientId: { in: patientIds } } }),
    prisma.intakeForm.deleteMany({ where: { patientId: { in: patientIds } } }),
    prisma.encounter.deleteMany({ where: { patientId: { in: patientIds } } }),
    prisma.appointment.deleteMany({ where: { patientId: { in: patientIds } } }),
    prisma.patient.deleteMany({ where: { id: { in: patientIds } } }),
    prisma.providerScheduleBlock.deleteMany({ where: { providerId: { in: created.providerIds } } }),
    prisma.appointmentType.deleteMany({ where: { id: { in: created.appointmentTypeIds } } }),
    prisma.provider.deleteMany({ where: { id: { in: created.providerIds } } }),
    prisma.integrationInstallation.deleteMany({ where: { id: { in: created.integrationIds } } }),
    prisma.user.deleteMany({
      where: { OR: [{ id: { in: created.userIds } }, { email: { startsWith: `${prefix}-` } }] },
    }),
    prisma.facility.deleteMany({ where: { id: { in: created.facilityIds } } }),
    prisma.role.deleteMany({
      where: { OR: [{ id: { in: created.roleIds } }, { name: { startsWith: `${prefix}-` } }] },
    }),
  ])
}

const requestAppointmentMutation = `mutation($appointmentTypeId: ID!, $providerId: ID!, $facilityId: ID!, $startsAt: String!, $patient: PatientAppointmentRequestInput!, $consent: WorkflowConsentInput!) {
  requestAppointment(
    appointmentTypeId: $appointmentTypeId
    providerId: $providerId
    facilityId: $facilityId
    startsAt: $startsAt
    patient: $patient
    preferredContactMethod: "email"
    consent: $consent
  ) { id appointmentNumber status patient { id } intakeForms { id accessCode } }
}`
const consent = { accepted: true, policyVersion: '2026-07-10', statementKey: 'hospital_appointment_request_acknowledgement_v1' }

let baseline
let completed = false

try {
  baseline = await snapshotCounts()
  const adminCredentials = JSON.parse(await readFile(credentialsPath, 'utf8'))
  const adminCookie = await authenticate(adminCredentials.email || adminCredentials.identity, adminCredentials.password)

  const [schedulerRole, patientRole] = await Promise.all([
    prisma.role.create({
      data: {
        name: `${prefix}-scheduler`,
        canManageAppointments: true,
        canManageScheduling: true,
        canManagePatients: true,
        canAccessAllClinicalData: false,
      },
    }),
    prisma.role.create({ data: { name: `${prefix}-patient`, canAccessAllClinicalData: false } }),
  ])
  created.roleIds.push(schedulerRole.id, patientRole.id)

  const [facilityA, facilityB] = await Promise.all([
    prisma.facility.create({ data: { name: `${prefix}-Facility A`, slug: `${prefix}-facility-a`, facilityType: 'clinic', status: 'active' } }),
    prisma.facility.create({ data: { name: `${prefix}-Facility B`, slug: `${prefix}-facility-b`, facilityType: 'clinic', status: 'active' } }),
  ])
  created.facilityIds.push(facilityA.id, facilityB.id)

  const communicationInstallations = await Promise.all([facilityA, facilityB].map((facility, index) =>
    prisma.integrationInstallation.create({
      data: {
        installationKey: `${prefix}-communications-${index}`,
        name: `${facility.name} communications`,
        kind: 'communications',
        status: 'active',
        transitionVersion: 1,
        operationKeyHash: createHash('sha256').update(`${prefix}:communications:${index}`).digest('hex'),
        requestHash: createHash('sha256').update(`${prefix}:communications-payload:${index}`).digest('hex'),
        facilityId: facility.id,
        endpointUrl: 'https://communications.example.test/events',
        allowedEventTypes: ['message.queued'],
        signingSecretCiphertext: 'synthetic-ciphertext',
        signingSecretIv: 'synthetic-iv',
        signingSecretTag: 'synthetic-tag',
        actorReference: 'runtime-validator',
      },
    }),
  ))
  created.integrationIds.push(...communicationInstallations.map(item => item.id))

  const schedulerUser = await createUser(adminCookie, {
    name: 'Runtime Scheduling Facility A',
    email: `${prefix}-scheduler@example.test`,
    roleId: schedulerRole.id,
    facilityIds: [facilityA.id],
  })
  const patientUserA = await createUser(adminCookie, {
    name: 'Runtime Scheduling Patient A',
    email: `${prefix}-patient-user-a@example.test`,
    roleId: patientRole.id,
  })
  const patientUserB = await createUser(adminCookie, {
    name: 'Runtime Scheduling Patient B',
    email: `${prefix}-patient-user-b@example.test`,
    roleId: patientRole.id,
  })

  const [providerA, providerB, sharedProvider] = await Promise.all([
    prisma.provider.create({
      data: {
        firstName: 'Schedule', lastName: `A-${runId}`, status: 'active', locationName: facilityA.name,
        facilities: { connect: { id: facilityA.id } },
      },
    }),
    prisma.provider.create({
      data: {
        firstName: 'Schedule', lastName: `B-${runId}`, status: 'active', locationName: facilityB.name,
        facilities: { connect: { id: facilityB.id } },
      },
    }),
    prisma.provider.create({
      data: {
        firstName: 'Schedule', lastName: `Shared-${runId}`, status: 'active', locationName: facilityA.name,
        facilities: { connect: [{ id: facilityA.id }, { id: facilityB.id }] },
      },
    }),
  ])
  created.providerIds.push(providerA.id, providerB.id, sharedProvider.id)

  const [appointmentType, providerAMismatchedType] = await Promise.all([
    prisma.appointmentType.create({
      data: {
        name: `${prefix} buffered visit`, slug: `${prefix}-buffered-visit`, status: 'bookable',
        durationMinutes: 30, bufferBeforeMinutes: 5, bufferAfterMinutes: 10,
        providers: { connect: [{ id: providerA.id }, { id: providerB.id }, { id: sharedProvider.id }] },
      },
    }),
    prisma.appointmentType.create({
      data: {
        name: `${prefix} provider A only`, slug: `${prefix}-provider-a-only`, status: 'bookable',
        durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0,
        providers: { connect: { id: providerA.id } },
      },
    }),
  ])
  created.appointmentTypeIds.push(appointmentType.id, providerAMismatchedType.id)

  const date = new Date(Date.now() + 30 * 24 * 60 * 60_000)
  date.setUTCHours(0, 0, 0, 0)
  const at = (hours, minutes = 0) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hours, minutes))
  await prisma.providerScheduleBlock.createMany({
    data: [
      { id: `${prefix}-available-a`, providerId: providerA.id, facilityId: facilityA.id, onboardingKey: `${prefix}-available-a`, blockType: 'available', startsAt: at(9), endsAt: at(17), maxAppointments: 1, locationName: facilityA.name },
      { id: `${prefix}-blocked-a`, providerId: providerA.id, facilityId: facilityA.id, onboardingKey: `${prefix}-blocked-a`, blockType: 'unavailable', startsAt: at(11), endsAt: at(12), maxAppointments: 1, locationName: facilityA.name },
      { id: `${prefix}-available-b`, providerId: providerB.id, facilityId: facilityB.id, onboardingKey: `${prefix}-available-b`, blockType: 'available', startsAt: at(9), endsAt: at(17), maxAppointments: 1, locationName: facilityB.name },
      { id: `${prefix}-available-shared`, providerId: sharedProvider.id, facilityId: facilityA.id, onboardingKey: `${prefix}-available-shared`, blockType: 'available', startsAt: at(9), endsAt: at(17), maxAppointments: 1, locationName: facilityA.name },
    ],
  })
  await assert.rejects(
    prisma.providerScheduleBlock.create({ data: {
      id: `${prefix}-ambiguous-shared-availability`, providerId: sharedProvider.id, facilityId: facilityB.id,
      onboardingKey: `${prefix}-ambiguous-shared-availability`, blockType: 'available',
      startsAt: at(10), endsAt: at(11), maxAppointments: 1, locationName: facilityB.name,
    } }),
    /ProviderScheduleBlock_available_no_overlap|exclusion constraint/,
  )

  const [patientA, patientB] = await Promise.all([
    prisma.patient.create({
      data: {
        firstName: 'Scheduling', lastName: `Patient-A-${runId}`, email: `${prefix}-patient-a@example.test`,
        userId: patientUserA.id, facilities: { connect: { id: facilityA.id } },
      },
    }),
    prisma.patient.create({
      data: {
        firstName: 'Scheduling', lastName: `Patient-B-${runId}`, email: `${prefix}-patient-b@example.test`,
        userId: patientUserB.id, facilities: { connect: { id: facilityB.id } },
      },
    }),
  ])
  created.patientIds.push(patientA.id, patientB.id)

  for (const status of ['requested', 'confirmed']) {
    await expectDenied(
      `onboarding ${status} cannot use another facility's availability`,
      `mutation($data: OnboardingAppointmentInput!) { createOnboardingAppointment(data: $data) { id } }`,
      { data: {
        operationKey: `${prefix}-onboarding-facility-${status}`,
        appointmentNumber: `${prefix}-ONBOARD-${status}`,
        status,
        facilityId: facilityB.id,
        patientId: patientB.id,
        providerId: sharedProvider.id,
        appointmentTypeId: appointmentType.id,
        startsAt: at(10).toISOString(),
        endsAt: at(10, 30).toISOString(),
      } },
      adminCookie,
      'outside availability',
    )
  }

  for (const status of ['requested', 'confirmed']) {
    await expectDenied(
      `onboarding ${status} must use appointment type duration`,
      `mutation($data: OnboardingAppointmentInput!) { createOnboardingAppointment(data: $data) { id } }`,
      { data: {
        operationKey: `${prefix}-onboarding-duration-${status}`,
        appointmentNumber: `${prefix}-DURATION-${status}`,
        status,
        facilityId: facilityA.id,
        patientId: patientA.id,
        providerId: sharedProvider.id,
        appointmentTypeId: appointmentType.id,
        startsAt: at(11).toISOString(),
        endsAt: at(11, 31).toISOString(),
      } },
      adminCookie,
      'must match the appointment type duration',
    )
  }

  await assert.rejects(
    prisma.appointment.create({
      data: {
        appointmentNumber: `${prefix}-RAW-DURATION`, bookingLockKey: `${prefix}-raw-duration`, status: 'requested',
        source: 'front_desk', startsAt: at(11), endsAt: at(11, 31), facilityId: facilityA.id,
        patientId: patientA.id, providerId: sharedProvider.id, appointmentTypeId: appointmentType.id,
      },
    }),
    /must match the appointment type duration/,
  )

  const privateAppointment = await prisma.appointment.create({
    data: {
      appointmentNumber: `GATE5-PRIVATE-${runId}`, bookingLockKey: `${prefix}:private`, status: 'confirmed',
      patientId: patientB.id, providerId: sharedProvider.id, facilityId: facilityB.id, appointmentTypeId: appointmentType.id,
      startsAt: at(15), endsAt: at(15, 30), reasonForVisit: 'Facility B private schedule reference', source: 'front_desk',
    },
  })
  const transitionAppointment = await prisma.appointment.create({
    data: {
      appointmentNumber: `GATE5-TRANSITION-${runId}`, bookingLockKey: `${prefix}:transition`, status: 'requested',
      patientId: patientA.id, providerId: providerA.id, facilityId: facilityA.id, appointmentTypeId: appointmentType.id,
      startsAt: at(14), endsAt: at(14, 30), reasonForVisit: 'Patient-owned scheduling proof', source: 'front_desk',
    },
  })

  const [schedulerCookie, patientCookie] = await Promise.all([
    authenticate(`${prefix}-scheduler@example.test`),
    authenticate(`${prefix}-patient-user-a@example.test`),
  ])

  const ownBlock = await graphql(
    'scoped scheduler creates own provider block',
    `mutation($data: ProviderScheduleBlockCreateInput!) { createProviderScheduleBlock(data: $data) { id provider { id } } }`,
    {
      data: {
        provider: { connect: { id: providerA.id } },
        facility: { connect: { id: facilityA.id } },
        onboardingKey: `${prefix}-scoped-create`,
        blockType: 'admin_time',
        startsAt: at(16).toISOString(),
        endsAt: at(16, 30).toISOString(),
        maxAppointments: 1,
      },
    },
    schedulerCookie,
  )
  if (ownBlock.createProviderScheduleBlock?.provider?.id !== providerA.id) {
    throw new Error('Scoped scheduler could not create an in-scope provider block')
  }
  await expectDenied(
    'cross-facility provider block create',
    `mutation($data: ProviderScheduleBlockCreateInput!) { createProviderScheduleBlock(data: $data) { id } }`,
    {
      data: {
        provider: { connect: { id: providerB.id } },
        facility: { connect: { id: facilityB.id } },
        onboardingKey: `${prefix}-cross-create`,
        blockType: 'available', startsAt: at(17).toISOString(), endsAt: at(18).toISOString(), maxAppointments: 1,
      },
    },
    schedulerCookie,
    'Access denied',
  )
  await expectDenied(
    'invalid provider block window',
    `mutation($data: ProviderScheduleBlockCreateInput!) { createProviderScheduleBlock(data: $data) { id } }`,
    {
      data: {
        provider: { connect: { id: providerA.id } },
        facility: { connect: { id: facilityA.id } },
        onboardingKey: `${prefix}-invalid-window`,
        blockType: 'available', startsAt: at(18).toISOString(), endsAt: at(17).toISOString(), maxAppointments: 1,
      },
    },
    schedulerCookie,
    'must end after',
  )
  await expectDenied(
    'unsupported provider block capacity',
    `mutation($data: ProviderScheduleBlockCreateInput!) { createProviderScheduleBlock(data: $data) { id } }`,
    {
      data: {
        provider: { connect: { id: providerA.id } },
        facility: { connect: { id: facilityA.id } },
        onboardingKey: `${prefix}-invalid-capacity`,
        blockType: 'available', startsAt: at(17).toISOString(), endsAt: at(18).toISOString(), maxAppointments: 2,
      },
    },
    schedulerCookie,
    'must be less than or equal to 1',
  )

  const dateKey = date.toISOString().slice(0, 10)
  const slots = await graphql(
    'public blocked-slot subtraction',
    `query($typeId: ID!, $providerId: ID!, $facilityId: ID!, $date: String!) {
      availableAppointmentSlots(appointmentTypeId: $typeId, providerId: $providerId, facilityId: $facilityId, date: $date) { startsAt endsAt }
    }`,
    { typeId: appointmentType.id, providerId: providerA.id, facilityId: facilityA.id, date: dateKey },
  )
  if (!slots.availableAppointmentSlots.length) throw new Error('No public slots were generated for the disposable provider')
  const leakedBlockedSlot = slots.availableAppointmentSlots.some((slot) => {
    const occupiedStart = new Date(new Date(slot.startsAt).getTime() - 5 * 60_000)
    const occupiedEnd = new Date(new Date(slot.endsAt).getTime() + 10 * 60_000)
    return occupiedStart < at(12) && at(11) < occupiedEnd
  })
  if (leakedBlockedSlot) throw new Error('Public availability exposed a slot overlapping an unavailable block or buffer')

  const mismatch = await graphql(
    'public provider and appointment type eligibility',
    `query($typeId: ID!, $providerId: ID!, $facilityId: ID!, $date: String!) {
      availableAppointmentSlots(appointmentTypeId: $typeId, providerId: $providerId, facilityId: $facilityId, date: $date) { startsAt }
    }`,
    { typeId: providerAMismatchedType.id, providerId: providerB.id, facilityId: facilityB.id, date: dateKey },
  )
  if (mismatch.availableAppointmentSlots.length !== 0) {
    throw new Error('Public availability exposed a provider not assigned to the appointment type')
  }

  await expectDenied(
    'public booking cannot infer a different facility for shared provider availability',
    requestAppointmentMutation,
    {
      appointmentTypeId: appointmentType.id, providerId: sharedProvider.id, facilityId: facilityB.id,
      startsAt: at(10).toISOString(),
      patient: { firstName: 'Facility', lastName: `Mismatch-${runId}`, email: `${prefix}-facility-mismatch@example.test` },
      consent,
    },
    undefined,
    'no longer available',
  )

  const raceStarts = [at(9, 15), at(9, 30)]
  const racePayloads = await Promise.all(raceStarts.map((startsAt, index) => rawGraphQL(
    requestAppointmentMutation,
    {
      appointmentTypeId: appointmentType.id,
      providerId: providerA.id,
      facilityId: facilityA.id,
      startsAt: startsAt.toISOString(),
      patient: {
        firstName: 'Concurrent', lastName: `Booking-${index}-${runId}`,
        email: `${prefix}-race-${index}@example.test`, phone: `555000${index}`,
      },
      consent,
    },
  )))
  const successfulBookings = racePayloads.filter((payload) => !payload.errors?.length && payload.data?.requestAppointment)
  if (successfulBookings.length !== 2) {
    throw new Error(`Unconfirmed public requests unexpectedly reserved provider inventory: ${JSON.stringify(racePayloads)}`)
  }
  const racePatients = await prisma.patient.findMany({ where: { email: { startsWith: `${prefix}-race-` } }, select: { id: true } })
  if (racePatients.length !== 2) throw new Error(`Concurrent request inbox persisted ${racePatients.length} patient rows instead of two`)

  const [firstRequest, secondRequest] = successfulBookings.map(payload => payload.data.requestAppointment)
  await graphql(
    'staff confirms one overlapping public request',
    `mutation($key: String!, $id: ID!) { transitionAppointment(operationKey: $key, appointmentId: $id, toStatus: "confirmed", expectedVersion: 1) { id status } }`,
    { key: `${prefix}-confirm-public-first`, id: firstRequest.id },
    schedulerCookie,
  )
  await expectDenied(
    'staff cannot confirm a second overlapping public request',
    `mutation($key: String!, $id: ID!) { transitionAppointment(operationKey: $key, appointmentId: $id, toStatus: "confirmed", expectedVersion: 1) { id status } }`,
    { key: `${prefix}-confirm-public-second`, id: secondRequest.id },
    schedulerCookie,
    'provider schedule conflicts',
  )

  const privateConflict = await graphql(
    'cross-facility schedule conflict redaction',
    `query($facilityId: ID!, $providerId: ID!, $startsAt: String!, $endsAt: String!) {
      appointmentScheduleConflicts(facilityId: $facilityId, providerId: $providerId, startsAt: $startsAt, endsAt: $endsAt) {
        hasConflict conflicts { id source reference status }
      }
      appointment(where: { id: "${privateAppointment.id}" }) { id }
    }`,
    { facilityId: facilityA.id, providerId: sharedProvider.id, startsAt: at(15).toISOString(), endsAt: at(15, 30).toISOString() },
    schedulerCookie,
  )
  const privateItem = privateConflict.appointmentScheduleConflicts.conflicts.find((item) => item.source === 'appointment')
  if (
    !privateConflict.appointmentScheduleConflicts.hasConflict ||
    privateConflict.appointment !== null ||
    privateItem?.reference !== 'busy' ||
    privateItem?.status !== 'busy' ||
    String(privateItem?.id).includes(privateAppointment.id)
  ) {
    throw new Error('Cross-facility schedule conflict leaked an appointment identifier or reference')
  }

  await expectDenied(
    'cross-facility appointment transition',
    `mutation($key: String!, $id: ID!) { transitionAppointment(operationKey: $key, appointmentId: $id, toStatus: "cancelled", expectedVersion: 1, reason: "blocked") { id } }`,
    { key: `${prefix}-cross-transition-operation`, id: privateAppointment.id },
    schedulerCookie,
    'not found or not accessible',
  )

  const transitionPayloads = await Promise.all([
    rawGraphQL(
      `mutation($key: String!, $id: ID!) { transitionAppointment(operationKey: $key, appointmentId: $id, toStatus: "confirmed", expectedVersion: 1) { id fromStatus status } }`,
      { key: `${prefix}-transition-race-a`, id: transitionAppointment.id },
      schedulerCookie,
    ),
    rawGraphQL(
      `mutation($key: String!, $id: ID!) { transitionAppointment(operationKey: $key, appointmentId: $id, toStatus: "confirmed", expectedVersion: 1) { id fromStatus status } }`,
      { key: `${prefix}-transition-race-b`, id: transitionAppointment.id },
      schedulerCookie,
    ),
  ])
  const successfulTransitions = transitionPayloads.filter((payload) => !payload.errors?.length && payload.data?.transitionAppointment)
  const deniedTransitions = transitionPayloads.filter((payload) => payload.errors?.length)
  if (successfulTransitions.length !== 1 || deniedTransitions.length !== 1) {
    throw new Error(`Concurrent appointment transition was not serialized: ${JSON.stringify(transitionPayloads)}`)
  }
  const transitionAfterRace = await prisma.appointment.findUnique({ where: { id: transitionAppointment.id }, select: { status: true } })
  const transitionAuditCount = await prisma.clinicalAuditLog.count({
    where: { appointmentId: transitionAppointment.id, eventType: 'appointment.confirmed' },
  })
  if (transitionAfterRace?.status !== 'confirmed' || transitionAuditCount !== 1) {
    throw new Error('Concurrent appointment transition did not persist exactly one state/audit change')
  }

  let overlapConstraintDenied = false
  try {
    await prisma.appointment.create({
      data: {
        appointmentNumber: `GATE5-OVERLAP-${runId}`, bookingLockKey: `${prefix}:overlap`, status: 'confirmed',
        patientId: patientA.id, providerId: providerA.id, facilityId: facilityA.id, appointmentTypeId: appointmentType.id,
        startsAt: at(14, 15), endsAt: at(14, 45), source: 'front_desk',
      },
    })
  } catch {
    overlapConstraintDenied = true
  }
  if (!overlapConstraintDenied) throw new Error('Database accepted an overlapping confirmed provider appointment')

  const patientRows = await graphql(
    'patient-owned appointment access',
    `query($privateId: ID!) {
      appointments(orderBy: [{ createdAt: asc }]) { id appointmentNumber status reasonForVisit }
      appointment(where: { id: $privateId }) { id }
    }`,
    { privateId: privateAppointment.id },
    patientCookie,
  )
  if (
    patientRows.appointments.length !== 1 ||
    patientRows.appointments[0].id !== transitionAppointment.id ||
    patientRows.appointments[0].reasonForVisit !== null ||
    patientRows.appointment !== null
  ) {
    throw new Error('Patient-owned appointment scope or field denial was incorrect')
  }
  await expectDenied(
    'patient appointment transition',
    `mutation($key: String!, $id: ID!) { transitionAppointment(operationKey: $key, appointmentId: $id, toStatus: "cancelled", expectedVersion: 2, reason: "blocked") { id } }`,
    { key: `${prefix}-patient-transition-operation`, id: transitionAppointment.id },
    patientCookie,
    'Not authorized',
  )
  await expectDenied(
    'patient schedule conflict inspection',
    `query($facilityId: ID!, $providerId: ID!, $startsAt: String!, $endsAt: String!) {
      appointmentScheduleConflicts(facilityId: $facilityId, providerId: $providerId, startsAt: $startsAt, endsAt: $endsAt) { hasConflict }
    }`,
    { facilityId: facilityA.id, providerId: providerA.id, startsAt: at(14).toISOString(), endsAt: at(14, 30).toISOString() },
    patientCookie,
    'Not authorized',
  )

  completed = true
  console.log(JSON.stringify({
    result: 'provider-availability-lifecycle-patient-access-passed',
    publicBlockingAndBufferSubtraction: true,
    providerTypeEligibility: true,
    onboardingFacilityBinding: true,
    appointmentTypeDurationBinding: true,
    scopedScheduleCreateAndCrossFacilityDenial: true,
    publicRequestsDoNotReserveUntilConfirmation: true,
    privateConflictRedacted: true,
    concurrentTransitionExactlyOnce: true,
    databaseOverlapConstraint: true,
    patientOwnedReadOnlyAccess: true,
  }))
} finally {
  const triggerBypass = await beginDisposableCleanup(prisma)
  try { await cleanup() } finally { await endDisposableCleanup(prisma, triggerBypass) }
  const after = await snapshotCounts()
  await prisma.$disconnect()
  if (baseline && JSON.stringify(after) !== JSON.stringify(baseline)) {
    throw new Error(`Scheduling proof cleanup did not restore baseline: ${JSON.stringify({ baseline, after })}`)
  }
  if (completed) console.log('Disposable scheduling cleanup passed; canonical counts restored.')
}

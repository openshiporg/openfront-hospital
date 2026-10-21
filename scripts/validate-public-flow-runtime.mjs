import 'dotenv/config'
import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PrismaClient } from '@prisma/client'
import { buildSchema, isListType, isNonNullType } from 'graphql'
import { assertLocalGraphqlEndpoint, assertSafeRuntimeDatabase, beginDisposableCleanup, endDisposableCleanup } from './lib/runtime-guard.mjs'

const BOOKING_CONSENT = {
  accepted: true,
  policyVersion: '2026-07-10',
  statementKey: 'hospital_appointment_request_acknowledgement_v1',
}
const INTAKE_CONSENT = {
  accepted: true,
  policyVersion: '2026-07-10',
  statementKey: 'hospital_intake_accuracy_and_contact_consent_v1',
}

const endpoint = process.env.OPENFRONT_GRAPHQL_URL || process.env.GRAPHQL_URL
const databaseUrl = process.env.DATABASE_URL

assertLocalGraphqlEndpoint(endpoint, 'public flow proof')
const { name: databaseName } = assertSafeRuntimeDatabase(databaseUrl, 'public flow proof')

const prisma = new PrismaClient()
const runId = randomUUID().replaceAll('-', '').slice(0, 12)
const patientEmail = `runtime-flow-${runId}@example.test`
const patientPhone = '+1-555-010-1234'
const blockedBootstrapEmail = `blocked-bootstrap-${runId}@example.test`
let communicationInstallationId = null
let runtimePatientId = null

async function rawGraphQL(query, variables = {}, headers = {}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  })
  const payload = await response.json()
  if (!response.ok && !payload.errors?.length) throw new Error(`GraphQL HTTP ${response.status}`)
  return payload
}

async function requestGraphQL(name, query, variables = {}, headers = {}) {
  const payload = await rawGraphQL(query, variables, headers)
  if (payload.errors?.length) {
    throw new Error(`${name} GraphQL errors: ${payload.errors.map((error) => error.message).join('; ')}`)
  }

  return payload.data
}

async function expectGraphQLDenied(name, query, variables = {}, expectedFragment = 'Access denied', headers = {}) {
  const payload = await rawGraphQL(query, variables, headers)
  const message = payload.errors
    ?.flatMap((error) => [error.message, error.extensions?.originalError?.message])
    .filter(Boolean)
    .join('; ') || ''
  const denied = message.includes(expectedFragment) ||
    (process.env.NODE_ENV === 'production' && message.includes('Unexpected error'))
  if (!denied) throw new Error(`${name} was not denied as expected: ${message || 'no GraphQL error'}`)
}

async function expectEmptyUnauthenticatedList(name, fieldName, selection) {
  const payload = await rawGraphQL(`query { ${fieldName}(take: 1) { ${selection} } }`)
  if (payload.errors?.length) throw new Error(`${name} returned an unexpected GraphQL error: ${payload.errors.map((error) => error.message).join('; ')}`)
  if (!Array.isArray(payload.data?.[fieldName]) || payload.data[fieldName].length !== 0) {
    throw new Error(`${name} exposed unauthenticated raw rows`)
  }
}

async function verifyInitialUserBootstrapClosed() {
  const before = await Promise.all([prisma.user.count(), prisma.role.count()])
  const payload = await rawGraphQL(
    `mutation($data: CreateInitialUserInput!) { createInitialUser(data: $data) { sessionToken } }`,
    { data: { name: 'Blocked Bootstrap', email: blockedBootstrapEmail, password: 'BlockedBootstrapPassword123!' } }
  )
  if (!payload.errors?.length || payload.data?.createInitialUser) throw new Error('Initialized runtime accepted createInitialUser')
  const after = await Promise.all([prisma.user.count(), prisma.role.count()])
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Denied createInitialUser changed User/Role counts')
}

function typeContainsList(type) {
  if (isListType(type)) return true
  return isNonNullType(type) ? typeContainsList(type.ofType) : false
}

async function verifyGenericCreateBoundaries() {
  // The runtime cost ceiling intentionally rejects broad mutation-root
  // introspection. Read the generated, byte-frozen schema locally, then probe
  // every discovered generic create boundary against the live endpoint.
  const schema = buildSchema(await readFile('schema.graphql', 'utf8'))
  const mutationType = schema.getMutationType()
  if (!mutationType) throw new Error('Generated schema has no Mutation root')
  const createFields = Object.values(mutationType.getFields()).filter((field) => {
    if (!/^create[A-Z]/.test(field.name) || field.name === 'createInitialUser') return false
    return field.args.some((argument) => argument.name === 'data')
  })
  if (!createFields.some((field) => field.name === 'createUser') || !createFields.some((field) => field.name === 'createUsers')) {
    throw new Error('Generic User singular/bulk create boundaries were not present for review')
  }

  for (const field of createFields) {
    const dataType = field.args.find((argument) => argument.name === 'data').type
    const payload = await rawGraphQL(
      `mutation($data: ${String(dataType)}) { ${field.name}(data: $data) { __typename } }`,
      { data: typeContainsList(dataType) ? [{}] : {} },
    )
    if (!payload.errors?.length) throw new Error(`${field.name} unexpectedly accepted an unauthenticated generic create`)
  }

  return createFields.map((field) => field.name).sort()
}

async function authenticateRuntimeAdmin() {
  const credentialsPath = process.env.OPENFRONT_RUNTIME_ADMIN_PATH
  if (!credentialsPath) throw new Error('Missing OPENFRONT_RUNTIME_ADMIN_PATH for authenticated evidence proof')
  const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'))
  const email = credentials.email || credentials.identity
  if (!email || !credentials.password) throw new Error('Runtime admin file is missing email/password fields')
  const data = await requestGraphQL(
    'runtime admin authentication',
    `mutation RuntimeAdmin($email: String!, $password: String!) { authenticateUserWithPassword(email: $email, password: $password) { ... on UserAuthenticationWithPasswordSuccess { sessionToken } ... on UserAuthenticationWithPasswordFailure { message } } }`,
    { email, password: credentials.password }
  )
  const token = data.authenticateUserWithPassword?.sessionToken
  if (!token) throw new Error('Runtime admin authentication failed')
  return { cookie: `keystonejs-session=${token}` }
}

function containsForbiddenMetadataKey(value) {
  if (!value || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.some(containsForbiddenMetadataKey)
  const forbidden = new Set(['reasonForVisit', 'responses', 'accessCode', 'email', 'phone', 'insuranceSummary', 'messageBody'])
  return Object.entries(value).some(([key, nested]) => forbidden.has(key) || containsForbiddenMetadataKey(nested))
}

async function snapshotCounts() {
  const [patients, appointments, intakeForms, messages, consents, auditLogs, scheduleBlocks] = await Promise.all([
    prisma.patient.count(),
    prisma.appointment.count(),
    prisma.intakeForm.count(),
    prisma.patientMessage.count(),
    prisma.patientConsent.count(),
    prisma.clinicalAuditLog.count(),
    prisma.providerScheduleBlock.count(),
  ])
  return { patients, appointments, intakeForms, messages, consents, auditLogs, scheduleBlocks }
}

async function verifyRuntimeIdentity() {
  const [apiData, databaseTypes] = await Promise.all([
    requestGraphQL(
      'runtime identity',
      /* GraphQL */ `
        query RuntimeIdentity {
          bookableAppointmentTypes { id slug }
        }
      `,
    ),
    prisma.appointmentType.findMany({ where: { status: 'bookable' }, select: { id: true }, orderBy: { id: 'asc' } }),
  ])
  const apiIds = new Set((apiData.bookableAppointmentTypes || []).map((item) => item.id))
  if (!databaseTypes.length || !databaseTypes.every((item) => apiIds.has(item.id))) {
    throw new Error('GraphQL endpoint does not match the guarded runtime_hospital database identity')
  }
}

async function findAvailableSlot() {
  const catalog = await requestGraphQL(
    'flow catalog',
    /* GraphQL */ `
      query PublicFlowCatalog {
        bookableAppointmentTypes {
          id
          name
          providers { id displayName }
        }
      }
    `
  )

  const appointmentTypes = catalog.bookableAppointmentTypes || []
  const firstType = appointmentTypes.find((item) => item.providers?.length)
  const firstProvider = firstType?.providers?.[0]
  if (!firstType || !firstProvider) throw new Error('No bookable appointment type/provider pair found')
  const scheduleFacility = await prisma.facility.findFirst({
    where: { status: 'active', providers: { some: { id: firstProvider.id } } },
    orderBy: { name: 'asc' },
  })
  if (!scheduleFacility) throw new Error('No active facility found for the bookable provider')
  const installation = await prisma.integrationInstallation.create({
    data: {
      installationKey: `runtime-public-flow-${runId}`,
      name: 'Runtime public-flow communications',
      kind: 'communications',
      status: 'active',
      transitionVersion: 1,
      operationKeyHash: createHash('sha256').update(`runtime-public-flow-integration-${runId}`).digest('hex'),
      requestHash: createHash('sha256').update(`runtime-public-flow-integration-payload-${runId}`).digest('hex'),
      facilityId: scheduleFacility.id,
      endpointUrl: 'https://communications.example.test/events',
      allowedEventTypes: ['message.queued'],
      signingSecretCiphertext: 'synthetic-ciphertext',
      signingSecretIv: 'synthetic-iv',
      signingSecretTag: 'synthetic-tag',
      actorReference: 'runtime-validator',
    },
  })
  communicationInstallationId = installation.id
  const disposableStart = new Date(Date.now() + 24 * 60 * 60_000)
  disposableStart.setUTCHours(9, 0, 0, 0)
  await prisma.providerScheduleBlock.create({
    data: {
      providerId: firstProvider.id,
      facilityId: scheduleFacility.id,
      onboardingKey: `runtime-public-flow-${runId}`,
      blockType: 'available',
      startsAt: disposableStart,
      endsAt: new Date(disposableStart.getTime() + 2 * 60 * 60_000),
      maxAppointments: 1,
      locationName: 'Hospital Runtime Verification',
    },
  })
  const now = Date.now()

  for (let dayOffset = 0; dayOffset <= 14; dayOffset += 1) {
    const date = new Date(now)
    date.setUTCDate(date.getUTCDate() + dayOffset)
    const dateValue = date.toISOString().slice(0, 10)

    for (const appointmentType of appointmentTypes) {
      for (const provider of appointmentType.providers || []) {
        const availability = await requestGraphQL(
          'flow availability',
          /* GraphQL */ `
            query PublicFlowAvailability($appointmentTypeId: ID!, $providerId: ID!, $facilityId: ID!, $date: String!) {
              availableAppointmentSlots(appointmentTypeId: $appointmentTypeId, providerId: $providerId, facilityId: $facilityId, date: $date) {
                providerId
                facilityId
                startsAt
              }
            }
          `,
          { appointmentTypeId: appointmentType.id, providerId: provider.id, facilityId: scheduleFacility.id, date: dateValue }
        )

        const slot = (availability.availableAppointmentSlots || []).find(
          (candidate) => new Date(candidate.startsAt).getTime() > now + 60_000
        )
        if (slot) return { appointmentType, provider, slot }
      }
    }
  }

  throw new Error('No future appointment slot was available in the next 14 days')
}

async function cleanupRuntimeFlowPatient() {
  const patients = await prisma.patient.findMany({
    where: { OR: [{ email: patientEmail }, ...(runtimePatientId ? [{ id: runtimePatientId }] : [])] },
    select: { id: true },
  })
  const patientIds = patients.map((patient) => patient.id)

  await prisma.$transaction([
    prisma.clinicalOutboxEvent.deleteMany({ where: { patientId: { in: patientIds } } }),
    prisma.clinicalAuditLog.deleteMany({ where: { patientId: { in: patientIds } } }),
    prisma.patientConsent.deleteMany({ where: { patientId: { in: patientIds } } }),
    prisma.patientMessage.deleteMany({ where: { patientId: { in: patientIds } } }),
    prisma.intakeForm.deleteMany({ where: { patientId: { in: patientIds } } }),
    prisma.appointment.deleteMany({ where: { patientId: { in: patientIds } } }),
    prisma.patient.deleteMany({ where: { id: { in: patientIds } } }),
    prisma.providerScheduleBlock.deleteMany({ where: { onboardingKey: `runtime-public-flow-${runId}` } }),
    prisma.integrationInstallation.deleteMany({ where: { id: communicationInstallationId || '__none__' } }),
  ])
}

let baseline
let completed = false

try {
  const existing = await prisma.patient.count({ where: { email: patientEmail } })
  if (existing) throw new Error('Generated runtime-flow email unexpectedly already exists')

  await verifyRuntimeIdentity()
  await expectEmptyUnauthenticatedList('unauthenticated patient list', 'patients', 'id email')
  await expectEmptyUnauthenticatedList('unauthenticated intake list', 'intakeForms', 'id status')
  await expectEmptyUnauthenticatedList('unauthenticated message list', 'patientMessages', 'id body')
  await expectEmptyUnauthenticatedList('unauthenticated consent list', 'patientConsents', 'id consentType')
  await expectEmptyUnauthenticatedList('unauthenticated audit list', 'clinicalAuditLogs', 'id eventType')
  await expectGraphQLDenied('unauthenticated patient create', `mutation { createPatient(data: { firstName: "Blocked", lastName: "Mutation" }) { id } }`, {}, 'Cannot query field')
  await expectGraphQLDenied('unauthenticated intake create', `mutation { createIntakeForm(data: { title: "Blocked" }) { id } }`, {}, 'Cannot query field')
  await expectGraphQLDenied('omitted raw message create', `mutation { createPatientMessage(data: { body: "Blocked" }) { id } }`, {}, 'Cannot query field')
  await expectGraphQLDenied('omitted consent create mutation', `mutation { createPatientConsent(data: { consentType: "x", policyVersion: "x", statementKey: "x" }) { id } }`, {}, 'Cannot query field')
  await expectGraphQLDenied('omitted audit create mutation', `mutation { createClinicalAuditLog(data: { eventType: "x", actorType: "x" }) { id } }`, {}, 'Cannot query field')
  await expectGraphQLDenied('public generic user create', `mutation { createUser(data: { name: "Blocked Public User", email: "blocked-${runId}@example.test", password: "BlockedPublicPassword123!" }) { id } }`)
  const deniedGenericCreates = await verifyGenericCreateBoundaries()
  await verifyInitialUserBootstrapClosed()
  baseline = await snapshotCounts()
  const decoyPatient = await prisma.patient.create({
    data: {
      firstName: 'Existing',
      lastName: 'Contact Collision',
      email: patientEmail,
      phone: patientPhone,
      status: 'active',
    },
  })
  const { appointmentType, provider, slot } = await findAvailableSlot()
  const flowBaseline = await snapshotCounts()

  const deniedConsentPayload = await rawGraphQL(
    `mutation DeniedConsent($appointmentTypeId: ID!, $providerId: ID!, $facilityId: ID!, $startsAt: String!, $patient: PatientAppointmentRequestInput!, $consent: WorkflowConsentInput!) { requestAppointment(appointmentTypeId: $appointmentTypeId, providerId: $providerId, facilityId: $facilityId, startsAt: $startsAt, patient: $patient, consent: $consent) { id } }`,
    {
      appointmentTypeId: appointmentType.id,
      providerId: provider.id,
      facilityId: slot.facilityId,
      startsAt: slot.startsAt,
      patient: { firstName: 'Runtime', lastName: 'Flow Check', email: patientEmail, phone: patientPhone },
      consent: { ...BOOKING_CONSENT, accepted: false },
    }
  )
  const deniedConsentMessage = deniedConsentPayload.errors
    ?.flatMap((error) => [error.message, error.extensions?.originalError?.message])
    .filter(Boolean)
    .join('; ') || ''
  const consentDenied = deniedConsentMessage.includes('Consent acknowledgement is required') ||
    (process.env.NODE_ENV === 'production' && deniedConsentMessage.includes('Unexpected error'))
  if (!consentDenied) throw new Error('False appointment consent was not denied')
  if (JSON.stringify(await snapshotCounts()) !== JSON.stringify(flowBaseline)) throw new Error('False-consent denial changed workflow/evidence counts')

  const requestData = await requestGraphQL(
    'appointment request',
    /* GraphQL */ `
      mutation PublicFlowRequest(
        $appointmentTypeId: ID!
        $providerId: ID!
        $facilityId: ID!
        $startsAt: String!
        $patient: PatientAppointmentRequestInput!
        $reasonForVisit: String
        $preferredContactMethod: String
        $consent: WorkflowConsentInput!
      ) {
        requestAppointment(
          appointmentTypeId: $appointmentTypeId
          providerId: $providerId
          facilityId: $facilityId
          startsAt: $startsAt
          patient: $patient
          reasonForVisit: $reasonForVisit
          preferredContactMethod: $preferredContactMethod
          consent: $consent
        ) {
          id
          appointmentNumber
          status
          patient { id displayName }
          intakeForms { id accessCode status }
        }
      }
    `,
    {
      appointmentTypeId: appointmentType.id,
      providerId: provider.id,
      facilityId: slot.facilityId,
      startsAt: slot.startsAt,
      patient: {
        firstName: 'Runtime',
        lastName: 'Flow Check',
        email: patientEmail,
        phone: patientPhone,
        dateOfBirth: '1990-01-01',
      },
      reasonForVisit: 'Disposable local runtime booking verification.',
      preferredContactMethod: 'email',
      consent: BOOKING_CONSENT,
    }
  )

  const appointment = requestData.requestAppointment
  const intake = appointment?.intakeForms?.[0]
  if (!appointment?.id || appointment.status !== 'requested') throw new Error('Appointment request did not create a requested appointment')
  if (!appointment.patient?.id || appointment.patient.displayName !== 'Runtime Flow Check') throw new Error('Appointment request returned the wrong scoped patient identity')
  if (appointment.patient.id === decoyPatient.id) throw new Error('Public booking attached to an existing patient by contact details')
  runtimePatientId = appointment.patient.id
  if (!intake?.accessCode || intake.accessCode.length < 32 || intake.status !== 'not_sent') {
    throw new Error('Appointment request did not create a usable not_sent intake form')
  }
  const issuedAccess = await prisma.intakeForm.findUnique({
    where: { id: intake.id },
    select: { accessCodeHash: true, accessExpiresAt: true, accessUsedAt: true, accessRevokedAt: true },
  })
  const expectedAccessHash = createHash('sha256').update(intake.accessCode, 'utf8').digest('hex')
  if (
    !issuedAccess?.accessCodeHash ||
    issuedAccess.accessCodeHash !== expectedAccessHash ||
    issuedAccess.accessCodeHash === intake.accessCode ||
    !issuedAccess.accessExpiresAt ||
    issuedAccess.accessExpiresAt <= new Date() ||
    issuedAccess.accessUsedAt ||
    issuedAccess.accessRevokedAt
  ) {
    throw new Error('Appointment request did not persist a hash-only active intake bearer boundary')
  }
  const queuedFollowUp = await prisma.patientMessage.findFirst({
    where: { appointmentId: appointment.id, direction: 'outbound' },
  })
  const followUpEvent = queuedFollowUp ? await prisma.clinicalOutboxEvent.findFirst({
    where: { aggregateType: 'patient_message', aggregateId: queuedFollowUp.id, eventType: 'message.queued' },
  }) : null
  if (
    !queuedFollowUp?.body.includes('{{intake_link}}') || queuedFollowUp.body.includes(intake.accessCode) ||
    followUpEvent?.deliveryMode !== 'external' || followUpEvent.status !== 'pending' ||
    followUpEvent.installationId !== communicationInstallationId || JSON.stringify(followUpEvent.payload).includes(intake.accessCode)
  ) {
    throw new Error('Appointment follow-up was not queued through a token-safe retryable communications event')
  }

  const intakeData = await requestGraphQL(
    'generated intake lookup',
    /* GraphQL */ `
      query PublicFlowIntake($accessCode: String!) {
        intakeFormByAccessCode(accessCode: $accessCode) {
          id
          status
          patient { email }
          appointment { id appointmentNumber }
        }
      }
    `,
    { accessCode: intake.accessCode }
  )
  if (intakeData.intakeFormByAccessCode?.patient?.email !== patientEmail) {
    throw new Error('Generated intake access code did not resolve to the disposable patient')
  }

  const otherPatient = await prisma.patient.findFirst({
    where: { id: { not: appointment.patient.id }, email: { not: '' } },
    select: { id: true, email: true },
  })
  if (!otherPatient?.email) throw new Error('Contact privacy proof requires another seeded patient with email')

  const submissionQuery = /* GraphQL */ `
    mutation PublicFlowSubmit($accessCode: String!, $responses: JSON!, $patientUpdates: PatientIntakeUpdateInput, $consent: WorkflowConsentInput!) {
      submitIntakeForm(accessCode: $accessCode, responses: $responses, patientUpdates: $patientUpdates, consent: $consent) {
        id
        status
        submittedAt
        patient { email preferredContactMethod insuranceSummary }
        appointment { id appointmentNumber }
      }
    }
  `
  const submissionVariables = {
    accessCode: intake.accessCode,
    responses: {
      runtimeFlowCheck: true,
      reasonForVisit: 'Disposable local runtime booking verification.',
      consentToContact: true,
    },
    consent: INTAKE_CONSENT,
    patientUpdates: {
      email: otherPatient.email,
      phone: patientPhone,
      preferredContactMethod: 'email',
      insuranceSummary: { payer: 'Local Test Plan', memberId: `LOCAL-${runId}` },
    },
  }
  const concurrentSubmissions = await Promise.all([
    rawGraphQL(submissionQuery, submissionVariables),
    rawGraphQL(submissionQuery, submissionVariables),
  ])
  const successfulSubmissions = concurrentSubmissions.filter(
    (payload) => !payload.errors?.length && payload.data?.submitIntakeForm,
  )
  const deniedConcurrentSubmissions = concurrentSubmissions.filter((payload) => payload.errors?.length)
  if (successfulSubmissions.length !== 1 || deniedConcurrentSubmissions.length !== 1) {
    throw new Error(`Concurrent intake bearer claim was not exactly-once: ${JSON.stringify(concurrentSubmissions)}`)
  }

  const submitted = successfulSubmissions[0].data.submitIntakeForm
  if (submitted?.status !== 'submitted' || !submitted.submittedAt) throw new Error('Intake submission did not reach submitted status')
  if (submitted.patient?.preferredContactMethod !== 'email' || submitted.patient?.email !== otherPatient.email) {
    throw new Error('Intake contact update did not complete without a global patient-existence oracle')
  }
  const unchangedOtherPatient = await prisma.patient.findUnique({ where: { id: otherPatient.id }, select: { email: true } })
  if (unchangedOtherPatient?.email !== otherPatient.email) throw new Error('Intake contact update modified another patient record')

  const consumedLookup = await requestGraphQL(
    'consumed intake lookup',
    `query($accessCode: String!) { intakeFormByAccessCode(accessCode: $accessCode) { id } }`,
    { accessCode: intake.accessCode },
  )
  if (consumedLookup.intakeFormByAccessCode !== null) throw new Error('Consumed intake bearer remained readable')
  await expectGraphQLDenied(
    'consumed intake resubmission',
    `mutation($accessCode: String!, $responses: JSON!, $consent: WorkflowConsentInput!) { submitIntakeForm(accessCode: $accessCode, responses: $responses, consent: $consent) { id } }`,
    { accessCode: intake.accessCode, responses: { replay: true }, consent: INTAKE_CONSENT },
    'Intake access is invalid or no longer active',
  )

  const persisted = await prisma.patient.findUnique({
    where: { id: appointment.patient.id },
    include: {
      appointments: true,
      intakeForms: true,
      messages: { orderBy: { createdAt: 'asc' } },
      consents: { orderBy: { grantedAt: 'asc' } },
      clinicalAuditLogs: { orderBy: { occurredAt: 'asc' } },
    },
  })
  if (!persisted) throw new Error('Disposable patient was not persisted')
  if (
    persisted.intakeForms.length !== 1 ||
    !persisted.intakeForms[0].accessUsedAt ||
    persisted.intakeForms[0].accessCodeHash !== expectedAccessHash
  ) {
    throw new Error('Submitted intake did not consume exactly the persisted hash-only bearer')
  }
  if (persisted.appointments.length !== 1 || persisted.appointments[0].status !== 'requested') {
    throw new Error('Disposable appointment persistence evidence is incomplete')
  }
  if (persisted.intakeForms.length !== 1 || persisted.intakeForms[0].status !== 'submitted') {
    throw new Error('Disposable intake persistence evidence is incomplete')
  }
  if (persisted.messages.length !== 1) throw new Error(`Expected 1 outbound integration message, found ${persisted.messages.length}`)
  if (persisted.consents.length !== 2) throw new Error(`Expected 2 consent records, found ${persisted.consents.length}`)
  if (persisted.clinicalAuditLogs.length !== 3) throw new Error(`Expected request, intake-view, and intake-submission audit records, found ${persisted.clinicalAuditLogs.length}`)
  if (persisted.consents.some((consent) => !consent.statementKey.startsWith('hospital_'))) throw new Error('Consent evidence contains an unexpected statement key')
  if (persisted.clinicalAuditLogs.some((event) => containsForbiddenMetadataKey(event.metadata))) {
    throw new Error('Audit metadata contains forbidden PHI/workflow payload keys')
  }
  if (!persisted.messages.some((message) => message.direction === 'outbound' && message.status === 'queued')) {
    throw new Error('Missing queued appointment-request message')
  }
  if (!persisted.clinicalAuditLogs.some((event) => event.eventType === 'intake.viewed')) {
    throw new Error('Missing one-time intake view audit evidence')
  }

  const adminHeaders = await authenticateRuntimeAdmin()
  const evidence = await requestGraphQL(
    'authenticated evidence read',
    `query Evidence($patientId: ID!) { patientConsents(where: { patient: { id: { equals: $patientId } } }, orderBy: [{ grantedAt: asc }]) { consentType policyVersion statementKey captureMethod evidence } clinicalAuditLogs(where: { patient: { id: { equals: $patientId } } }, orderBy: [{ occurredAt: asc }]) { eventType actorType actorReference metadata } }`,
    { patientId: persisted.id },
    adminHeaders
  )
  if (evidence.patientConsents?.length !== 2 || evidence.clinicalAuditLogs?.length !== 3) {
    throw new Error('Authenticated evidence query did not return the expected append-only records')
  }

  const consentId = persisted.consents[0]?.id
  if (!consentId) throw new Error('No consent row was available for immutable update/delete negatives')
  await expectGraphQLDenied(
    'authenticated consent update',
    `mutation($id: ID!) { updatePatientConsent(where: { id: $id }, data: { statementKey: "tampered" }) { id } }`,
    { id: consentId },
    'Cannot query field',
    adminHeaders
  )
  await expectGraphQLDenied(
    'authenticated consent delete',
    `mutation($id: ID!) { deletePatientConsent(where: { id: $id }) { id } }`,
    { id: consentId },
    'Cannot query field',
    adminHeaders
  )
  const consentAfterAttempts = await prisma.patientConsent.findUnique({ where: { id: consentId }, select: { id: true, statementKey: true } })
  if (!consentAfterAttempts || consentAfterAttempts.statementKey === 'tampered') throw new Error('Consent immutability persistence proof failed')

  completed = true
  console.log(JSON.stringify({
    flow: 'booking -> generated intake -> submitted intake',
    appointmentStatus: persisted.appointments[0].status,
    intakeStatus: persisted.intakeForms[0].status,
    messageStates: persisted.messages.map((message) => `${message.direction}:${message.status}`).sort(),
    consentTypes: persisted.consents.map((consent) => consent.consentType).sort(),
    auditEvents: persisted.clinicalAuditLogs.map((event) => event.eventType).sort(),
    deniedGenericCreateCount: deniedGenericCreates.length,
    negativeProofs: ['raw lists empty', 'all generic singular/bulk creates denied anonymously', 'public generic user create denied', 'initialized createInitialUser denied with stable User/Role counts', 'authenticated consent update/delete omitted and persisted unchanged', 'evidence CRUD omitted', 'false consent denied', 'duplicate contact reveals no global patient-existence state', 'contact update remains scoped to the capability patient', 'plaintext bearer absent from storage', 'concurrent bearer claim exactly once', 'consumed bearer lookup and replay denied'],
    authenticatedEvidenceRead: true,
    cleanup: 'pending',
  }))
} finally {
  const triggerBypass = await beginDisposableCleanup(prisma)
  try { await cleanupRuntimeFlowPatient() } finally { await endDisposableCleanup(prisma, triggerBypass) }
  const remaining = await prisma.patient.count({ where: { OR: [{ email: patientEmail }, ...(runtimePatientId ? [{ id: runtimePatientId }] : [])] } })
  if (remaining) throw new Error('Disposable runtime-flow patient cleanup failed')

  if (baseline) {
    const after = await snapshotCounts()
    if (JSON.stringify(after) !== JSON.stringify(baseline)) {
      throw new Error(`Runtime-flow cleanup did not restore baseline counts: before=${JSON.stringify(baseline)} after=${JSON.stringify(after)}`)
    }
  }

  await prisma.$disconnect()
  if (completed) console.log('Disposable runtime flow cleanup passed; canonical counts restored.')
}

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
assertLocalGraphqlEndpoint(endpoint, 'access proof')
assertSafeRuntimeDatabase(databaseUrl, 'access proof')

const prisma = new PrismaClient()
const runId = randomUUID().replaceAll('-', '').slice(0, 12)
const password = `RuntimeAccess-${runId}-Password!`
const prefix = `runtime-access-${runId}`
const proofStartedAt = new Date()
let adminUserId = ''
const created = {
  roleIds: [],
  userIds: [],
  facilityIds: [],
  providerIds: [],
  appointmentTypeIds: [],
  patientIds: [],
  appointmentIds: [],
  intakeIds: [],
  encounterIds: [],
  medicalOrderIds: [],
  labResultIds: [],
  labTestIds: [],
  prescriptionIds: [],
  insuranceClaimIds: [],
  messageIds: [],
  portalIds: [],
  departmentIds: [],
  wardIds: [],
  roomIds: [],
  clinicianIds: [],
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
  const payload = await rawGraphQL(query, variables || {}, cookie)
  const messages = errorMessages(payload)
  const omittedFromSchema = messages.includes('Cannot query field') || messages.includes('Unknown type')
  const productionMasked = process.env.NODE_ENV === 'production' && messages.includes('Unexpected error')
  if (!payload.errors?.length || (expected && !omittedFromSchema && !productionMasked && !messages.includes(expected))) {
    throw new Error(`${name} was not denied as expected: ${messages || 'no GraphQL error'}; payload=${JSON.stringify(payload)}`)
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
  if (!data.createUser?.id) throw new Error(`User creation failed for ${email}`)
  created.userIds.push(data.createUser.id)
  return data.createUser
}

async function snapshotCounts() {
  const [roles, users, facilities, providers, patients, appointments, intakes, encounters, medicalOrders, labResults, prescriptions, insuranceClaims, messages, portals, phiReadAudits] = await Promise.all([
    prisma.role.count(),
    prisma.user.count(),
    prisma.facility.count(),
    prisma.provider.count(),
    prisma.patient.count(),
    prisma.appointment.count(),
    prisma.intakeForm.count(),
    prisma.encounter.count(),
    prisma.medicalOrder.count(),
    prisma.labResult.count(),
    prisma.prescription.count(),
    prisma.insuranceClaim.count(),
    prisma.patientMessage.count(),
    prisma.patientPortalAccess.count(),
    prisma.phiReadAudit.count(),
  ])
  return { roles, users, facilities, providers, patients, appointments, intakes, encounters, medicalOrders, labResults, prescriptions, insuranceClaims, messages, portals, phiReadAudits }
}

async function cleanup() {
  await prisma.$transaction([
    prisma.phiReadAudit.deleteMany({
      where: {
        occurredAt: { gte: proofStartedAt },
        actorReference: { in: [adminUserId, ...created.userIds].filter(Boolean) },
      },
    }),
    prisma.clinicalAuditLog.deleteMany({ where: { patientId: { in: created.patientIds } } }),
    prisma.patientConsent.deleteMany({ where: { patientId: { in: created.patientIds } } }),
    prisma.patientMessage.deleteMany({ where: { patientId: { in: created.patientIds } } }),
    prisma.intakeForm.deleteMany({ where: { patientId: { in: created.patientIds } } }),
    prisma.labResult.deleteMany({ where: { OR: [{ id: { in: created.labResultIds } }, { patientId: { in: created.patientIds } }] } }),
    prisma.labTest.deleteMany({ where: { id: { in: created.labTestIds } } }),
    prisma.prescription.deleteMany({ where: { id: { in: created.prescriptionIds } } }),
    prisma.insuranceClaim.deleteMany({ where: { OR: [{ id: { in: created.insuranceClaimIds } }, { patientId: { in: created.patientIds } }] } }),
    prisma.medicalOrder.deleteMany({ where: { id: { in: created.medicalOrderIds } } }),
    prisma.encounter.deleteMany({ where: { patientId: { in: created.patientIds } } }),
    prisma.appointment.deleteMany({ where: { patientId: { in: created.patientIds } } }),
    prisma.appointmentType.deleteMany({ where: { id: { in: created.appointmentTypeIds } } }),
    prisma.patientPortalAccess.deleteMany({ where: { id: { in: created.portalIds } } }),
    prisma.patient.deleteMany({ where: { id: { in: created.patientIds } } }),
    prisma.clinician.deleteMany({ where: { id: { in: created.clinicianIds } } }),
    prisma.room.deleteMany({ where: { id: { in: created.roomIds } } }),
    prisma.ward.deleteMany({ where: { id: { in: created.wardIds } } }),
    prisma.department.deleteMany({ where: { id: { in: created.departmentIds } } }),
    prisma.provider.deleteMany({ where: { id: { in: created.providerIds } } }),
    prisma.user.deleteMany({ where: { id: { in: created.userIds } } }),
    prisma.facility.deleteMany({ where: { id: { in: created.facilityIds } } }),
    prisma.role.deleteMany({ where: { id: { in: created.roleIds } } }),
  ])
}

const scopedQuery = `query ScopedHospitalRows {
  patients(orderBy: [{ createdAt: asc }]) { id firstName displayName email insuranceSummary notes }
  providers(orderBy: [{ createdAt: asc }]) { id firstName lastName metadata }
  facilities(orderBy: [{ createdAt: asc }]) { id slug metadata }
  appointments(orderBy: [{ createdAt: asc }]) { id appointmentNumber reasonForVisit operationalNotes metadata }
  intakeForms(orderBy: [{ createdAt: asc }]) { id title responses reviewNotes accessCodeHash }
  encounters(orderBy: [{ createdAt: asc }]) { id encounterNumber chiefComplaint diagnosisSummary metadata }
  labResults(orderBy: [{ createdAt: asc }]) { id resultNumber resultValue referenceRange abnormalFlag metadata }
  prescriptions(orderBy: [{ createdAt: asc }]) { id prescriptionNumber medicationName dosage frequency notes }
  insuranceClaims(orderBy: [{ createdAt: asc }]) { id claimNumber payerName billedAmountCents paidAmountCents denialReason metadata }
  patientMessages(orderBy: [{ createdAt: asc }]) { id subject body status externalId metadata }
}`

function ids(items) {
  return new Set((items || []).map((item) => item.id))
}

function expectOnly(label, items, expectedId) {
  const actual = [...ids(items)]
  if (actual.length !== 1 || actual[0] !== expectedId) {
    throw new Error(`${label} scope mismatch: ${JSON.stringify(actual)}; expected only ${expectedId}`)
  }
}

function expectNone(label, items) {
  if (items?.length) throw new Error(`${label} unexpectedly exposed ${items.length} rows`)
}

let baseline
let completed = false

try {
  baseline = await snapshotCounts()
  const adminCredentials = JSON.parse(await readFile(credentialsPath, 'utf8'))
  const adminEmail = adminCredentials.email || adminCredentials.identity
  const adminCookie = await authenticate(adminEmail, adminCredentials.password)
  const admin = await graphql(
    'global clinical permission proof',
    `query { authenticatedItem { ... on User { id role { id name canAccessAllClinicalData } } } }`,
    {},
    adminCookie,
  )
  if (!admin.authenticatedItem?.role?.canAccessAllClinicalData) {
    throw new Error('Maintained runtime administrator was not backfilled with explicit global clinical access')
  }
  adminUserId = admin.authenticatedItem.id

  const scopedRoleData = {
    canManageAppointments: true,
    canManageScheduling: true,
    canManagePatients: true,
    canManageProviders: true,
    canManageIntake: true,
    canManageCommunications: true,
    canViewReports: true,
    canAccessDashboard: true,
    canAccessAllClinicalData: false,
  }
  const [scopedRole, patientRole, delegatedRoleAdmin, billingRole] = await Promise.all([
    prisma.role.create({ data: { name: `${prefix}-scoped`, ...scopedRoleData } }),
    prisma.role.create({ data: { name: `${prefix}-patient`, canAccessAllClinicalData: false } }),
    prisma.role.create({
      data: {
        name: `${prefix}-delegated-role-admin`,
        canManageOnboarding: true,
        canManagePeople: true,
        canManageRoles: true,
        canAccessDashboard: true,
        canAccessAllClinicalData: false,
      },
    }),
    prisma.role.create({
      data: { name: `${prefix}-billing`, canManageBilling: true, canAccessDashboard: true, canAccessAllClinicalData: false },
    }),
  ])
  created.roleIds.push(scopedRole.id, patientRole.id, delegatedRoleAdmin.id, billingRole.id)

  const [facilityA, facilityB] = await Promise.all([
    prisma.facility.create({ data: { name: `${prefix}-A`, slug: `${prefix}-a`, facilityType: 'clinic', status: 'active' } }),
    prisma.facility.create({ data: { name: `${prefix}-B`, slug: `${prefix}-b`, facilityType: 'clinic', status: 'active' } }),
  ])
  created.facilityIds.push(facilityA.id, facilityB.id)

  const facilityUser = await createUser(adminCookie, {
    name: 'Runtime Facility A',
    email: `${prefix}-facility@example.test`,
    roleId: scopedRole.id,
    facilityIds: [facilityA.id],
  })
  await createUser(adminCookie, {
    name: 'Runtime Role Only',
    email: `${prefix}-role-only@example.test`,
    roleId: scopedRole.id,
  })
  const delegatedRoleUser = await createUser(adminCookie, {
    name: 'Runtime Delegated Role Admin',
    email: `${prefix}-delegated-role-admin@example.test`,
    roleId: delegatedRoleAdmin.id,
  })
  await createUser(adminCookie, {
    name: 'Runtime Billing Facility A',
    email: `${prefix}-billing@example.test`,
    roleId: billingRole.id,
    facilityIds: [facilityA.id],
  })
  const providerUserA = await createUser(adminCookie, {
    name: 'Runtime Provider A',
    email: `${prefix}-provider-a@example.test`,
    roleId: scopedRole.id,
  })
  const providerUserB = await createUser(adminCookie, {
    name: 'Runtime Provider B',
    email: `${prefix}-provider-b@example.test`,
    roleId: scopedRole.id,
  })
  const patientUserA = await createUser(adminCookie, {
    name: 'Runtime Patient A',
    email: `${prefix}-patient-a@example.test`,
    roleId: patientRole.id,
  })
  const patientUserB = await createUser(adminCookie, {
    name: 'Runtime Patient B',
    email: `${prefix}-patient-b@example.test`,
    roleId: patientRole.id,
  })

  const [providerA, providerB] = await Promise.all([
    prisma.provider.create({
      data: {
        firstName: 'Provider', lastName: `A-${runId}`, status: 'active', locationName: facilityA.name,
        userId: providerUserA.id, facilities: { connect: { id: facilityA.id } },
      },
    }),
    prisma.provider.create({
      data: {
        firstName: 'Provider', lastName: `B-${runId}`, status: 'active', locationName: facilityB.name,
        userId: providerUserB.id, facilities: { connect: { id: facilityB.id } },
      },
    }),
  ])
  created.providerIds.push(providerA.id, providerB.id)
  const accessAppointmentType = await prisma.appointmentType.create({
    data: {
      name: `${prefix} scoped visit`, slug: `${prefix}-scoped-visit`, status: 'bookable', durationMinutes: 30,
      providers: { connect: [{ id: providerA.id }, { id: providerB.id }] },
    },
  })
  created.appointmentTypeIds.push(accessAppointmentType.id)

  const [departmentA, departmentB] = await Promise.all([
    prisma.department.create({ data: { name: `${prefix}-Department A`, code: `${prefix}-dept-a`, facilities: { connect: { id: facilityA.id } } } }),
    prisma.department.create({ data: { name: `${prefix}-Department B`, code: `${prefix}-dept-b`, facilities: { connect: { id: facilityB.id } } } }),
  ])
  created.departmentIds.push(departmentA.id, departmentB.id)
  const [wardA, wardB] = await Promise.all([
    prisma.ward.create({ data: { name: `${prefix}-Ward A`, departmentId: departmentA.id } }),
    prisma.ward.create({ data: { name: `${prefix}-Ward B`, departmentId: departmentB.id } }),
  ])
  created.wardIds.push(wardA.id, wardB.id)
  const [roomA, roomB] = await Promise.all([
    prisma.room.create({ data: { roomNumber: `${prefix}-ROOM-A`, wardId: wardA.id } }),
    prisma.room.create({ data: { roomNumber: `${prefix}-ROOM-B`, wardId: wardB.id } }),
  ])
  created.roomIds.push(roomA.id, roomB.id)
  const [clinicianA, clinicianB] = await Promise.all([
    prisma.clinician.create({ data: { displayName: `${prefix} Clinician A`, providerId: providerA.id, departmentId: departmentA.id } }),
    prisma.clinician.create({ data: { displayName: `${prefix} Clinician B`, providerId: providerB.id, departmentId: departmentB.id } }),
  ])
  created.clinicianIds.push(clinicianA.id, clinicianB.id)

  const [patientA, patientB] = await Promise.all([
    prisma.patient.create({
      data: {
        firstName: 'Patient', lastName: `A-${runId}`, email: `${prefix}-a@phi.example.test`, status: 'active',
        notes: 'Facility A restricted PHI', insuranceSummary: { memberId: `A-${runId}` }, userId: patientUserA.id,
        facilities: { connect: { id: facilityA.id } },
      },
    }),
    prisma.patient.create({
      data: {
        firstName: 'Patient', lastName: `B-${runId}`, email: `${prefix}-b@phi.example.test`, status: 'active',
        notes: 'Facility B restricted PHI', insuranceSummary: { memberId: `B-${runId}` }, userId: patientUserB.id,
        facilities: { connect: { id: facilityB.id } },
      },
    }),
  ])
  created.patientIds.push(patientA.id, patientB.id)

  const start = new Date(Date.now() + 48 * 60 * 60_000)
  const end = new Date(start.getTime() + 30 * 60_000)
  const [appointmentA, appointmentB] = await Promise.all([
    prisma.appointment.create({
      data: {
        appointmentNumber: `APT-ACCESS-A-${runId}`, bookingLockKey: `access-a:${runId}`, status: 'requested',
        patientId: patientA.id, providerId: providerA.id, facilityId: facilityA.id, appointmentTypeId: accessAppointmentType.id,
        startsAt: start, endsAt: end, reasonForVisit: 'Facility A restricted reason', source: 'front_desk',
      },
    }),
    prisma.appointment.create({
      data: {
        appointmentNumber: `APT-ACCESS-B-${runId}`, bookingLockKey: `access-b:${runId}`, status: 'requested',
        patientId: patientB.id, providerId: providerB.id, facilityId: facilityB.id, appointmentTypeId: accessAppointmentType.id,
        startsAt: new Date(start.getTime() + 60 * 60_000), endsAt: new Date(end.getTime() + 60 * 60_000),
        reasonForVisit: 'Facility B restricted reason', source: 'front_desk',
      },
    }),
  ])
  created.appointmentIds.push(appointmentA.id, appointmentB.id)

  const tokenA = `${prefix}-intake-token-a`
  const tokenB = `${prefix}-intake-token-b`
  const expiry = new Date(Date.now() + 24 * 60 * 60_000)
  const [intakeA, intakeB] = await Promise.all([
    prisma.intakeForm.create({
      data: {
        title: 'Facility A restricted intake', status: 'submitted', facilityId: facilityA.id, patientId: patientA.id, appointmentId: appointmentA.id,
        operationKeyHash: createHash('sha256').update(`${prefix}-intake-a-operation`).digest('hex'),
        requestHash: createHash('sha256').update(`${prefix}-intake-a-request`).digest('hex'),
        accessCodeHash: createHash('sha256').update(tokenA).digest('hex'), accessExpiresAt: expiry,
        responses: { restricted: 'A' }, submittedAt: new Date(),
      },
    }),
    prisma.intakeForm.create({
      data: {
        title: 'Facility B restricted intake', status: 'submitted', facilityId: facilityB.id, patientId: patientB.id, appointmentId: appointmentB.id,
        operationKeyHash: createHash('sha256').update(`${prefix}-intake-b-operation`).digest('hex'),
        requestHash: createHash('sha256').update(`${prefix}-intake-b-request`).digest('hex'),
        accessCodeHash: createHash('sha256').update(tokenB).digest('hex'), accessExpiresAt: expiry,
        responses: { restricted: 'B' }, submittedAt: new Date(),
      },
    }),
  ])
  created.intakeIds.push(intakeA.id, intakeB.id)

  const [encounterA, encounterB] = await Promise.all([
    prisma.encounter.create({
      data: {
        encounterNumber: `ENC-ACCESS-A-${runId}`, status: 'open', patientId: patientA.id,
        providerId: providerA.id, appointmentId: appointmentA.id, facilityId: facilityA.id,
        transitionVersion: 1,
        operationKeyHash: createHash('sha256').update(`${prefix}-encounter-a`).digest('hex'),
        requestHash: createHash('sha256').update(`${prefix}-encounter-a-request`).digest('hex'),
        actorReference: 'runtime-validator',
        chiefComplaint: 'Facility A restricted complaint',
      },
    }),
    prisma.encounter.create({
      data: {
        encounterNumber: `ENC-ACCESS-B-${runId}`, status: 'open', patientId: patientB.id,
        providerId: providerB.id, appointmentId: appointmentB.id, facilityId: facilityB.id,
        transitionVersion: 1,
        operationKeyHash: createHash('sha256').update(`${prefix}-encounter-b`).digest('hex'),
        requestHash: createHash('sha256').update(`${prefix}-encounter-b-request`).digest('hex'),
        actorReference: 'runtime-validator',
        chiefComplaint: 'Facility B restricted complaint',
      },
    }),
  ])
  created.encounterIds.push(encounterA.id, encounterB.id)

  let labTest = await prisma.labTest.findFirst({ where: { active: true } })
  if (!labTest) {
    labTest = await prisma.labTest.create({ data: {
      name: 'Runtime access proof panel', code: `${prefix}-lab-test`, category: 'runtime-proof',
      specimenType: 'synthetic', turnaroundHours: 1, active: true,
    } })
    created.labTestIds.push(labTest.id)
  }
  const [medicalOrderA, medicalOrderB] = await Promise.all([
    prisma.medicalOrder.create({
      data: {
        orderNumber: `ORDER-ACCESS-A-${runId}`, orderType: 'lab', status: 'completed', patientId: patientA.id,
        encounterId: encounterA.id, orderingProviderId: providerA.id, facilityId: facilityA.id,
        operationKeyHash: createHash('sha256').update(`${prefix}-order-a`).digest('hex'),
        requestHash: createHash('sha256').update(`${prefix}-order-a-request`).digest('hex'),
        actorReference: 'runtime-validator', orderedAt: new Date(), completedAt: new Date(), summary: 'Access proof order A',
      },
    }),
    prisma.medicalOrder.create({
      data: {
        orderNumber: `ORDER-ACCESS-B-${runId}`, orderType: 'lab', status: 'completed', patientId: patientB.id,
        encounterId: encounterB.id, orderingProviderId: providerB.id, facilityId: facilityB.id,
        operationKeyHash: createHash('sha256').update(`${prefix}-order-b`).digest('hex'),
        requestHash: createHash('sha256').update(`${prefix}-order-b-request`).digest('hex'),
        actorReference: 'runtime-validator', orderedAt: new Date(), completedAt: new Date(), summary: 'Access proof order B',
      },
    }),
  ])
  created.medicalOrderIds.push(medicalOrderA.id, medicalOrderB.id)

  const [labResultA, labResultB, prescriptionA, prescriptionB, insuranceClaimA, insuranceClaimB] = await Promise.all([
    prisma.labResult.create({
      data: {
        resultNumber: `LAB-ACCESS-A-${runId}`, patientId: patientA.id, encounterId: encounterA.id, facilityId: facilityA.id,
        medicalOrderId: medicalOrderA.id, labTestId: labTest.id, actorReference: 'runtime-validator',
        operationKeyHash: createHash('sha256').update(`${prefix}-lab-a`).digest('hex'), requestHash: createHash('sha256').update(`${prefix}-lab-a-request`).digest('hex'),
        status: 'final', resultValue: 'A-positive', referenceRange: 'A-range', abnormalFlag: 'high',
        resultedAt: new Date(), metadata: { restricted: 'lab-a' },
      },
    }),
    prisma.labResult.create({
      data: {
        resultNumber: `LAB-ACCESS-B-${runId}`, patientId: patientB.id, encounterId: encounterB.id, facilityId: facilityB.id,
        medicalOrderId: medicalOrderB.id, labTestId: labTest.id, actorReference: 'runtime-validator',
        operationKeyHash: createHash('sha256').update(`${prefix}-lab-b`).digest('hex'), requestHash: createHash('sha256').update(`${prefix}-lab-b-request`).digest('hex'),
        status: 'final', resultValue: 'B-positive', referenceRange: 'B-range', abnormalFlag: 'critical',
        resultedAt: new Date(), metadata: { restricted: 'lab-b' },
      },
    }),
    prisma.prescription.create({
      data: {
        prescriptionNumber: `RX-ACCESS-A-${runId}`, patientId: patientA.id, providerId: providerA.id,
        encounterId: encounterA.id, facilityId: facilityA.id,
        operationKeyHash: createHash('sha256').update(`${prefix}-rx-a`).digest('hex'), requestHash: createHash('sha256').update(`${prefix}-rx-a-request`).digest('hex'), medicationName: 'Facility A restricted medication', dosage: 'A-dose',
        frequency: 'A-frequency', status: 'active', recordingBasis: 'manual_reconciliation', startsAt: new Date(), notes: 'Facility A restricted prescription note',
      },
    }),
    prisma.prescription.create({
      data: {
        prescriptionNumber: `RX-ACCESS-B-${runId}`, patientId: patientB.id, providerId: providerB.id,
        encounterId: encounterB.id, facilityId: facilityB.id,
        operationKeyHash: createHash('sha256').update(`${prefix}-rx-b`).digest('hex'), requestHash: createHash('sha256').update(`${prefix}-rx-b-request`).digest('hex'), medicationName: 'Facility B restricted medication', dosage: 'B-dose',
        frequency: 'B-frequency', status: 'active', recordingBasis: 'manual_reconciliation', startsAt: new Date(), notes: 'Facility B restricted prescription note',
      },
    }),
    prisma.insuranceClaim.create({
      data: {
        claimNumber: `CLAIM-ACCESS-A-${runId}`, patientId: patientA.id, encounterId: encounterA.id, facilityId: facilityA.id,
        operationKeyHash: createHash('sha256').update(`${prefix}-claim-a`).digest('hex'), requestHash: createHash('sha256').update(`${prefix}-claim-a-request`).digest('hex'),
        payerName: 'Facility A restricted payer', status: 'draft', billedAmountCents: 12345,
        paidAmountCents: 0, denialReason: 'Facility A restricted claim note', metadata: { restricted: 'claim-a' },
      },
    }),
    prisma.insuranceClaim.create({
      data: {
        claimNumber: `CLAIM-ACCESS-B-${runId}`, patientId: patientB.id, encounterId: encounterB.id, facilityId: facilityB.id,
        operationKeyHash: createHash('sha256').update(`${prefix}-claim-b`).digest('hex'), requestHash: createHash('sha256').update(`${prefix}-claim-b-request`).digest('hex'),
        payerName: 'Facility B restricted payer', status: 'draft', billedAmountCents: 23456,
        paidAmountCents: 0, denialReason: 'Facility B restricted claim note', metadata: { restricted: 'claim-b' },
      },
    }),
  ])
  created.labResultIds.push(labResultA.id, labResultB.id)
  created.prescriptionIds.push(prescriptionA.id, prescriptionB.id)
  created.insuranceClaimIds.push(insuranceClaimA.id, insuranceClaimB.id)

  const messageA = await prisma.patientMessage.create({
    data: {
      facilityId: facilityA.id, patientId: patientA.id, appointmentId: appointmentA.id, direction: 'outbound', channel: 'phone',
      operationKeyHash: createHash('sha256').update(`${prefix}-message-a-operation`).digest('hex'),
      requestHash: createHash('sha256').update(`${prefix}-message-a-request`).digest('hex'),
      purpose: 'care_operations', status: 'manual_required', subject: 'Facility A restricted subject', body: 'Facility A restricted body',
    },
  })
  created.messageIds.push(messageA.id)
  const portalA = await prisma.patientPortalAccess.create({
    data: {
      facilityId: facilityA.id, patientId: patientA.id,
      operationKeyHash: createHash('sha256').update(`${prefix}-portal-a-operation`).digest('hex'),
      requestHash: createHash('sha256').update(`${prefix}-portal-a-request`).digest('hex'),
      status: 'invited', inviteEmail: `${prefix}-a@phi.example.test`,
      inviteTokenDigest: createHash('sha256').update(`${prefix}-portal-a`).digest('hex'), invitedAt: new Date(),
    },
  })
  created.portalIds.push(portalA.id)

  const [facilityCookie, roleOnlyCookie, delegatedRoleCookie, providerCookie, patientCookie, billingCookie] = await Promise.all([
    authenticate(`${prefix}-facility@example.test`),
    authenticate(`${prefix}-role-only@example.test`),
    authenticate(`${prefix}-delegated-role-admin@example.test`),
    authenticate(`${prefix}-provider-a@example.test`),
    authenticate(`${prefix}-patient-a@example.test`),
    authenticate(`${prefix}-billing@example.test`),
  ])

  const nonGlobalPortalRows = await graphql(
    'non-global legacy portal list',
    `query { patientPortalAccesses { id } }`,
    {},
    facilityCookie,
  )
  expectNone('non-global legacy portals', nonGlobalPortalRows.patientPortalAccesses)
  const globalPortalRows = await graphql(
    'global legacy portal retained-data read',
    `query($id: ID!) { patientPortalAccess(where: { id: $id }) { id inviteEmail inviteTokenDigest status } }`,
    { id: portalA.id },
    adminCookie,
  )
  if (
    globalPortalRows.patientPortalAccess?.id !== portalA.id ||
    globalPortalRows.patientPortalAccess.inviteEmail !== `${prefix}-a@phi.example.test` ||
    globalPortalRows.patientPortalAccess.inviteTokenDigest !== null
  ) {
    throw new Error('Legacy portal retained-data boundary is not global-only and digest-hidden')
  }
  await expectDenied(
    'global inverse legacy portal mutation',
    `mutation($userId: ID!, $portalId: ID!) { updateUser(where: { id: $userId }, data: { patientPortalAccess: { connect: { id: $portalId } } }) { id } }`,
    { userId: admin.authenticatedItem.id, portalId: portalA.id },
    adminCookie,
    'Access denied',
  )

  await expectDenied(
    'scoped manager facility creation',
    `mutation($data: FacilityCreateInput!) { createFacility(data: $data) { id } }`,
    { data: { name: `${prefix}-injected`, slug: `${prefix}-injected`, facilityType: 'clinic', status: 'active' } },
    facilityCookie,
    'Access denied',
  )
  await expectDenied(
    'scoped manager provider relationship reassignment',
    `mutation($id: ID!, $facilityId: ID!) { updateProvider(where: { id: $id }, data: { facilities: { set: [{ id: $facilityId }] } }) { id } }`,
    { id: providerA.id, facilityId: facilityB.id },
    facilityCookie,
    'Access denied',
  )
  await expectDenied(
    'scoped manager ward relationship reassignment',
    `mutation($id: ID!, $departmentId: ID!) { updateWard(where: { id: $id }, data: { department: { connect: { id: $departmentId } } }) { id } }`,
    { id: wardA.id, departmentId: departmentB.id },
    facilityCookie,
    'Access denied',
  )
  await expectDenied(
    'scoped manager cross-facility room creation',
    `mutation($data: RoomCreateInput!) { createRoom(data: $data) { id } }`,
    { data: { roomNumber: `${prefix}-injected-room`, ward: { connect: { id: wardB.id } } } },
    facilityCookie,
    'Access denied',
  )
  await expectDenied(
    'scoped manager cross-facility clinician creation',
    `mutation($data: ClinicianCreateInput!) { createClinician(data: $data) { id } }`,
    { data: { displayName: `${prefix} injected clinician`, provider: { connect: { id: providerB.id } }, department: { connect: { id: departmentB.id } } } },
    facilityCookie,
    'Access denied',
  )
  let mismatchedBedDenied = false
  try {
    const mismatched = await prisma.bed.create({
      data: { bedNumber: `${prefix}-MISMATCH`, roomId: roomB.id, facilityId: facilityA.id, status: 'available' },
    })
    await prisma.bed.delete({ where: { id: mismatched.id } })
  } catch {
    mismatchedBedDenied = true
  }
  if (!mismatchedBedDenied) throw new Error('Database accepted a bed whose room belongs to another facility')

  const billingRows = await graphql(
    'billing-only direct facility patient resolution',
    `query { patients(orderBy: [{ createdAt: asc }]) { id displayName email } }`,
    {},
    billingCookie,
  )
  expectOnly('billing facility patient', billingRows.patients, patientA.id)
  if (!billingRows.patients[0]?.displayName || billingRows.patients[0]?.email !== patientA.email) {
    throw new Error('Billing-only operator could not resolve the in-facility patient identity')
  }

  const facilityRows = await graphql('facility A scope', scopedQuery, {}, facilityCookie)
  const phiAudit = await prisma.phiReadAudit.findFirst({
    where: { actorReference: facilityUser.id, operationName: 'ScopedHospitalRows', occurredAt: { gte: proofStartedAt } },
    orderBy: { occurredAt: 'desc' },
  })
  const phiDescriptor = JSON.stringify(phiAudit || {})
  if (
    !phiAudit || phiAudit.eventType !== 'phi.read' || !phiAudit.success || phiAudit.resultCount < 1 ||
    !Array.isArray(phiAudit.rootFields) || !phiAudit.rootFields.includes('patients') ||
    !Array.isArray(phiAudit.selectedFields) || !phiAudit.selectedFields.includes('email') ||
    !/^[a-f0-9]{64}$/.test(phiAudit.selectionDigest) ||
    /Facility A restricted|phi\.example\.test|A-positive/.test(phiDescriptor)
  ) {
    throw new Error('Authenticated PHI-read audit descriptor was missing, incomplete, or value-bearing')
  }
  expectOnly('facility patient', facilityRows.patients, patientA.id)
  expectOnly('facility provider', facilityRows.providers, providerA.id)
  expectOnly('facility facility', facilityRows.facilities, facilityA.id)
  expectOnly('facility appointment', facilityRows.appointments, appointmentA.id)
  expectOnly('facility intake', facilityRows.intakeForms, intakeA.id)
  expectOnly('facility encounter', facilityRows.encounters, encounterA.id)
  expectOnly('facility lab result', facilityRows.labResults, labResultA.id)
  expectOnly('facility prescription', facilityRows.prescriptions, prescriptionA.id)
  expectOnly('facility insurance claim', facilityRows.insuranceClaims, insuranceClaimA.id)
  expectOnly('facility message', facilityRows.patientMessages, messageA.id)
  if (
    facilityRows.patients[0].email !== `${prefix}-a@phi.example.test` ||
    facilityRows.intakeForms[0].responses?.restricted !== 'A' ||
    facilityRows.labResults[0].resultValue !== 'A-positive' ||
    facilityRows.prescriptions[0].medicationName !== 'Facility A restricted medication' ||
    facilityRows.insuranceClaims[0].payerName !== 'Facility A restricted payer'
  ) {
    throw new Error('Authorized facility role did not receive its in-scope PHI')
  }
  if (facilityRows.intakeForms[0].accessCodeHash !== null) {
    throw new Error('Credential digests were exposed through GraphQL')
  }

  const providerRows = await graphql('provider A scope', scopedQuery, {}, providerCookie)
  expectOnly('provider patient', providerRows.patients, patientA.id)
  expectOnly('provider provider', providerRows.providers, providerA.id)
  expectOnly('provider facility', providerRows.facilities, facilityA.id)
  expectOnly('provider appointment', providerRows.appointments, appointmentA.id)
  expectOnly('provider intake', providerRows.intakeForms, intakeA.id)
  expectOnly('provider encounter', providerRows.encounters, encounterA.id)
  expectOnly('provider lab result', providerRows.labResults, labResultA.id)
  expectOnly('provider prescription', providerRows.prescriptions, prescriptionA.id)
  expectOnly('provider insurance claim', providerRows.insuranceClaims, insuranceClaimA.id)

  const patientRows = await graphql('patient A owner scope', scopedQuery, {}, patientCookie)
  expectOnly('patient owner patient', patientRows.patients, patientA.id)
  expectOnly('patient owner provider', patientRows.providers, providerA.id)
  expectOnly('patient owner facility', patientRows.facilities, facilityA.id)
  expectOnly('patient owner appointment', patientRows.appointments, appointmentA.id)
  expectOnly('patient owner intake', patientRows.intakeForms, intakeA.id)
  expectOnly('patient owner encounter', patientRows.encounters, encounterA.id)
  expectOnly('patient owner lab result', patientRows.labResults, labResultA.id)
  expectOnly('patient owner prescription', patientRows.prescriptions, prescriptionA.id)
  expectOnly('patient owner insurance claim', patientRows.insuranceClaims, insuranceClaimA.id)
  expectOnly('patient owner message', patientRows.patientMessages, messageA.id)
  if (
    patientRows.patients[0].firstName !== null ||
    patientRows.patients[0].displayName !== null ||
    patientRows.patients[0].email !== null ||
    patientRows.intakeForms[0].responses !== null ||
    patientRows.encounters[0].chiefComplaint !== null ||
    patientRows.labResults[0].resultValue !== null ||
    patientRows.labResults[0].referenceRange !== null ||
    patientRows.labResults[0].abnormalFlag !== null ||
    patientRows.labResults[0].metadata !== null ||
    patientRows.prescriptions[0].medicationName !== null ||
    patientRows.prescriptions[0].dosage !== null ||
    patientRows.prescriptions[0].frequency !== null ||
    patientRows.prescriptions[0].notes !== null ||
    patientRows.insuranceClaims[0].payerName !== null ||
    patientRows.insuranceClaims[0].billedAmountCents !== null ||
    patientRows.insuranceClaims[0].paidAmountCents !== null ||
    patientRows.insuranceClaims[0].denialReason !== null ||
    patientRows.insuranceClaims[0].metadata !== null ||
    patientRows.patientMessages[0].body !== null
  ) {
    throw new Error('Sensitive clinical/intake/message fields were not denied to the patient raw GraphQL role')
  }

  const roleOnlyRows = await graphql('role without ownership scope', scopedQuery, {}, roleOnlyCookie)
  expectNone('role-only patients', roleOnlyRows.patients)
  expectNone('role-only providers', roleOnlyRows.providers)
  expectNone('role-only facilities', roleOnlyRows.facilities)
  expectNone('role-only appointments', roleOnlyRows.appointments)
  expectNone('role-only intakes', roleOnlyRows.intakeForms)
  expectNone('role-only encounters', roleOnlyRows.encounters)
  expectNone('role-only lab results', roleOnlyRows.labResults)
  expectNone('role-only prescriptions', roleOnlyRows.prescriptions)
  expectNone('role-only insurance claims', roleOnlyRows.insuranceClaims)
  expectNone('role-only messages', roleOnlyRows.patientMessages)

  const delegatedSession = await graphql(
    'delegated role administrator session proof',
    `query { authenticatedItem { ... on User { id role { id canManageOnboarding canManagePeople canManageRoles canAccessAllClinicalData } } } }`,
    {},
    delegatedRoleCookie,
  )
  if (
    delegatedSession.authenticatedItem?.role?.id !== delegatedRoleAdmin.id ||
    delegatedSession.authenticatedItem.role.canManageOnboarding !== true ||
    delegatedSession.authenticatedItem.role.canManagePeople !== true ||
    delegatedSession.authenticatedItem.role.canManageRoles !== true ||
    delegatedSession.authenticatedItem.role.canAccessAllClinicalData !== false
  ) {
    throw new Error(`Delegated role session was not least-privilege: ${JSON.stringify(delegatedSession.authenticatedItem)}`)
  }

  await expectDenied(
    'delegated role administrator global clinical escalation',
    `mutation($id: ID!) { updateRole(where: { id: $id }, data: { canAccessAllClinicalData: true }) { id } }`,
    { id: scopedRole.id },
    delegatedRoleCookie,
    'Access denied',
  )
  const adminRoleId = admin.authenticatedItem.role.id
  await expectDenied(
    'delegated people administrator direct assignment to global role',
    `mutation($id: ID!, $roleId: ID!) { updateUser(where: { id: $id }, data: { role: { connect: { id: $roleId } } }) { id } }`,
    { id: delegatedRoleUser.id, roleId: adminRoleId },
    delegatedRoleCookie,
    'Access denied',
  )
  await expectDenied(
    'delegated role administrator inverse assignment to global role',
    `mutation($id: ID!, $data: RoleUpdateInput!) { updateRole(where: { id: $id }, data: $data) { id } }`,
    {
      id: adminRoleId,
      data: { assignedTo: { connect: [{ id: delegatedRoleUser.id }] } },
    },
    delegatedRoleCookie,
    'Access denied',
  )
  await expectDenied(
    'delegated role administrator global role deletion',
    `mutation($id: ID!) { deleteRole(where: { id: $id }) { id } }`,
    { id: adminRoleId },
    delegatedRoleCookie,
    'Access denied',
  )
  await expectDenied(
    'delegated onboarding administrator raw intake create',
    `mutation($data: IntakeFormCreateInput!) { createIntakeForm(data: $data) { id } }`,
    {
      data: {
        title: 'Blocked cross-facility delegated intake',
        patient: { connect: { id: patientB.id } },
        appointment: { connect: { id: appointmentB.id } },
        accessExpiresAt: expiry.toISOString(),
      },
    },
    delegatedRoleCookie,
    'Access denied',
  )

  const [scopedRoleAfterEscalation, delegatedUserAfterEscalation, adminRoleAfterEscalation] = await Promise.all([
    prisma.role.findUnique({
      where: { id: scopedRole.id },
      select: { canAccessAllClinicalData: true },
    }),
    prisma.user.findUnique({ where: { id: delegatedRoleUser.id }, select: { roleId: true } }),
    prisma.role.findUnique({ where: { id: adminRoleId }, select: { id: true, canAccessAllClinicalData: true } }),
  ])
  if (scopedRoleAfterEscalation?.canAccessAllClinicalData) {
    throw new Error('Denied delegated role mutation granted global clinical access')
  }
  if (delegatedUserAfterEscalation?.roleId !== delegatedRoleAdmin.id) {
    throw new Error('Denied inverse role mutation reassigned a delegated administrator')
  }
  if (!adminRoleAfterEscalation?.canAccessAllClinicalData) {
    throw new Error('Denied delegated role mutation removed or changed the maintained global role')
  }

  const crossPatient = await graphql(
    'cross-patient singular negative',
    `query($patientId: ID!, $appointmentId: ID!, $labResultId: ID!, $prescriptionId: ID!, $claimId: ID!) {
      patient(where: { id: $patientId }) { id }
      appointment(where: { id: $appointmentId }) { id }
      labResult(where: { id: $labResultId }) { id }
      prescription(where: { id: $prescriptionId }) { id }
      insuranceClaim(where: { id: $claimId }) { id }
    }`,
    {
      patientId: patientB.id,
      appointmentId: appointmentB.id,
      labResultId: labResultB.id,
      prescriptionId: prescriptionB.id,
      claimId: insuranceClaimB.id,
    },
    facilityCookie,
  )
  if (
    crossPatient.patient !== null ||
    crossPatient.appointment !== null ||
    crossPatient.labResult !== null ||
    crossPatient.prescription !== null ||
    crossPatient.insuranceClaim !== null
  ) {
    throw new Error('Cross-facility singular GraphQL query exposed a PHI record')
  }

  await expectDenied(
    'cross-facility patient scope mutation',
    `mutation($id: ID!, $facilityId: ID!) { updatePatient(where: { id: $id }, data: { facilities: { connect: [{ id: $facilityId }] } }) { id } }`,
    { id: patientA.id, facilityId: facilityB.id },
    facilityCookie,
    'Access denied',
  )
  await expectDenied(
    'cross-facility provider scope mutation',
    `mutation($id: ID!, $facilityId: ID!) { updateProvider(where: { id: $id }, data: { facilities: { connect: [{ id: $facilityId }] } }) { id } }`,
    { id: providerA.id, facilityId: facilityB.id },
    facilityCookie,
    'Access denied',
  )
  await expectDenied(
    'cross-facility inverse scope mutation',
    `mutation($id: ID!, $patientId: ID!) { updateFacility(where: { id: $id }, data: { patients: { connect: [{ id: $patientId }] } }) { id } }`,
    { id: facilityA.id, patientId: patientB.id },
    facilityCookie,
    'Access denied',
  )
  await expectDenied(
    'self-service inverse patient ownership mutation',
    `mutation($id: ID!, $patientId: ID!) { updateUser(where: { id: $id }, data: { patientProfile: { connect: { id: $patientId } } }) { id } }`,
    { id: facilityUser.id, patientId: patientB.id },
    facilityCookie,
    'Access denied',
  )
  await expectDenied(
    'self-service inverse provider ownership mutation',
    `mutation($id: ID!, $providerId: ID!) { updateUser(where: { id: $id }, data: { providerProfile: { connect: { id: $providerId } } }) { id } }`,
    { id: facilityUser.id, providerId: providerB.id },
    facilityCookie,
    'Access denied',
  )
  await expectDenied(
    'self-service inverse portal ownership mutation',
    `mutation($id: ID!, $portalId: ID!) { updateUser(where: { id: $id }, data: { patientPortalAccess: { connect: { id: $portalId } } }) { id } }`,
    { id: facilityUser.id, portalId: portalA.id },
    facilityCookie,
    'Access denied',
  )
  await expectDenied(
    'self-service inverse intake reviewer mutation',
    `mutation($id: ID!, $intakeId: ID!) { updateUser(where: { id: $id }, data: { reviewedIntakeForms: { connect: [{ id: $intakeId }] } }) { id } }`,
    { id: facilityUser.id, intakeId: intakeB.id },
    facilityCookie,
    'Access denied',
  )
  await expectDenied(
    'scoped raw lab result create',
    `mutation($data: LabResultCreateInput!) { createLabResult(data: $data) { id } }`,
    {
      data: {
        resultNumber: `LAB-CROSS-${runId}`,
        patient: { connect: { id: patientB.id } },
        encounter: { connect: { id: encounterB.id } },
      },
    },
    facilityCookie,
    'Access denied',
  )
  await expectDenied(
    'scoped raw prescription create',
    `mutation($data: PrescriptionCreateInput!) { createPrescription(data: $data) { id } }`,
    {
      data: {
        prescriptionNumber: `RX-CROSS-${runId}`,
        medicationName: 'Blocked cross-facility medication',
        patient: { connect: { id: patientB.id } },
        provider: { connect: { id: providerB.id } },
        encounter: { connect: { id: encounterB.id } },
      },
    },
    facilityCookie,
    'Access denied',
  )
  await expectDenied(
    'scoped raw insurance claim create',
    `mutation($data: InsuranceClaimCreateInput!) { createInsuranceClaim(data: $data) { id } }`,
    {
      data: {
        claimNumber: `CLAIM-CROSS-${runId}`,
        patient: { connect: { id: patientB.id } },
        encounter: { connect: { id: encounterB.id } },
      },
    },
    facilityCookie,
    'Access denied',
  )
  await expectDenied(
    'lab result patient reassignment',
    `mutation($id: ID!, $patientId: ID!) { updateLabResult(where: { id: $id }, data: { patient: { connect: { id: $patientId } } }) { id } }`,
    { id: labResultA.id, patientId: patientB.id },
    facilityCookie,
    'Access denied',
  )
  await expectDenied(
    'prescription patient reassignment',
    `mutation($id: ID!, $patientId: ID!) { updatePrescription(where: { id: $id }, data: { patient: { connect: { id: $patientId } } }) { id } }`,
    { id: prescriptionA.id, patientId: patientB.id },
    facilityCookie,
    'Access denied',
  )
  await expectDenied(
    'insurance claim patient reassignment',
    `mutation($id: ID!, $patientId: ID!) { updateInsuranceClaim(where: { id: $id }, data: { patient: { connect: { id: $patientId } } }) { id } }`,
    { id: insuranceClaimA.id, patientId: patientB.id },
    facilityCookie,
    'Access denied',
  )
  const [patientScopeAfterMutation, providerScopeAfterMutation, facilityUserAfterMutation, intakeAfterReviewerMutation, labResultAfterMutation, prescriptionAfterMutation, claimAfterMutation] = await Promise.all([
    prisma.patient.findUnique({ where: { id: patientA.id }, select: { facilities: { select: { id: true } } } }),
    prisma.provider.findUnique({ where: { id: providerA.id }, select: { facilities: { select: { id: true } } } }),
    prisma.user.findUnique({
      where: { id: facilityUser.id },
      select: { patientProfile: { select: { id: true } }, providerProfile: { select: { id: true } }, patientPortalAccess: { select: { id: true } } },
    }),
    prisma.intakeForm.findUnique({ where: { id: intakeB.id }, select: { reviewedById: true } }),
    prisma.labResult.findUnique({ where: { id: labResultA.id }, select: { patientId: true, encounterId: true } }),
    prisma.prescription.findUnique({ where: { id: prescriptionA.id }, select: { patientId: true, providerId: true, encounterId: true } }),
    prisma.insuranceClaim.findUnique({ where: { id: insuranceClaimA.id }, select: { patientId: true, encounterId: true } }),
  ])
  if (
    patientScopeAfterMutation?.facilities.some((facility) => facility.id === facilityB.id) ||
    providerScopeAfterMutation?.facilities.some((facility) => facility.id === facilityB.id) ||
    facilityUserAfterMutation?.patientProfile !== null ||
    facilityUserAfterMutation.providerProfile !== null ||
    facilityUserAfterMutation.patientPortalAccess !== null ||
    intakeAfterReviewerMutation?.reviewedById !== null ||
    labResultAfterMutation?.patientId !== patientA.id ||
    labResultAfterMutation.encounterId !== encounterA.id ||
    prescriptionAfterMutation?.patientId !== patientA.id ||
    prescriptionAfterMutation.providerId !== providerA.id ||
    prescriptionAfterMutation.encounterId !== encounterA.id ||
    claimAfterMutation?.patientId !== patientA.id ||
    claimAfterMutation.encounterId !== encounterA.id
  ) {
    throw new Error('Denied ownership mutation changed a clinical relationship')
  }

  await expectDenied(
    'cross-facility appointment transition',
    `mutation($key: String!, $id: ID!) { transitionAppointment(operationKey: $key, appointmentId: $id, toStatus: "confirmed", expectedVersion: 1) { id } }`,
    { key: `${prefix}-cross-appointment`, id: appointmentB.id },
    facilityCookie,
    'not found or not accessible',
  )
  await expectDenied(
    'cross-facility encounter transition',
    `mutation($key: String!, $id: ID!) { transitionEncounter(operationKey: $key, encounterId: $id, toStatus: "in_progress", expectedVersion: 1) { id } }`,
    { key: `${prefix}-cross-encounter`, id: encounterB.id },
    facilityCookie,
    'not found or not accessible',
  )
  await expectDenied(
    'cross-facility intake transition',
    `mutation($key: String!, $id: ID!) { transitionIntakeReview(operationKey: $key, intakeFormId: $id, toStatus: "reviewed", expectedVersion: 1, reviewNotes: "blocked") { id } }`,
    { key: `${prefix}-cross-intake`, id: intakeB.id },
    facilityCookie,
    'not found or not accessible',
  )
  await expectDenied(
    'cross-facility secure message',
    `mutation($key: String!, $facilityId: ID!, $patientId: ID!) { sendSecurePatientMessage(operationKey: $key, facilityId: $facilityId, patientId: $patientId, channel: "phone", purpose: "care_operations", body: "blocked") { id } }`,
    { key: `${prefix}-cross-message`, facilityId: facilityB.id, patientId: patientB.id },
    facilityCookie,
    'not found or not accessible',
  )
  await expectDenied(
    'cross-facility provider schedule query',
    `query($facilityId: ID!, $providerId: ID!, $startsAt: String!, $endsAt: String!) {
      appointmentScheduleConflicts(facilityId: $facilityId, providerId: $providerId, startsAt: $startsAt, endsAt: $endsAt) { hasConflict }
    }`,
    { facilityId: facilityB.id, providerId: providerB.id, startsAt: start.toISOString(), endsAt: end.toISOString() },
    facilityCookie,
    'not found or not accessible',
  )

  await expectDenied(
    'raw appointment lifecycle update',
    `mutation($id: ID!) { updateAppointment(where: { id: $id }, data: { status: "completed" }) { id } }`,
    { id: appointmentA.id },
    facilityCookie,
    'Access denied',
  )
  await expectDenied(
    'raw intake lifecycle update',
    `mutation($id: ID!) { updateIntakeForm(where: { id: $id }, data: { status: "reviewed" }) { id } }`,
    { id: intakeA.id },
    facilityCookie,
    'Access denied',
  )
  await expectDenied(
    'raw encounter lifecycle update',
    `mutation($id: ID!) { updateEncounter(where: { id: $id }, data: { status: "closed" }) { id } }`,
    { id: encounterA.id },
    facilityCookie,
    'Access denied',
  )
  await expectDenied(
    'raw message lifecycle update',
    `mutation($id: ID!) { updatePatientMessage(where: { id: $id }, data: { status: "sent" }) { id } }`,
    { id: messageA.id },
    facilityCookie,
    'Access denied',
  )
  await expectDenied(
    'raw portal lifecycle update',
    `mutation($id: ID!) { updatePatientPortalAccess(where: { id: $id }, data: { status: "active" }) { id } }`,
    { id: portalA.id },
    facilityCookie,
    'Access denied',
  )
  await expectDenied(
    'raw lab result lifecycle update',
    `mutation($id: ID!) { updateLabResult(where: { id: $id }, data: { status: "corrected" }) { id } }`,
    { id: labResultA.id },
    facilityCookie,
    'Access denied',
  )
  await expectDenied(
    'raw prescription lifecycle update',
    `mutation($id: ID!) { updatePrescription(where: { id: $id }, data: { status: "completed" }) { id } }`,
    { id: prescriptionA.id },
    facilityCookie,
    'Access denied',
  )
  await expectDenied(
    'raw insurance claim lifecycle update',
    `mutation($id: ID!) { updateInsuranceClaim(where: { id: $id }, data: { status: "submitted" }) { id } }`,
    { id: insuranceClaimA.id },
    facilityCookie,
    'Access denied',
  )

  // Broad mutation-root introspection is intentionally over the runtime cost
  // ceiling. Verify omissions against the generated schema frozen with this
  // build while the live negative mutation probes above exercise execution.
  const generatedSchema = buildSchema(await readFile('schema.graphql', 'utf8'))
  const mutationNames = new Set(Object.keys(generatedSchema.getMutationType()?.getFields() || {}))
  for (const name of ['deleteAppointment', 'deleteIntakeForm', 'deleteEncounter', 'deletePatientPortalAccess', 'deleteLabResult', 'deletePrescription', 'deleteInsuranceClaim', 'updateVitalSign', 'deleteVitalSign']) {
    if (mutationNames.has(name)) throw new Error(`${name} remains exposed in the raw lifecycle schema`)
  }

  const adminCredentialProof = await graphql(
    'admin credential field denial',
    `query($intakeId: ID!, $portalId: ID!) {
      intakeForm(where: { id: $intakeId }) { id accessCodeHash }
      patientPortalAccess(where: { id: $portalId }) { id inviteTokenDigest }
    }`,
    { intakeId: intakeA.id, portalId: portalA.id },
    adminCookie,
  )
  if (adminCredentialProof.intakeForm?.accessCodeHash !== null || adminCredentialProof.patientPortalAccess?.inviteTokenDigest !== null) {
    throw new Error('Global administrator could raw-read a credential digest')
  }
  if (intakeA.accessCodeHash === tokenA || intakeA.accessCodeHash !== createHash('sha256').update(tokenA).digest('hex')) {
    throw new Error('Intake bearer was not hash-only in the database')
  }

  completed = true
  console.log(JSON.stringify({
    result: 'cross-patient-facility-provider-role-negatives-passed',
    scopedRowsPerFacility: 1,
    credentialFieldsDenied: true,
    rawLifecycleWritesClosed: true,
    customSudoOwnershipChecked: true,
    ownershipRelationshipWritesClosed: true,
    delegatedRoleEscalationDenied: true,
    globalRoleAssignmentAndDeletionDenied: true,
    labPrescriptionClaimScopeAndFieldProof: true,
    billingOnlyDirectFacilityPatientResolution: true,
  }))
} finally {
  const triggerBypass = await beginDisposableCleanup(prisma)
  try { await cleanup() } finally { await endDisposableCleanup(prisma, triggerBypass) }
  const after = await snapshotCounts()
  await prisma.$disconnect()
  if (baseline && JSON.stringify(after) !== JSON.stringify(baseline)) {
    throw new Error(`Access proof cleanup did not restore baseline: ${JSON.stringify({ baseline, after })}`)
  }
  if (completed) console.log('Disposable access-control cleanup passed; canonical counts restored.')
}

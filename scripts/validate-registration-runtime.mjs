import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PrismaClient } from '@prisma/client'
import { assertLocalGraphqlEndpoint, assertSafeRuntimeDatabase, beginDisposableCleanup, endDisposableCleanup } from './lib/runtime-guard.mjs'

const endpoint = process.env.OPENFRONT_GRAPHQL_URL || process.env.GRAPHQL_URL
const databaseUrl = process.env.DATABASE_URL
const credentialsPath = process.env.OPENFRONT_RUNTIME_ADMIN_PATH
if (!credentialsPath) throw new Error('OPENFRONT_RUNTIME_ADMIN_PATH is required')
assertLocalGraphqlEndpoint(endpoint, 'registration proof')
assertSafeRuntimeDatabase(databaseUrl, 'registration proof')

const prisma = new PrismaClient()
const runId = randomUUID().replaceAll('-', '').slice(0, 12)
const prefix = `runtime-registration-${runId}`
const password = `RuntimeRegistration-${runId}-Password!`
const created = { roleIds: [], userIds: [], facilityIds: [] }

async function rawGraphQL(query, variables = {}, cookie) {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`GraphQL HTTP ${response.status}`)
  return response.json()
}
function messages(payload) { return payload.errors?.flatMap((error) => [error.message, error.extensions?.originalError?.message]).filter(Boolean).join('; ') || '' }
async function graphql(name, query, variables = {}, cookie) { const payload = await rawGraphQL(query, variables, cookie); if (payload.errors?.length) throw new Error(`${name}: ${messages(payload)}`); return payload.data }
async function expectDenied(name, query, variables, cookie, expected) { const payload = await rawGraphQL(query, variables, cookie); const errorText = messages(payload); const productionMasked = process.env.NODE_ENV === 'production' && errorText.includes('Unexpected error'); if (!payload.errors?.length || (expected && !productionMasked && !errorText.includes(expected))) throw new Error(`${name} was not denied: ${errorText || JSON.stringify(payload)}`) }
async function authenticate(email, userPassword = password) {
  const data = await graphql('authenticate', `mutation($email:String!,$password:String!){authenticateUserWithPassword(email:$email,password:$password){... on UserAuthenticationWithPasswordSuccess{sessionToken item{id}} ... on UserAuthenticationWithPasswordFailure{message}}}`, { email, password: userPassword })
  const token = data.authenticateUserWithPassword?.sessionToken
  if (!token) throw new Error(`Authentication failed for ${email}`)
  return `keystonejs-session=${token}`
}
async function createUser(adminCookie, name, roleId, facilityId) {
  const data = await graphql('create operator', `mutation($data:UserCreateInput!){createUser(data:$data){id}}`, { data: { name, email: `${prefix}-${name.toLowerCase().replaceAll(' ', '-')}@example.test`, password, role: { connect: { id: roleId } }, facilities: { connect: [{ id: facilityId }] } } }, adminCookie)
  created.userIds.push(data.createUser.id)
  return `${prefix}-${name.toLowerCase().replaceAll(' ', '-')}@example.test`
}
async function counts() {
  const [patients, identifiers, registrations, consents, audits, facilities, users, roles] = await Promise.all([prisma.patient.count(), prisma.patientIdentifier.count(), prisma.patientRegistration.count(), prisma.patientConsent.count(), prisma.clinicalAuditLog.count(), prisma.facility.count(), prisma.user.count(), prisma.role.count()])
  return { patients, identifiers, registrations, consents, audits, facilities, users, roles }
}
async function cleanup() {
  const registrations = await prisma.patientRegistration.findMany({ where: { facilityId: { in: created.facilityIds } }, select: { id: true, patientId: true, identifierId: true, consentId: true, auditLogId: true } })
  const patientIds = [...new Set(registrations.map((row) => row.patientId))]
  const fixturePatients = await prisma.patient.findMany({ where: { OR: [{ id: { in: patientIds } }, { email: { startsWith: prefix } }] }, select: { id: true } })
  const allPatientIds = fixturePatients.map((row) => row.id)
  await prisma.$transaction([
    prisma.patientRegistration.deleteMany({ where: { id: { in: registrations.map((row) => row.id) } } }),
    prisma.patientIdentifier.deleteMany({ where: { facilityId: { in: created.facilityIds } } }),
    prisma.patientConsent.deleteMany({ where: { id: { in: registrations.map((row) => row.consentId) } } }),
    prisma.clinicalAuditLog.deleteMany({ where: { id: { in: registrations.map((row) => row.auditLogId) } } }),
    prisma.patient.deleteMany({ where: { id: { in: allPatientIds } } }),
    prisma.user.deleteMany({ where: { id: { in: created.userIds } } }),
    prisma.facility.deleteMany({ where: { id: { in: created.facilityIds } } }),
    prisma.role.deleteMany({ where: { id: { in: created.roleIds } } }),
  ])
}

const mutation = `mutation($data:PatientRegistrationInput!){registerPatient(data:$data){status replayed registrationId patientId identifierId medicalRecordNumber duplicateResolution candidates{patientId displayName dateOfBirth maskedEmail maskedPhone reasons}}}`
const consent = { accepted: true, policyVersion: 'registration-v1', statementKey: 'hospital-registration-acknowledgement' }
const makeInput = (facilityId, suffix, overrides = {}) => ({ facilityId, idempotencyKey: `${prefix}-idempotency-${suffix}`, medicalRecordNumber: `REG-${runId.toUpperCase()}-${suffix.toUpperCase()}`, firstName: 'Runtime', lastName: `Patient-${suffix}`, dateOfBirth: '1990-02-14', email: `${prefix}-${suffix}@example.test`, phone: `+1555010${String(suffix.length).padStart(4, '0')}`, preferredContactMethod: 'email', consent, ...overrides })

let baseline
try {
  baseline = await counts()
  const admin = JSON.parse(await readFile(credentialsPath, 'utf8'))
  const adminCookie = await authenticate(admin.email || admin.identity, admin.password)
  const [operatorRole, weakRole] = await Promise.all([
    prisma.role.create({ data: { name: `${prefix}-operator`, canManagePatients: true, canViewReports: true, canManageIntake: true, canAccessAllClinicalData: false } }),
    prisma.role.create({ data: { name: `${prefix}-weak`, canAccessAllClinicalData: false } }),
  ])
  created.roleIds.push(operatorRole.id, weakRole.id)
  const [facilityA, facilityB] = await Promise.all([
    prisma.facility.create({ data: { name: `${prefix} A`, slug: `${prefix}-a`, facilityType: 'hospital', status: 'active' } }),
    prisma.facility.create({ data: { name: `${prefix} B`, slug: `${prefix}-b`, facilityType: 'hospital', status: 'active' } }),
  ])
  created.facilityIds.push(facilityA.id, facilityB.id)
  const operatorAEmail = await createUser(adminCookie, 'Operator A', operatorRole.id, facilityA.id)
  const operatorBEmail = await createUser(adminCookie, 'Operator B', operatorRole.id, facilityB.id)
  const weakEmail = await createUser(adminCookie, 'Weak User', weakRole.id, facilityA.id)
  const [operatorA, operatorB, weak] = await Promise.all([authenticate(operatorAEmail), authenticate(operatorBEmail), authenticate(weakEmail)])

  await expectDenied('cross-facility registration', mutation, { data: makeInput(facilityB.id, 'cross') }, operatorA, 'not accessible')
  await expectDenied('underprivileged registration', mutation, { data: makeInput(facilityA.id, 'weak') }, weak, 'Not authorized')
  await expectDenied('raw patient create bypass', 'mutation{createPatient(data:{firstName:"Bypass",lastName:"Attempt"}){id}}', {}, operatorA)
  await expectDenied('raw patient delete bypass', 'mutation($id:ID!){deletePatient(where:{id:$id}){id}}', { id: facilityA.id }, operatorA)

  const sameKeyInput = makeInput(facilityA.id, 'same-key')
  const sameKey = await Promise.all([rawGraphQL(mutation, { data: sameKeyInput }, operatorA), rawGraphQL(mutation, { data: sameKeyInput }, operatorA)])
  if (sameKey.some((payload) => payload.errors?.length) || new Set(sameKey.map((payload) => payload.data.registerPatient.registrationId)).size !== 1 || sameKey.filter((payload) => payload.data.registerPatient.replayed).length !== 1) throw new Error(`Same-key registration was not exactly-once: ${JSON.stringify(sameKey)}`)
  await expectDenied('idempotency payload mismatch', mutation, { data: { ...sameKeyInput, lastName: 'Changed' } }, operatorA, 'different payload')
  const registeredPatientId = sameKey[0].data.registerPatient.patientId
  await rawGraphQL(
    `mutation($id:ID!){updatePatient(where:{id:$id},data:{firstName:"Changed",lastName:"Identity",email:"changed@example.test",phone:"5559999999"}){id}}`,
    { id: registeredPatientId },
    operatorA,
  )
  const unchangedIdentity = await prisma.patient.findUnique({ where: { id: registeredPatientId }, select: { firstName: true, lastName: true, email: true, phone: true } })
  if (unchangedIdentity?.firstName !== sameKeyInput.firstName || unchangedIdentity.lastName !== sameKeyInput.lastName || unchangedIdentity.email !== sameKeyInput.email || unchangedIdentity.phone !== sameKeyInput.phone) throw new Error('Generic Patient mutation rewrote registration identity fields')

  const mrnInputA = makeInput(facilityA.id, 'same-mrn-a', { medicalRecordNumber: `REG-${runId.toUpperCase()}-RACE`, idempotencyKey: `${prefix}-mrn-key-a` })
  const mrnInputB = { ...mrnInputA, idempotencyKey: `${prefix}-mrn-key-b` }
  const sameMrn = await Promise.all([rawGraphQL(mutation, { data: mrnInputA }, operatorA), rawGraphQL(mutation, { data: mrnInputB }, operatorA)])
  const sameMrnAccepted = sameMrn.filter((payload) => !payload.errors?.length)
  const sameMrnRejected = sameMrn.filter((payload) => payload.errors?.length && (
    messages(payload).includes('already assigned') ||
    (process.env.NODE_ENV === 'production' && messages(payload).includes('Unexpected error'))
  ))
  if (sameMrnAccepted.length !== 1 || sameMrnRejected.length !== 1) throw new Error(`Same-MRN registration was not exactly-once: ${JSON.stringify(sameMrn)}`)

  const candidate = await prisma.patient.create({ data: { firstName: 'Exact', lastName: 'Candidate', dateOfBirth: new Date('1988-03-04T00:00:00.000Z'), email: `${prefix}-candidate@example.test`, phone: '+15550109999', facilities: { connect: [{ id: facilityA.id }] } } })
  const hiddenOtherFacilityCandidate = await prisma.patient.create({ data: { firstName: 'Exact', lastName: 'Candidate', dateOfBirth: new Date('1988-03-04T00:00:00.000Z'), email: `${prefix}-candidate@example.test`, phone: '+15550109999', facilities: { connect: [{ id: facilityB.id }] } } })
  const duplicateInput = makeInput(facilityA.id, 'duplicate', { firstName: 'Exact', lastName: 'Candidate', dateOfBirth: '1988-03-04', email: `${prefix}-candidate@example.test`, phone: '+15550109999' })
  const duplicateReview = await graphql('duplicate review', mutation, { data: duplicateInput }, operatorA)
  if (duplicateReview.registerPatient.status !== 'duplicate_review' || duplicateReview.registerPatient.candidates.length !== 1 || duplicateReview.registerPatient.candidates[0].patientId !== candidate.id || duplicateReview.registerPatient.candidates.some((item) => item.patientId === hiddenOtherFacilityCandidate.id)) throw new Error('Duplicate review leaked or missed a facility-local exact candidate')
  const linked = await graphql('link exact duplicate', mutation, { data: { ...duplicateInput, duplicateResolution: 'link_existing', duplicatePatientId: candidate.id } }, operatorA)
  if (linked.registerPatient.status !== 'completed' || linked.registerPatient.patientId !== candidate.id) throw new Error('Human duplicate link did not complete against the selected candidate')

  const crossRead = await graphql('cross-facility read', `query{patientRegistrations{ id } patientIdentifiers{ id }}`, {}, operatorB)
  if (crossRead.patientRegistrations.length || crossRead.patientIdentifiers.length) throw new Error('Cross-facility operator discovered registration identity rows')
  const weakRead = await graphql('underprivileged read', `query{patientRegistrations{ id } patientIdentifiers{ id }}`, {}, weak)
  if (weakRead.patientRegistrations.length || weakRead.patientIdentifiers.length) throw new Error('Underprivileged role discovered registration identity rows')
  const operatorRows = await graphql('operator field boundary', `query{patientRegistrations{ id idempotencyKeyHash requestHash }}`, {}, operatorA)
  if (!operatorRows.patientRegistrations.length || operatorRows.patientRegistrations.some((row) => row.idempotencyKeyHash !== null || row.requestHash !== null)) throw new Error('Registration replay digests escaped the global-only field boundary')
  for (const operation of ['createPatientIdentifier', 'updatePatientIdentifier', 'deletePatientIdentifier', 'createPatientRegistration', 'updatePatientRegistration', 'deletePatientRegistration']) await expectDenied(operation, `mutation{${operation}(data:{}){id}}`, {}, operatorA)

  const fixtureRegistrationCount = await prisma.patientRegistration.count({ where: { facilityId: facilityA.id } })
  const fixtureIdentifierCount = await prisma.patientIdentifier.count({ where: { facilityId: facilityA.id } })
  const fixtureConsentCount = await prisma.patientConsent.count({ where: { patientId: { in: await prisma.patient.findMany({ where: { email: { startsWith: prefix } }, select: { id: true } }).then((rows) => rows.map((row) => row.id)) } } })
  if (fixtureRegistrationCount !== 3 || fixtureIdentifierCount !== 3 || fixtureConsentCount !== 3) throw new Error(`Registration evidence counts were not exact: ${fixtureRegistrationCount}/${fixtureIdentifierCount}/${fixtureConsentCount}`)
  console.log(JSON.stringify({ result: 'facility-registration-identity-provenance-passed', concurrentSameKeyExactlyOnce: true, concurrentSameMrnExactlyOnce: true, deterministicDuplicateHumanResolution: true, crossFacilityAndUnderprivilegedDenied: true, rawIdentityMutationsOmitted: true, rawPatientIdentityRewriteDenied: true, replayDigestsFieldDenied: true, registrations: fixtureRegistrationCount }))
} finally {
  const triggerBypass = await beginDisposableCleanup(prisma)
  try { await cleanup() } finally { await endDisposableCleanup(prisma, triggerBypass); const final = await counts(); await prisma.$disconnect(); if (baseline && JSON.stringify(final) !== JSON.stringify(baseline)) throw new Error(`Registration cleanup mismatch: baseline=${JSON.stringify(baseline)} final=${JSON.stringify(final)}`); console.log('Disposable registration cleanup passed; canonical counts restored.') }
}

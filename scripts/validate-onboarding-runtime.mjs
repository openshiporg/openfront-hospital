import 'dotenv/config'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { assertLocalGraphqlEndpoint, assertSafeRuntimeDatabase } from './lib/runtime-guard.mjs'

const endpoint = process.env.OPENFRONT_GRAPHQL_URL || process.env.GRAPHQL_URL
const credentialsPath = process.env.OPENFRONT_RUNTIME_ADMIN_PATH
if (!credentialsPath) throw new Error('OPENFRONT_RUNTIME_ADMIN_PATH is required')
assertLocalGraphqlEndpoint(endpoint, 'onboarding proof')
assertSafeRuntimeDatabase(process.env.DATABASE_URL, 'onboarding proof')

const seed = JSON.parse(await readFile('features/platform/onboarding/lib/seed.json', 'utf8'))
const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'))

async function graphql(name, query, variables = {}, cookie) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(60_000),
  })
  const payload = await response.json()
  if (!response.ok || payload.errors?.length) {
    throw new Error(`${name}: ${payload.errors?.map(error => error.message).join('; ') || `HTTP ${response.status}`}`)
  }
  return payload.data
}

const auth = await graphql('authenticate runtime admin', `
  mutation($email:String!,$password:String!){
    authenticateUserWithPassword(email:$email,password:$password){
      ... on UserAuthenticationWithPasswordSuccess{sessionToken item{id}}
      ... on UserAuthenticationWithPasswordFailure{message}
    }
  }
`, { email: credentials.email || credentials.identity, password: credentials.password })
const authentication = auth.authenticateUserWithPassword
if (!authentication?.sessionToken) throw new Error('Runtime admin authentication failed')
const cookie = `keystonejs-session=${authentication.sessionToken}`

const permission = await graphql('onboarding authority', `query{authenticatedItem{... on User{id role{canAccessAllClinicalData canManageOnboarding}}}}`, {}, cookie)
if (!permission.authenticatedItem?.role?.canAccessAllClinicalData || !permission.authenticatedItem?.role?.canManageOnboarding) {
  throw new Error('Runtime admin lacks global onboarding authority')
}

const applyMutation = `mutation($configuration:JSON!){
  applyHospitalOnboarding(configuration:$configuration){
    status referenceDate counts intakeLinks{label href expiresAt}
  }
}`
const first = (await graphql('first deterministic onboarding apply', applyMutation, { configuration: seed }, cookie)).applyHospitalOnboarding
const second = (await graphql('replayed deterministic onboarding apply', applyMutation, { configuration: seed }, cookie)).applyHospitalOnboarding
if (first.status !== 'completed' || second.status !== 'completed') throw new Error('Onboarding did not complete')
if (!/^\d{4}-\d{2}-\d{2}$/.test(first.referenceDate)) throw new Error('Onboarding reference date is invalid')
if (JSON.stringify(first.counts) !== JSON.stringify(second.counts)) throw new Error('Onboarding replay counts changed')
const linkProjection = links => links.map(link => ({ label: link.label, href: link.href, expiresAt: link.expiresAt }))
if (JSON.stringify(linkProjection(first.intakeLinks)) !== JSON.stringify(linkProjection(second.intakeLinks))) {
  throw new Error('Active one-time intake links were not replay-deliverable')
}
for (const link of first.intakeLinks) {
  if (!link.href.startsWith('/intake#accessCode=intake_v1_') || new Date(link.expiresAt) <= new Date()) {
    throw new Error('Onboarding returned an invalid or expired intake link')
  }
}

const inspection = await graphql('inspect deterministic onboarding result', `
  query($departmentCodes:[String!],$facilitySlugs:[String!],$providerKeys:[String!],$clinicianKeys:[String!],$typeSlugs:[String!],$scheduleKeys:[String!],$emails:[String!],$numbers:[String!],$messageOperationKeys:[String!]){
    hospitalProfiles(where:{profileKey:{equals:"primary"}},take:2){id profileKey status name shortName media}
    departments(where:{code:{in:$departmentCodes}},take:20){id code images(take:2){id imagePath}}
    facilities(where:{slug:{in:$facilitySlugs}},take:20){id slug timeZone staff(take:20){id} images(take:2){id imagePath}}
    providers(where:{onboardingKey:{in:$providerKeys}},take:20){id onboardingKey facilities(take:10){slug}}
    clinicians(where:{onboardingKey:{in:$clinicianKeys}},take:20){id onboardingKey provider{onboardingKey} department{code} images(take:2){id imagePath}}
    appointmentTypes(where:{slug:{in:$typeSlugs}},take:20){id slug durationMinutes providers(take:20){onboardingKey}}
    providerScheduleBlocks(where:{onboardingKey:{in:$scheduleKeys}},take:30){id onboardingKey startsAt endsAt facility{slug timeZone} provider{onboardingKey}}
    patients(where:{email:{in:$emails}},take:20){id email facilities(take:10){slug}}
    appointments(where:{appointmentNumber:{in:$numbers}},take:20){id appointmentNumber status startsAt facility{slug timeZone} provider{onboardingKey} appointmentType{slug}}
    intakeForms(where:{appointment:{appointmentNumber:{in:$numbers}}},take:20){id templateKey status accessUsedAt accessRevokedAt accessExpiresAt appointment{appointmentNumber}}
    patientMessages(where:{operationKeyHash:{in:$messageOperationKeys}},take:20){id operationKeyHash channel status subject appointment{appointmentNumber}}
  }
`, {
  departmentCodes: seed.departments.map(item => item.code),
  facilitySlugs: seed.facilities.map(item => item.slug),
  providerKeys: seed.providers.map(item => item.onboardingKey),
  clinicianKeys: seed.clinicians.map(item => item.onboardingKey),
  typeSlugs: seed.appointmentTypes.map(item => item.slug),
  scheduleKeys: seed.scheduleBlocks.map(item => item.onboardingKey),
  emails: seed.patients.map(item => item.email),
  numbers: seed.appointments.map(item => item.appointmentNumber),
  messageOperationKeys: seed.messages.map(item => createHash('sha256')
    .update(`onboarding-follow-up-${item.appointmentNumber}`)
    .digest('hex')),
}, cookie)

const exact = (rows, expected, label) => {
  if (rows.length !== expected) throw new Error(`${label} count is not replay-safe: expected ${expected}, found ${rows.length}`)
}
const localParts = (value, timeZone) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
  timeZone,
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  hourCycle: 'h23',
}).formatToParts(new Date(value)).filter(part => part.type !== 'literal').map(part => [part.type, part.value]))
const addDays = (date, offset) => {
  const value = new Date(`${date}T12:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + offset)
  return value.toISOString().slice(0, 10)
}
const localDate = parts => `${parts.year}-${parts.month}-${parts.day}`
exact(inspection.hospitalProfiles, 1, 'hospital profile')
exact(inspection.departments, seed.departments.length, 'departments')
exact(inspection.facilities, seed.facilities.length, 'facilities')
exact(inspection.providers, seed.providers.length, 'providers')
exact(inspection.clinicians, seed.clinicians.length, 'clinicians')
exact(inspection.appointmentTypes, seed.appointmentTypes.length, 'appointment types')
exact(inspection.providerScheduleBlocks, seed.scheduleBlocks.length, 'schedule blocks')
exact(inspection.patients, seed.patients.length, 'patients')
exact(inspection.appointments, seed.appointments.length, 'appointments')
exact(inspection.intakeForms, seed.intakeForms.length, 'intake forms')
exact(inspection.patientMessages, seed.messages.length, 'follow-up tasks')
const deliverableIntakeCount = inspection.intakeForms.filter(form =>
  !form.accessUsedAt && !form.accessRevokedAt && !['submitted', 'reviewed'].includes(form.status)
).length
if (first.intakeLinks.length !== deliverableIntakeCount || second.intakeLinks.length !== deliverableIntakeCount) {
  throw new Error(`Onboarding returned the wrong active one-time intake-link count: expected ${deliverableIntakeCount}`)
}

const expectedDepartmentImages = new Map(seed.departments.map(item => [item.code, item.imagePath]))
for (const department of inspection.departments) {
  if (department.images.length !== 1 || department.images[0].imagePath !== expectedDepartmentImages.get(department.code)) {
    throw new Error(`Department ${department.code} media was not reconciled exactly`)
  }
}
const expectedFacilityImages = new Map(seed.facilities.map(item => [item.slug, item.imagePath]))
for (const facility of inspection.facilities) {
  if (!facility.timeZone || !facility.staff.some(user => user.id === permission.authenticatedItem.id)) {
    throw new Error(`Facility ${facility.slug} lacks a time zone or onboarding administrator assignment`)
  }
  if (facility.images.length !== 1 || facility.images[0].imagePath !== expectedFacilityImages.get(facility.slug)) {
    throw new Error(`Facility ${facility.slug} media was not reconciled exactly`)
  }
}
const expectedClinicianImages = new Map(seed.clinicians.map(item => [item.onboardingKey, item.imagePath]))
for (const clinician of inspection.clinicians) {
  if (clinician.images.length !== 1 || clinician.images[0].imagePath !== expectedClinicianImages.get(clinician.onboardingKey)) {
    throw new Error(`Clinician ${clinician.onboardingKey} media was not reconciled exactly`)
  }
}
const scheduleInputByKey = new Map(seed.scheduleBlocks.map(item => [item.onboardingKey, item]))
for (const block of inspection.providerScheduleBlocks) {
  if (new Date(block.endsAt) <= new Date(block.startsAt) || new Date(block.endsAt) <= new Date()) {
    throw new Error(`Schedule block ${block.onboardingKey} was not refreshed into an active future window`)
  }
  const input = scheduleInputByKey.get(block.onboardingKey)
  const starts = localParts(block.startsAt, block.facility.timeZone)
  const ends = localParts(block.endsAt, block.facility.timeZone)
  const expectedDate = addDays(first.referenceDate, input.dayOffset)
  if (localDate(starts) !== expectedDate || localDate(ends) !== expectedDate || Number(starts.hour) !== input.startHour ||
      Number(starts.minute) !== Number(input.startMinute || 0) || Number(ends.hour) !== input.endHour || Number(ends.minute) !== Number(input.endMinute || 0)) {
    throw new Error(`Schedule block ${block.onboardingKey} does not match its relative facility-local fixture window`)
  }
}
const appointmentInputByNumber = new Map(seed.appointments.map(item => [item.appointmentNumber, item]))
for (const appointment of inspection.appointments) {
  if (new Date(appointment.startsAt) <= new Date()) {
    throw new Error(`Onboarding appointment ${appointment.appointmentNumber} was not reconciled into the refreshed fixture window`)
  }
  const input = appointmentInputByNumber.get(appointment.appointmentNumber)
  const starts = localParts(appointment.startsAt, appointment.facility.timeZone)
  if (localDate(starts) !== addDays(first.referenceDate, input.dayOffset) || Number(starts.hour) !== input.startHour || Number(starts.minute) !== Number(input.startMinute || 0)) {
    throw new Error(`Onboarding appointment ${appointment.appointmentNumber} does not match its relative facility-local fixture time`)
  }
}
for (const message of inspection.patientMessages) {
  if (message.channel !== 'phone' || message.status !== 'manual_required') {
    throw new Error('Onboarding follow-up must remain an honest manual task')
  }
}
if (inspection.hospitalProfiles[0].name !== seed.practiceInfo.name) throw new Error('Persisted hospital branding does not match setup')
for (const [mediaKey, imagePath] of Object.entries(seed.practiceInfo.media)) {
  if (inspection.hospitalProfiles[0].media?.[mediaKey] !== imagePath) {
    throw new Error(`Persisted hospital branding media ${mediaKey} does not match setup`)
  }
}

console.log(`Onboarding runtime proof passed: deterministic branding, ${inspection.facilities.length} zoned facilities, ${inspection.providerScheduleBlocks.length} refreshed schedule blocks, ${first.intakeLinks.length} active replay-deliverable one-time intake links (${inspection.intakeForms.length - first.intakeLinks.length} retained terminal forms not reactivated), ${inspection.patientMessages.length} manual follow-up tasks.`)

import fs from 'node:fs'
import path from 'node:path'

const seedPath = path.join(process.cwd(), 'features/platform/onboarding/lib/seed.json')
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'))

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
function asArray(value, key) {
  assert(Array.isArray(value), `${key} must be an array`)
  assert(value.length <= 100, `${key} exceeds the onboarding bound`)
  return value
}
function unique(values, label) {
  assert(values.every(Boolean), `${label} values are required`)
  assert(new Set(values).size === values.length, `${label} values must be unique`)
}
function assertCanonicalImagePath(imagePath, label) {
  assert(typeof imagePath === 'string' && imagePath.startsWith('/images/'), `${label} imagePath must start with /images/`)
  assert(!imagePath.includes('..'), `${label} imagePath must not contain ..`)
  assert(fs.existsSync(path.join(process.cwd(), 'public', imagePath.replace(/^\//, ''))), `${label} imagePath does not exist: ${imagePath}`)
}
function assertTimeZone(value, label) {
  assert(typeof value === 'string' && value.length <= 100, `${label} timeZone is required`)
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date(0)) }
  catch { throw new Error(`${label} timeZone must be a valid IANA identifier`) }
}

assert(seed.practiceInfo?.name, 'practiceInfo.name is required')
assert(seed.practiceInfo?.shortName, 'practiceInfo.shortName is required')
assert(seed.practiceInfo?.supportEmail?.endsWith('.test'), 'practiceInfo.supportEmail must remain fictional')
for (const [key, imagePath] of Object.entries(seed.practiceInfo?.media || {})) assertCanonicalImagePath(imagePath, `practiceInfo.media.${key}`)

const departments = asArray(seed.departments, 'departments')
const facilities = asArray(seed.facilities, 'facilities')
const providers = asArray(seed.providers, 'providers')
const clinicians = asArray(seed.clinicians, 'clinicians')
const appointmentTypes = asArray(seed.appointmentTypes, 'appointmentTypes')
const scheduleBlocks = asArray(seed.scheduleBlocks, 'scheduleBlocks')
const patients = asArray(seed.patients, 'patients')
const appointments = asArray(seed.appointments, 'appointments')
const intakeForms = asArray(seed.intakeForms, 'intakeForms')
const messages = asArray(seed.messages, 'messages')
assert(seed.portalAccess === undefined, 'portalAccess must be omitted until invite redemption and patient login exist')

unique(departments.map(item => item.code), 'department code')
for (const item of departments) {
  assert(item.name, `department ${item.code} name is required`)
  assertCanonicalImagePath(item.imagePath, `department ${item.code}`)
  assert(item.imageAltText, `department ${item.code} imageAltText is required`)
}
const departmentCodes = new Set(departments.map(item => item.code))

unique(facilities.map(item => item.slug), 'facility slug')
for (const item of facilities) {
  assert(item.name, `facility ${item.slug} name is required`)
  assertTimeZone(item.timeZone, `facility ${item.slug}`)
  assertCanonicalImagePath(item.imagePath, `facility ${item.slug}`)
  assert(item.imageAltText, `facility ${item.slug} imageAltText is required`)
  for (const code of item.departmentCodes || []) assert(departmentCodes.has(code), `${item.slug} references missing department ${code}`)
}
const facilitySlugs = new Set(facilities.map(item => item.slug))
const facilityNames = new Set(facilities.map(item => item.name))

unique(providers.map(item => item.onboardingKey), 'provider onboardingKey')
unique(providers.map(item => item.lastName), 'provider lastName')
for (const item of providers) {
  assert(item.firstName && item.lastName, `provider ${item.onboardingKey} name is required`)
  assert(facilitySlugs.has(item.facilitySlug), `${item.onboardingKey} references missing facility ${item.facilitySlug}`)
}
const providerKeys = new Set(providers.map(item => item.onboardingKey))
const providerLastNames = new Set(providers.map(item => item.lastName))

unique(clinicians.map(item => item.onboardingKey), 'clinician onboardingKey')
for (const item of clinicians) {
  assert(providerKeys.has(item.providerKey), `${item.onboardingKey} references missing provider ${item.providerKey}`)
  assert(departmentCodes.has(item.departmentCode), `${item.onboardingKey} references missing department ${item.departmentCode}`)
  assertCanonicalImagePath(item.imagePath, `clinician ${item.onboardingKey}`)
  assert(item.imageAltText, `clinician ${item.onboardingKey} imageAltText is required`)
}

unique(appointmentTypes.map(item => item.slug), 'appointment type slug')
for (const item of appointmentTypes) {
  assert(Number.isInteger(item.durationMinutes) && item.durationMinutes >= 5 && item.durationMinutes <= 480, `${item.slug} duration is invalid`)
  assert(Number.isInteger(item.priceCents) && item.priceCents >= 0, `${item.slug} price must use integer cents`)
  for (const providerKey of item.providerKeys || []) assert(providerKeys.has(providerKey), `${item.slug} references missing provider ${providerKey}`)
}
const appointmentTypeSlugs = new Set(appointmentTypes.map(item => item.slug))

unique(scheduleBlocks.map(item => item.onboardingKey), 'schedule onboardingKey')
for (const item of scheduleBlocks) {
  assert(providerKeys.has(item.providerKey), `${item.onboardingKey} references missing provider ${item.providerKey}`)
  assert(facilitySlugs.has(item.facilitySlug), `${item.onboardingKey} references missing facility ${item.facilitySlug}`)
  assert(Number.isInteger(item.dayOffset) && item.dayOffset >= 1 && item.dayOffset <= 180, `${item.onboardingKey} dayOffset is invalid`)
  assert(Number.isInteger(item.startHour) && Number.isInteger(item.endHour) && item.endHour > item.startHour, `${item.onboardingKey} window is invalid`)
}

unique(patients.map(item => item.patientKey), 'patientKey')
unique(patients.map(item => item.medicalRecordNumber), 'fictional MRN')
unique(patients.map(item => item.lastName), 'patient lastName')
for (const item of patients) {
  assert(facilitySlugs.has(item.facilitySlug), `${item.patientKey} references missing facility ${item.facilitySlug}`)
  assert(String(item.email || '').endsWith('.test'), `${item.patientKey} email must remain fictional`)
  assert(['phone', 'sms', 'email'].includes(item.preferredContactMethod), `${item.patientKey} contact method must not imply a portal`)
}
const patientKeys = new Set(patients.map(item => item.patientKey))
const patientLastNames = new Set(patients.map(item => item.lastName))

unique(appointments.map(item => item.appointmentNumber), 'appointmentNumber')
for (const item of appointments) {
  assert(patientKeys.has(item.patientKey) && patientLastNames.has(item.patientLastName), `${item.appointmentNumber} patient reference is invalid`)
  assert(providerKeys.has(item.providerKey) && providerLastNames.has(item.providerLastName), `${item.appointmentNumber} provider reference is invalid`)
  assert(appointmentTypeSlugs.has(item.appointmentTypeSlug), `${item.appointmentNumber} appointment type is invalid`)
  assert(facilitySlugs.has(item.facilitySlug) && facilityNames.has(item.locationName), `${item.appointmentNumber} facility reference is invalid`)
  assert(Number.isInteger(item.dayOffset) && item.dayOffset >= 1 && item.dayOffset <= 180, `${item.appointmentNumber} dayOffset is invalid`)
}
const appointmentNumbers = new Set(appointments.map(item => item.appointmentNumber))

unique(intakeForms.map(item => `${item.appointmentNumber}:${item.templateKey}`), 'intake appointment/template')
for (const item of intakeForms) {
  assert(patientKeys.has(item.patientKey), `${item.title} references missing patient`)
  assert(appointmentNumbers.has(item.appointmentNumber), `${item.title} references missing appointment`)
  assert(!('accessCode' in item) && !('responses' in item), `${item.title} must not seed plaintext access or submitted responses`)
}
unique(messages.map(item => item.appointmentNumber), 'follow-up appointmentNumber')
for (const item of messages) {
  assert(patientKeys.has(item.patientKey), `${item.subject} references missing patient`)
  assert(appointmentNumbers.has(item.appointmentNumber), `${item.subject} references missing appointment`)
  assert(item.channel === 'phone', `${item.subject} must be an honest manual follow-up task`)
  assert(/No external message was sent/.test(item.body), `${item.subject} must state that no external message was sent`)
}

console.log(`Onboarding seed validation passed: ${departments.length} departments, ${facilities.length} facilities, ${providers.length} providers, ${clinicians.length} clinicians, ${appointmentTypes.length} appointment types, ${patients.length} patients, ${appointments.length} appointments, ${intakeForms.length} one-time intake links, ${messages.length} manual follow-up tasks.`)

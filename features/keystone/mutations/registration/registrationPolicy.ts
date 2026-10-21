import { createHash } from 'node:crypto'

export type RegistrationConsentInput = {
  accepted: boolean
  policyVersion: string
  statementKey: string
}

export type RegistrationInput = {
  facilityId: string
  idempotencyKey: string
  medicalRecordNumber: string
  firstName: string
  lastName: string
  dateOfBirth: string
  email?: string | null
  phone?: string | null
  preferredContactMethod?: string | null
  consent: RegistrationConsentInput
  duplicateResolution?: string | null
  duplicatePatientId?: string | null
}

export type NormalizedRegistrationInput = {
  facilityId: string
  idempotencyKey: string
  medicalRecordNumber: string
  firstName: string
  lastName: string
  dateOfBirth: string
  email: string | null
  phone: string | null
  preferredContactMethod: 'phone' | 'sms' | 'email'
  consent: RegistrationConsentInput
  duplicateResolution: 'create_new' | 'link_existing' | null
  duplicatePatientId: string | null
}

type DuplicateCandidate = {
  firstName?: string | null
  lastName?: string | null
  dateOfBirth?: Date | string | null
  email?: string | null
  phone?: string | null
}

export const REGISTRATION_CONSENT = {
  consentType: 'patient_registration',
  policyVersion: 'registration-v1',
  statementKey: 'hospital-registration-acknowledgement',
} as const

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,199}$/
const MEDICAL_RECORD_NUMBER = /^[A-Z0-9][A-Z0-9-]{2,39}$/
const CONTACT_METHODS = new Set(['phone', 'sms', 'email'])
const LEGACY_REGISTRATION_STATEMENT_KEYS = new Set(['northstar-registration-acknowledgement'])

function requiredBoundedText(value: unknown, label: string, maxLength: number) {
  const normalized = String(value ?? '').trim().replace(/\s+/g, ' ')
  if (!normalized || normalized.length > maxLength || CONTROL_CHARACTERS.test(normalized)) {
    throw new Error(`${label} is invalid for patient registration`)
  }
  return normalized
}

function normalizeName(value: unknown, label: string) {
  return requiredBoundedText(value, label, 100)
}

function normalizeEmail(value: unknown): string | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return null
  if (
    normalized.length > 254 ||
    CONTROL_CHARACTERS.test(normalized) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    throw new Error('Email is invalid for patient registration')
  }
  return normalized
}

function normalizePhone(value: unknown): string | null {
  const input = String(value ?? '').trim()
  if (!input) return null
  if (CONTROL_CHARACTERS.test(input)) throw new Error('Phone is invalid for patient registration')
  const digits = input.replace(/\D/g, '')
  if (digits.length < 7 || digits.length > 15) {
    throw new Error('Phone is invalid for patient registration')
  }
  return input.startsWith('+') ? `+${digits}` : digits
}

function normalizeDateOfBirth(value: unknown, now: Date) {
  const input = String(value ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    throw new Error('Date of birth must use YYYY-MM-DD for patient registration')
  }
  const parsed = new Date(`${input}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== input) {
    throw new Error('Date of birth is not a real calendar date')
  }
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  if (parsed > today || parsed.getUTCFullYear() < 1850) {
    throw new Error('Date of birth is outside the supported registration range')
  }
  return parsed.toISOString()
}

export function normalizeRegistrationInput(
  input: RegistrationInput,
  now = new Date(),
): NormalizedRegistrationInput {
  const facilityId = requiredBoundedText(input.facilityId, 'Facility', 128)
  const idempotencyKey = String(input.idempotencyKey ?? '').trim()
  if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
    throw new Error('Registration idempotency key must be 16-200 safe characters')
  }

  const medicalRecordNumber = String(input.medicalRecordNumber ?? '').trim().toUpperCase()
  if (!MEDICAL_RECORD_NUMBER.test(medicalRecordNumber)) {
    throw new Error('Medical record number must be 3-40 letters, numbers, or hyphens')
  }

  const preferredContactMethod = String(input.preferredContactMethod ?? 'phone').trim().toLowerCase()
  if (!CONTACT_METHODS.has(preferredContactMethod)) {
    throw new Error('Preferred contact method is invalid for patient registration')
  }

  if (input.consent?.accepted !== true) {
    throw new Error('Registration consent acknowledgement is required')
  }
  const consent = {
    accepted: true,
    policyVersion: requiredBoundedText(input.consent.policyVersion, 'Consent policy version', 100),
    statementKey: requiredBoundedText(input.consent.statementKey, 'Consent statement key', 160),
  }
  if (
    consent.policyVersion !== REGISTRATION_CONSENT.policyVersion ||
    (consent.statementKey !== REGISTRATION_CONSENT.statementKey && !LEGACY_REGISTRATION_STATEMENT_KEYS.has(consent.statementKey))
  ) {
    throw new Error('Registration consent acknowledgement does not match the current policy')
  }

  const resolutionInput = String(input.duplicateResolution ?? '').trim().toLowerCase()
  const duplicateResolution = resolutionInput || null
  if (duplicateResolution !== null && duplicateResolution !== 'create_new' && duplicateResolution !== 'link_existing') {
    throw new Error('Duplicate resolution is invalid for patient registration')
  }
  const duplicatePatientId = input.duplicatePatientId
    ? requiredBoundedText(input.duplicatePatientId, 'Duplicate patient', 128)
    : null
  if (duplicateResolution === 'link_existing' && !duplicatePatientId) {
    throw new Error('Duplicate patient is required when linking an existing registration')
  }
  if (duplicateResolution !== 'link_existing' && duplicatePatientId) {
    throw new Error('Duplicate patient is only valid when linking an existing registration')
  }

  return {
    facilityId,
    idempotencyKey,
    medicalRecordNumber,
    firstName: normalizeName(input.firstName, 'First name'),
    lastName: normalizeName(input.lastName, 'Last name'),
    dateOfBirth: normalizeDateOfBirth(input.dateOfBirth, now),
    email: normalizeEmail(input.email),
    phone: normalizePhone(input.phone),
    preferredContactMethod: preferredContactMethod as NormalizedRegistrationInput['preferredContactMethod'],
    consent,
    duplicateResolution,
    duplicatePatientId,
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export function buildRegistrationRequestHash(input: NormalizedRegistrationInput) {
  const { idempotencyKey: _idempotencyKey, ...payload } = input
  return createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex')
}

export function hashRegistrationIdempotencyKey(idempotencyKey: string) {
  return createHash('sha256').update(idempotencyKey, 'utf8').digest('hex')
}

function comparableDate(value: DuplicateCandidate['dateOfBirth']) {
  if (!value) return null
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
}

function comparableEmail(value: string | null | undefined) {
  try {
    return normalizeEmail(value)
  } catch {
    return null
  }
}

function comparablePhone(value: string | null | undefined) {
  try {
    return normalizePhone(value)
  } catch {
    return null
  }
}

export function findDeterministicDuplicateReasons(
  input: NormalizedRegistrationInput,
  candidate: DuplicateCandidate,
) {
  if (comparableDate(candidate.dateOfBirth) !== input.dateOfBirth.slice(0, 10)) return []

  const reasons: string[] = []
  if (input.email && comparableEmail(candidate.email) === input.email) {
    reasons.push('date_of_birth_and_email')
  }
  if (input.phone && comparablePhone(candidate.phone) === input.phone) {
    reasons.push('date_of_birth_and_phone')
  }
  const candidateFirstName = String(candidate.firstName ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
  const candidateLastName = String(candidate.lastName ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
  if (
    candidateFirstName === input.firstName.toLowerCase() &&
    candidateLastName === input.lastName.toLowerCase()
  ) {
    reasons.push('date_of_birth_and_name')
  }
  return reasons
}

export function maskRegistrationContact(value: string | null | undefined, type: 'email' | 'phone') {
  if (!value) return null
  if (type === 'email') {
    const [local, domain] = value.split('@')
    return domain ? `${local.slice(0, 1) || '*'}***@${domain}` : '***'
  }
  const digits = value.replace(/\D/g, '')
  return digits ? `••••${digits.slice(-4)}` : null
}

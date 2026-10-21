const LEGACY_INTAKE_ACCESS_PATTERN = /^intake_[A-Za-z0-9_-]{43}$/
const DELIVERABLE_INTAKE_ACCESS_PATTERN = /^intake_v1_[A-Za-z0-9_-]{20,74}\.[A-Za-z0-9_-]{43}$/

/**
 * Public shape validation only. Authority remains with the hash, expiry,
 * one-time-use, revocation, facility, patient, and appointment checks in the
 * Keystone intake resolvers.
 */
export function isPublicIntakeAccessCode(value: unknown): value is string {
  const accessCode = String(value || '')
  return accessCode.length <= 128 && (
    LEGACY_INTAKE_ACCESS_PATTERN.test(accessCode) ||
    DELIVERABLE_INTAKE_ACCESS_PATTERN.test(accessCode)
  )
}

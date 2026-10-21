export const BOOKING_CONSENT = {
  consentType: 'appointment_request',
  policyVersion: '2026-07-10',
  statementKey: 'hospital_appointment_request_acknowledgement_v1',
} as const

export const INTAKE_CONSENT = {
  consentType: 'intake_submission',
  policyVersion: '2026-07-10',
  statementKey: 'hospital_intake_accuracy_and_contact_consent_v1',
} as const

export function requireConsent(
  consent: { accepted?: boolean | null; policyVersion?: string | null; statementKey?: string | null } | null | undefined,
  expected: { policyVersion: string; statementKey: string }
) {
  if (!consent?.accepted) throw new Error('Consent acknowledgement is required')
  if (consent.policyVersion !== expected.policyVersion || consent.statementKey !== expected.statementKey) {
    throw new Error('Consent acknowledgement does not match the current policy')
  }
}


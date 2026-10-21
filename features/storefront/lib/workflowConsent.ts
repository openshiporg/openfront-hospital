export const APPOINTMENT_REQUEST_CONSENT = {
  consentType: 'appointment_request',
  policyVersion: '2026-07-10',
  statementKey: 'hospital_appointment_request_acknowledgement_v1',
} as const

export const INTAKE_SUBMISSION_CONSENT = {
  consentType: 'intake_submission',
  policyVersion: '2026-07-10',
  statementKey: 'hospital_intake_accuracy_and_contact_consent_v1',
} as const

export type WorkflowConsentInput = {
  accepted: boolean
  policyVersion: string
  statementKey: string
}

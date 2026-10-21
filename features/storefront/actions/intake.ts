'use server'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import type { IntakeSubmissionInput, PatientIntakeForm } from '@/features/storefront/lib/data/intake'
import { isPublicIntakeAccessCode } from '@/features/storefront/lib/intakeAccessCode'

const INTAKE_SELECTION = `
  id
  title
  status
  templateKey
  formSchema
  submittedAt
  accessCode
  patient { id displayName email phone dateOfBirth preferredContactMethod insuranceSummary }
  appointment {
    id
    appointmentNumber
    status
    startsAt
    endsAt
    reasonForVisit
    facilityName
    facilityTimeZone
    provider { id displayName specialty }
    appointmentType { id name durationMinutes }
  }
`

export async function loadPatientIntakeAction(accessCode: string) {
  if (!isPublicIntakeAccessCode(accessCode)) {
    return { success: false as const, error: 'Intake access is invalid' }
  }
  const query = `query($accessCode: String!) { intakeFormByAccessCode(accessCode: $accessCode) { ${INTAKE_SELECTION} } }`
  const response = await keystoneClient<{ intakeFormByAccessCode: PatientIntakeForm | null }>(query, { accessCode })
  if (!response.success || !response.data.intakeFormByAccessCode) {
    return { success: false as const, error: 'Intake access is invalid or no longer active' }
  }
  return { success: true as const, data: response.data.intakeFormByAccessCode }
}

export async function submitPatientIntakeAction(input: IntakeSubmissionInput) {
  const mutation = `
    mutation SubmitIntakeForm($accessCode: String!, $responses: JSON!, $patientUpdates: PatientIntakeUpdateInput, $consent: WorkflowConsentInput!) {
      submitIntakeForm(accessCode: $accessCode, responses: $responses, patientUpdates: $patientUpdates, consent: $consent) {
        ${INTAKE_SELECTION}
      }
    }
  `

  return keystoneClient<{ submitIntakeForm: PatientIntakeForm }>(mutation, input)
}

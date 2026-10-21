import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import type { WorkflowConsentInput } from '@/features/storefront/lib/workflowConsent'

export type PatientIntakeForm = {
  id: string
  title: string
  status: string
  templateKey?: string | null
  formSchema?: any
  submittedAt?: string | null
  accessCode: string
  patient?: {
    id: string
    displayName?: string | null
    email?: string | null
    phone?: string | null
    dateOfBirth?: string | null
    preferredContactMethod?: string | null
    insuranceSummary?: any
  } | null
  appointment?: {
    id: string
    appointmentNumber?: string | null
    status?: string | null
    startsAt?: string | null
    endsAt?: string | null
    reasonForVisit?: string | null
    facilityName?: string | null
    facilityTimeZone: string
    provider?: { id: string; displayName?: string | null; specialty?: string | null } | null
    appointmentType?: { id: string; name?: string | null; durationMinutes?: number | null } | null
  } | null
}

export type IntakeSubmissionInput = {
  accessCode: string
  responses: Record<string, unknown>
  consent: WorkflowConsentInput
  patientUpdates?: {
    email?: string
    phone?: string
    preferredContactMethod?: string
    insuranceSummary?: Record<string, unknown>
  }
}

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

export async function getIntakeFormByAccessCode(accessCode: string) {
  const query = `
    query IntakeFormByAccessCode($accessCode: String!) {
      intakeFormByAccessCode(accessCode: $accessCode) {
        ${INTAKE_SELECTION}
      }
    }
  `

  const response = await keystoneClient<{ intakeFormByAccessCode: PatientIntakeForm | null }>(query, { accessCode })
  if (!response.success) throw new Error('Intake access could not be checked')
  return response.data.intakeFormByAccessCode
}


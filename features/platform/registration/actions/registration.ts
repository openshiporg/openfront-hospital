'use server'

import { revalidatePath } from 'next/cache'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'

export type RegistrationSubmission = {
  facilityId: string
  idempotencyKey: string
  medicalRecordNumber: string
  firstName: string
  lastName: string
  dateOfBirth: string
  email?: string
  phone?: string
  preferredContactMethod?: string
  registrationAcknowledged: boolean
  duplicateResolution?: 'create_new' | 'link_existing'
  duplicatePatientId?: string
}

export type RegistrationResult = {
  status: 'completed' | 'duplicate_review' | 'candidate_overflow'
  candidateCount: number
  candidateLimit: number
  candidateCountIsLowerBound: boolean
  replayed: boolean
  registrationId?: string | null
  patientId?: string | null
  identifierId?: string | null
  medicalRecordNumber?: string | null
  duplicateResolution?: string | null
  candidates: Array<{
    patientId: string
    displayName: string
    dateOfBirth?: string | null
    maskedEmail?: string | null
    maskedPhone?: string | null
    reasons: string[]
  }>
}

export async function submitPatientRegistration(data: RegistrationSubmission) {
  if (data.registrationAcknowledged !== true) {
    return { success: false as const, error: 'Registration acknowledgement is required before review.' }
  }
  const { registrationAcknowledged: _registrationAcknowledged, ...registrationData } = data
  const mutation = `
    mutation RegisterPatient($data: PatientRegistrationInput!) {
      registerPatient(data: $data) {
        status replayed registrationId patientId identifierId medicalRecordNumber duplicateResolution
        candidateCount candidateLimit candidateCountIsLowerBound
        candidates { patientId displayName dateOfBirth maskedEmail maskedPhone reasons }
      }
    }
  `
  const response = await keystoneClient<{ registerPatient: RegistrationResult }>(mutation, {
    data: {
      ...registrationData,
      consent: {
        accepted: true,
        policyVersion: 'registration-v1',
        statementKey: 'hospital-registration-acknowledgement',
      },
    },
  })
  if (response.success && response.data.registerPatient.status === 'completed') {
    revalidatePath('/dashboard/platform/registration')
    revalidatePath('/dashboard/platform/patients')
  }
  return response
}

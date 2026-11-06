'use server'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'

export type PatientVisitView = {
  appointmentNumber: string; status: string; startsAt: string; endsAt: string; facilityName: string; facilityTimeZone: string
  facilityPhone: string; facilityAddress: string; providerName: string; visitTypeName: string; canCancel: boolean; accessToken: string
}

const FIELDS = 'appointmentNumber status startsAt endsAt facilityName facilityTimeZone facilityPhone facilityAddress providerName visitTypeName canCancel accessToken'

export async function findVisitAction(input: { accessToken?: string; appointmentNumber?: string; dateOfBirth?: string }) {
  const response = await keystoneClient<{ patientVisit: PatientVisitView | null }>(
    `query PatientVisit($accessToken:String,$appointmentNumber:String,$dateOfBirth:String){patientVisit(accessToken:$accessToken,appointmentNumber:$appointmentNumber,dateOfBirth:$dateOfBirth){${FIELDS}}}`,
    { accessToken: input.accessToken || null, appointmentNumber: input.appointmentNumber || null, dateOfBirth: input.dateOfBirth || null },
  )
  return response.success ? response.data.patientVisit : null
}

export async function cancelVisitAction(accessToken: string, reason: string) {
  const response = await keystoneClient<{ cancelPatientVisit: PatientVisitView | null }>(
    `mutation CancelPatientVisit($accessToken:String!,$reason:String){cancelPatientVisit(accessToken:$accessToken,reason:$reason){${FIELDS}}}`,
    { accessToken, reason },
  )
  return response.success ? { success: true as const, visit: response.data.cancelPatientVisit } : { success: false as const, error: response.error || 'This visit could not be cancelled online. Call the clinic.' }
}

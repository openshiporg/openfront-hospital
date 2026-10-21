'use server'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import type { AppointmentRequestInput } from '@/features/storefront/lib/data/booking'

export async function requestAppointmentAction(input: AppointmentRequestInput) {
  const mutation = `
    mutation RequestAppointment(
      $appointmentTypeId: ID!
      $providerId: ID!
      $facilityId: ID!
      $startsAt: String!
      $patient: PatientAppointmentRequestInput!
      $reasonForVisit: String
      $preferredContactMethod: String
      $consent: WorkflowConsentInput!
    ) {
      requestAppointment(
        appointmentTypeId: $appointmentTypeId
        providerId: $providerId
        facilityId: $facilityId
        startsAt: $startsAt
        patient: $patient
        reasonForVisit: $reasonForVisit
        preferredContactMethod: $preferredContactMethod
        consent: $consent
      ) {
        id
        appointmentNumber
        status
        startsAt
        endsAt
        patient { id displayName }
        provider { id displayName specialty }
        appointmentType { id name durationMinutes }
        intakeForms { id accessCode status }
      }
    }
  `

  return keystoneClient<{ requestAppointment: any }>(mutation, input)
}

export async function loadAppointmentAvailability(input: { appointmentTypeId: string; providerId: string; facilityId: string; date: string }) {
  const { getAvailableAppointmentSlots } = await import('@/features/storefront/lib/data/booking')
  try { return { success: true as const, slots: await getAvailableAppointmentSlots(input.appointmentTypeId, input.providerId, input.facilityId, input.date) } }
  catch { return { success: false as const, error: 'Times could not be checked. Your patient details are retained. Try checking availability again or contact scheduling.' } }
}

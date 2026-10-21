import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import type { WorkflowConsentInput } from '@/features/storefront/lib/workflowConsent'

export type BookableProvider = {
  id: string
  displayName: string
  specialty?: string | null
  bio?: string | null
  locationName?: string | null
  facilities: Array<{ id: string; name: string; timeZone: string }>
}

export type BookableAppointmentType = {
  id: string
  name: string
  slug: string
  description?: string | null
  durationMinutes: number
  priceCents?: number | null
  formattedPrice?: string | null
  providers: BookableProvider[]
}

export type AvailableAppointmentSlot = {
  providerId: string
  providerName: string
  appointmentTypeId: string
  appointmentTypeName: string
  facilityId: string
  facilityName: string
  facilityTimeZone: string
  followUpMode: 'integration' | 'manual'
  startsAt: string
  endsAt: string
  durationMinutes: number
  remainingCapacity: number
}

export type AppointmentRequestInput = {
  appointmentTypeId: string
  providerId: string
  facilityId: string
  startsAt: string
  patient: {
    firstName: string
    lastName: string
    email?: string
    phone?: string
    dateOfBirth?: string
  }
  reasonForVisit?: string
  preferredContactMethod?: string
  consent: WorkflowConsentInput
}

export async function getBookableAppointmentTypes() {
  const query = `
    query BookableAppointmentTypes {
      bookableAppointmentTypes {
        id
        name
        slug
        description
        durationMinutes
        priceCents
        formattedPrice
        providers {
          id
          displayName
          specialty
          bio
          locationName
          facilities { id name timeZone }
        }
      }
    }
  `

  const response = await keystoneClient<{ bookableAppointmentTypes: BookableAppointmentType[] }>(query)
  if (!response.success) throw new Error('Bookable appointment types are unavailable')
  return response.data.bookableAppointmentTypes
}

export async function getAvailableAppointmentSlots(appointmentTypeId: string, providerId: string, facilityId: string, date: string) {
  const query = `
    query AvailableAppointmentSlots($appointmentTypeId: ID!, $providerId: ID!, $facilityId: ID!, $date: String!) {
      availableAppointmentSlots(appointmentTypeId: $appointmentTypeId, providerId: $providerId, facilityId: $facilityId, date: $date) {
        providerId
        providerName
        appointmentTypeId
        appointmentTypeName
        facilityId
        facilityName
        facilityTimeZone
        followUpMode
        startsAt
        endsAt
        durationMinutes
        remainingCapacity
      }
    }
  `

  const response = await keystoneClient<{ availableAppointmentSlots: AvailableAppointmentSlot[] }>(
    query,
    { appointmentTypeId, providerId, facilityId, date }
  )

  if (!response.success) throw new Error('Appointment availability is unavailable')
  return response.data.availableAppointmentSlots
}


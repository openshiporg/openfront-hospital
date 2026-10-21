'use server'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'

export type ScheduleConflictInput = {
  facilityId: string
  providerId: string
  startsAt: string
  endsAt: string
  excludeAppointmentId?: string
}

export async function getAppointmentScheduleConflicts(input: ScheduleConflictInput) {
  const query = `
    query AppointmentScheduleConflicts(
      $facilityId: ID!
      $providerId: ID!
      $startsAt: String!
      $endsAt: String!
      $excludeAppointmentId: ID
    ) {
      appointmentScheduleConflicts(
        facilityId: $facilityId
        providerId: $providerId
        startsAt: $startsAt
        endsAt: $endsAt
        excludeAppointmentId: $excludeAppointmentId
      ) {
        withinAvailability
        hasConflict
        conflicts {
          source
          id
          reference
          status
          startsAt
          endsAt
        }
      }
    }
  `

  return keystoneClient(query, input)
}

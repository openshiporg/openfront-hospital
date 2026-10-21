'use server'

import { revalidatePath } from 'next/cache'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'

export type EncounterOpenInput = {
  operationKey: string
  facilityId: string
  patientId: string
  providerId: string
  appointmentId?: string
  departmentId?: string
  chiefComplaint?: string
}

export type EncounterTransitionInput = {
  operationKey: string
  encounterId: string
  toStatus: 'in_progress' | 'closed' | 'cancelled'
  expectedVersion: number
  reason?: string
  expectedReviewFingerprint?: string
  reviewedTuple?: Record<string, unknown>
}

export async function openEncounter(data: EncounterOpenInput) {
  const response = await keystoneClient(`
    mutation OpenEncounter($data: EncounterWorkflowInput!) {
      openEncounter(data: $data) {
        id encounterNumber status transitionVersion replayed
      }
    }
  `, { data })
  revalidatePath('/dashboard/platform/clinical-operations')
  revalidatePath('/dashboard/platform/care-queue')
  revalidatePath('/dashboard/platform/encounters')
  return response
}

export async function transitionEncounter(input: EncounterTransitionInput) {
  const mutation = `
    mutation TransitionEncounter(
      $operationKey: String!
      $encounterId: ID!
      $toStatus: String!
      $expectedVersion: Int!
      $reason: String
      $expectedReviewFingerprint: String
      $reviewedTuple: JSON
    ) {
      transitionEncounter(
        operationKey: $operationKey
        encounterId: $encounterId
        toStatus: $toStatus
        expectedVersion: $expectedVersion
        reason: $reason
        expectedReviewFingerprint: $expectedReviewFingerprint
        reviewedTuple: $reviewedTuple
      ) {
        id
        encounterNumber
        fromStatus
        status
        transitionVersion
        startedAt
        endedAt
        replayed
        episodeReceipt
        outcome
        reasonCode
      }
    }
  `

  const response = await keystoneClient(mutation, input)
  revalidatePath('/dashboard/platform/clinical-operations')
  revalidatePath('/dashboard/platform/care-queue')
  revalidatePath('/dashboard/platform/appointments')
  revalidatePath('/dashboard/platform/encounters')
  return response
}

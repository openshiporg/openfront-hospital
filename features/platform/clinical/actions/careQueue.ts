'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'

export async function arriveAppointment(input: { appointmentId: string; idempotencyKey: string; reasonCode?: string }) {
  const response = await keystoneClient(
    `mutation($appointmentId:ID!,$idempotencyKey:String!,$reasonCode:String){arriveAppointment(appointmentId:$appointmentId,idempotencyKey:$idempotencyKey,reasonCode:$reasonCode){id status queueDate queuePosition transitionVersion replayed}}`,
    input,
  )
  revalidatePath('/dashboard/platform/care-queue')
  revalidatePath('/dashboard/platform/appointments')
  return response
}

export async function transitionCareQueue(input: {
  ticketId: string
  toStatus: string
  expectedVersion: number
  encounterId?: string
  operationKey?: string
}) {
  const { operationKey = `hospital-ui-${randomUUID()}`, ...variables } = input
  const response = await keystoneClient(
    `mutation($operationKey:String!,$ticketId:ID!,$toStatus:String!,$expectedVersion:Int!,$encounterId:ID){transitionCareQueue(operationKey:$operationKey,ticketId:$ticketId,toStatus:$toStatus,expectedVersion:$expectedVersion,encounterId:$encounterId){id status queueDate queuePosition transitionVersion replayed}}`,
    { ...variables, operationKey },
  )
  revalidatePath('/dashboard/platform/care-queue')
  revalidatePath('/dashboard/platform/encounters')
  return response
}

export async function searchQueueEncounters(facilityId: string, patientId: string, rawSearch: string) {
  if (!facilityId || !patientId || facilityId.length > 200 || patientId.length > 200 || typeof rawSearch !== 'string' || rawSearch.length > 80) return { success: false as const, error: 'Encounter scope is incomplete.' }
  const authority = await keystoneClient<{ authenticatedItem: { role?: { canManageAppointments?: boolean; canManagePatients?: boolean } } | null }>(`query QueueEncounterAuthority{authenticatedItem{... on User{role{canManageAppointments canManagePatients}}}}`)
  if (!authority.success || (!authority.data.authenticatedItem?.role?.canManageAppointments && !authority.data.authenticatedItem?.role?.canManagePatients)) return { success: false as const, error: 'Current queue capability could not be verified.' }
  const search = rawSearch.trim()
  const where = { status: { equals: 'in_progress' }, facility: { id: { equals: facilityId } }, patient: { id: { equals: patientId } }, ...(search ? { encounterNumber: { contains: search, mode: 'insensitive' } } : {}) }
  return keystoneClient<{ encounters: Array<{ id: string; encounterNumber: string }>; encountersCount: number }>(`query QueueEncounterCandidates($where:EncounterWhereInput!){encounters(where:$where,orderBy:[{createdAt:desc},{id:desc}],take:25){id encounterNumber} encountersCount(where:$where)}`, { where })
}

'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import type { CommunicationFilters } from '../lib/communicationFilters'

export type SecureMessageInput = {
  facilityId: string
  patientId: string
  appointmentId?: string
  installationId?: string
  templateId?: string
  channel: 'sms' | 'email' | 'phone'
  purpose?: 'care_operations' | 'billing' | 'general'
  subject?: string
  body: string
}

function communicationWhere(filters: CommunicationFilters) {
  const where: Record<string, unknown> = {}
  if (filters.status === 'open') where.status = { in: ['manual_required', 'queued', 'failed'] }
  else if (filters.status !== 'all') where.status = { equals: filters.status }
  if (filters.channel !== 'all') where.channel = { equals: filters.channel }
  if (filters.search) {
    where.OR = [
      { subject: { contains: filters.search, mode: 'insensitive' } },
      { patient: { OR: [
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
      ] } },
      { appointment: { appointmentNumber: { contains: filters.search, mode: 'insensitive' } } },
      { facility: { name: { contains: filters.search, mode: 'insensitive' } } },
    ]
  }
  return where
}

export type CommunicationTask = {
  id: string
  status: string
  transitionVersion: number
  channel: string
  purpose?: string | null
  direction?: string | null
  subject?: string | null
  createdAt: string
  sentAt?: string | null
  deliveredAt?: string | null
  externalId?: string | null
  patient?: { id: string; displayName?: string | null } | null
  appointment?: { id: string; appointmentNumber?: string | null; status?: string | null } | null
  facility?: { id: string; name?: string | null; timeZone?: string | null } | null
  installation?: { id: string; name?: string | null; status?: string | null } | null
}

export async function getCommunicationTasks(filters: CommunicationFilters) {
  return keystoneClient<{
    patientMessagesCount: number
    patientMessages: CommunicationTask[]
    all: number
    open: number
    manualRequired: number
    queued: number
    failed: number
  }>(`
    query CommunicationTasks($where: PatientMessageWhereInput!, $orderBy: [PatientMessageOrderByInput!]!) {
      patientMessagesCount(where: $where)
      patientMessages(where: $where, orderBy: $orderBy, take: 100) {
        id status transitionVersion channel purpose direction subject createdAt sentAt deliveredAt externalId
        patient { id displayName }
        appointment { id appointmentNumber status }
        facility { id name timeZone }
        installation { id name status }
      }
      all: patientMessagesCount
      open: patientMessagesCount(where: { status: { in: ["manual_required", "queued", "failed"] } })
      manualRequired: patientMessagesCount(where: { status: { equals: "manual_required" } })
      queued: patientMessagesCount(where: { status: { equals: "queued" } })
      failed: patientMessagesCount(where: { status: { equals: "failed" } })
    }
  `, { where: communicationWhere(filters), orderBy: [{ createdAt: filters.sort === 'newest' ? 'desc' : 'asc' }] })
}

export async function completeManualFollowUp(messageId: string, expectedVersion: number, operationKey: string) {
  const response = await keystoneClient(`
    mutation CompleteManualFollowUp($operationKey: String!, $messageId: ID!, $expectedVersion: Int!) {
      transitionPatientMessage(
        operationKey: $operationKey
        messageId: $messageId
        toStatus: "completed"
        expectedVersion: $expectedVersion
        reasonCode: "operator_follow_up_completed"
      ) { id status transitionVersion replayed }
    }
  `, { operationKey, messageId, expectedVersion })
  revalidatePath('/dashboard/platform/communications')
  return response
}

export async function sendSecurePatientMessage(input: SecureMessageInput) {
  const mutation = `
    mutation SendSecurePatientMessage(
      $operationKey: String!
      $facilityId: ID!
      $patientId: ID!
      $appointmentId: ID
      $installationId: ID
      $templateId: ID
      $channel: String!
      $purpose: String!
      $subject: String
      $body: String!
    ) {
      sendSecurePatientMessage(
        operationKey: $operationKey
        facilityId: $facilityId
        patientId: $patientId
        appointmentId: $appointmentId
        installationId: $installationId
        templateId: $templateId
        channel: $channel
        purpose: $purpose
        subject: $subject
        body: $body
      ) {
        id
        status
        channel
        direction
        recordedAt
        patientId
        appointmentId
        replayed
      }
    }
  `

  const response = await keystoneClient(mutation, {
    ...input,
    operationKey: `hospital-ui-${randomUUID()}`,
    purpose: input.purpose || 'care_operations',
  })
  revalidatePath('/dashboard/platform/communications')
  revalidatePath('/dashboard/platform/appointments')
  return response
}

'use server'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { AUDIT_RANGES, type AuditRange, type AuditViewerRole, type ClinicalAuditRow, type WorkflowTransitionRow } from '../types'

type ListParams = { type: string; range: AuditRange; search: string; take: number; skip: number }

function sinceFor(range: AuditRange) {
  const hours = AUDIT_RANGES.find(item => item.value === range)?.hours
  return hours ? new Date(Date.now() - hours * 3_600_000).toISOString() : null
}

export async function getAuditViewerRole() {
  const response = await keystoneClient<{ authenticatedItem: { role?: AuditViewerRole | null } | null }>(
    `query AuditViewer { authenticatedItem { ... on User { role { canViewReports canManagePatients canManageAppointments canAccessAllClinicalData } } } }`,
  )
  if (!response.success) return { success: false as const, error: response.error }
  return { success: true as const, data: response.data.authenticatedItem?.role ?? null }
}

export async function getClinicalAuditEvents(params: ListParams) {
  const and: Record<string, unknown>[] = []
  const since = sinceFor(params.range)
  if (since) and.push({ occurredAt: { gte: since } })
  if (params.type) and.push({ eventType: { equals: params.type } })
  if (params.search) and.push({
    OR: [
      { eventType: { contains: params.search, mode: 'insensitive' } },
      { appointment: { appointmentNumber: { contains: params.search, mode: 'insensitive' } } },
      { encounter: { encounterNumber: { contains: params.search, mode: 'insensitive' } } },
    ],
  })
  const where = and.length ? { AND: and } : {}
  return keystoneClient<{ clinicalAuditLogs: ClinicalAuditRow[]; clinicalAuditLogsCount: number; recent: Array<{ eventType?: string | null }> }>(
    `query ClinicalAuditTrail($where: ClinicalAuditLogWhereInput!, $take: Int!, $skip: Int!) {
      clinicalAuditLogs(where: $where, orderBy: [{ occurredAt: desc }], take: $take, skip: $skip) {
        id eventType actorType occurredAt
        facility { name timeZone }
        patient { id displayName }
        appointment { id appointmentNumber }
        encounter { id encounterNumber }
        intakeForm { id title }
      }
      clinicalAuditLogsCount(where: $where)
      recent: clinicalAuditLogs(orderBy: [{ occurredAt: desc }], take: 100) { eventType }
    }`,
    { where, take: params.take, skip: params.skip },
  )
}

export async function getWorkflowTransitions(params: ListParams) {
  const and: Record<string, unknown>[] = []
  const since = sinceFor(params.range)
  if (since) and.push({ occurredAt: { gte: since } })
  if (params.type) and.push({ aggregateType: { equals: params.type } })
  if (params.search) and.push({
    OR: [
      { aggregateId: { contains: params.search, mode: 'insensitive' } },
      { fromStatus: { contains: params.search, mode: 'insensitive' } },
      { toStatus: { contains: params.search, mode: 'insensitive' } },
    ],
  })
  const where = and.length ? { AND: and } : {}
  // `result` is deliberately not selected: it can carry clinical command bodies.
  return keystoneClient<{ workflowTransitions: WorkflowTransitionRow[]; workflowTransitionsCount: number }>(
    `query WorkflowTransitionTrail($where: WorkflowTransitionWhereInput!, $take: Int!, $skip: Int!) {
      workflowTransitions(where: $where, orderBy: [{ occurredAt: desc }], take: $take, skip: $skip) {
        id aggregateType aggregateId fromStatus toStatus fromVersion toVersion occurredAt
        facility { name timeZone }
        patient { id displayName }
        auditLog { id eventType }
      }
      workflowTransitionsCount(where: $where)
    }`,
    { where, take: params.take, skip: params.skip },
  )
}

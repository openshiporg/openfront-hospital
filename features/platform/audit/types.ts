export type AuditViewerRole = {
  canViewReports?: boolean | null
  canManagePatients?: boolean | null
  canManageAppointments?: boolean | null
  canAccessAllClinicalData?: boolean | null
}

export type AuditRange = '24h' | '7d' | '30d' | 'all'

export const AUDIT_RANGES: ReadonlyArray<{ value: AuditRange; label: string; hours: number | null }> = [
  { value: '24h', label: 'Last 24h', hours: 24 },
  { value: '7d', label: '7 days', hours: 24 * 7 },
  { value: '30d', label: '30 days', hours: 24 * 30 },
  { value: 'all', label: 'All time', hours: null },
]

/** Aggregate types whose transition rows the server exposes to a clinical-PHI reader (canManagePatients). */
export const CLINICAL_AGGREGATES = ['lab_result_creation', 'encounter', 'lab_result', 'medical_order', 'prescription', 'procedure', 'care_plan', 'clinical_document', 'specimen', 'admission', 'vital_sign'] as const
/** Aggregate types exposed to an appointment-PHI reader (canManageAppointments or canManagePatients). */
export const APPOINTMENT_AGGREGATES = ['appointment', 'care_queue_ticket'] as const

export type ClinicalAuditRow = {
  id: string
  eventType?: string | null
  actorType?: string | null
  occurredAt?: string | null
  facility?: { name?: string | null; timeZone?: string | null } | null
  patient?: { id: string; displayName?: string | null } | null
  appointment?: { id: string; appointmentNumber?: string | null } | null
  encounter?: { id: string; encounterNumber?: string | null } | null
  intakeForm?: { id: string; title?: string | null } | null
}

export type WorkflowTransitionRow = {
  id: string
  aggregateType?: string | null
  aggregateId?: string | null
  fromStatus?: string | null
  toStatus?: string | null
  fromVersion?: number | null
  toVersion?: number | null
  occurredAt?: string | null
  facility?: { name?: string | null; timeZone?: string | null } | null
  patient?: { id: string; displayName?: string | null } | null
  auditLog?: { id: string; eventType?: string | null } | null
}

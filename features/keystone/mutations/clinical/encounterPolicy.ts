export const ENCOUNTER_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  open: ['in_progress', 'cancelled'],
  in_progress: ['closed', 'cancelled'],
  closed: [],
  cancelled: [],
}

export function isEncounterTransitionAllowed(fromStatus: string, toStatus: string) {
  return ENCOUNTER_TRANSITIONS[fromStatus]?.includes(toStatus) ?? false
}

export function validateBoundedEncounterTransitionEvidence(input: {
  toStatus: string
  diagnosisSummary?: string | null
  reason?: string | null
}) {
  if (String(input.diagnosisSummary || '').trim()) {
    throw new Error('Diagnosis authorship is unavailable in this bounded patient-operations release')
  }
  if (input.toStatus === 'closed' && !String(input.reason || '').trim()) {
    throw new Error('Operational closure reason is required to close an encounter')
  }
  if (input.toStatus === 'cancelled' && !String(input.reason || '').trim()) {
    throw new Error('Cancellation reason is required')
  }
}

export function linkedAppointmentTransition(encounterStatus: string, appointmentStatus: string) {
  if (encounterStatus === 'in_progress' && appointmentStatus === 'checked_in') {
    return { fromStatus: 'checked_in', toStatus: 'in_visit' } as const
  }
  if (encounterStatus === 'closed' && appointmentStatus === 'in_visit') {
    return { fromStatus: 'in_visit', toStatus: 'completed' } as const
  }
  return null
}

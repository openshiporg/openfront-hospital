import { createHash } from 'node:crypto'

// Operational options, not clinical readiness, legal retention, or payer decisions.
export const episodePolicyOptions = {
  operationalClosure: ['enabled', 'blocked_pending_review'],
  legacyEpisodes: ['reviewed_late_only', 'block_pending_review'],
  newCare: ['new_encounter_required'],
  lateResults: ['allow_existing_order', 'block_pending_review'],
  resultCorrections: ['allow_recorded_human_review', 'block_pending_review'],
  claims: ['allow_reconciliation', 'block_pending_review'],
  retention: ['unchanged_separate_retention_policy'],
  admission: ['separate_admission_discharge_workflow'],
} as const
export type EpisodePolicyDefinition = { [K in keyof typeof episodePolicyOptions]: (typeof episodePolicyOptions)[K][number] }
export type EpisodeAction = 'new_care' | 'late_result' | 'correction' | 'claim' | 'cancel_evidence' | 'retention_evidence'

export function validateEpisodePolicy(value: unknown): EpisodePolicyDefinition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Explicit episode policy options are required')
  const definition = value as Record<string, unknown>
  if (Object.keys(definition).length !== Object.keys(episodePolicyOptions).length) throw new Error('Episode policy must contain exactly the reviewed options')
  for (const [key, options] of Object.entries(episodePolicyOptions)) {
    if (!(options as readonly unknown[]).includes(definition[key])) throw new Error(`Explicit ${key} policy is required`)
  }
  return { ...definition } as EpisodePolicyDefinition
}

export function episodeEligibility(input: {
  status: string; discharged?: boolean; receiptPresent: boolean; policy: EpisodePolicyDefinition | null;
  action: EpisodeAction; humanReviewed?: boolean;
}) {
  const closed = ['closed', 'cancelled'].includes(input.status) || input.discharged === true
  if (!closed) return { allowed: true, code: 'active_episode_existing_authority_required' }
  if (input.action === 'retention_evidence') return { allowed: false, code: 'separate_retention_hold_authority_required' }
  if (input.action === 'new_care') return { allowed: false, code: 'new_encounter_required' }
  if (!input.policy) return { allowed: false, code: 'policy_unavailable' }
  if (!input.receiptPresent && input.policy.legacyEpisodes !== 'reviewed_late_only') return { allowed: false, code: 'legacy_episode_review_required' }
  if (input.action === 'cancel_evidence') return { allowed: true, code: 'record_only_no_cascade_or_physical_disposition' }
  if (input.action === 'late_result') return { allowed: input.policy.lateResults === 'allow_existing_order', code: 'late_result_existing_order_policy' }
  if (input.action === 'correction') return {
    allowed: input.policy.resultCorrections === 'allow_recorded_human_review' && input.humanReviewed === true,
    code: 'correction_requires_recorded_human_review',
  }
  return { allowed: input.policy.claims === 'allow_reconciliation', code: 'claim_reconciliation_policy' }
}

export function episodeDigest(value: unknown): string {
  const canonical = (item: any): string => Array.isArray(item) ? `[${item.map(canonical).join(',')}]`
    : item && typeof item === 'object' ? `{${Object.keys(item).sort().map(key => `${JSON.stringify(key)}:${canonical(item[key])}`).join(',')}}`
      : JSON.stringify(item)
  return createHash('sha256').update(canonical(value)).digest('hex')
}

export function episodeTuple(row: any) {
  return { encounterId: row.id, facilityId: row.facility?.id, patientId: row.patient?.id,
    providerId: row.provider?.id, appointmentId: row.appointment?.id || null }
}
export function assertEpisodeTuple(expected: any, current: any) {
  if (episodeDigest(expected) !== episodeDigest(current)) throw new Error('Episode scope changed; original command cannot be applied or recovered')
}
export function requireHumanEpisodeReview(attested: unknown, reference: unknown) {
  if (attested !== true || typeof reference !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{2,199}$/.test(reference)) {
    throw new Error('Explicit human review and a non-PHI approval reference are required')
  }
  return reference
}

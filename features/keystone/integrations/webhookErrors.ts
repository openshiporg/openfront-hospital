const invalid = new Set(['invalid_webhook_field', 'integration_kind_mismatch', 'aggregate_scope_mismatch', 'invalid_domain_transition', 'episode_claim_policy_denied'])
export function webhookErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (message === 'webhook_event_id_reused') return { status: 409, code: 'webhook_event_id_reused' }
  if (message === 'integration_generation_revoked') return { status: 401, code: 'integration_generation_revoked' }
  if (invalid.has(message)) return { status: 422, code: message }
  // Serialization, DB/schema/key outages and unknown exceptions may be transient.
  return { status: 503, code: 'webhook_processing_unavailable' }
}

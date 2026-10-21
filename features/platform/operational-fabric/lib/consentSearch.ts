export function normalizeConsentTypeSearch(rawConsentType: unknown): string {
  return String(rawConsentType || '').trim().slice(0, 100).trim()
}

function consentDecisionCandidateWhere(
  facilityId: string,
  patientId: string,
  rawConsentType: unknown,
  decision?: 'granted',
): Record<string, unknown> | null {
  const facility = String(facilityId || '').trim()
  const patient = String(patientId || '').trim()
  const consentType = normalizeConsentTypeSearch(rawConsentType)
  if (!facility || !patient || !consentType) return null

  return {
    facility: { id: { equals: facility }, status: { equals: 'active' } },
    patient: { id: { equals: patient }, status: { equals: 'active' } },
    consentType: { equals: consentType },
    // Keystone accepts null for this nullable to-one relation to select unsuperseded current decisions.
    supersedingDecision: null,
    ...(decision ? { decision: { equals: decision } } : {}),
  }
}

export function currentConsentCandidateWhere(facilityId: string, patientId: string, consentType: unknown) {
  return consentDecisionCandidateWhere(facilityId, patientId, consentType)
}

export function currentGrantedConsentCandidateWhere(facilityId: string, patientId: string, consentType: unknown) {
  return consentDecisionCandidateWhere(facilityId, patientId, consentType, 'granted')
}

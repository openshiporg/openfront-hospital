export function normalizePaymentClaimSearch(rawSearch: unknown): string {
  return String(rawSearch || '').trim().slice(0, 100).trim()
}

export function paymentClaimCandidateWhere(facilityId: string, patientId: string, rawSearch: unknown): Record<string, unknown> | null {
  const facility = String(facilityId || '').trim()
  const patient = String(patientId || '').trim()
  const search = normalizePaymentClaimSearch(rawSearch)
  if (!facility || !patient || search.length < 2) return null

  return {
    facility: { id: { equals: facility } },
    patient: { id: { equals: patient } },
    claimNumber: { contains: search, mode: 'insensitive' },
  }
}

export function normalizeEncounterHoldSearch(rawSearch: unknown): string {
  return String(rawSearch || '').trim().slice(0, 100).trim()
}

export function encounterHoldCandidateWhere(facilityId: string, rawSearch: unknown): Record<string, unknown> | null {
  const facility = String(facilityId || '').trim()
  const search = normalizeEncounterHoldSearch(rawSearch)
  if (!facility || search.length < 2) return null

  return {
    status: { in: ['open', 'in_progress'] },
    facility: { id: { equals: facility }, status: { equals: 'active' } },
    encounterNumber: { contains: search, mode: 'insensitive' },
  }
}

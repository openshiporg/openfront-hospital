const SEARCH_LIMIT = 100

export function normalizeIntegrationSearch(rawSearch: unknown) {
  return String(rawSearch || '').trim().slice(0, SEARCH_LIMIT)
}

export function activeIntegrationCandidateWhere(rawSearch: unknown): Record<string, unknown> | null {
  const search = normalizeIntegrationSearch(rawSearch)
  if (search.length < 2) return null

  const contains = { contains: search, mode: 'insensitive' }
  return {
    status: { equals: 'active' },
    OR: [
      { name: contains },
      { kind: contains },
    ],
  }
}

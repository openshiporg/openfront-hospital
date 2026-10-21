const SEARCH_LIMIT = 100

export function normalizeInventorySearch(rawSearch: unknown) {
  return String(rawSearch || '').trim().slice(0, SEARCH_LIMIT)
}

export function inventoryCandidateWhere(rawSearch: unknown): Record<string, unknown> | null {
  const search = normalizeInventorySearch(rawSearch)
  if (search.length < 2) return null

  const contains = { contains: search, mode: 'insensitive' }
  return {
    status: { equals: 'active' },
    OR: [
      { sku: contains },
      { name: contains },
    ],
  }
}

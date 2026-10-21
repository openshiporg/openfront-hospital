export function unverifiedCoverageCandidateWhere(rawSearch: unknown): Record<string, unknown> | null {
  const search = String(rawSearch || '').trim().slice(0, 100)
  if (search.length < 2) return null

  const contains = { contains: search, mode: 'insensitive' }
  return {
    status: { equals: 'unverified' },
    OR: [
      { coverageNumber: contains },
      { payerName: contains },
    ],
  }
}

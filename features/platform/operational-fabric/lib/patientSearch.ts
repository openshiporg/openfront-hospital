export function normalizeFabricPatientSearch(rawSearch: unknown): string {
  return String(rawSearch || '').trim().slice(0, 100).trim()
}

export function activeFabricPatientCandidateWhere(facilityId: string, rawSearch: unknown): Record<string, unknown> | null {
  const facility = String(facilityId || '').trim()
  const search = normalizeFabricPatientSearch(rawSearch)
  if (!facility || search.length < 2) return null

  const contains = (value: string) => ({ contains: value, mode: 'insensitive' })
  const terms = search.split(/\s+/).filter(Boolean)
  const nameMatches: Record<string, unknown>[] = [
    { firstName: contains(search) },
    { lastName: contains(search) },
  ]
  if (terms.length > 1) {
    const first = terms[0]
    const last = terms.slice(1).join(' ')
    nameMatches.push(
      { AND: [{ firstName: contains(first) }, { lastName: contains(last) }] },
      { AND: [{ lastName: contains(first) }, { firstName: contains(last) }] },
    )
  }

  return {
    status: { equals: 'active' },
    facilities: { some: { id: { equals: facility } } },
    OR: nameMatches,
  }
}

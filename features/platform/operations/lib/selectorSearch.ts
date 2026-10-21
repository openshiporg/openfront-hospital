const SEARCH_LIMIT = 100

export function normalizeSelectorSearch(rawSearch: unknown) {
  return String(rawSearch || '').trim().slice(0, SEARCH_LIMIT)
}

export function activeLabTestCandidateWhere(rawSearch: unknown): Record<string, unknown> | null {
  const search = normalizeSelectorSearch(rawSearch)
  if (search.length < 2) return null

  const contains = { contains: search, mode: 'insensitive' }
  return {
    active: { equals: true },
    OR: [{ name: contains }, { code: contains }],
  }
}

export function activeLabOrderCandidateWhere(facilityId: unknown, patientId: unknown, encounterId: unknown, rawSearch: unknown): Record<string, unknown> | null {
  const facility = String(facilityId || '').trim().slice(0, 200)
  const patient = String(patientId || '').trim().slice(0, 200)
  const encounter = String(encounterId || '').trim().slice(0, 200)
  const search = normalizeSelectorSearch(rawSearch)
  if (!facility || !patient || !encounter || search.length < 2) return null

  return {
    orderType: { equals: 'lab' },
    status: { in: ['ordered', 'in_progress'] },
    facility: { id: { equals: facility } },
    patient: { id: { equals: patient } },
    encounter: { id: { equals: encounter } },
    orderNumber: { contains: search, mode: 'insensitive' },
  }
}

export function activeMedicationOrderCandidateWhere(facilityId: unknown, patientId: unknown, encounterId: unknown, rawSearch: unknown): Record<string, unknown> | null {
  const facility = String(facilityId || '').trim().slice(0, 200)
  const patient = String(patientId || '').trim().slice(0, 200)
  const encounter = String(encounterId || '').trim().slice(0, 200)
  const search = normalizeSelectorSearch(rawSearch)
  if (!facility || !patient || !encounter || search.length < 2) return null

  return {
    orderType: { equals: 'medication' },
    status: { in: ['ordered', 'in_progress'] },
    facility: { id: { equals: facility } },
    patient: { id: { equals: patient } },
    encounter: { id: { equals: encounter } },
    orderNumber: { contains: search, mode: 'insensitive' },
  }
}

export function activeProcedureOrderCandidateWhere(facilityId: unknown, patientId: unknown, encounterId: unknown, rawSearch: unknown): Record<string, unknown> | null {
  const facility = String(facilityId || '').trim().slice(0, 200)
  const patient = String(patientId || '').trim().slice(0, 200)
  const encounter = String(encounterId || '').trim().slice(0, 200)
  const search = normalizeSelectorSearch(rawSearch)
  if (!facility || !patient || !encounter || search.length < 2) return null

  return {
    orderType: { equals: 'procedure' },
    status: { in: ['ordered', 'in_progress'] },
    facility: { id: { equals: facility } },
    patient: { id: { equals: patient } },
    encounter: { id: { equals: encounter } },
    orderNumber: { contains: search, mode: 'insensitive' },
  }
}

export function correctableLabResultCandidateWhere(rawSearch: unknown): Record<string, unknown> | null {
  const search = normalizeSelectorSearch(rawSearch)
  if (search.length < 2) return null

  return {
    status: { in: ['final', 'acknowledged', 'corrected'] },
    supersedingResult: null,
    resultNumber: { contains: search, mode: 'insensitive' },
  }
}

export function activeFacilityClinicianCandidateWhere(facilityId: unknown, rawSearch: unknown): Record<string, unknown> | null {
  const facility = String(facilityId || '').trim().slice(0, 200)
  const search = normalizeSelectorSearch(rawSearch)
  if (!facility || search.length < 2) return null

  const contains = { contains: search, mode: 'insensitive' }
  return {
    active: { equals: true },
    AND: [
      { OR: [{ displayName: contains }, { clinicianType: contains }] },
      { OR: [
        { department: { facilities: { some: { id: { equals: facility } } } } },
        { provider: { facilities: { some: { id: { equals: facility } } } } },
      ] },
    ],
  }
}

export function departmentCandidateWhere(facilityId: unknown, rawSearch: unknown): Record<string, unknown> | null {
  const facility = String(facilityId || '').trim().slice(0, 200)
  const search = normalizeSelectorSearch(rawSearch)
  if (!facility || search.length < 2) return null

  return {
    status: { equals: 'active' },
    facilities: { some: { id: { equals: facility }, status: { equals: 'active' } } },
    name: { contains: search, mode: 'insensitive' },
  }
}

export function activeFacilityPatientCandidateWhere(facilityId: unknown, rawSearch: unknown): Record<string, unknown> | null {
  const facility = String(facilityId || '').trim().slice(0, 200)
  const search = normalizeSelectorSearch(rawSearch)
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
    facilities: { some: { id: { equals: facility }, status: { equals: 'active' } } },
    OR: nameMatches,
  }
}

export function encounterPatientCandidateWhere(facilityId: unknown, rawSearch: unknown): Record<string, unknown> | null {
  return activeFacilityPatientCandidateWhere(facilityId, rawSearch)
}

export function providerCandidateWhere(facilityId: unknown, rawSearch: unknown): Record<string, unknown> | null {
  const facility = String(facilityId || '').trim().slice(0, 200)
  const search = normalizeSelectorSearch(rawSearch)
  if (!facility || search.length < 2) return null

  const terms = search.split(/\s+/).filter(Boolean).slice(0, 2)
  const nameFilters: Record<string, unknown>[] = terms.flatMap(term => [
    { firstName: { contains: term, mode: 'insensitive' } },
    { lastName: { contains: term, mode: 'insensitive' } },
  ])
  if (terms.length > 1) {
    nameFilters.push(
      { AND: [{ firstName: { contains: terms[0], mode: 'insensitive' } }, { lastName: { contains: terms[1], mode: 'insensitive' } }] },
      { AND: [{ firstName: { contains: terms[1], mode: 'insensitive' } }, { lastName: { contains: terms[0], mode: 'insensitive' } }] },
    )
  }

  return {
    status: { equals: 'active' },
    facilities: { some: { id: { equals: facility } } },
    OR: [
      ...nameFilters,
      { credentials: { contains: search, mode: 'insensitive' } },
      { specialty: { contains: search, mode: 'insensitive' } },
    ],
  }
}

export function patientCoverageCandidateWhere(facilityId: unknown, patientId: unknown, rawSearch: unknown): Record<string, unknown> | null {
  const facility = String(facilityId || '').trim().slice(0, 200)
  const patient = String(patientId || '').trim().slice(0, 200)
  const search = normalizeSelectorSearch(rawSearch)
  if (!facility || !patient || search.length < 2) return null

  const contains = { contains: search, mode: 'insensitive' }
  return {
    status: { equals: 'active' },
    facility: { id: { equals: facility } },
    patient: { id: { equals: patient } },
    OR: [
      { coverageNumber: contains },
      { payerName: contains },
    ],
  }
}

export function availableBedCandidateWhere(facilityId: unknown, rawSearch: unknown): Record<string, unknown> | null {
  const facility = String(facilityId || '').trim().slice(0, 200)
  const search = normalizeSelectorSearch(rawSearch)
  if (!facility || search.length < 2) return null

  const contains = { contains: search, mode: 'insensitive' }
  return {
    status: { equals: 'available' },
    facility: { id: { equals: facility } },
    OR: [
      { bedNumber: contains },
      { room: { roomNumber: contains } },
      { room: { ward: { name: contains } } },
    ],
  }
}

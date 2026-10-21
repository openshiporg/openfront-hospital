export const CLAIMS_CURSOR_PAGE_SIZE = 25
export const CLAIMS_CURSOR_FETCH_SIZE = CLAIMS_CURSOR_PAGE_SIZE + 1
export const CLAIMS_QUEUE_STATUSES = ['draft', 'prepared', 'submitted', 'external_rejected', 'denied', 'corrected'] as const

export type ClaimsCursorDirection = 'first' | 'after' | 'before'
export type ClaimsCursorParam = string | string[] | undefined
export type ClaimsCursorRequest =
  | { state: 'ready'; direction: ClaimsCursorDirection; cursorId: string | null }
  | { state: 'stale' | 'inconsistent' }

export type ClaimsQueueRow = {
  id: string
  claimNumber: string
  status: string
  transitionVersion: number
  patient?: { displayName?: string | null } | null
  facility?: { name?: string | null } | null
}

export type ClaimsCursorPage =
  | { state: 'inconsistent' }
  | {
      state: 'empty' | 'ready'
      claims: ClaimsQueueRow[]
      totalCount: number
      submittedCount: number
      overflow: boolean
      hasPrevious: boolean
      hasNext: boolean
    }

export function claimsQueueWhere() {
  return { status: { in: [...CLAIMS_QUEUE_STATUSES] } }
}

export function claimsCursorOrderBy(direction: 'after' | 'before') {
  const order = direction === 'before' ? 'desc' : 'asc'
  return [{ createdAt: order }, { id: order }]
}

export function claimsCursorMembershipWhere(cursorId: string) {
  return {
    AND: [
      claimsQueueWhere(),
      { id: { equals: cursorId } },
    ],
  }
}

function parseCursorParam(value: ClaimsCursorParam) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) return null
  return value.trim()
}

export function parseClaimsCursor(after: ClaimsCursorParam, before: ClaimsCursorParam): ClaimsCursorRequest {
  const hasAfter = after !== undefined
  const hasBefore = before !== undefined
  if (!hasAfter && !hasBefore) return { state: 'ready', direction: 'first', cursorId: null }
  if (hasAfter && hasBefore) return { state: 'inconsistent' }

  const cursorId = parseCursorParam(hasAfter ? after : before)
  if (!cursorId) return { state: 'stale' }
  return { state: 'ready', direction: hasAfter ? 'after' : 'before', cursorId }
}

export function parseClaimsCounts(totalCount: unknown, submittedCount: unknown) {
  if (typeof totalCount !== 'number' || !Number.isSafeInteger(totalCount) || totalCount < 0 ||
    typeof submittedCount !== 'number' || !Number.isSafeInteger(submittedCount) || submittedCount < 0 || submittedCount > totalCount) return null
  return { totalCount, submittedCount }
}

export function validateClaimsCursorMembership(cursorId: string, rows: unknown, count: unknown): 'member' | 'stale' | 'inconsistent' {
  if (!Array.isArray(rows) || rows.length > 1 || !rows.every(row => row && typeof row === 'object' && typeof row.id === 'string') ||
    typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
    return 'inconsistent'
  }
  if (rows.length === 0 && count === 0) return 'stale'
  if (rows.length === 1 && count === 1 && rows[0].id === cursorId) return 'member'
  return 'inconsistent'
}

function isClaimRow(row: unknown): row is ClaimsQueueRow {
  if (!row || typeof row !== 'object') return false
  const candidate = row as Record<string, any>
  const patientValid = candidate.patient == null || (
    typeof candidate.patient === 'object' && !Array.isArray(candidate.patient) &&
    (candidate.patient.displayName == null || typeof candidate.patient.displayName === 'string')
  )
  const facilityValid = candidate.facility == null || (
    typeof candidate.facility === 'object' && !Array.isArray(candidate.facility) &&
    (candidate.facility.name == null || typeof candidate.facility.name === 'string')
  )
  return typeof candidate.id === 'string' && Boolean(candidate.id) &&
    typeof candidate.claimNumber === 'string' && Boolean(candidate.claimNumber) &&
    typeof candidate.status === 'string' && (CLAIMS_QUEUE_STATUSES as readonly string[]).includes(candidate.status) &&
    Number.isSafeInteger(candidate.transitionVersion) && candidate.transitionVersion > 0 &&
    patientValid && facilityValid
}

export function shapeClaimsCursorPage(
  rawRows: unknown,
  totalCount: unknown,
  submittedCount: unknown,
  direction: ClaimsCursorDirection,
  hasCursor: boolean,
): ClaimsCursorPage {
  const counts = parseClaimsCounts(totalCount, submittedCount)
  if (!Array.isArray(rawRows) || rawRows.length > CLAIMS_CURSOR_FETCH_SIZE || !rawRows.every(isClaimRow) ||
    new Set(rawRows.map(row => row.id)).size !== rawRows.length || !counts) {
    return { state: 'inconsistent' }
  }

  const overflow = rawRows.length === CLAIMS_CURSOR_FETCH_SIZE
  if (hasCursor) {
    if (counts.totalCount < rawRows.length + 1) return { state: 'inconsistent' }
  } else if (direction !== 'first' || (overflow ? counts.totalCount <= CLAIMS_CURSOR_PAGE_SIZE : rawRows.length !== counts.totalCount)) {
    return { state: 'inconsistent' }
  }

  const claims = (overflow ? rawRows.slice(0, CLAIMS_CURSOR_PAGE_SIZE) : [...rawRows]) as ClaimsQueueRow[]
  if (direction === 'before') claims.reverse()
  const hasPrevious = direction === 'before' ? overflow : direction === 'after' ? hasCursor : false
  const hasNext = direction === 'before' ? hasCursor : overflow

  return {
    state: claims.length ? 'ready' : 'empty',
    claims,
    totalCount: counts.totalCount,
    submittedCount: counts.submittedCount,
    overflow,
    hasPrevious,
    hasNext,
  }
}

export function claimsCursorHref(
  cursorParam: 'claimsAfter' | 'claimsBefore' | null,
  cursorId: string | null,
  status: string | string[] | undefined,
) {
  const params = new URLSearchParams()
  const statuses = Array.isArray(status) ? status.slice(0, 8) : [status]
  for (const value of statuses) {
    if (typeof value === 'string' && value.length <= 100) params.append('status', value)
  }
  if (cursorParam && cursorId) params.set(cursorParam, cursorId)
  const query = params.toString()
  return query ? `/dashboard/platform/claims?${query}` : '/dashboard/platform/claims'
}

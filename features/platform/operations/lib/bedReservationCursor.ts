export const ACTIVE_BED_RESERVATION_PAGE_SIZE = 25
export const ACTIVE_BED_RESERVATION_FETCH_SIZE = ACTIVE_BED_RESERVATION_PAGE_SIZE + 1
export const ACTIVE_BED_RESERVATION_STATUS = 'active' as const

export type BedReservationCursorDirection = 'first' | 'after' | 'before'
export type BedReservationCursorParam = string | string[] | undefined
export type BedReservationCursorRequest =
  | { state: 'ready'; direction: BedReservationCursorDirection; cursorId: string | null }
  | { state: 'stale' | 'inconsistent' }

export type BedReservationCursorRow = {
  id: string
  reservationNumber: string
  status: string
  transitionVersion: number
  expiresAt: string
  patient?: { displayName?: string | null } | null
  bed?: { bedNumber?: string | null } | null
  facility?: { name?: string | null; timeZone?: string | null } | null
}

export type BedReservationCursorPage =
  | { state: 'inconsistent' }
  | {
      state: 'empty' | 'ready'
      reservations: BedReservationCursorRow[]
      totalCount: number
      overflow: boolean
      hasPrevious: boolean
      hasNext: boolean
    }

export function activeBedReservationsWhere() {
  return { status: { equals: ACTIVE_BED_RESERVATION_STATUS } }
}

export function bedReservationCursorMembershipWhere(cursorId: string) {
  return {
    AND: [
      activeBedReservationsWhere(),
      { id: { equals: cursorId } },
    ],
  }
}

export function bedReservationCursorOrderBy(direction: 'after' | 'before') {
  const order = direction === 'before' ? 'desc' : 'asc'
  return [{ expiresAt: order }, { id: order }]
}

function parseCursorParam(value: BedReservationCursorParam) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) return null
  return value.trim()
}

export function parseBedReservationCursor(after: BedReservationCursorParam, before: BedReservationCursorParam): BedReservationCursorRequest {
  const hasAfter = after !== undefined
  const hasBefore = before !== undefined
  if (!hasAfter && !hasBefore) return { state: 'ready', direction: 'first', cursorId: null }
  if (hasAfter && hasBefore) return { state: 'inconsistent' }

  const cursorId = parseCursorParam(hasAfter ? after : before)
  if (!cursorId) return { state: 'stale' }
  return { state: 'ready', direction: hasAfter ? 'after' : 'before', cursorId }
}

export function parseBedReservationsCount(count: unknown): number | null {
  return typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 ? count : null
}

export function validateBedReservationCursorMembership(cursorId: string, rows: unknown, count: unknown): 'member' | 'denied' | 'inconsistent' {
  if (!Array.isArray(rows) || rows.length > 1 || !rows.every(row => row && typeof row === 'object' && typeof row.id === 'string')) {
    return 'inconsistent'
  }
  const normalizedCount = parseBedReservationsCount(count)
  if (normalizedCount === null) return 'inconsistent'
  if (rows.length === 0 && normalizedCount === 0) return 'denied'
  if (rows.length === 1 && normalizedCount === 1 && rows[0].id === cursorId) return 'member'
  return 'inconsistent'
}

function isBedReservationRow(row: unknown): row is BedReservationCursorRow {
  if (!row || typeof row !== 'object') return false
  const candidate = row as Record<string, any>
  const relationField = (value: unknown, field: string) => value == null || (
    typeof value === 'object' && !Array.isArray(value) &&
    ((value as Record<string, unknown>)[field] == null || typeof (value as Record<string, unknown>)[field] === 'string')
  )
  return typeof candidate.id === 'string' && Boolean(candidate.id) &&
    typeof candidate.reservationNumber === 'string' && Boolean(candidate.reservationNumber) &&
    candidate.status === ACTIVE_BED_RESERVATION_STATUS &&
    Number.isSafeInteger(candidate.transitionVersion) && candidate.transitionVersion > 0 &&
    typeof candidate.expiresAt === 'string' && Number.isFinite(Date.parse(candidate.expiresAt)) &&
    relationField(candidate.patient, 'displayName') && relationField(candidate.bed, 'bedNumber') &&
    relationField(candidate.facility, 'name') && relationField(candidate.facility, 'timeZone')
}

export function shapeBedReservationCursorPage(
  rawRows: unknown,
  totalCountValue: unknown,
  direction: BedReservationCursorDirection,
  hasCursor: boolean,
): BedReservationCursorPage {
  const totalCount = parseBedReservationsCount(totalCountValue)
  if (!Array.isArray(rawRows) || rawRows.length > ACTIVE_BED_RESERVATION_FETCH_SIZE || !rawRows.every(isBedReservationRow) ||
    new Set(rawRows.map(row => row.id)).size !== rawRows.length || totalCount === null) {
    return { state: 'inconsistent' }
  }

  const overflow = rawRows.length === ACTIVE_BED_RESERVATION_FETCH_SIZE
  if (hasCursor) {
    if (totalCount < rawRows.length + 1) return { state: 'inconsistent' }
  } else if (direction !== 'first' || (overflow ? totalCount <= ACTIVE_BED_RESERVATION_PAGE_SIZE : rawRows.length !== totalCount)) {
    return { state: 'inconsistent' }
  }

  const reservations = (overflow ? rawRows.slice(0, ACTIVE_BED_RESERVATION_PAGE_SIZE) : [...rawRows]) as BedReservationCursorRow[]
  if (direction === 'before') reservations.reverse()
  const hasPrevious = direction === 'before' ? overflow : direction === 'after' ? hasCursor : false
  const hasNext = direction === 'before' ? hasCursor : overflow

  return {
    state: reservations.length ? 'ready' : 'empty',
    reservations,
    totalCount,
    overflow,
    hasPrevious,
    hasNext,
  }
}

export const BED_CURSOR_PAGE_SIZE = 25
export const BED_CURSOR_FETCH_SIZE = BED_CURSOR_PAGE_SIZE + 1

export type BedCursorDirection = 'first' | 'after' | 'before'
export type BedCursorParam = string | string[] | undefined
export type BedCursorRequest =
  | { state: 'ready'; direction: BedCursorDirection; cursorId: string | null }
  | { state: 'stale' | 'inconsistent' }

export type BedCursorRow = {
  id: string
  bedNumber: string
  status: string
  transitionVersion: number
  currentPatient?: { displayName?: string | null } | null
  room?: { roomNumber?: string | null; ward?: { name?: string | null } | null } | null
}

export type BedCursorPage =
  | { state: 'inconsistent' }
  | {
      state: 'empty' | 'ready'
      beds: BedCursorRow[]
      totalCount: number
      overflow: boolean
      hasPrevious: boolean
      hasNext: boolean
    }

export type BedCounts = { beds: number; availableBeds: number; occupiedBeds: number }

export function allBedsWhere() {
  return {}
}

export function bedCursorMembershipWhere(cursorId: string) {
  return { id: { equals: cursorId } }
}

export function bedCursorOrderBy(direction: 'after' | 'before') {
  const order = direction === 'before' ? 'desc' : 'asc'
  return [{ bedNumber: order }, { id: order }]
}

function parseCursorParam(value: BedCursorParam) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) return null
  return value.trim()
}

export function parseBedCursor(after: BedCursorParam, before: BedCursorParam): BedCursorRequest {
  const hasAfter = after !== undefined
  const hasBefore = before !== undefined
  if (!hasAfter && !hasBefore) return { state: 'ready', direction: 'first', cursorId: null }
  if (hasAfter && hasBefore) return { state: 'inconsistent' }

  const cursorId = parseCursorParam(hasAfter ? after : before)
  if (!cursorId) return { state: 'stale' }
  return { state: 'ready', direction: hasAfter ? 'after' : 'before', cursorId }
}

export function parseBedsCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

export function parseBedCounts(value: { bedsCount: unknown; availableBedsCount: unknown; occupiedBedsCount: unknown }): BedCounts | null {
  const beds = parseBedsCount(value.bedsCount)
  const availableBeds = parseBedsCount(value.availableBedsCount)
  const occupiedBeds = parseBedsCount(value.occupiedBedsCount)
  return beds === null || availableBeds === null || occupiedBeds === null ? null : { beds, availableBeds, occupiedBeds }
}

export function validateBedCursorMembership(cursorId: string, rows: unknown, count: unknown): 'member' | 'denied' | 'inconsistent' {
  if (!Array.isArray(rows) || rows.length > 1 || !rows.every(row => row && typeof row === 'object' && typeof row.id === 'string')) {
    return 'inconsistent'
  }
  const normalizedCount = parseBedsCount(count)
  if (normalizedCount === null) return 'inconsistent'
  if (rows.length === 0 && normalizedCount === 0) return 'denied'
  if (rows.length === 1 && normalizedCount === 1 && rows[0].id === cursorId) return 'member'
  return 'inconsistent'
}

function isBedRow(row: unknown): row is BedCursorRow {
  if (!row || typeof row !== 'object') return false
  const candidate = row as Record<string, any>
  const relationField = (value: unknown, field: string) => value == null || (
    typeof value === 'object' && !Array.isArray(value) &&
    ((value as Record<string, unknown>)[field] == null || typeof (value as Record<string, unknown>)[field] === 'string')
  )
  const roomValid = candidate.room == null || (
    typeof candidate.room === 'object' && !Array.isArray(candidate.room) &&
    (candidate.room.roomNumber == null || typeof candidate.room.roomNumber === 'string') &&
    relationField(candidate.room.ward, 'name')
  )
  return typeof candidate.id === 'string' && Boolean(candidate.id) &&
    typeof candidate.bedNumber === 'string' &&
    typeof candidate.status === 'string' && Boolean(candidate.status) &&
    Number.isSafeInteger(candidate.transitionVersion) && candidate.transitionVersion > 0 &&
    relationField(candidate.currentPatient, 'displayName') && roomValid
}

export function shapeBedCursorPage(
  rawRows: unknown,
  totalCountValue: unknown,
  direction: BedCursorDirection,
  hasCursor: boolean,
): BedCursorPage {
  const totalCount = parseBedsCount(totalCountValue)
  if (!Array.isArray(rawRows) || rawRows.length > BED_CURSOR_FETCH_SIZE || !rawRows.every(isBedRow) ||
    new Set(rawRows.map(row => row.id)).size !== rawRows.length || totalCount === null) {
    return { state: 'inconsistent' }
  }

  const overflow = rawRows.length === BED_CURSOR_FETCH_SIZE
  if (hasCursor) {
    if (totalCount < rawRows.length + 1) return { state: 'inconsistent' }
  } else if (direction !== 'first' || (overflow ? totalCount <= BED_CURSOR_PAGE_SIZE : rawRows.length !== totalCount)) {
    return { state: 'inconsistent' }
  }

  const beds = (overflow ? rawRows.slice(0, BED_CURSOR_PAGE_SIZE) : [...rawRows]) as BedCursorRow[]
  if (direction === 'before') beds.reverse()
  const hasPrevious = direction === 'before' ? overflow : direction === 'after' ? hasCursor : false
  const hasNext = direction === 'before' ? hasCursor : overflow

  return {
    state: beds.length ? 'ready' : 'empty',
    beds,
    totalCount,
    overflow,
    hasPrevious,
    hasNext,
  }
}

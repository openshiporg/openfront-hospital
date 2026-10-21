export const ACTIVE_ADMISSION_PAGE_SIZE = 25
export const ACTIVE_ADMISSION_FETCH_SIZE = ACTIVE_ADMISSION_PAGE_SIZE + 1
export const ACTIVE_ADMISSION_STATUSES = ['admitted', 'transferred'] as const

export type AdmissionCursorDirection = 'first' | 'after' | 'before'
export type AdmissionCursorParam = string | string[] | undefined
export type AdmissionCursorRequest =
  | { state: 'ready'; direction: AdmissionCursorDirection; cursorId: string | null }
  | { state: 'stale' | 'inconsistent' }

export type ActiveAdmissionRow = {
  id: string
  admissionNumber: string
  status: string
  transitionVersion: number
  admittedAt?: string | null
  patient?: { displayName?: string | null } | null
  facility?: { id?: string | null; name?: string | null; timeZone?: string | null } | null
  bed?: { id: string; bedNumber?: string | null } | null
  room?: { roomNumber?: string | null } | null
}

export type ActiveAdmissionsCursorPage =
  | { state: 'inconsistent' }
  | {
      state: 'empty' | 'ready'
      admissions: ActiveAdmissionRow[]
      totalCount: number
      overflow: boolean
      hasPrevious: boolean
      hasNext: boolean
    }

export function activeAdmissionsWhere() {
  return { status: { in: [...ACTIVE_ADMISSION_STATUSES] } }
}

export function admissionCursorMembershipWhere(cursorId: string) {
  return {
    AND: [
      activeAdmissionsWhere(),
      { id: { equals: cursorId } },
    ],
  }
}

export function admissionCursorOrderBy(direction: 'after' | 'before') {
  const order = direction === 'before' ? 'desc' : 'asc'
  return [{ admittedAt: order }, { id: order }]
}

function parseCursorParam(value: AdmissionCursorParam) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) return null
  return value.trim()
}

export function parseAdmissionCursor(after: AdmissionCursorParam, before: AdmissionCursorParam): AdmissionCursorRequest {
  const hasAfter = after !== undefined
  const hasBefore = before !== undefined
  if (!hasAfter && !hasBefore) return { state: 'ready', direction: 'first', cursorId: null }
  if (hasAfter && hasBefore) return { state: 'inconsistent' }

  const cursorId = parseCursorParam(hasAfter ? after : before)
  if (!cursorId) return { state: 'stale' }
  return { state: 'ready', direction: hasAfter ? 'after' : 'before', cursorId }
}

export function parseAdmissionsCount(count: unknown): number | null {
  return typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 ? count : null
}

export function validateAdmissionCursorMembership(cursorId: string, rows: unknown, count: unknown): 'member' | 'denied' | 'inconsistent' {
  if (!Array.isArray(rows) || rows.length > 1 || !rows.every(row => row && typeof row === 'object' && typeof row.id === 'string')) {
    return 'inconsistent'
  }
  const normalizedCount = parseAdmissionsCount(count)
  if (normalizedCount === null) return 'inconsistent'
  if (rows.length === 0 && normalizedCount === 0) return 'denied'
  if (rows.length === 1 && normalizedCount === 1 && rows[0].id === cursorId) return 'member'
  return 'inconsistent'
}

function isAdmissionRow(row: unknown): row is ActiveAdmissionRow {
  if (!row || typeof row !== 'object') return false
  const candidate = row as Record<string, any>
  const relationField = (value: unknown, field: string) => value == null || (
    typeof value === 'object' && !Array.isArray(value) &&
    ((value as Record<string, unknown>)[field] == null || typeof (value as Record<string, unknown>)[field] === 'string')
  )
  const bedValid = candidate.bed == null || (
    typeof candidate.bed === 'object' && !Array.isArray(candidate.bed) && typeof candidate.bed.id === 'string' &&
    (candidate.bed.bedNumber == null || typeof candidate.bed.bedNumber === 'string')
  )
  const roomValid = relationField(candidate.room, 'roomNumber')
  const facilityValid = relationField(candidate.facility, 'id') && relationField(candidate.facility, 'name') && relationField(candidate.facility, 'timeZone')
  return typeof candidate.id === 'string' && Boolean(candidate.id) &&
    typeof candidate.admissionNumber === 'string' && Boolean(candidate.admissionNumber) &&
    typeof candidate.status === 'string' && (ACTIVE_ADMISSION_STATUSES as readonly string[]).includes(candidate.status) &&
    Number.isSafeInteger(candidate.transitionVersion) && candidate.transitionVersion > 0 &&
    (candidate.admittedAt == null || typeof candidate.admittedAt === 'string') &&
    relationField(candidate.patient, 'displayName') && facilityValid && bedValid && roomValid
}

export function shapeActiveAdmissionsCursorPage(rawRows: unknown, totalCountValue: unknown, direction: AdmissionCursorDirection, hasCursor: boolean): ActiveAdmissionsCursorPage {
  const totalCount = parseAdmissionsCount(totalCountValue)
  if (!Array.isArray(rawRows) || rawRows.length > ACTIVE_ADMISSION_FETCH_SIZE || !rawRows.every(isAdmissionRow) ||
    new Set(rawRows.map(row => row.id)).size !== rawRows.length || totalCount === null) {
    return { state: 'inconsistent' }
  }

  const overflow = rawRows.length === ACTIVE_ADMISSION_FETCH_SIZE
  if (hasCursor) {
    if (totalCount < rawRows.length + 1) return { state: 'inconsistent' }
  } else if (direction !== 'first' || (overflow ? totalCount <= ACTIVE_ADMISSION_PAGE_SIZE : rawRows.length !== totalCount)) {
    return { state: 'inconsistent' }
  }

  const admissions = (overflow ? rawRows.slice(0, ACTIVE_ADMISSION_PAGE_SIZE) : [...rawRows]) as ActiveAdmissionRow[]
  if (direction === 'before') admissions.reverse()
  const hasPrevious = direction === 'before' ? overflow : direction === 'after' ? hasCursor : false
  const hasNext = direction === 'before' ? hasCursor : overflow

  return {
    state: admissions.length ? 'ready' : 'empty',
    admissions,
    totalCount,
    overflow,
    hasPrevious,
    hasNext,
  }
}


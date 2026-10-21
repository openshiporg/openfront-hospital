import { fulfillmentCursorHref, type FulfillmentQueueState } from './fulfillmentCursorHref'

export const CARE_PLAN_CURSOR_PAGE_SIZE = 25
export const CARE_PLAN_CURSOR_FETCH_SIZE = CARE_PLAN_CURSOR_PAGE_SIZE + 1
export const CARE_PLAN_QUEUE_STATUSES = ['draft', 'active'] as const

export type CarePlanCursorDirection = 'first' | 'after' | 'before'
export type CarePlanCursorParam = string | string[] | undefined
export type CarePlanCursorRequest =
  | { state: 'ready'; direction: CarePlanCursorDirection; cursorId: string | null }
  | { state: 'stale' | 'inconsistent' }

export type CarePlanQueueRow = {
  id: string
  title: string
  status: string
  transitionVersion: number
  patient?: { displayName?: string | null } | null
}

export type CarePlanCursorPage =
  | { state: 'inconsistent' }
  | {
      state: 'empty' | 'ready'
      carePlans: CarePlanQueueRow[]
      totalCount: number
      overflow: boolean
      hasPrevious: boolean
      hasNext: boolean
    }

export type CarePlanPreservedQueueState = FulfillmentQueueState

export function carePlanQueueWhere() {
  return { status: { in: [...CARE_PLAN_QUEUE_STATUSES] } }
}

export function carePlanCursorMembershipWhere(cursorId: string) {
  return {
    AND: [
      carePlanQueueWhere(),
      { id: { equals: cursorId } },
    ],
  }
}

export function carePlanCursorOrderBy(direction: 'after' | 'before') {
  const order = direction === 'before' ? 'desc' : 'asc'
  return [{ createdAt: order }, { id: order }]
}

function parseCursorParam(value: CarePlanCursorParam) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) return null
  return value.trim()
}

export function parseCarePlanCursor(after: CarePlanCursorParam, before: CarePlanCursorParam): CarePlanCursorRequest {
  const hasAfter = after !== undefined
  const hasBefore = before !== undefined
  if (!hasAfter && !hasBefore) return { state: 'ready', direction: 'first', cursorId: null }
  if (hasAfter && hasBefore) return { state: 'inconsistent' }

  const cursorId = parseCursorParam(hasAfter ? after : before)
  if (!cursorId) return { state: 'stale' }
  return { state: 'ready', direction: hasAfter ? 'after' : 'before', cursorId }
}

export function parseCarePlansCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

export function validateCarePlanCursorMembership(cursorId: string, rows: unknown, count: unknown): 'member' | 'stale' | 'inconsistent' {
  if (!Array.isArray(rows) || rows.length > 1 || !rows.every(row => row && typeof row === 'object' && typeof row.id === 'string')) {
    return 'inconsistent'
  }
  const normalizedCount = parseCarePlansCount(count)
  if (normalizedCount === null) return 'inconsistent'
  if (rows.length === 0 && normalizedCount === 0) return 'stale'
  if (rows.length === 1 && normalizedCount === 1 && rows[0].id === cursorId) return 'member'
  return 'inconsistent'
}

function isCarePlanRow(row: unknown): row is CarePlanQueueRow {
  if (!row || typeof row !== 'object') return false
  const candidate = row as Record<string, any>
  const patientValid = candidate.patient == null || (
    typeof candidate.patient === 'object' && !Array.isArray(candidate.patient) &&
    (candidate.patient.displayName == null || typeof candidate.patient.displayName === 'string')
  )
  return typeof candidate.id === 'string' && Boolean(candidate.id) &&
    typeof candidate.title === 'string' && Boolean(candidate.title) &&
    typeof candidate.status === 'string' && (CARE_PLAN_QUEUE_STATUSES as readonly string[]).includes(candidate.status) &&
    Number.isSafeInteger(candidate.transitionVersion) && candidate.transitionVersion > 0 && patientValid
}

export function shapeCarePlanCursorPage(
  rawRows: unknown,
  totalCountValue: unknown,
  direction: CarePlanCursorDirection,
  hasCursor: boolean,
): CarePlanCursorPage {
  const totalCount = parseCarePlansCount(totalCountValue)
  if (!Array.isArray(rawRows) || rawRows.length > CARE_PLAN_CURSOR_FETCH_SIZE || !rawRows.every(isCarePlanRow) ||
    new Set(rawRows.map(row => row.id)).size !== rawRows.length || totalCount === null) {
    return { state: 'inconsistent' }
  }

  const overflow = rawRows.length === CARE_PLAN_CURSOR_FETCH_SIZE
  if (hasCursor) {
    if (totalCount < rawRows.length + 1) return { state: 'inconsistent' }
  } else if (direction !== 'first' || (overflow ? totalCount <= CARE_PLAN_CURSOR_PAGE_SIZE : rawRows.length !== totalCount)) {
    return { state: 'inconsistent' }
  }

  const carePlans = (overflow ? rawRows.slice(0, CARE_PLAN_CURSOR_PAGE_SIZE) : [...rawRows]) as CarePlanQueueRow[]
  if (direction === 'before') carePlans.reverse()
  const hasPrevious = direction === 'before' ? overflow : direction === 'after' ? hasCursor : false
  const hasNext = direction === 'before' ? hasCursor : overflow

  return {
    state: carePlans.length ? 'ready' : 'empty',
    carePlans,
    totalCount,
    overflow,
    hasPrevious,
    hasNext,
  }
}

export function carePlanCursorHref(
  cursorParam: 'carePlansAfter' | 'carePlansBefore' | null,
  cursorId: string | null,
  preservedState: CarePlanPreservedQueueState = {},
) {
  return fulfillmentCursorHref(cursorParam, cursorId, preservedState)
}

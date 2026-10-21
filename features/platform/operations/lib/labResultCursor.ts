import { fulfillmentCursorHref, type FulfillmentQueueState } from './fulfillmentCursorHref'

export const LAB_RESULT_CURSOR_PAGE_SIZE = 25
export const LAB_RESULT_CURSOR_FETCH_SIZE = LAB_RESULT_CURSOR_PAGE_SIZE + 1
export const LAB_RESULT_QUEUE_STATUSES = ['pending', 'preliminary', 'final', 'corrected'] as const

export type LabResultCursorDirection = 'first' | 'after' | 'before'
export type LabResultCursorParam = string | string[] | undefined
export type LabResultCursorRequest =
  | { state: 'ready'; direction: LabResultCursorDirection; cursorId: string | null }
  | { state: 'stale' | 'inconsistent' }

export type LabResultQueueRow = {
  id: string
  resultNumber: string
  version: number
  status: string
  transitionVersion: number
  patient?: { displayName?: string | null } | null
}

export type LabResultCursorPage =
  | { state: 'inconsistent' }
  | {
      state: 'empty' | 'ready'
      results: LabResultQueueRow[]
      totalCount: number
      overflow: boolean
      hasPrevious: boolean
      hasNext: boolean
    }

export type LabResultPreservedQueueState = FulfillmentQueueState

export function labResultQueueWhere() {
  return { status: { in: [...LAB_RESULT_QUEUE_STATUSES] } }
}

export function labResultCursorMembershipWhere(cursorId: string) {
  return {
    AND: [
      labResultQueueWhere(),
      { id: { equals: cursorId } },
    ],
  }
}

export function labResultCursorOrderBy(direction: 'after' | 'before') {
  const order = direction === 'before' ? 'desc' : 'asc'
  return [{ createdAt: order }, { id: order }]
}

function parseCursorParam(value: LabResultCursorParam) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) return null
  return value.trim()
}

export function parseLabResultCursor(after: LabResultCursorParam, before: LabResultCursorParam): LabResultCursorRequest {
  const hasAfter = after !== undefined
  const hasBefore = before !== undefined
  if (!hasAfter && !hasBefore) return { state: 'ready', direction: 'first', cursorId: null }
  if (hasAfter && hasBefore) return { state: 'inconsistent' }

  const cursorId = parseCursorParam(hasAfter ? after : before)
  if (!cursorId) return { state: 'stale' }
  return { state: 'ready', direction: hasAfter ? 'after' : 'before', cursorId }
}

export function parseLabResultsCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

export function validateLabResultCursorMembership(cursorId: string, rows: unknown, count: unknown): 'member' | 'stale' | 'inconsistent' {
  if (!Array.isArray(rows) || rows.length > 1 || !rows.every(row => row && typeof row === 'object' && typeof row.id === 'string')) {
    return 'inconsistent'
  }
  const normalizedCount = parseLabResultsCount(count)
  if (normalizedCount === null) return 'inconsistent'
  if (rows.length === 0 && normalizedCount === 0) return 'stale'
  if (rows.length === 1 && normalizedCount === 1 && rows[0].id === cursorId) return 'member'
  return 'inconsistent'
}

function isLabResultRow(row: unknown): row is LabResultQueueRow {
  if (!row || typeof row !== 'object') return false
  const candidate = row as Record<string, any>
  const patientValid = candidate.patient == null || (
    typeof candidate.patient === 'object' && !Array.isArray(candidate.patient) &&
    (candidate.patient.displayName == null || typeof candidate.patient.displayName === 'string')
  )
  return typeof candidate.id === 'string' && Boolean(candidate.id) &&
    typeof candidate.resultNumber === 'string' && Boolean(candidate.resultNumber) &&
    Number.isSafeInteger(candidate.version) && candidate.version > 0 &&
    typeof candidate.status === 'string' && (LAB_RESULT_QUEUE_STATUSES as readonly string[]).includes(candidate.status) &&
    Number.isSafeInteger(candidate.transitionVersion) && candidate.transitionVersion > 0 && patientValid
}

export function shapeLabResultCursorPage(
  rawRows: unknown,
  totalCountValue: unknown,
  direction: LabResultCursorDirection,
  hasCursor: boolean,
): LabResultCursorPage {
  const totalCount = parseLabResultsCount(totalCountValue)
  if (!Array.isArray(rawRows) || rawRows.length > LAB_RESULT_CURSOR_FETCH_SIZE || !rawRows.every(isLabResultRow) ||
    new Set(rawRows.map(row => row.id)).size !== rawRows.length || totalCount === null) {
    return { state: 'inconsistent' }
  }

  const overflow = rawRows.length === LAB_RESULT_CURSOR_FETCH_SIZE
  if (hasCursor) {
    if (totalCount < rawRows.length + 1) return { state: 'inconsistent' }
  } else if (direction !== 'first' || (overflow ? totalCount <= LAB_RESULT_CURSOR_PAGE_SIZE : rawRows.length !== totalCount)) {
    return { state: 'inconsistent' }
  }

  const results = (overflow ? rawRows.slice(0, LAB_RESULT_CURSOR_PAGE_SIZE) : [...rawRows]) as LabResultQueueRow[]
  if (direction === 'before') results.reverse()
  const hasPrevious = direction === 'before' ? overflow : direction === 'after' ? hasCursor : false
  const hasNext = direction === 'before' ? hasCursor : overflow

  return {
    state: results.length ? 'ready' : 'empty',
    results,
    totalCount,
    overflow,
    hasPrevious,
    hasNext,
  }
}

export function labResultCursorHref(
  cursorParam: 'resultsAfter' | 'resultsBefore' | null,
  cursorId: string | null,
  preservedState: LabResultPreservedQueueState = {},
) {
  return fulfillmentCursorHref(cursorParam, cursorId, preservedState)
}

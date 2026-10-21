import { fulfillmentCursorHref, type FulfillmentQueueState } from './fulfillmentCursorHref'

export const PROCEDURE_CURSOR_PAGE_SIZE = 25
export const PROCEDURE_CURSOR_FETCH_SIZE = PROCEDURE_CURSOR_PAGE_SIZE + 1
export const PROCEDURE_QUEUE_STATUSES = ['scheduled', 'in_progress'] as const

export type ProcedureCursorDirection = 'first' | 'after' | 'before'
export type ProcedureCursorParam = string | string[] | undefined
export type ProcedureCursorRequest =
  | { state: 'ready'; direction: ProcedureCursorDirection; cursorId: string | null }
  | { state: 'stale' | 'inconsistent' }

export type ProcedureQueueRow = {
  id: string
  procedureNumber: string
  status: string
  transitionVersion: number
  patient?: { displayName?: string | null } | null
}

export type ProcedureCursorPage =
  | { state: 'inconsistent' }
  | {
      state: 'empty' | 'ready'
      procedures: ProcedureQueueRow[]
      totalCount: number
      overflow: boolean
      hasPrevious: boolean
      hasNext: boolean
    }

export type ProcedurePreservedQueueState = FulfillmentQueueState

export function procedureQueueWhere() {
  return { status: { in: [...PROCEDURE_QUEUE_STATUSES] } }
}

export function procedureCursorMembershipWhere(cursorId: string) {
  return {
    AND: [
      procedureQueueWhere(),
      { id: { equals: cursorId } },
    ],
  }
}

export function procedureCursorOrderBy(direction: 'after' | 'before') {
  const order = direction === 'before' ? 'desc' : 'asc'
  return [{ createdAt: order }, { id: order }]
}

function parseCursorParam(value: ProcedureCursorParam) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) return null
  return value.trim()
}

export function parseProcedureCursor(after: ProcedureCursorParam, before: ProcedureCursorParam): ProcedureCursorRequest {
  const hasAfter = after !== undefined
  const hasBefore = before !== undefined
  if (!hasAfter && !hasBefore) return { state: 'ready', direction: 'first', cursorId: null }
  if (hasAfter && hasBefore) return { state: 'inconsistent' }

  const cursorId = parseCursorParam(hasAfter ? after : before)
  if (!cursorId) return { state: 'stale' }
  return { state: 'ready', direction: hasAfter ? 'after' : 'before', cursorId }
}

export function parseProceduresCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

export function validateProcedureCursorMembership(cursorId: string, rows: unknown, count: unknown): 'member' | 'stale' | 'inconsistent' {
  if (!Array.isArray(rows) || rows.length > 1 || !rows.every(row => row && typeof row === 'object' && typeof row.id === 'string')) {
    return 'inconsistent'
  }
  const normalizedCount = parseProceduresCount(count)
  if (normalizedCount === null) return 'inconsistent'
  if (rows.length === 0 && normalizedCount === 0) return 'stale'
  if (rows.length === 1 && normalizedCount === 1 && rows[0].id === cursorId) return 'member'
  return 'inconsistent'
}

function isProcedureRow(row: unknown): row is ProcedureQueueRow {
  if (!row || typeof row !== 'object') return false
  const candidate = row as Record<string, any>
  const patientValid = candidate.patient == null || (
    typeof candidate.patient === 'object' && !Array.isArray(candidate.patient) &&
    (candidate.patient.displayName == null || typeof candidate.patient.displayName === 'string')
  )
  return typeof candidate.id === 'string' && Boolean(candidate.id) &&
    typeof candidate.procedureNumber === 'string' && Boolean(candidate.procedureNumber) &&
    typeof candidate.status === 'string' && (PROCEDURE_QUEUE_STATUSES as readonly string[]).includes(candidate.status) &&
    Number.isSafeInteger(candidate.transitionVersion) && candidate.transitionVersion > 0 && patientValid
}

export function shapeProcedureCursorPage(
  rawRows: unknown,
  totalCountValue: unknown,
  direction: ProcedureCursorDirection,
  hasCursor: boolean,
): ProcedureCursorPage {
  const totalCount = parseProceduresCount(totalCountValue)
  if (!Array.isArray(rawRows) || rawRows.length > PROCEDURE_CURSOR_FETCH_SIZE || !rawRows.every(isProcedureRow) ||
    new Set(rawRows.map(row => row.id)).size !== rawRows.length || totalCount === null) {
    return { state: 'inconsistent' }
  }

  const overflow = rawRows.length === PROCEDURE_CURSOR_FETCH_SIZE
  if (hasCursor) {
    if (totalCount < rawRows.length + 1) return { state: 'inconsistent' }
  } else if (direction !== 'first' || (overflow ? totalCount <= PROCEDURE_CURSOR_PAGE_SIZE : rawRows.length !== totalCount)) {
    return { state: 'inconsistent' }
  }

  const procedures = (overflow ? rawRows.slice(0, PROCEDURE_CURSOR_PAGE_SIZE) : [...rawRows]) as ProcedureQueueRow[]
  if (direction === 'before') procedures.reverse()
  const hasPrevious = direction === 'before' ? overflow : direction === 'after' ? hasCursor : false
  const hasNext = direction === 'before' ? hasCursor : overflow

  return {
    state: procedures.length ? 'ready' : 'empty',
    procedures,
    totalCount,
    overflow,
    hasPrevious,
    hasNext,
  }
}

export function procedureCursorHref(
  cursorParam: 'proceduresAfter' | 'proceduresBefore' | null,
  cursorId: string | null,
  preservedState: ProcedurePreservedQueueState = {},
) {
  return fulfillmentCursorHref(cursorParam, cursorId, preservedState)
}

import { fulfillmentCursorHref, type FulfillmentQueueState } from './fulfillmentCursorHref'

export const PRESCRIPTION_CURSOR_PAGE_SIZE = 25
export const PRESCRIPTION_CURSOR_FETCH_SIZE = PRESCRIPTION_CURSOR_PAGE_SIZE + 1
export const PRESCRIPTION_QUEUE_STATUSES = ['recorded_manual', 'draft', 'active', 'held'] as const

export type PrescriptionCursorDirection = 'first' | 'after' | 'before'
export type PrescriptionCursorParam = string | string[] | undefined
export type PrescriptionCursorRequest =
  | { state: 'ready'; direction: PrescriptionCursorDirection; cursorId: string | null }
  | { state: 'stale' | 'inconsistent' }

export type PrescriptionQueueRow = {
  id: string
  prescriptionNumber: string
  status: string
  transitionVersion: number
  patient?: { displayName?: string | null } | null
}

export type PrescriptionCursorPage =
  | { state: 'inconsistent' }
  | {
      state: 'empty' | 'ready'
      prescriptions: PrescriptionQueueRow[]
      totalCount: number
      overflow: boolean
      hasPrevious: boolean
      hasNext: boolean
    }

export type PrescriptionPreservedQueueState = FulfillmentQueueState

export function prescriptionQueueWhere() {
  return { status: { in: [...PRESCRIPTION_QUEUE_STATUSES] } }
}

export function prescriptionCursorMembershipWhere(cursorId: string) {
  return {
    AND: [
      prescriptionQueueWhere(),
      { id: { equals: cursorId } },
    ],
  }
}

export function prescriptionCursorOrderBy(direction: 'after' | 'before') {
  const order = direction === 'before' ? 'desc' : 'asc'
  return [{ createdAt: order }, { id: order }]
}

function parseCursorParam(value: PrescriptionCursorParam) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) return null
  return value.trim()
}

export function parsePrescriptionCursor(after: PrescriptionCursorParam, before: PrescriptionCursorParam): PrescriptionCursorRequest {
  const hasAfter = after !== undefined
  const hasBefore = before !== undefined
  if (!hasAfter && !hasBefore) return { state: 'ready', direction: 'first', cursorId: null }
  if (hasAfter && hasBefore) return { state: 'inconsistent' }

  const cursorId = parseCursorParam(hasAfter ? after : before)
  if (!cursorId) return { state: 'stale' }
  return { state: 'ready', direction: hasAfter ? 'after' : 'before', cursorId }
}

export function parsePrescriptionsCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

export function validatePrescriptionCursorMembership(cursorId: string, rows: unknown, count: unknown): 'member' | 'stale' | 'inconsistent' {
  if (!Array.isArray(rows) || rows.length > 1 || !rows.every(row => row && typeof row === 'object' && typeof row.id === 'string')) {
    return 'inconsistent'
  }
  const normalizedCount = parsePrescriptionsCount(count)
  if (normalizedCount === null) return 'inconsistent'
  if (rows.length === 0 && normalizedCount === 0) return 'stale'
  if (rows.length === 1 && normalizedCount === 1 && rows[0].id === cursorId) return 'member'
  return 'inconsistent'
}

function isPrescriptionRow(row: unknown): row is PrescriptionQueueRow {
  if (!row || typeof row !== 'object') return false
  const candidate = row as Record<string, any>
  const patientValid = candidate.patient == null || (
    typeof candidate.patient === 'object' && !Array.isArray(candidate.patient) &&
    (candidate.patient.displayName == null || typeof candidate.patient.displayName === 'string')
  )
  return typeof candidate.id === 'string' && Boolean(candidate.id) &&
    typeof candidate.prescriptionNumber === 'string' && Boolean(candidate.prescriptionNumber) &&
    typeof candidate.status === 'string' && (PRESCRIPTION_QUEUE_STATUSES as readonly string[]).includes(candidate.status) &&
    Number.isSafeInteger(candidate.transitionVersion) && candidate.transitionVersion > 0 && patientValid
}

export function shapePrescriptionCursorPage(
  rawRows: unknown,
  totalCountValue: unknown,
  direction: PrescriptionCursorDirection,
  hasCursor: boolean,
): PrescriptionCursorPage {
  const totalCount = parsePrescriptionsCount(totalCountValue)
  if (!Array.isArray(rawRows) || rawRows.length > PRESCRIPTION_CURSOR_FETCH_SIZE || !rawRows.every(isPrescriptionRow) ||
    new Set(rawRows.map(row => row.id)).size !== rawRows.length || totalCount === null) {
    return { state: 'inconsistent' }
  }

  const overflow = rawRows.length === PRESCRIPTION_CURSOR_FETCH_SIZE
  if (hasCursor) {
    if (totalCount < rawRows.length + 1) return { state: 'inconsistent' }
  } else if (direction !== 'first' || (overflow ? totalCount <= PRESCRIPTION_CURSOR_PAGE_SIZE : rawRows.length !== totalCount)) {
    return { state: 'inconsistent' }
  }

  const prescriptions = (overflow ? rawRows.slice(0, PRESCRIPTION_CURSOR_PAGE_SIZE) : [...rawRows]) as PrescriptionQueueRow[]
  if (direction === 'before') prescriptions.reverse()
  const hasPrevious = direction === 'before' ? overflow : direction === 'after' ? hasCursor : false
  const hasNext = direction === 'before' ? hasCursor : overflow

  return {
    state: prescriptions.length ? 'ready' : 'empty',
    prescriptions,
    totalCount,
    overflow,
    hasPrevious,
    hasNext,
  }
}

export function prescriptionCursorHref(
  cursorParam: 'prescriptionsAfter' | 'prescriptionsBefore' | null,
  cursorId: string | null,
  preservedState: PrescriptionPreservedQueueState = {},
) {
  return fulfillmentCursorHref(cursorParam, cursorId, preservedState)
}

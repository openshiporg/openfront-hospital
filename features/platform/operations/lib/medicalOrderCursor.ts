import { fulfillmentCursorHref, type FulfillmentQueueState } from './fulfillmentCursorHref'

export const MEDICAL_ORDER_CURSOR_PAGE_SIZE = 25
export const MEDICAL_ORDER_CURSOR_FETCH_SIZE = MEDICAL_ORDER_CURSOR_PAGE_SIZE + 1
export const MEDICAL_ORDER_QUEUE_STATUSES = ['draft', 'ordered', 'in_progress'] as const

export type MedicalOrderCursorDirection = 'first' | 'after' | 'before'
export type MedicalOrderCursorParam = string | string[] | undefined
export type MedicalOrderCursorRequest =
  | { state: 'ready'; direction: MedicalOrderCursorDirection; cursorId: string | null }
  | { state: 'stale' | 'inconsistent' }

export type MedicalOrderQueueRow = {
  id: string
  orderNumber: string
  orderType: string
  status: string
  transitionVersion: number
  patient?: { displayName?: string | null } | null
}

export type MedicalOrderCursorPage =
  | { state: 'inconsistent' }
  | {
      state: 'empty' | 'ready'
      orders: MedicalOrderQueueRow[]
      totalCount: number
      overflow: boolean
      hasPrevious: boolean
      hasNext: boolean
    }

export type MedicalOrderPreservedQueueState = FulfillmentQueueState

export function medicalOrderQueueWhere() {
  return { status: { in: [...MEDICAL_ORDER_QUEUE_STATUSES] } }
}

export function medicalOrderCursorMembershipWhere(cursorId: string) {
  return {
    AND: [
      medicalOrderQueueWhere(),
      { id: { equals: cursorId } },
    ],
  }
}

export function medicalOrderCursorOrderBy(direction: 'after' | 'before') {
  const order = direction === 'before' ? 'desc' : 'asc'
  return [{ createdAt: order }, { id: order }]
}

function parseCursorParam(value: MedicalOrderCursorParam) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) return null
  return value.trim()
}

export function parseMedicalOrderCursor(after: MedicalOrderCursorParam, before: MedicalOrderCursorParam): MedicalOrderCursorRequest {
  const hasAfter = after !== undefined
  const hasBefore = before !== undefined
  if (!hasAfter && !hasBefore) return { state: 'ready', direction: 'first', cursorId: null }
  if (hasAfter && hasBefore) return { state: 'inconsistent' }

  const cursorId = parseCursorParam(hasAfter ? after : before)
  if (!cursorId) return { state: 'stale' }
  return { state: 'ready', direction: hasAfter ? 'after' : 'before', cursorId }
}

export function parseMedicalOrdersCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

export function validateMedicalOrderCursorMembership(cursorId: string, rows: unknown, count: unknown): 'member' | 'stale' | 'inconsistent' {
  if (!Array.isArray(rows) || rows.length > 1 || !rows.every(row => row && typeof row === 'object' && typeof row.id === 'string')) {
    return 'inconsistent'
  }
  const normalizedCount = parseMedicalOrdersCount(count)
  if (normalizedCount === null) return 'inconsistent'
  if (rows.length === 0 && normalizedCount === 0) return 'stale'
  if (rows.length === 1 && normalizedCount === 1 && rows[0].id === cursorId) return 'member'
  return 'inconsistent'
}

function isMedicalOrderRow(row: unknown): row is MedicalOrderQueueRow {
  if (!row || typeof row !== 'object') return false
  const candidate = row as Record<string, any>
  const patientValid = candidate.patient == null || (
    typeof candidate.patient === 'object' && !Array.isArray(candidate.patient) &&
    (candidate.patient.displayName == null || typeof candidate.patient.displayName === 'string')
  )
  return typeof candidate.id === 'string' && Boolean(candidate.id) &&
    typeof candidate.orderNumber === 'string' && Boolean(candidate.orderNumber) &&
    typeof candidate.orderType === 'string' && Boolean(candidate.orderType) &&
    typeof candidate.status === 'string' && (MEDICAL_ORDER_QUEUE_STATUSES as readonly string[]).includes(candidate.status) &&
    Number.isSafeInteger(candidate.transitionVersion) && candidate.transitionVersion > 0 && patientValid
}

export function shapeMedicalOrderCursorPage(
  rawRows: unknown,
  totalCountValue: unknown,
  direction: MedicalOrderCursorDirection,
  hasCursor: boolean,
): MedicalOrderCursorPage {
  const totalCount = parseMedicalOrdersCount(totalCountValue)
  if (!Array.isArray(rawRows) || rawRows.length > MEDICAL_ORDER_CURSOR_FETCH_SIZE || !rawRows.every(isMedicalOrderRow) ||
    new Set(rawRows.map(row => row.id)).size !== rawRows.length || totalCount === null) {
    return { state: 'inconsistent' }
  }

  const overflow = rawRows.length === MEDICAL_ORDER_CURSOR_FETCH_SIZE
  if (hasCursor) {
    if (totalCount < rawRows.length + 1) return { state: 'inconsistent' }
  } else if (direction !== 'first' || (overflow ? totalCount <= MEDICAL_ORDER_CURSOR_PAGE_SIZE : rawRows.length !== totalCount)) {
    return { state: 'inconsistent' }
  }

  const orders = (overflow ? rawRows.slice(0, MEDICAL_ORDER_CURSOR_PAGE_SIZE) : [...rawRows]) as MedicalOrderQueueRow[]
  if (direction === 'before') orders.reverse()
  const hasPrevious = direction === 'before' ? overflow : direction === 'after' ? hasCursor : false
  const hasNext = direction === 'before' ? hasCursor : overflow

  return {
    state: orders.length ? 'ready' : 'empty',
    orders,
    totalCount,
    overflow,
    hasPrevious,
    hasNext,
  }
}

export function medicalOrderCursorHref(
  cursorParam: 'ordersAfter' | 'ordersBefore' | null,
  cursorId: string | null,
  preservedState: MedicalOrderPreservedQueueState = {},
) {
  return fulfillmentCursorHref(cursorParam, cursorId, preservedState)
}

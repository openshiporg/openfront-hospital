export const FULFILLMENT_CURSOR_KEYS = ['ordersAfter', 'ordersBefore', 'resultsAfter', 'resultsBefore', 'prescriptionsAfter', 'prescriptionsBefore', 'proceduresAfter', 'proceduresBefore', 'carePlansAfter', 'carePlansBefore'] as const
export const FULFILLMENT_OFFSET_PAGE_KEYS = [] as const

export type FulfillmentCursorKey = typeof FULFILLMENT_CURSOR_KEYS[number]
export type FulfillmentQueueState = Partial<Record<FulfillmentCursorKey, string>>

export function fulfillmentCursorHref(
  cursorKey: FulfillmentCursorKey | null,
  cursorId: string | null,
  preservedState: FulfillmentQueueState = {},
) {
  const params = new URLSearchParams()
  if (cursorKey && cursorId && cursorId.length > 0 && cursorId.length <= 200) params.set(cursorKey, cursorId)
  for (const key of FULFILLMENT_CURSOR_KEYS) {
    if (key === cursorKey) continue
    const value = preservedState[key]
    if (typeof value === 'string' && value.length > 0 && value.length <= 200) params.set(key, value)
  }
  const query = params.toString()
  return query ? `/dashboard/platform/clinical-fulfillment?${query}` : '/dashboard/platform/clinical-fulfillment'
}

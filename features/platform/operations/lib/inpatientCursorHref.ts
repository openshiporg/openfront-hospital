export type InpatientCursorKey =
  | 'admissionsAfter'
  | 'admissionsBefore'
  | 'reservationsAfter'
  | 'reservationsBefore'
  | 'bedsAfter'
  | 'bedsBefore'
export type InpatientCursor = { key: InpatientCursorKey; id: string }

export function inpatientCursorHref(cursor: InpatientCursor | null, preservedCursors: readonly InpatientCursor[] = []) {
  const params = new URLSearchParams()
  for (const value of [cursor, ...preservedCursors]) {
    if (value && value.id.length > 0 && value.id.length <= 200) params.set(value.key, value.id)
  }
  const query = params.toString()
  return query ? `/dashboard/platform/inpatient?${query}` : '/dashboard/platform/inpatient'
}

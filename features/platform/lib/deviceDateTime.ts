function wallTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
/** This input contract is explicitly the operator device zone, never facility wall time. */
export function deviceLocalDateTimeToIso(raw: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) throw new Error('Enter a valid date and time in the displayed device time zone.')
  const value = new Date(raw)
  if (!Number.isFinite(value.getTime()) || wallTime(value) !== raw) throw new Error('This local date/time does not exist. Choose a valid time in the displayed device zone.')
  for (const minutes of [30, 60, 90, 120]) {
    if (wallTime(new Date(value.getTime() + minutes * 60_000)) === raw) throw new Error('This local time occurs twice during a clock change. Choose an unambiguous time; this form cannot choose its offset.')
  }
  return value.toISOString()
}

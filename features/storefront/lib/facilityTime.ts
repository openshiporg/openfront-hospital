function dateKey(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant)
  const value = (type: 'year' | 'month' | 'day') => parts.find(part => part.type === type)?.value || ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

export function nextFacilityCalendarDate(timeZone: string, now = new Date()) {
  // Noon UTC on the following calendar key is only used to advance a date key;
  // appointment boundaries are resolved by the backend facility-time policy.
  const today = dateKey(now, timeZone)
  const [year, month, day] = today.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + 1, 12)).toISOString().slice(0, 10)
}

/** Patient-facing name for an IANA zone, e.g. America/Los_Angeles -> Pacific Time. */
export function formatTimeZoneLabel(timeZone: string) {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longGeneric' })
      .formatToParts(new Date(Date.UTC(2026, 0, 1)))
      .find(part => part.type === 'timeZoneName')?.value
    if (name && !/^GMT/.test(name)) return name
  } catch {}
  return timeZone.split('/').pop()?.replace(/_/g, ' ') || timeZone
}

export function formatFacilitySlotTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(value))
}

export function formatCalendarDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${value}T12:00:00.000Z`))
}

export function publicBookingDateRange(timeZone: string, now = new Date()) {
  const min = dateKey(now, timeZone)
  const [year, month, day] = min.split('-').map(Number)
  return { min, max: new Date(Date.UTC(year, month - 1, day + 180, 12)).toISOString().slice(0, 10) }
}
export function publicBookingDateError(value: unknown, timeZone: string, now = new Date()): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Choose a calendar date.'
  const parsed = new Date(`${value}T12:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return 'Choose a valid calendar date.'
  const range = publicBookingDateRange(timeZone, now)
  if (value < range.min || value > range.max) return `Choose a date from ${range.min} through ${range.max} in ${timeZone}.`
  return null
}

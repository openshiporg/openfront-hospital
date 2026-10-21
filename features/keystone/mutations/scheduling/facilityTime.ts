const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function dateParts(date: string) {
  const match = DATE_PATTERN.exec(date)
  if (!match) throw new Error('date must use YYYY-MM-DD format')
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    throw new Error('date must be a real calendar date')
  }
  return { year, month, day }
}

function zonedParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value)
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  }
}

export function assertIanaTimeZone(value: unknown) {
  const timeZone = String(value || '').trim()
  if (!timeZone || timeZone.length > 100 || !/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+.-]+)+$|^UTC$/.test(timeZone)) {
    throw new Error('Facility time zone must be a valid IANA identifier')
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date(0))
  } catch {
    throw new Error('Facility time zone must be a valid IANA identifier')
  }
  return timeZone
}

/** Convert an unambiguous local wall time into its UTC instant. */
export function localDateTimeToUtc(
  date: string,
  hour: number,
  minute: number,
  timeZoneValue: unknown,
) {
  const timeZone = assertIanaTimeZone(timeZoneValue)
  const { year, month, day } = dateParts(date)
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error('Local facility time is invalid')
  }
  const target = Date.UTC(year, month - 1, day, hour, minute, 0, 0)
  let candidate = target
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const observed = zonedParts(new Date(candidate), timeZone)
    const represented = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    )
    candidate += target - represented
  }
  const finalParts = zonedParts(new Date(candidate), timeZone)
  const matchesTarget = (parts: ReturnType<typeof zonedParts>) =>
    parts.year === year && parts.month === month && parts.day === day &&
    parts.hour === hour && parts.minute === minute
  if (!matchesTarget(finalParts)) {
    throw new Error('Local facility time does not exist because of a time-zone transition')
  }
  for (let offsetMinutes = -180; offsetMinutes <= 180; offsetMinutes += 15) {
    if (offsetMinutes === 0) continue
    if (matchesTarget(zonedParts(new Date(candidate + offsetMinutes * 60_000), timeZone))) {
      throw new Error('Local facility time is ambiguous because of a time-zone transition')
    }
  }
  return new Date(candidate)
}

export function calendarDateInTimeZone(instant: Date, timeZoneValue: unknown) {
  const timeZone = assertIanaTimeZone(timeZoneValue)
  const parts = zonedParts(instant, timeZone)
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

export function addCalendarDays(date: string, days: number) {
  const { year, month, day } = dateParts(date)
  if (!Number.isInteger(days) || Math.abs(days) > 3660) throw new Error('Calendar-day offset is invalid')
  const result = new Date(Date.UTC(year, month - 1, day + days))
  return result.toISOString().slice(0, 10)
}

export function facilityCalendarWindow(date: string, timeZoneValue: unknown) {
  const timeZone = assertIanaTimeZone(timeZoneValue)
  return {
    timeZone,
    start: localDateTimeToUtc(date, 0, 0, timeZone),
    end: localDateTimeToUtc(addCalendarDays(date, 1), 0, 0, timeZone),
  }
}

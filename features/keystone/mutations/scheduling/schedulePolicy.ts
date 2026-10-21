import { Prisma } from '@prisma/client'
import { addCalendarDays, assertIanaTimeZone, calendarDateInTimeZone, facilityCalendarWindow } from './facilityTime'

// A public request is an inbox item, not an inventory reservation. Only staff-
// accepted/current visits block provider availability.
export const ACTIVE_APPOINTMENT_STATUSES = ['confirmed', 'checked_in', 'in_visit'] as const
export const BLOCKING_SCHEDULE_TYPES = ['unavailable', 'admin_time'] as const
export const MAX_APPOINTMENT_DURATION_MINUTES = 480
export const MAX_APPOINTMENT_BUFFER_MINUTES = 240
export const MAX_PUBLIC_BOOKING_DAYS = 180

export type ScheduleWindow = {
  start: Date
  end: Date
}

type AppointmentTypePolicy = {
  id: string
  name: string
  durationMinutes: number
  bufferBeforeMinutes: number
  bufferAfterMinutes: number
}

type ProviderPolicy = {
  id: string
  firstName: string
  lastName: string
  credentials: string
  locationName: string
  facilities: Array<{ id: string; name: string }>
}

export function parseScheduleWindow(startsAt: string | Date, endsAt: string | Date): ScheduleWindow {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Schedule window must use valid ISO dates')
  }
  if (end <= start) throw new Error('Schedule window must end after it starts')
  if (end.getTime() - start.getTime() > 24 * 60 * 60_000) {
    throw new Error('Schedule window cannot exceed 24 hours')
  }
  return { start, end }
}

export function parsePublicDateWindow(
  date: string,
  timeZoneOrNow: string | Date = 'UTC',
  requestedNow = new Date(),
) {
  // Keep the historical (date, now) unit-test signature while requiring every
  // application caller to supply the facility's persisted IANA time zone.
  const timeZone = timeZoneOrNow instanceof Date ? 'UTC' : assertIanaTimeZone(timeZoneOrNow)
  const now = timeZoneOrNow instanceof Date ? timeZoneOrNow : requestedNow
  const window = facilityCalendarWindow(date, timeZone)
  const today = calendarDateInTimeZone(now, timeZone)
  const latest = addCalendarDays(today, MAX_PUBLIC_BOOKING_DAYS)
  if (date < today) throw new Error('date cannot be in the past')
  if (date > latest) throw new Error(`date cannot be more than ${MAX_PUBLIC_BOOKING_DAYS} days ahead`)
  return window
}

export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd
}

export function normalizeAppointmentTypePolicy(appointmentType: {
  id: string
  name: string
  durationMinutes: number | null
  bufferBeforeMinutes: number | null
  bufferAfterMinutes: number | null
}): AppointmentTypePolicy {
  const durationMinutes = Number(appointmentType.durationMinutes)
  const bufferBeforeMinutes = Number(appointmentType.bufferBeforeMinutes || 0)
  const bufferAfterMinutes = Number(appointmentType.bufferAfterMinutes || 0)

  if (durationMinutes < 5 || durationMinutes > MAX_APPOINTMENT_DURATION_MINUTES) {
    throw new Error('Appointment duration is outside the supported range')
  }
  if (
    bufferBeforeMinutes < 0 ||
    bufferBeforeMinutes > MAX_APPOINTMENT_BUFFER_MINUTES ||
    bufferAfterMinutes < 0 ||
    bufferAfterMinutes > MAX_APPOINTMENT_BUFFER_MINUTES
  ) {
    throw new Error('Appointment buffer is outside the supported range')
  }

  return {
    id: appointmentType.id,
    name: appointmentType.name,
    durationMinutes,
    bufferBeforeMinutes,
    bufferAfterMinutes,
  }
}

export function occupiedWindow(
  startsAt: string | Date,
  endsAt: string | Date,
  bufferBeforeMinutes = 0,
  bufferAfterMinutes = 0,
): ScheduleWindow {
  const { start, end } = parseScheduleWindow(startsAt, endsAt)
  return {
    start: new Date(start.getTime() - bufferBeforeMinutes * 60_000),
    end: new Date(end.getTime() + bufferAfterMinutes * 60_000),
  }
}

export async function lockProviderSchedule(db: any, providerId: string) {
  if (!providerId) throw new Error('Provider is required')
  await db.$queryRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`hospital-provider-schedule:${providerId}`}, 0))::text AS "lock"`,
  )
}

export async function getBookableProviderPolicy(
  db: any,
  appointmentTypeId: string,
  providerId: string,
  facilityId: string,
): Promise<{ appointmentType: AppointmentTypePolicy; provider: ProviderPolicy; facility: { id: string; name: string } } | null> {
  const [appointmentTypeRecord, provider] = await Promise.all([
    db.appointmentType.findFirst({
      where: { id: appointmentTypeId, status: 'bookable' },
      select: {
        id: true,
        name: true,
        durationMinutes: true,
        bufferBeforeMinutes: true,
        bufferAfterMinutes: true,
      },
    }),
    db.provider.findFirst({
      where: {
        id: providerId,
        status: 'active',
        appointmentTypes: { some: { id: appointmentTypeId, status: 'bookable' } },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        credentials: true,
        locationName: true,
        facilities: {
          where: { status: 'active', id: facilityId },
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
        },
      },
    }),
  ])

  if (!appointmentTypeRecord || !provider) return null
  const appointmentType = normalizeAppointmentTypePolicy(appointmentTypeRecord)
  const facility = provider.facilities.find((item: { id: string }) => item.id === facilityId)
  if (!facility) return null
  return { appointmentType, provider, facility }
}

export async function inspectProviderWindow(
  db: any,
  args: {
    providerId: string
    startsAt: string | Date
    endsAt: string | Date
    bufferBeforeMinutes?: number
    bufferAfterMinutes?: number
    excludeAppointmentId?: string | null
    facilityId: string
  },
) {
  const { start, end } = parseScheduleWindow(args.startsAt, args.endsAt)
  const candidate = occupiedWindow(
    start,
    end,
    args.bufferBeforeMinutes || 0,
    args.bufferAfterMinutes || 0,
  )

  const [provider, coveringAvailability, blockingScheduleBlocks, appointmentCandidates] = await Promise.all([
    db.provider.findUnique({ where: { id: args.providerId }, select: { id: true, status: true } }),
    db.providerScheduleBlock.findFirst({
      where: {
        providerId: args.providerId,
        facilityId: args.facilityId,
        blockType: 'available',
        startsAt: { lte: candidate.start },
        endsAt: { gte: candidate.end },
      },
      select: { id: true },
    }),
    db.providerScheduleBlock.findMany({
      where: {
        providerId: args.providerId,
        facilityId: args.facilityId,
        blockType: { in: [...BLOCKING_SCHEDULE_TYPES] },
        startsAt: { lt: candidate.end },
        endsAt: { gt: candidate.start },
      },
      orderBy: { startsAt: 'asc' },
      take: 1_001,
      select: { id: true, blockType: true, startsAt: true, endsAt: true },
    }),
    db.appointment.findMany({
      where: {
        providerId: args.providerId,
        id: args.excludeAppointmentId ? { not: args.excludeAppointmentId } : undefined,
        status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
        startsAt: { lt: new Date(candidate.end.getTime() + MAX_APPOINTMENT_BUFFER_MINUTES * 60_000) },
        endsAt: { gt: new Date(candidate.start.getTime() - MAX_APPOINTMENT_BUFFER_MINUTES * 60_000) },
      },
      orderBy: { startsAt: 'asc' },
      take: 501,
      select: {
        id: true,
        appointmentNumber: true,
        status: true,
        startsAt: true,
        endsAt: true,
        appointmentType: {
          select: { bufferBeforeMinutes: true, bufferAfterMinutes: true },
        },
      },
    }),
  ])

  if (!provider || provider.status !== 'active') throw new Error('Provider is not active')
  if (blockingScheduleBlocks.length > 1_000 || appointmentCandidates.length > 500) {
    throw new Error('Provider schedule window exceeds its configured capacity')
  }

  const appointments = appointmentCandidates.filter((appointment: any) => {
    const occupied = occupiedWindow(
      appointment.startsAt,
      appointment.endsAt,
      Number(appointment.appointmentType?.bufferBeforeMinutes || 0),
      Number(appointment.appointmentType?.bufferAfterMinutes || 0),
    )
    return rangesOverlap(candidate.start, candidate.end, occupied.start, occupied.end)
  })

  return {
    withinAvailability: Boolean(coveringAvailability),
    hasConflict: !coveringAvailability || blockingScheduleBlocks.length > 0 || appointments.length > 0,
    appointments,
    blockingScheduleBlocks,
  }
}

export async function inspectBookableSlot(
  db: any,
  args: { appointmentTypeId: string; providerId: string; facilityId: string; startsAt: string | Date; excludeAppointmentId?: string | null },
) {
  const start = new Date(args.startsAt)
  if (Number.isNaN(start.getTime())) throw new Error('startsAt must be a valid ISO date')
  const coveringBlock = await db.providerScheduleBlock.findFirst({
    where: { providerId: args.providerId, facilityId: args.facilityId, blockType: 'available', startsAt: { lte: start }, endsAt: { gt: start } },
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    select: { facilityId: true },
  })
  const policy = await getBookableProviderPolicy(db, args.appointmentTypeId, args.providerId, args.facilityId)
  if (!coveringBlock || !policy) throw new Error('Appointment type, provider, and facility are not bookable together')
  const end = new Date(start.getTime() + policy.appointmentType.durationMinutes * 60_000)
  const availability = await inspectProviderWindow(db, {
    providerId: args.providerId,
    facilityId: policy.facility.id,
    startsAt: start,
    endsAt: end,
    bufferBeforeMinutes: policy.appointmentType.bufferBeforeMinutes,
    bufferAfterMinutes: policy.appointmentType.bufferAfterMinutes,
    excludeAppointmentId: args.excludeAppointmentId,
  })

  return { ...policy, startsAt: start, endsAt: end, availability }
}

export function isScheduleRaceError(error: unknown) {
  const value = error as { code?: string; message?: string }
  return (
    value?.code === 'P2002' ||
    value?.code === 'P2004' ||
    value?.code === 'P2034' ||
    value?.message?.includes('Appointment_active_provider_no_overlap') === true
  )
}

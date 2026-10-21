import type { Context } from '.keystone/types'
import {
  ACTIVE_APPOINTMENT_STATUSES,
  BLOCKING_SCHEDULE_TYPES,
  MAX_APPOINTMENT_BUFFER_MINUTES,
  normalizeAppointmentTypePolicy,
  occupiedWindow,
  parsePublicDateWindow,
  rangesOverlap,
} from '../scheduling/schedulePolicy'

type Args = {
  appointmentTypeId: string
  providerId: string
  facilityId: string
  date: string
}

const availabilityCache = new WeakMap<object, Map<string, Promise<Array<Record<string, unknown>>>>>()

function providerDisplayName(provider: {
  firstName?: string | null
  lastName?: string | null
  credentials?: string | null
}) {
  const credentials = provider.credentials ? `, ${provider.credentials}` : ''
  return `${provider.firstName || ''} ${provider.lastName || ''}${credentials}`.trim() || 'Provider'
}

async function loadAvailableAppointmentSlots(
  { appointmentTypeId, providerId, facilityId, date }: Args,
  context: Context,
) {
  const sudo = context.sudo()
  const prisma = sudo.prisma as any
  const facilityRecord = await prisma.facility.findFirst({
    where: { id: facilityId, status: 'active' },
    select: { id: true, name: true, timeZone: true },
  })
  if (!facilityRecord) return []
  const { start, end, timeZone } = parsePublicDateWindow(date, facilityRecord.timeZone)

  const appointmentTypeRecord = await prisma.appointmentType.findFirst({
    where: { id: appointmentTypeId, status: 'bookable' },
    select: {
      id: true,
      name: true,
      durationMinutes: true,
      bufferBeforeMinutes: true,
      bufferAfterMinutes: true,
    },
  })
  if (!appointmentTypeRecord) throw new Error('Appointment type not found or not currently bookable')
  const appointmentType = normalizeAppointmentTypePolicy(appointmentTypeRecord)

  const providers = await prisma.provider.findMany({
    where: {
      id: providerId,
      status: 'active',
      appointmentTypes: { some: { id: appointmentTypeId, status: 'bookable' } },
      facilities: { some: { id: facilityId, status: 'active' } },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: 101,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      credentials: true,
    },
  })
  if (providers.length === 0) return []
  if (providers.length > 100) throw new Error('Too many providers match this public availability request')
  const providerIds = providers.map((provider: any) => provider.id)

  const [scheduleBlocks, appointmentCandidates, communicationInstallations] = await Promise.all([
    prisma.providerScheduleBlock.findMany({
      where: {
        providerId: { in: providerIds },
        facilityId,
        startsAt: { lt: end },
        endsAt: { gt: start },
      },
      orderBy: [{ providerId: 'asc' }, { startsAt: 'asc' }],
      take: 2_001,
      select: {
        id: true,
        providerId: true,
        facilityId: true,
        facility: { select: { id: true, name: true } },
        blockType: true,
        startsAt: true,
        endsAt: true,
      },
    }),
    prisma.appointment.findMany({
      where: {
        providerId: { in: providerIds },
        status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
        startsAt: { lt: new Date(end.getTime() + MAX_APPOINTMENT_BUFFER_MINUTES * 60_000) },
        endsAt: { gt: new Date(start.getTime() - MAX_APPOINTMENT_BUFFER_MINUTES * 60_000) },
      },
      take: 2_001,
      select: {
        id: true,
        providerId: true,
        startsAt: true,
        endsAt: true,
        appointmentType: {
          select: { bufferBeforeMinutes: true, bufferAfterMinutes: true },
        },
      },
    }),
    prisma.integrationInstallation.findMany({
      where: { kind: 'communications', status: 'active', facilityId },
      take: 1_001,
      select: { facilityId: true, allowedEventTypes: true },
    }),
  ])

  if (scheduleBlocks.length > 2_000 || appointmentCandidates.length > 2_000 || communicationInstallations.length > 1_000) {
    throw new Error('Public availability window is too broad')
  }
  const eligibleFollowUpInstallations = communicationInstallations.filter((item: any) =>
    Array.isArray(item.allowedEventTypes) && item.allowedEventTypes.includes('message.queued'),
  )
  if (eligibleFollowUpInstallations.length > 1) {
    throw new Error('Public follow-up configuration is ambiguous for this facility')
  }
  const followUpMode = eligibleFollowUpInstallations.length === 1 ? 'integration' : 'manual'
  const now = new Date()
  const slots: Array<Record<string, unknown>> = []
  const seen = new Set<string>()

  for (const provider of providers) {
    const providerBlocks = scheduleBlocks.filter((block: any) => block.providerId === provider.id)
    const availableBlocks = providerBlocks.filter((block: any) =>
      block.blockType === 'available' && block.facilityId === facilityId,
    )
    const blockingBlocks = providerBlocks.filter((block: any) =>
      BLOCKING_SCHEDULE_TYPES.includes(block.blockType as (typeof BLOCKING_SCHEDULE_TYPES)[number]),
    )
    const providerAppointments = appointmentCandidates.filter((appointment: any) => appointment.providerId === provider.id)

    for (const block of availableBlocks) {
      const blockStart = new Date(Math.max(block.startsAt.getTime(), start.getTime()))
      const blockEnd = new Date(Math.min(block.endsAt.getTime(), end.getTime()))

      const firstSlotStart = new Date(Math.ceil(blockStart.getTime() / (15 * 60_000)) * 15 * 60_000)
      for (
        let cursor = firstSlotStart;
        cursor.getTime() + appointmentType.durationMinutes * 60_000 <= blockEnd.getTime();
        cursor = new Date(cursor.getTime() + 15 * 60_000)
      ) {
        const slotStart = new Date(cursor)
        if (slotStart <= now) continue
        const slotEnd = new Date(slotStart.getTime() + appointmentType.durationMinutes * 60_000)
        const occupied = occupiedWindow(
          slotStart,
          slotEnd,
          appointmentType.bufferBeforeMinutes,
          appointmentType.bufferAfterMinutes,
        )
        if (occupied.start < block.startsAt || occupied.end > block.endsAt) continue

        const blockedBySchedule = blockingBlocks.some((blocking: any) =>
          rangesOverlap(occupied.start, occupied.end, blocking.startsAt, blocking.endsAt),
        )
        if (blockedBySchedule) continue

        const blockedByAppointment = providerAppointments.some((appointment: any) => {
          const existing = occupiedWindow(
            appointment.startsAt,
            appointment.endsAt,
            Number(appointment.appointmentType?.bufferBeforeMinutes || 0),
            Number(appointment.appointmentType?.bufferAfterMinutes || 0),
          )
          return rangesOverlap(occupied.start, occupied.end, existing.start, existing.end)
        })
        if (blockedByAppointment) continue

        const key = `${provider.id}:${block.facilityId}:${slotStart.toISOString()}`
        if (seen.has(key)) continue
        seen.add(key)
        slots.push({
          providerId: provider.id,
          providerName: providerDisplayName(provider),
          facilityId: block.facility.id,
          facilityName: block.facility.name,
          facilityTimeZone: timeZone,
          followUpMode,
          appointmentTypeId: appointmentType.id,
          appointmentTypeName: appointmentType.name,
          startsAt: slotStart.toISOString(),
          endsAt: slotEnd.toISOString(),
          durationMinutes: appointmentType.durationMinutes,
          remainingCapacity: 1,
        })
      }
    }
  }

  return slots.sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)))
}

export default function getAvailableAppointmentSlots(
  _root: unknown,
  args: Args,
  context: Context,
) {
  const contextKey = context as unknown as object
  let requestCache = availabilityCache.get(contextKey)
  if (!requestCache) {
    requestCache = new Map()
    availabilityCache.set(contextKey, requestCache)
  }
  const key = `${args.appointmentTypeId}\0${args.providerId}\0${args.facilityId}\0${args.date}`
  const existing = requestCache.get(key)
  if (existing) return existing
  const pending = loadAvailableAppointmentSlots(args, context)
  requestCache.set(key, pending)
  void pending.catch(() => requestCache?.delete(key))
  return pending
}

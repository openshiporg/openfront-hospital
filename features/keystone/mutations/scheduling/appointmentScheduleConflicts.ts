import type { Context } from '.keystone/types'
import {
  inspectProviderWindow,
  MAX_APPOINTMENT_BUFFER_MINUTES,
  parseScheduleWindow,
} from './schedulePolicy'

const conflictCache = new WeakMap<object, Map<string, Promise<unknown>>>()

export type ScheduleConflictArgs = {
  facilityId: string
  providerId: string
  startsAt: string
  endsAt: string
  excludeAppointmentId?: string | null
}

export function canInspectSchedule(context: Context) {
  const role = context.session?.data.role
  return Boolean(role?.canManageScheduling || role?.canManageAppointments)
}

export function requireSchedulePermission(context: Context) {
  if (!canInspectSchedule(context)) throw new Error('Not authorized to inspect schedule conflicts')
}

export async function findScheduleConflicts(args: ScheduleConflictArgs, context: Context) {
  const { start, end } = parseScheduleWindow(args.startsAt, args.endsAt)
  const scopedProvider = await context.query.Provider.findOne({
    where: { id: args.providerId },
    query: 'id facilities { id }',
  }) as { id: string; facilities?: Array<{ id: string }> } | null
  if (!scopedProvider?.facilities?.some(facility => facility.id === args.facilityId)) {
    throw new Error('Provider and facility not found or not accessible')
  }

  const [availability, accessibleAppointments] = await Promise.all([
    inspectProviderWindow(context.sudo().prisma, {
      providerId: args.providerId,
      facilityId: args.facilityId,
      startsAt: start,
      endsAt: end,
      excludeAppointmentId: args.excludeAppointmentId,
    }),
    context.query.Appointment.findMany({
      where: {
        provider: { id: { equals: args.providerId } },
        facility: { id: { equals: args.facilityId } },
        id: args.excludeAppointmentId ? { not: { equals: args.excludeAppointmentId } } : undefined,
        startsAt: { lt: new Date(end.getTime() + MAX_APPOINTMENT_BUFFER_MINUTES * 60_000).toISOString() },
        endsAt: { gt: new Date(start.getTime() - MAX_APPOINTMENT_BUFFER_MINUTES * 60_000).toISOString() },
      },
      query: 'id',
    }),
  ])
  const accessibleIds = new Set(accessibleAppointments.map((appointment) => appointment.id))

  return {
    withinAvailability: availability.withinAvailability,
    hasConflict: availability.hasConflict,
    conflicts: [
      ...availability.appointments.map((appointment: any, index: number) => {
        const accessible = accessibleIds.has(appointment.id)
        return {
          source: 'appointment',
          id: accessible ? appointment.id : `private-appointment-${index + 1}`,
          reference: accessible ? appointment.appointmentNumber : 'busy',
          status: accessible ? appointment.status : 'busy',
          startsAt: appointment.startsAt,
          endsAt: appointment.endsAt,
        }
      }),
      ...availability.blockingScheduleBlocks.map((block: any) => ({
        source: 'schedule_block',
        id: block.id,
        reference: block.blockType,
        status: block.blockType,
        startsAt: block.startsAt,
        endsAt: block.endsAt,
      })),
    ],
  }
}

export default function appointmentScheduleConflicts(
  _root: unknown,
  args: ScheduleConflictArgs,
  context: Context,
) {
  requireSchedulePermission(context)
  const contextKey = context as unknown as object
  let requestCache = conflictCache.get(contextKey)
  if (!requestCache) {
    requestCache = new Map()
    conflictCache.set(contextKey, requestCache)
  }
  const key = `${args.facilityId}\0${args.providerId}\0${args.startsAt}\0${args.endsAt}\0${args.excludeAppointmentId || ''}`
  const existing = requestCache.get(key)
  if (existing) return existing
  const pending = findScheduleConflicts(args, context)
  requestCache.set(key, pending)
  void pending.catch(() => requestCache?.delete(key))
  return pending
}

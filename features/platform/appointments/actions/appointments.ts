'use server'

import { calendarDateInTimeZone, facilityCalendarWindow } from '@/features/keystone/mutations/scheduling/facilityTime'
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'

export type AppointmentStatus = 'requested' | 'confirmed' | 'checked_in' | 'in_visit' | 'completed' | 'cancelled' | 'no_show'

export type AppointmentQueueItem = {
  id: string
  appointmentNumber: string
  status: AppointmentStatus
  transitionVersion: number
  startsAt: string
  endsAt: string
  locationName?: string | null
  reasonForVisit?: string | null
  source?: string | null
  checkInAt?: string | null
  completedAt?: string | null
  cancellationReason?: string | null
  operationalNotes?: string | null
  patient?: {
    id: string
    displayName?: string | null
    phone?: string | null
    email?: string | null
    preferredContactMethod?: string | null
  } | null
  provider?: {
    id: string
    displayName?: string | null
    specialty?: string | null
  } | null
  facility?: {
    id: string
    name?: string | null
    timeZone: string
  } | null
  appointmentType?: {
    id: string
    name?: string | null
    durationMinutes?: number | null
  } | null
  intakeFormsCount?: number | null
  intakeForms?: Array<{
    id: string
    title?: string | null
    status?: string | null
    submittedAt?: string | null
  }>
  messagesCount?: number | null
  messages?: Array<{
    id: string
    channel?: string | null
    direction?: string | null
    status?: string | null
    subject?: string | null
  }>
}

const APPOINTMENT_SELECTION = `
  id
  appointmentNumber
  status
  transitionVersion
  startsAt
  endsAt
  locationName
  reasonForVisit
  source
  checkInAt
  completedAt
  cancellationReason
  operationalNotes
  patient { id displayName phone email preferredContactMethod }
  provider { id displayName specialty }
  facility { id name timeZone }
  appointmentType { id name durationMinutes }
  intakeFormsCount
  intakeForms(orderBy: [{ createdAt: desc }], take: 10) { id title status submittedAt }
  messagesCount
  messages(orderBy: [{ createdAt: desc }], take: 10) { id channel direction status subject }
`

function endOfRangeIso(days = 14) {
  return new Date(Date.now() + days * 24 * 60 * 60_000).toISOString()
}

function buildWhere(status?: string | null, view?: string | null, search?: string | null) {
  const where: Record<string, unknown> = {}

  if (view === 'upcoming') {
    where.startsAt = { gte: new Date().toISOString(), lt: endOfRangeIso(14) }
    where.status = { in: ['requested', 'confirmed', 'checked_in', 'in_visit'] }
  } else if (view === 'needs_action') {
    where.status = { in: ['requested', 'checked_in'] }
  }

  if (status && status !== 'all') {
    where.status = { equals: status }
  }

  const boundedSearch = search?.trim().slice(0, 80)
  if (boundedSearch) {
    where.OR = [
      { appointmentNumber: { contains: boundedSearch, mode: 'insensitive' } },
      { patient: { OR: [
        { firstName: { contains: boundedSearch, mode: 'insensitive' } },
        { lastName: { contains: boundedSearch, mode: 'insensitive' } },
      ] } },
      { provider: { OR: [
        { firstName: { contains: boundedSearch, mode: 'insensitive' } },
        { lastName: { contains: boundedSearch, mode: 'insensitive' } },
      ] } },
      { facility: { name: { contains: boundedSearch, mode: 'insensitive' } } },
    ]
  }

  return where
}

export async function getAppointments(where: Record<string, unknown> = {}, take = 50, skip = 0, sort = 'start_asc', cursor?: string) {
  if (!Number.isInteger(take) || take < 1 || take > 100 || !Number.isInteger(skip) || skip < 0 || skip > 1000) {
    return { success: false as const, error: 'Appointment pagination is outside the bounded list contract.' }
  }
  if (cursor) {
    if (cursor.length > 200 || !/^[A-Za-z0-9_-]+$/.test(cursor)) return { success: false as const, error: 'Appointment cursor is invalid; return to the first page.' }
    const anchor = await keystoneClient<{ appointments: Array<{ id: string }> }>(`query AppointmentQueueAnchor($where:AppointmentWhereInput!){appointments(where:$where,take:1){id}}`, { where: { AND: [where, { id: { equals: cursor } }] } })
    if (!anchor.success || anchor.data.appointments.length !== 1) return { success: false as const, error: 'The page anchor is no longer accessible in this queue. Return to the first page.' }
  }
  const query = `
    query GetAppointmentQueue($where: AppointmentWhereInput, $take: Int!, $skip: Int!, $orderBy: [AppointmentOrderByInput!]!, $cursor: AppointmentWhereUniqueInput) {
      appointments(where: $where, take: $take, skip: $skip, cursor: $cursor, orderBy: $orderBy) {
        ${APPOINTMENT_SELECTION}
      }
      appointmentsCount(where: $where)
    }
  `

  const response = await keystoneClient<{ appointments: AppointmentQueueItem[]; appointmentsCount: number }>(query, {
    where,
    take,
    skip: cursor ? 1 : skip,
    cursor: cursor ? { id: cursor } : null,
    orderBy: [{ startsAt: sort === 'start_desc' ? 'desc' : 'asc' }, { id: sort === 'start_desc' ? 'desc' : 'asc' }],
  })

  if (!response.success) return response
  const items = response.data.appointments
  const count = response.data.appointmentsCount
  return {
    success: true as const,
    data: {
      items,
      count,
      truncated: count > skip + items.length,
      notice: count > skip + items.length ? `Showing ${items.length} of ${count} appointments on this bounded page. Narrow the status or view to reach records outside this page.` : null,
    },
  }
}

export async function getAppointmentFacilityFilter(facilityId?: string) {
  return keystoneClient<{ facilitiesCount: number; facility: { id: string; name: string; timeZone: string; status: string } | null }>(`query AppointmentFacilityFilter($id:ID!){facilitiesCount(where:{status:{equals:"active"}}) facility(where:{id:$id}){id name timeZone status}}`, { id: facilityId || 'unselected' })
}

export async function getAppointmentQueue(status?: string | null, view?: string | null, search?: string | null, sort = 'start_asc', cursor?: string, facilityId?: string, date?: string) {
  const where = buildWhere(status, view === 'today' ? 'all' : view, search)
  if (facilityId) where.facility = { id: { equals: facilityId } }
  if (view === 'today') {
    const facilityResponse = await getAppointmentFacilityFilter(facilityId)
    const facility = facilityResponse.success ? facilityResponse.data.facility : null
    if (!facility || facility.status !== 'active') return { success: true as const, data: { items: [] as AppointmentQueueItem[], count: 0, truncated: false, notice: 'Select an accessible active facility to check its calendar day. No empty appointment result is inferred.', nextCursor: null as string | null, requiresFacility: true } }
    try {
      const window = facilityCalendarWindow(date || calendarDateInTimeZone(new Date(), facility.timeZone), facility.timeZone)
      where.startsAt = { gte: window.start.toISOString(), lt: window.end.toISOString() }
    } catch { return { success: false as const, error: 'Select a valid calendar date for this facility.' } }
  }
  const response = await getAppointments(where, 76, 0, sort, cursor)
  if (!response.success) return response
  const items = response.data.items.slice(0, 75)
  const more = response.data.items.length > 75
  return { success: true as const, data: { items, count: response.data.count, truncated: more, nextCursor: more ? items.at(-1)!.id : null, requiresFacility: false, notice: more ? 'More matching appointments are available on the next page.' : null } }
}

export async function getAppointmentStatusCounts() {
  const query = `
    query AppointmentStatusCounts {
      all: appointmentsCount
      requested: appointmentsCount(where: { status: { equals: "requested" } })
      confirmed: appointmentsCount(where: { status: { equals: "confirmed" } })
      checked_in: appointmentsCount(where: { status: { equals: "checked_in" } })
      in_visit: appointmentsCount(where: { status: { equals: "in_visit" } })
      completed: appointmentsCount(where: { status: { equals: "completed" } })
      cancelled: appointmentsCount(where: { status: { equals: "cancelled" } })
      no_show: appointmentsCount(where: { status: { equals: "no_show" } })
    }
  `

  const response = await keystoneClient<Record<string, number>>(query)
  if (!response.success) return response
  return { success: true as const, data: response.data }
}

export async function updateAppointmentStatus(appointmentId: string, status: AppointmentStatus, expectedVersion: number, options?: { cancellationReason?: string; operationalNotes?: string }, operationKey = `hospital-ui-${randomUUID()}`) {
  const mutation = `
    mutation TransitionAppointment($operationKey: String!, $appointmentId: ID!, $toStatus: String!, $expectedVersion: Int!, $reason: String, $operationalNotes: String) {
      transitionAppointment(
        operationKey: $operationKey
        appointmentId: $appointmentId
        toStatus: $toStatus
        expectedVersion: $expectedVersion
        reason: $reason
        operationalNotes: $operationalNotes
      ) {
        id
        appointmentNumber
        fromStatus
        status
        transitionVersion
        startsAt
        endsAt
        checkInAt
        completedAt
        cancellationReason
      }
    }
  `

  const response = await keystoneClient<{ transitionAppointment: AppointmentQueueItem }>(mutation, {
    operationKey,
    appointmentId,
    toStatus: status,
    expectedVersion,
    reason: options?.cancellationReason,
    operationalNotes: options?.operationalNotes,
  })
  revalidatePath('/dashboard/platform/appointments')
  return response
}

export async function confirmAppointment(appointmentId: string, expectedVersion: number, operationKey?: string) {
  return updateAppointmentStatus(appointmentId, 'confirmed', expectedVersion, undefined, operationKey)
}

export async function checkInAppointment(appointmentId: string, _expectedVersion: number, operationKey = `hospital-ui-${randomUUID()}`) {
  const response = await keystoneClient(`mutation ArriveAppointment($appointmentId:ID!,$idempotencyKey:String!){arriveAppointment(appointmentId:$appointmentId,idempotencyKey:$idempotencyKey){id status transitionVersion replayed}}`, {
    appointmentId,
    idempotencyKey: operationKey,
  })
  revalidatePath('/dashboard/platform/appointments')
  revalidatePath('/dashboard/platform/care-queue')
  return response
}

export async function startAppointmentVisit(appointmentId: string, expectedVersion: number, operationKey?: string) {
  return updateAppointmentStatus(appointmentId, 'in_visit', expectedVersion, undefined, operationKey)
}

export async function completeAppointment(appointmentId: string, expectedVersion: number, operationKey?: string) {
  return updateAppointmentStatus(appointmentId, 'completed', expectedVersion, undefined, operationKey)
}

export async function markAppointmentNoShow(appointmentId: string, expectedVersion: number, operationKey?: string) {
  return updateAppointmentStatus(appointmentId, 'no_show', expectedVersion, undefined, operationKey)
}

export async function cancelAppointment(appointmentId: string, expectedVersion: number, operationKey?: string, cancellationReason = '') {
  if (!cancellationReason.trim()) return { success: false as const, error: 'Enter the operator cancellation reason.' }
  return updateAppointmentStatus(appointmentId, 'cancelled', expectedVersion, { cancellationReason }, operationKey)
}

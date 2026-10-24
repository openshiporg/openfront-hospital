import 'server-only'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import type { Option } from '@/features/platform/providers/actions/types'
import type { VisitTypeDetail, VisitTypeRow } from './types'

const STATUSES = new Set(['all', 'bookable', 'internal', 'paused'])
const ACTIVE_APPOINTMENT = ['requested', 'confirmed', 'checked_in', 'in_visit']

export type VisitTypeFilters = { status: string; search: string }

export function normalizeVisitTypeFilters(input: Record<string, string | string[] | undefined>): VisitTypeFilters {
  const value = (key: string) => (typeof input[key] === 'string' ? (input[key] as string).trim() : '')
  const status = value('status')
  return { status: STATUSES.has(status) ? status : 'all', search: value('search').slice(0, 80) }
}

export async function getVisitTypeWorkspace(filters: VisitTypeFilters) {
  const and: Record<string, unknown>[] = []
  if (filters.search) {
    const contains = { contains: filters.search, mode: 'insensitive' }
    and.push({ OR: [{ name: contains }, { slug: contains }, { description: contains }] })
  }
  const withStatus = (status: string) => ({ AND: [...and, { status: { equals: status } }] })
  const where = filters.status === 'all' ? { AND: and } : withStatus(filters.status)
  const query = `
    query VisitTypeWorkspace(
      $where: AppointmentTypeWhereInput!, $all: AppointmentTypeWhereInput!, $bookable: AppointmentTypeWhereInput!,
      $internal: AppointmentTypeWhereInput!, $paused: AppointmentTypeWhereInput!, $upcoming: AppointmentWhereInput!
    ) {
      appointmentTypes(where: $where, orderBy: [{ name: asc }], take: 100) {
        id name slug status durationMinutes bufferBeforeMinutes bufferAfterMinutes priceCents formattedPrice
        providersCount
        upcomingCount: appointmentsCount(where: $upcoming)
      }
      filtered: appointmentTypesCount(where: $where)
      all: appointmentTypesCount(where: $all)
      bookable: appointmentTypesCount(where: $bookable)
      internal: appointmentTypesCount(where: $internal)
      paused: appointmentTypesCount(where: $paused)
      providers(orderBy: [{ lastName: asc }, { firstName: asc }], take: 200) { id displayName status }
    }
  `
  const response = await keystoneClient<{
    appointmentTypes: VisitTypeRow[]
    filtered: number
    all: number
    bookable: number
    internal: number
    paused: number
    providers: Array<{ id: string; displayName: string | null; status: string | null }>
  }>(query, {
    where,
    all: { AND: and },
    bookable: withStatus('bookable'),
    internal: withStatus('internal'),
    paused: withStatus('paused'),
    upcoming: { startsAt: { gte: new Date().toISOString() }, status: { in: ACTIVE_APPOINTMENT } },
  })
  if (!response.success) return response
  const d = response.data
  return {
    success: true as const,
    data: {
      visitTypes: d.appointmentTypes,
      counts: { filtered: d.filtered, all: d.all, bookable: d.bookable, internal: d.internal, paused: d.paused },
      providers: d.providers.map((p): Option => ({ id: p.id, label: p.displayName || 'Unnamed provider', sub: p.status })),
    },
  }
}

export async function getVisitTypeDetail(id: string) {
  const now = new Date().toISOString()
  const query = `
    query VisitTypeDetail($id: ID!, $upcoming: AppointmentWhereInput!, $recent: AppointmentWhereInput!) {
      appointmentType(where: { id: $id }) {
        id name slug description status durationMinutes bufferBeforeMinutes bufferAfterMinutes priceCents formattedPrice
        intakeRequirements
        providersCount
        upcomingCount: appointmentsCount(where: $upcoming)
        providers(orderBy: [{ lastName: asc }, { firstName: asc }]) { id displayName specialty status }
        upcoming: appointments(where: $upcoming, orderBy: [{ startsAt: asc }], take: 15) {
          id appointmentNumber status startsAt provider { id displayName } facility { id name timeZone }
        }
        recent: appointments(where: $recent, orderBy: [{ startsAt: desc }], take: 15) {
          id appointmentNumber status startsAt provider { id displayName } facility { id name timeZone }
        }
      }
      providers(orderBy: [{ lastName: asc }, { firstName: asc }], take: 200) { id displayName status }
    }
  `
  const response = await keystoneClient<{
    appointmentType: VisitTypeDetail | null
    providers: Array<{ id: string; displayName: string | null; status: string | null }>
  }>(query, {
    id,
    upcoming: { startsAt: { gte: now }, status: { in: ACTIVE_APPOINTMENT } },
    recent: { startsAt: { lt: now } },
  })
  if (!response.success) return response
  return {
    success: true as const,
    data: {
      visitType: response.data.appointmentType,
      providers: response.data.providers.map((p): Option => ({ id: p.id, label: p.displayName || 'Unnamed provider', sub: p.status })),
    },
  }
}

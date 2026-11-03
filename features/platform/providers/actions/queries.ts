import 'server-only'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { scanChunks } from '@/features/platform/lib/chunkedScan'
import { worklistPageSkip } from '@/features/platform/lib/worklistPagination'
import {
  PROVIDER_FACILITY_OPTIONS_QUERY,
  PROVIDER_PAGE_SIZE,
  PROVIDER_VISIT_TYPE_OPTIONS_QUERY,
  providerPageQuery,
  providerSpecialtiesQuery,
} from './queryDocs'
import type { Option, ProviderDetail, ProviderFilters, ProviderRow } from './types'

const STATUSES = new Set(['all', 'active', 'unavailable', 'inactive'])

export function normalizeProviderFilters(input: Record<string, string | string[] | undefined>): ProviderFilters {
  const value = (key: string) => (typeof input[key] === 'string' ? (input[key] as string).trim() : '')
  const status = value('status')
  return {
    status: STATUSES.has(status) ? status : 'all',
    facility: value('facility').slice(0, 64),
    specialty: value('specialty').slice(0, 80),
    search: value('search').slice(0, 80),
  }
}

function baseWhere(filters: ProviderFilters) {
  const and: Record<string, unknown>[] = []
  if (filters.facility) and.push({ facilities: { some: { id: { equals: filters.facility } } } })
  if (filters.specialty) and.push({ specialty: { equals: filters.specialty } })
  if (filters.search) {
    const contains = { contains: filters.search, mode: 'insensitive' }
    and.push({
      OR: [
        { firstName: contains },
        { lastName: contains },
        { specialty: contains },
        { credentials: contains },
        { locationName: contains },
      ],
    })
  }
  return and
}

export async function getProviderWorkspace(filters: ProviderFilters, page = 1) {
  const and = baseWhere(filters)
  const where = { AND: [...and, ...(filters.status !== 'all' ? [{ status: { equals: filters.status } }] : [])] }
  const statusWhere = (status: string) => ({ AND: [...and, { status: { equals: status } }] })
  const now = new Date().toISOString()
  // Independent operations, all started together.
  const specialtiesP = scanChunks(async skip => {
    const r = await keystoneClient<{ providers: Array<{ specialty: string | null }> }>(providerSpecialtiesQuery(skip))
    return r.success ? { success: true as const, data: r.data.providers } : r
  })
  const facilitiesP = keystoneClient<{ facilities: Array<{ id: string; name: string | null; status: string | null }> }>(PROVIDER_FACILITY_OPTIONS_QUERY)
  const typesP = keystoneClient<{ appointmentTypes: Array<{ id: string; name: string | null; status: string | null }> }>(PROVIDER_VISIT_TYPE_OPTIONS_QUERY)
  const response = await keystoneClient<{
    providers: ProviderRow[]
    filtered: number
    all: number
    active: number
    unavailable: number
    inactive: number
  }>(providerPageQuery(worklistPageSkip(page)), {
    where,
    all: { AND: and },
    active: statusWhere('active'),
    unavailable: statusWhere('unavailable'),
    inactive: statusWhere('inactive'),
    now,
  })
  const [specialtyScan, facilityRes, typeRes] = await Promise.all([specialtiesP, facilitiesP, typesP])
  if (!response.success) return response
  if (!specialtyScan.success) return specialtyScan
  if (!facilityRes.success) return facilityRes
  if (!typeRes.success) return typeRes
  const d = response.data
  const specialties = Array.from(new Set(specialtyScan.data.map((p) => p.specialty?.trim()).filter((s): s is string => Boolean(s)))).sort()
  return {
    success: true as const,
    data: {
      providers: d.providers,
      counts: { filtered: d.filtered, all: d.all, active: d.active, unavailable: d.unavailable, inactive: d.inactive },
      specialties,
      facilities: facilityRes.data.facilities.map((f): Option => ({ id: f.id, label: f.name || 'Unnamed facility', sub: f.status })),
      appointmentTypes: typeRes.data.appointmentTypes.map((t): Option => ({ id: t.id, label: t.name || 'Unnamed visit type', sub: t.status })),
    },
  }
}

export async function getProviderDetail(id: string) {
  const now = new Date().toISOString()
  const query = `
    query ProviderDetail($id: ID!, $now: DateTime!) {
      provider(where: { id: $id }) {
        id firstName lastName displayName credentials specialty status bio locationName
        facilities(orderBy: [{ name: asc }]) { id name }
        appointmentTypes(orderBy: [{ name: asc }]) { id name status durationMinutes formattedPrice }
        scheduleBlocks(where: { endsAt: { gte: $now } }, orderBy: [{ startsAt: asc }], take: 20) {
          id blockType startsAt endsAt locationName facility { id name timeZone }
        }
        appointments(
          where: { startsAt: { gte: $now }, status: { in: ["requested", "confirmed", "checked_in", "in_visit"] } }
          orderBy: [{ startsAt: asc }]
          take: 20
        ) {
          id appointmentNumber status startsAt appointmentType { id name } facility { id name timeZone }
        }
        clinicians(orderBy: [{ displayName: asc }]) {
          id displayName clinicianType licenseNumber email phone active department { id name }
        }
      }
      facilities(orderBy: [{ name: asc }], take: 100) { id name status }
      appointmentTypes(orderBy: [{ name: asc }], take: 100) { id name status }
      departments(orderBy: [{ name: asc }], take: 100) { id name status }
    }
  `
  const response = await keystoneClient<{
    provider: ProviderDetail | null
    facilities: Array<{ id: string; name: string | null; status: string | null }>
    appointmentTypes: Array<{ id: string; name: string | null; status: string | null }>
    departments: Array<{ id: string; name: string | null; status: string | null }>
  }>(query, { id, now })
  if (!response.success) return response
  const d = response.data
  return {
    success: true as const,
    data: {
      provider: d.provider,
      facilities: d.facilities.map((f): Option => ({ id: f.id, label: f.name || 'Unnamed facility', sub: f.status })),
      appointmentTypes: d.appointmentTypes.map((t): Option => ({ id: t.id, label: t.name || 'Unnamed visit type', sub: t.status })),
      departments: d.departments.map((t): Option => ({ id: t.id, label: t.name || 'Unnamed department', sub: t.status })),
    },
  }
}

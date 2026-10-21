import 'server-only'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'

export type ScheduleBlock = {
  id: string
  blockType: string
  startsAt: string
  endsAt: string
  locationName?: string | null
  recurrenceRule?: string | null
  notes?: string | null
  provider?: { id: string; displayName?: string | null; specialty?: string | null } | null
  facility?: { id: string; name?: string | null; timeZone?: string | null } | null
}

export type ScheduleFilters = {
  search: string
  blockType: string
  range: string
  sort: string
}

const BLOCK_TYPES = new Set(['all', 'available', 'unavailable', 'on_call', 'admin_time'])
const RANGES = new Set(['upcoming', 'past', 'all'])
const SORTS = new Set(['start_asc', 'start_desc'])

export function normalizeScheduleFilters(input: Record<string, string | string[] | undefined>): ScheduleFilters {
  const value = (key: string) => typeof input[key] === 'string' ? input[key].trim() : ''
  const blockType = value('type')
  const range = value('range')
  const sort = value('sort')
  return {
    search: value('search').slice(0, 80),
    blockType: BLOCK_TYPES.has(blockType) ? blockType : 'all',
    range: RANGES.has(range) ? range : 'upcoming',
    sort: SORTS.has(sort) ? sort : 'start_asc',
  }
}

function buildWhere(filters: ScheduleFilters) {
  const where: Record<string, unknown> = {}
  if (filters.blockType !== 'all') where.blockType = { equals: filters.blockType }
  if (filters.range === 'upcoming') where.endsAt = { gte: new Date().toISOString() }
  if (filters.range === 'past') where.endsAt = { lt: new Date().toISOString() }
  if (filters.search) {
    where.OR = [
      { provider: { OR: [
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
        { specialty: { contains: filters.search, mode: 'insensitive' } },
      ] } },
      { facility: { name: { contains: filters.search, mode: 'insensitive' } } },
      { locationName: { contains: filters.search, mode: 'insensitive' } },
    ]
  }
  return where
}

function orderBy(sort: string) {
  if (sort === 'start_desc') return [{ startsAt: 'desc' }]
  return [{ startsAt: 'asc' }]
}

export async function getScheduleWorkspace(filters: ScheduleFilters) {
  const query = `
    query ScheduleWorkspace($where: ProviderScheduleBlockWhereInput!, $orderBy: [ProviderScheduleBlockOrderByInput!]!) {
      providerScheduleBlocks(where: $where, orderBy: $orderBy, take: 100) {
        id blockType startsAt endsAt locationName recurrenceRule notes
        provider { id displayName specialty }
        facility { id name timeZone }
      }
      providerScheduleBlocksCount(where: $where)
      all: providerScheduleBlocksCount
      available: providerScheduleBlocksCount(where: { blockType: { equals: "available" } })
      unavailable: providerScheduleBlocksCount(where: { blockType: { equals: "unavailable" } })
      onCall: providerScheduleBlocksCount(where: { blockType: { equals: "on_call" } })
      adminTime: providerScheduleBlocksCount(where: { blockType: { equals: "admin_time" } })
    }
  `
  return keystoneClient<{
    providerScheduleBlocks: ScheduleBlock[]
    providerScheduleBlocksCount: number
    all: number
    available: number
    unavailable: number
    onCall: number
    adminTime: number
  }>(query, { where: buildWhere(filters), orderBy: orderBy(filters.sort) })
}

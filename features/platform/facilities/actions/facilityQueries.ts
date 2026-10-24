import 'server-only'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import type { BedRecord, DepartmentRecord, FacilityFilters, FacilityListItem, FacilityRecord, RoomRecord, WardRecord } from '../lib/structure'

const LIST_LIMIT = 100

function baseWhere(filters: FacilityFilters) {
  const and: Record<string, unknown>[] = []
  if (filters.facilityType !== 'all') and.push({ facilityType: { equals: filters.facilityType } })
  if (filters.search) {
    const contains = { contains: filters.search, mode: 'insensitive' }
    and.push({ OR: [{ name: contains }, { slug: contains }, { city: contains }, { region: contains }, { postalCode: contains }] })
  }
  return and
}

export async function getFacilityList(filters: FacilityFilters) {
  const and = baseWhere(filters)
  const where = { AND: filters.status === 'all' ? and : [...and, { status: { equals: filters.status } }] }
  const query = `
    query FacilityStructureList($where: FacilityWhereInput!, $all: FacilityWhereInput!, $active: FacilityWhereInput!, $inactive: FacilityWhereInput!) {
      facilities(where: $where, orderBy: [{ name: asc }, { id: asc }], take: ${LIST_LIMIT}) {
        id name slug facilityType status city region timeZone phone departmentsCount providersCount
      }
      facilitiesCount(where: $where)
      all: facilitiesCount(where: $all)
      active: facilitiesCount(where: $active)
      inactive: facilitiesCount(where: $inactive)
      authenticatedItem { ... on User { id role { canAccessAllClinicalData } } }
    }
  `
  return keystoneClient<{
    facilities: FacilityListItem[]
    facilitiesCount: number
    all: number
    active: number
    inactive: number
    authenticatedItem?: { id: string; role?: { canAccessAllClinicalData?: boolean | null } | null } | null
  }>(query, {
    where,
    all: { AND: and },
    active: { AND: [...and, { status: { equals: 'active' } }] },
    inactive: { AND: [...and, { status: { equals: 'inactive' } }] },
  })
}

export const STRUCTURE_LIMITS = { departments: 100, wards: 200, rooms: 500, beds: 1000 } as const

export async function getFacilityStructure(id: string) {
  const inFacility = { facilities: { some: { id: { equals: id } } } }
  const query = `
    query FacilityStructure($id: ID!, $departmentWhere: DepartmentWhereInput!, $wardWhere: WardWhereInput!, $roomWhere: RoomWhereInput!, $bedWhere: BedWhereInput!) {
      facility(where: { id: $id }) {
        id name slug facilityType status addressLine1 addressLine2 city region postalCode phone timeZone departmentsCount providersCount
      }
      departments(where: $departmentWhere, orderBy: [{ name: asc }, { id: asc }], take: ${STRUCTURE_LIMITS.departments}) {
        id name code status description phone email
      }
      departmentsCount(where: $departmentWhere)
      wards(where: $wardWhere, orderBy: [{ name: asc }, { id: asc }], take: ${STRUCTURE_LIMITS.wards}) {
        id name floor capacity status department { id }
      }
      wardsCount(where: $wardWhere)
      rooms(where: $roomWhere, orderBy: [{ roomNumber: asc }, { id: asc }], take: ${STRUCTURE_LIMITS.rooms}) {
        id roomNumber roomType status ward { id }
      }
      roomsCount(where: $roomWhere)
      beds(where: $bedWhere, orderBy: [{ bedNumber: asc }, { id: asc }], take: ${STRUCTURE_LIMITS.beds}) {
        id bedNumber status room { id }
      }
      bedsCount(where: $bedWhere)
      authenticatedItem { ... on User { id role { canAccessAllClinicalData } } }
    }
  `
  return keystoneClient<{
    facility: FacilityRecord | null
    departments: DepartmentRecord[]
    departmentsCount: number
    wards: WardRecord[]
    wardsCount: number
    rooms: RoomRecord[]
    roomsCount: number
    beds: BedRecord[]
    bedsCount: number
    authenticatedItem?: { id: string; role?: { canAccessAllClinicalData?: boolean | null } | null } | null
  }>(query, {
    id,
    departmentWhere: inFacility,
    wardWhere: { department: inFacility },
    roomWhere: { ward: { department: inFacility } },
    bedWhere: { room: { ward: { department: inFacility } } },
  })
}

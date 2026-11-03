import { SCAN_CHUNK } from '@/features/platform/lib/scanLimits'
import { WORKLIST_PAGE_SIZE } from '@/features/platform/lib/worklistPagination'

export const PROVIDER_PAGE_SIZE = WORKLIST_PAGE_SIZE

/** Visible page of providers plus status counts. */
export function providerPageQuery(skip: number) {
  return `
    query ProviderWorkspace(
      $where: ProviderWhereInput!, $all: ProviderWhereInput!, $active: ProviderWhereInput!,
      $unavailable: ProviderWhereInput!, $inactive: ProviderWhereInput!, $now: DateTime!
    ) {
      providers(where: $where, orderBy: [{ lastName: asc }, { firstName: asc }, { id: asc }], take: ${PROVIDER_PAGE_SIZE}, skip: ${skip}) {
        id firstName lastName displayName credentials specialty status locationName
        appointmentTypesCount
        upcomingBlocks: scheduleBlocksCount(where: { endsAt: { gte: $now } })
        facilities(take: 5) { id name }
      }
      filtered: providersCount(where: $where)
      all: providersCount(where: $all)
      active: providersCount(where: $active)
      unavailable: providersCount(where: $unavailable)
      inactive: providersCount(where: $inactive)
    }
  `
}

/** Filter and option lists: facilities and visit types (each its own operation). */
export const PROVIDER_FACILITY_OPTIONS_QUERY = `
  query ProviderFacilityOptions { facilities(orderBy: [{ name: asc }], take: 100) { id name status } }
`
export const PROVIDER_VISIT_TYPE_OPTIONS_QUERY = `
  query ProviderVisitTypeOptions { appointmentTypes(orderBy: [{ name: asc }, { id: asc }], take: 100) { id name status } }
`
/** One chunk of the specialty scan. */
export function providerSpecialtiesQuery(skip: number) {
  return `
    query ProviderSpecialties { providers(where: { specialty: { not: { equals: "" } } }, orderBy: [{ specialty: asc }, { id: asc }], take: ${SCAN_CHUNK}, skip: ${skip}) { specialty } }
  `
}


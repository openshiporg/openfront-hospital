'use server'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { facilityCandidateWhere, normalizeFacilitySearch } from '../lib/facilitySearch'

export type FacilitySearchResult = {
  facilities: Array<{ id: string; name: string; city?: string | null; region?: string | null }>
  facilitiesCount: number
}

export async function searchAccessibleFacilities(rawSearch: string) {
  const search = normalizeFacilitySearch(rawSearch)
  const where = facilityCandidateWhere(search)
  if (!where) return { success: true as const, data: { facilities: [], facilitiesCount: 0 } }

  return keystoneClient<FacilitySearchResult>(
    `query AccessibleFacilityCandidates($where:FacilityWhereInput!){facilities(where:$where,orderBy:[{name:asc},{id:asc}],take:25){id name city region} facilitiesCount(where:$where)}`,
    { where },
  )
}

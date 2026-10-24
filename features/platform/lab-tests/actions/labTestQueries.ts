import 'server-only'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import type { LabTestFilters, LabTestRecord } from '../lib/labTests'

export const LAB_TEST_LIMIT = 200
const CATEGORY_SCAN_LIMIT = 1000

export async function getLabTestCatalog(filters: LabTestFilters) {
  const and: Record<string, unknown>[] = []
  if (filters.category) and.push({ category: { equals: filters.category } })
  if (filters.search) {
    const contains = { contains: filters.search, mode: 'insensitive' }
    and.push({ OR: [{ name: contains }, { code: contains }, { category: contains }, { specimenType: contains }] })
  }
  const where = { AND: filters.status === 'all' ? and : [...and, { active: { equals: filters.status === 'active' } }] }
  const query = `
    query LabTestCatalog($where: LabTestWhereInput!, $all: LabTestWhereInput!, $active: LabTestWhereInput!, $inactive: LabTestWhereInput!) {
      labTests(where: $where, orderBy: [{ name: asc }, { id: asc }], take: ${LAB_TEST_LIMIT}) {
        id code name category specimenType turnaroundHours active
      }
      labTestsCount(where: $where)
      all: labTestsCount(where: $all)
      active: labTestsCount(where: $active)
      inactive: labTestsCount(where: $inactive)
      categories: labTests(where: { category: { not: { equals: "" } } }, orderBy: [{ category: asc }], take: ${CATEGORY_SCAN_LIMIT}) { category }
      authenticatedItem { ... on User { id role { canAccessAllClinicalData } } }
    }
  `
  const response = await keystoneClient<{
    labTests: LabTestRecord[]
    labTestsCount: number
    all: number
    active: number
    inactive: number
    categories: Array<{ category?: string | null }>
    authenticatedItem?: { id: string; role?: { canAccessAllClinicalData?: boolean | null } | null } | null
  }>(query, {
    where,
    all: { AND: and },
    active: { AND: [...and, { active: { equals: true } }] },
    inactive: { AND: [...and, { active: { equals: false } }] },
  })
  if (!response.success) return response
  const categories = Array.from(new Set(response.data.categories.map(item => item.category?.trim()).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b))
  return { success: true as const, data: { ...response.data, categories } }
}

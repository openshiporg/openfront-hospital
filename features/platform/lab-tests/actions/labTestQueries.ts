import 'server-only'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { scanChunks } from '@/features/platform/lib/chunkedScan'
import { worklistPageSkip } from '@/features/platform/lib/worklistPagination'
import { LAB_TEST_LIMIT, labTestCatalogQuery, labTestCategoriesQuery } from './labTestQueryDocs'
import type { LabTestFilters, LabTestRecord } from '../lib/labTests'


export async function getLabTestCatalog(filters: LabTestFilters, page = 1) {
  const and: Record<string, unknown>[] = []
  if (filters.category) and.push({ category: { equals: filters.category } })
  if (filters.search) {
    const contains = { contains: filters.search, mode: 'insensitive' }
    and.push({ OR: [{ name: contains }, { code: contains }, { category: contains }, { specimenType: contains }] })
  }
  const where = { AND: filters.status === 'all' ? and : [...and, { active: { equals: filters.status === 'active' } }] }
  // Separate operation, started in parallel with the page query.
  const categoryScanPromise = scanChunks(async skip => {
    const r = await keystoneClient<{ labTests: Array<{ category?: string | null }> }>(labTestCategoriesQuery(skip))
    return r.success ? { success: true as const, data: r.data.labTests } : r
  })
  const response = await keystoneClient<{
    labTests: LabTestRecord[]
    labTestsCount: number
    all: number
    active: number
    inactive: number
    authenticatedItem?: { id: string; role?: { canAccessAllClinicalData?: boolean | null } | null } | null
  }>(labTestCatalogQuery(worklistPageSkip(page)), {
    where,
    all: { AND: and },
    active: { AND: [...and, { active: { equals: true } }] },
    inactive: { AND: [...and, { active: { equals: false } }] },
  })
  if (!response.success) return response
  const categoryScan = await categoryScanPromise
  if (!categoryScan.success) return categoryScan
  const categories = Array.from(new Set(categoryScan.data.map(item => item.category?.trim()).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b))
  return { success: true as const, data: { ...response.data, categories } }
}

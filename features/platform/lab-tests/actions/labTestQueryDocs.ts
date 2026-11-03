import { SCAN_CHUNK } from '@/features/platform/lib/scanLimits'
import { WORKLIST_PAGE_SIZE } from '@/features/platform/lib/worklistPagination'

export const LAB_TEST_LIMIT = WORKLIST_PAGE_SIZE

/** Page of the catalog plus counts. Kept small so it stays far under the GraphQL cost limit. */
export function labTestCatalogQuery(skip: number) {
  return `
    query LabTestCatalog($where: LabTestWhereInput!, $all: LabTestWhereInput!, $active: LabTestWhereInput!, $inactive: LabTestWhereInput!) {
      labTests(where: $where, orderBy: [{ name: asc }, { id: asc }], take: ${LAB_TEST_LIMIT}, skip: ${skip}) {
        id code name category specimenType turnaroundHours active
      }
      labTestsCount(where: $where)
      all: labTestsCount(where: $all)
      active: labTestsCount(where: $active)
      inactive: labTestsCount(where: $inactive)
      authenticatedItem { ... on User { id role { canAccessAllClinicalData } } }
    }
  `
}

/** One chunk of the category scan, run as its own operation. */
export function labTestCategoriesQuery(skip: number) {
  return `
    query LabTestCategories {
      labTests(where: { category: { not: { equals: "" } } }, orderBy: [{ category: asc }, { id: asc }], take: ${SCAN_CHUNK}, skip: ${skip}) { category }
    }
  `
}


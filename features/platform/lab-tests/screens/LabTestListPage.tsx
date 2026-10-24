import Link from 'next/link'
import { Search } from 'lucide-react'

import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { BoundedDataNotice } from '@/features/platform/components/BoundedDataNotice'
import { WorkspaceLoadError } from '@/features/platform/components/WorkspaceLoadError'
import {
  Board,
  BoardRow,
  Code,
  EmptyBoard,
  FilterBar,
  Pill,
  Readout,
  ReadoutStrip,
  SegmentedLinks,
  StatusTag,
  Track,
  WardBody,
  WardHeader,
  WardSection,
  fieldClass,
} from '@/features/platform/components/ward'
import { ActionGroup } from '@/features/platform/facilities/components/FormSheet'
import { getLabTestCatalog } from '../actions/labTestQueries'
import { setLabTestActive } from '../actions/labTestMutations'
import { LabTestSheet } from '../components/LabTestSheet'
import { normalizeLabTestFilters, type LabTestFilters } from '../lib/labTests'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const BASE = '/dashboard/platform/lab-tests'
const breadcrumbs = [
  { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
  { type: 'page' as const, label: 'Platform' },
  { type: 'page' as const, label: 'Lab tests' },
]

function hrefFor(filters: LabTestFilters, patch: Partial<LabTestFilters>) {
  const next = { ...filters, ...patch }
  const params = new URLSearchParams()
  if (next.status !== 'active') params.set('status', next.status)
  if (next.category) params.set('category', next.category)
  if (next.search) params.set('search', next.search)
  const query = params.toString()
  return query ? `${BASE}?${query}` : BASE
}

export async function LabTestListPage({ searchParams }: { searchParams: SearchParams }) {
  const filters = normalizeLabTestFilters(await searchParams)
  const response = await getLabTestCatalog(filters)
  if (!response.success) {
    return <WorkspaceLoadError title="Lab tests" description="The lab test catalog may be unavailable for this session." breadcrumbs={breadcrumbs} />
  }
  const data = response.data
  const canManage = data.authenticatedItem?.role?.canAccessAllClinicalData === true
  const tests = data.labTests
  const categories = filters.category && !data.categories.includes(filters.category) ? [filters.category, ...data.categories] : data.categories

  return (
    <PageContainer
      title="Lab tests"
      breadcrumbs={breadcrumbs}
      header={<WardHeader
        title="Lab tests"
        tone={data.active > 0 ? 'ok' : 'idle'}
        meta={`${data.all} test${data.all === 1 ? '' : 's'}`}
        actions={canManage ? <LabTestSheet categories={data.categories} /> : undefined}
      />}
    >
      <WardBody>
        <ReadoutStrip>
          <Readout label="Active" tone="ok" value={data.active} />
          <Readout label="Inactive" tone="idle" value={data.inactive} />
          <Readout label="Categories" value={data.categories.length} />
        </ReadoutStrip>

        <SegmentedLinks
          label="Lab test status"
          options={[
            { href: hrefFor(filters, { status: 'active' }), label: 'Active', active: filters.status === 'active', count: data.active, tone: 'ok' },
            { href: hrefFor(filters, { status: 'inactive' }), label: 'Inactive', active: filters.status === 'inactive', count: data.inactive, tone: 'idle' },
            { href: hrefFor(filters, { status: 'all' }), label: 'All', active: filters.status === 'all', count: data.all },
          ]}
        />

        <FilterBar>
          {filters.status !== 'active' && <input type="hidden" name="status" value={filters.status} />}
          <label className="relative w-full sm:min-w-56 sm:flex-1">
            <span className="sr-only">Search name, code, category or specimen</span>
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
            <input className={`${fieldClass} pl-9`} name="search" defaultValue={filters.search} placeholder="Name, code, specimen…" />
          </label>
          <label className="w-full sm:w-48">
            <span className="sr-only">Category</span>
            <select name="category" defaultValue={filters.category} className={fieldClass}>
              <option value="">All categories</option>
              {categories.map(category => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
          <Track>
            <Pill type="submit" variant="primary">Apply</Pill>
            <Pill asChild variant="plain"><Link href={BASE}>Reset</Link></Pill>
          </Track>
        </FilterBar>

        <BoundedDataNotice messages={data.labTestsCount > tests.length ? [`Showing ${tests.length} of ${data.labTestsCount}. Narrow the filters to see more.`] : undefined} />

        <WardSection title="Catalog" count={data.labTestsCount} id="lab-test-catalog">
          {!tests.length ? <EmptyBoard title="No matching lab tests" /> : (
            <Board>
              {tests.map(test => {
                const status = test.active ? 'active' : 'inactive'
                return (
                  <BoardRow
                    key={test.id}
                    tone={test.active ? 'ok' : 'idle'}
                    status={status}
                    title={<>{test.name}{test.code && <Code className="ml-2">{test.code}</Code>}</>}
                    meta={<>
                      <StatusTag status={status} tone={test.active ? 'ok' : 'idle'} />
                      <span>{test.category || 'Uncategorized'}</span>
                      <span>{test.specimenType || 'Specimen not set'}</span>
                      <span className="tabular-nums">{test.turnaroundHours != null ? `${test.turnaroundHours}h turnaround` : 'Turnaround not set'}</span>
                    </>}
                    aside={canManage ? (
                      <ActionGroup
                        actions={[test.active
                          ? { label: 'Deactivate', action: setLabTestActive.bind(null, test.id, false) }
                          : { label: 'Activate', action: setLabTestActive.bind(null, test.id, true) }]}
                      >
                        <LabTestSheet bare test={test} categories={data.categories} />
                      </ActionGroup>
                    ) : undefined}
                  />
                )
              })}
            </Board>
          )}
        </WardSection>
      </WardBody>
    </PageContainer>
  )
}

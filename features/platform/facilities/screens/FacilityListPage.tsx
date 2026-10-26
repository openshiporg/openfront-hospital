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
  toneForStatus,
} from '@/features/platform/components/ward'
import { getFacilityList } from '../actions/facilityQueries'
import { setStructureStatus } from '../actions/structureMutations'
import { ActionGroup } from '../components/FormSheet'
import { FacilitySheet } from '../components/StructureSheets'
import { FACILITY_TYPES, normalizeFacilityFilters, optionLabel, type FacilityFilters } from '../lib/structure'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const BASE = '/dashboard/platform/facilities'
const breadcrumbs = [
  { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
  { type: 'page' as const, label: 'Platform' },
  { type: 'page' as const, label: 'Facilities' },
]

function hrefFor(filters: FacilityFilters, patch: Partial<FacilityFilters>) {
  const next = { ...filters, ...patch }
  const params = new URLSearchParams()
  if (next.status !== 'active') params.set('status', next.status)
  if (next.facilityType !== 'all') params.set('type', next.facilityType)
  if (next.search) params.set('search', next.search)
  const query = params.toString()
  return query ? `${BASE}?${query}` : BASE
}

export async function FacilityListPage({ searchParams }: { searchParams: SearchParams }) {
  const filters = normalizeFacilityFilters(await searchParams)
  const response = await getFacilityList(filters)
  if (!response.success) {
    return <WorkspaceLoadError title="Facilities" description="Facilities, departments or provider counts may be unavailable for this session." breadcrumbs={breadcrumbs} />
  }
  const data = response.data
  const canManage = data.authenticatedItem?.role?.canAccessAllClinicalData === true
  const facilities = data.facilities

  return (
    <PageContainer
      title="Facilities"
      breadcrumbs={breadcrumbs}
      header={<WardHeader
        title="Facilities"
        tone={data.active > 0 ? 'ok' : 'idle'}
        meta={`${data.all} facilit${data.all === 1 ? 'y' : 'ies'}`}
        actions={canManage ? <FacilitySheet /> : undefined}
      />}
    >
      <WardBody>
        <ReadoutStrip>
          <Readout label="Active" tone="ok" value={data.active} />
          <Readout label="Inactive" tone="idle" value={data.inactive} />
        </ReadoutStrip>

        <SegmentedLinks
          label="Facility status"
          options={[
            { href: hrefFor(filters, { status: 'active' }), label: 'Active', active: filters.status === 'active', count: data.active, tone: 'ok' },
            { href: hrefFor(filters, { status: 'inactive' }), label: 'Inactive', active: filters.status === 'inactive', count: data.inactive, tone: 'idle' },
            { href: hrefFor(filters, { status: 'all' }), label: 'All', active: filters.status === 'all', count: data.all },
          ]}
        />

        <FilterBar>
          {filters.status !== 'active' && <input type="hidden" name="status" value={filters.status} />}
          <label className="relative w-full sm:min-w-56 sm:flex-1">
            <span className="sr-only">Search name, slug, city, region or postal code</span>
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
            <input className={`${fieldClass} pl-9`} name="search" defaultValue={filters.search} placeholder="Name, slug, city…" />
          </label>
          <label className="w-full sm:w-44">
            <span className="sr-only">Facility type</span>
            <select name="type" defaultValue={filters.facilityType} className={fieldClass}>
              <option value="all">All types</option>
              {FACILITY_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </label>
          <Track>
            <Pill type="submit" variant="primary">Apply</Pill>
            <Pill asChild variant="plain"><Link href={BASE}>Reset</Link></Pill>
          </Track>
        </FilterBar>

        <BoundedDataNotice messages={data.facilitiesCount > facilities.length ? [`Showing ${facilities.length} of ${data.facilitiesCount}. Narrow the filters to see more.`] : undefined} />

        <WardSection title="Facilities" count={data.facilitiesCount} id="facility-list">
          {!facilities.length ? <EmptyBoard title="No matching facilities" /> : (
            <Board>
              {facilities.map(facility => {
                const location = [facility.city, facility.region].filter(Boolean).join(', ')
                return (
                  <BoardRow
                    key={facility.id}
                    tone={toneForStatus(facility.status)}
                    status={facility.status}
                    title={<Link href={`${BASE}/${facility.id}`} className="hover:underline">{facility.name}</Link>}
                    meta={<>
                      <StatusTag status={facility.status} />
                      <span>{optionLabel(FACILITY_TYPES, facility.facilityType)}</span>
                      <Code>{facility.slug}</Code>
                      <span>{location || 'No city'}</span>
                      <span className="tabular-nums ">{facility.timeZone}</span>
                      <span className="tabular-nums">{facility.departmentsCount} dept{facility.departmentsCount === 1 ? '' : 's'}</span>
                      <span className="tabular-nums">{facility.providersCount} provider{facility.providersCount === 1 ? '' : 's'}</span>
                    </>}
                    aside={
                      <ActionGroup
                        actions={canManage ? [facility.status === 'active'
                          ? { label: 'Deactivate', action: setStructureStatus.bind(null, 'facility', facility.id, 'inactive') }
                          : { label: 'Activate', action: setStructureStatus.bind(null, 'facility', facility.id, 'active') }] : []}
                      >
                        <Pill asChild size="sm"><Link href={`${BASE}/${facility.id}`}>Open</Link></Pill>
                      </ActionGroup>
                    }
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

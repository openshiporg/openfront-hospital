import Link from 'next/link'
import { Search } from 'lucide-react'

import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { WorkspaceLoadError } from '@/features/platform/components/WorkspaceLoadError'
import {
  Board,
  BoardRow,
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
  fieldClass,
} from '@/features/platform/components/ward'
import { getProviderWorkspace, normalizeProviderFilters } from '../actions/queries'
import { providerStatusLabel, providerTone, type ProviderFilters } from '../actions/types'
import { ProviderSheet } from '../components/ProviderSheet'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const breadcrumbs = [
  { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
  { type: 'page' as const, label: 'Platform' },
  { type: 'page' as const, label: 'Providers' },
]

function hrefWith(filters: ProviderFilters, patch: Partial<ProviderFilters>) {
  const next = { ...filters, ...patch }
  const params = new URLSearchParams()
  if (next.status !== 'all') params.set('status', next.status)
  if (next.facility) params.set('facility', next.facility)
  if (next.specialty) params.set('specialty', next.specialty)
  if (next.search) params.set('search', next.search)
  const qs = params.toString()
  return `/dashboard/platform/providers${qs ? `?${qs}` : ''}`
}

export async function ProviderListPage({ searchParams }: { searchParams: SearchParams }) {
  const filters = normalizeProviderFilters(await searchParams)
  const response = await getProviderWorkspace(filters)
  if (!response.success) {
    return <WorkspaceLoadError title="Providers" description="Providers, counts, or filters may be unavailable for this session." breadcrumbs={breadcrumbs} />
  }
  const { providers, counts, specialties, facilities, appointmentTypes } = response.data
  const filtered = Boolean(filters.facility || filters.specialty || filters.search)

  return (
    <PageContainer
      title="Providers"
      breadcrumbs={breadcrumbs}
      header={
        <WardHeader
          title="Providers"
          tone={counts.active > 0 ? 'ok' : 'idle'}
          meta={`${counts.all} provider${counts.all === 1 ? '' : 's'}${filtered ? ' matching' : ''}`}
          actions={<ProviderSheet mode="create" facilities={facilities} appointmentTypes={appointmentTypes} />}
        />
      }
    >
      <WardBody>
        <ReadoutStrip>
          <Readout label="Active" tone="ok" value={counts.active} />
          <Readout label="Unavailable" tone="warn" value={counts.unavailable} />
          <Readout label="Inactive" tone="idle" value={counts.inactive} />
        </ReadoutStrip>

        <SegmentedLinks
          label="Provider status"
          options={[
            { href: hrefWith(filters, { status: 'all' }), label: 'All', count: counts.all, active: filters.status === 'all' },
            { href: hrefWith(filters, { status: 'active' }), label: 'Active', tone: 'ok', count: counts.active, active: filters.status === 'active' },
            { href: hrefWith(filters, { status: 'unavailable' }), label: 'Unavailable', tone: 'warn', count: counts.unavailable, active: filters.status === 'unavailable' },
            { href: hrefWith(filters, { status: 'inactive' }), label: 'Inactive', tone: 'idle', count: counts.inactive, active: filters.status === 'inactive' },
          ]}
        />

        <FilterBar action="/dashboard/platform/providers" method="get">
          {filters.status !== 'all' && <input type="hidden" name="status" value={filters.status} />}
          <label className="relative w-full sm:min-w-56 sm:flex-1">
            <span className="sr-only">Search providers</span>
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
            <input className={`${fieldClass} pl-9`} name="search" defaultValue={filters.search} placeholder="Name, specialty, credentials…" />
          </label>
          <label className="w-[calc(50%-0.25rem)] sm:w-44">
            <span className="sr-only">Facility</span>
            <select name="facility" defaultValue={filters.facility} className={fieldClass}>
              <option value="">All facilities</option>
              {facilities.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </label>
          <label className="w-[calc(50%-0.25rem)] sm:w-44">
            <span className="sr-only">Specialty</span>
            <select name="specialty" defaultValue={filters.specialty} className={fieldClass}>
              <option value="">All specialties</option>
              {specialties.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <Track>
            <Pill type="submit">Apply</Pill>
            {filtered && <Pill asChild variant="plain"><Link href={hrefWith(filters, { facility: '', specialty: '', search: '' })}>Clear</Link></Pill>}
          </Track>
        </FilterBar>

        {providers.length === 0 ? (
          <EmptyBoard title={filtered || filters.status !== 'all' ? 'No providers match these filters' : 'No providers yet'} />
        ) : (
          <Board>
            {providers.map((p) => (
              <BoardRow
                key={p.id}
                tone={providerTone(p.status)}
                status={providerStatusLabel(p.status)}
                title={<Link href={`/dashboard/platform/providers/${p.id}`} className="hover:underline">{p.displayName || `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || 'Unnamed provider'}</Link>}
                meta={
                  <>
                    <span>{p.specialty || 'No specialty'}</span>
                    {p.credentials && <span className="font-mono">{p.credentials}</span>}
                    <span>{p.appointmentTypesCount ?? 0} visit type{p.appointmentTypesCount === 1 ? '' : 's'}</span>
                    <span>{p.upcomingBlocks ?? 0} upcoming block{p.upcomingBlocks === 1 ? '' : 's'}</span>
                    {p.facilities && p.facilities.length > 0 && <span>{p.facilities.map((f) => f.name).filter(Boolean).join(', ')}</span>}
                  </>
                }
                aside={
                  <>
                    <StatusTag status={providerStatusLabel(p.status)} tone={providerTone(p.status)} />
                    <Track><Pill asChild size="sm"><Link href={`/dashboard/platform/providers/${p.id}`}>Open</Link></Pill></Track>
                  </>
                }
              />
            ))}
          </Board>
        )}
        {counts.filtered > providers.length && <p className="text-xs text-muted-foreground">Showing {providers.length} of {counts.filtered}</p>}
      </WardBody>
    </PageContainer>
  )
}

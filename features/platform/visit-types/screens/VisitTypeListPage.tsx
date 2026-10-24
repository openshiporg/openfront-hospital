import Link from 'next/link'
import { Search } from 'lucide-react'

import { PageContainer } from '@/features/dashboard/components/PageContainer'
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
  fieldClass,
} from '@/features/platform/components/ward'
import { getVisitTypeWorkspace, normalizeVisitTypeFilters, type VisitTypeFilters } from '../actions/queries'
import { formatCents, visitStatusLabel, visitTone } from '../actions/types'
import { VisitTypeSheet } from '../components/VisitTypeSheet'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const breadcrumbs = [
  { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
  { type: 'page' as const, label: 'Platform' },
  { type: 'page' as const, label: 'Visit types' },
]

function hrefWith(filters: VisitTypeFilters, patch: Partial<VisitTypeFilters>) {
  const next = { ...filters, ...patch }
  const params = new URLSearchParams()
  if (next.status !== 'all') params.set('status', next.status)
  if (next.search) params.set('search', next.search)
  const qs = params.toString()
  return `/dashboard/platform/visit-types${qs ? `?${qs}` : ''}`
}

export async function VisitTypeListPage({ searchParams }: { searchParams: SearchParams }) {
  const filters = normalizeVisitTypeFilters(await searchParams)
  const response = await getVisitTypeWorkspace(filters)
  if (!response.success) {
    return <WorkspaceLoadError title="Visit types" description="Visit types, counts, or providers may be unavailable for this session." breadcrumbs={breadcrumbs} />
  }
  const { visitTypes, counts, providers } = response.data

  return (
    <PageContainer
      title="Visit types"
      breadcrumbs={breadcrumbs}
      header={
        <WardHeader
          title="Visit types"
          tone={counts.bookable > 0 ? 'ok' : 'idle'}
          meta={`${counts.all} visit type${counts.all === 1 ? '' : 's'}`}
          actions={<VisitTypeSheet mode="create" providers={providers} />}
        />
      }
    >
      <WardBody>
        <ReadoutStrip>
          <Readout label="Bookable" tone="ok" value={counts.bookable} />
          <Readout label="Internal only" tone="info" value={counts.internal} />
          <Readout label="Paused" tone="warn" value={counts.paused} />
        </ReadoutStrip>

        <SegmentedLinks
          label="Visit type status"
          options={[
            { href: hrefWith(filters, { status: 'all' }), label: 'All', count: counts.all, active: filters.status === 'all' },
            { href: hrefWith(filters, { status: 'bookable' }), label: 'Bookable', tone: 'ok', count: counts.bookable, active: filters.status === 'bookable' },
            { href: hrefWith(filters, { status: 'internal' }), label: 'Internal', tone: 'info', count: counts.internal, active: filters.status === 'internal' },
            { href: hrefWith(filters, { status: 'paused' }), label: 'Paused', tone: 'warn', count: counts.paused, active: filters.status === 'paused' },
          ]}
        />

        <FilterBar action="/dashboard/platform/visit-types" method="get">
          {filters.status !== 'all' && <input type="hidden" name="status" value={filters.status} />}
          <label className="relative w-full sm:min-w-56 sm:flex-1">
            <span className="sr-only">Search visit types</span>
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
            <input className={`${fieldClass} pl-9`} name="search" defaultValue={filters.search} placeholder="Name, slug, description…" />
          </label>
          <Track>
            <Pill type="submit">Search</Pill>
            {filters.search && <Pill asChild variant="plain"><Link href={hrefWith(filters, { search: '' })}>Clear</Link></Pill>}
          </Track>
        </FilterBar>

        {visitTypes.length === 0 ? (
          <EmptyBoard title={filters.search || filters.status !== 'all' ? 'No visit types match these filters' : 'No visit types yet'} />
        ) : (
          <Board>
            {visitTypes.map((t) => (
              <BoardRow
                key={t.id}
                tone={visitTone(t.status)}
                status={visitStatusLabel(t.status)}
                title={<Link href={`/dashboard/platform/visit-types/${t.id}`} className="hover:underline">{t.name || 'Unnamed visit type'}</Link>}
                meta={
                  <>
                    <Code>/{t.slug}</Code>
                    <span>{t.durationMinutes ?? 0} min</span>
                    <span>Buffers {t.bufferBeforeMinutes ?? 0}/{t.bufferAfterMinutes ?? 0} min</span>
                    <span>{t.formattedPrice ?? formatCents(t.priceCents)}</span>
                    <span>{t.providersCount ?? 0} provider{t.providersCount === 1 ? '' : 's'}</span>
                    <span>{t.upcomingCount ?? 0} upcoming</span>
                  </>
                }
                aside={
                  <>
                    <StatusTag status={visitStatusLabel(t.status)} tone={visitTone(t.status)} />
                    <Track><Pill asChild size="sm"><Link href={`/dashboard/platform/visit-types/${t.id}`}>Open</Link></Pill></Track>
                  </>
                }
              />
            ))}
          </Board>
        )}
        {counts.filtered > visitTypes.length && <p className="text-xs text-muted-foreground">Showing {visitTypes.length} of {counts.filtered}</p>}
      </WardBody>
    </PageContainer>
  )
}

import Link from 'next/link'
import { ChevronRight, Plus, Search } from 'lucide-react'

import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { BoundedDataNotice } from '@/features/platform/components/BoundedDataNotice'
import { WorkspaceLoadError } from '@/features/platform/components/WorkspaceLoadError'
import {
  Board,
  BoardRow,
  EmptyBoard,
  Facts,
  FilterBar,
  Pill,
  Readout,
  ReadoutStrip,
  StatusDot,
  Track,
  WardBody,
  WardHeader,
  WardSection,
  fieldClass,
  type WardTone,
} from '@/features/platform/components/ward'
import { getScheduleWorkspace, normalizeScheduleFilters, type ScheduleBlock } from '../actions/schedules'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const typeTone: Record<string, WardTone> = {
  available: 'ok',
  unavailable: 'bad',
  on_call: 'info',
  admin_time: 'idle',
}

const typeLabels: Record<string, string> = {
  available: 'Available',
  unavailable: 'Unavailable',
  on_call: 'On call',
  admin_time: 'Admin time',
}

function formatDateTime(value: string, timeZone?: string | null) {
  if (!timeZone) return 'Facility time zone unavailable'
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    timeZoneName: 'short',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function durationLabel(block: ScheduleBlock) {
  const minutes = Math.max(0, Math.round((new Date(block.endsAt).getTime() - new Date(block.startsAt).getTime()) / 60_000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}

function BlockDetails({ block }: { block: ScheduleBlock }) {
  return (
    <details className="group min-w-0">
      <summary className="w-fit cursor-pointer list-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <Track><Pill asChild size="sm" variant="plain"><span><ChevronRight className="transition-transform group-open:rotate-90" aria-hidden />Details</span></Pill></Track>
      </summary>
      <Facts
        className="mt-2 max-w-xl rounded-lg border bg-muted/30 px-3"
        items={[
          { label: 'Ends', value: formatDateTime(block.endsAt, block.facility?.timeZone) },
          { label: 'Duration', value: durationLabel(block), mono: true },
          { label: 'Recurrence', value: block.recurrenceRule || 'Single block', mono: Boolean(block.recurrenceRule) },
          { label: 'Notes', value: block.notes || 'None' },
        ]}
      />
    </details>
  )
}

function BlockActions({ block }: { block: ScheduleBlock }) {
  return (
    <Track>
      <Pill asChild size="sm"><Link href={`/dashboard/provider-schedule-blocks/${block.id}`}>Open</Link></Pill>
      {block.provider?.id && <Pill asChild size="sm" variant="plain"><Link href={`/dashboard/providers/${block.provider.id}`}>Provider</Link></Pill>}
      {block.facility?.id && <Pill asChild size="sm" variant="plain"><Link href={`/dashboard/facilities/${block.facility.id}`}>Facility</Link></Pill>}
    </Track>
  )
}

export async function ScheduleListPage({ searchParams }: { searchParams: SearchParams }) {
  const filters = normalizeScheduleFilters(await searchParams)
  const breadcrumbs = [{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Provider schedules' }]
  const response = await getScheduleWorkspace(filters)
  if (!response.success) {
    return <WorkspaceLoadError title="Provider schedules" description="Schedule blocks, counts, or notes may be unavailable for this session." breadcrumbs={breadcrumbs} />
  }

  const data = response.data
  const blocks = data.providerScheduleBlocks

  return (
    <PageContainer
      title="Provider schedules"
      breadcrumbs={breadcrumbs}
      header={<WardHeader
        title="Provider schedules"
        tone={data.available > 0 ? 'ok' : 'idle'}
        meta={`${data.all} block${data.all === 1 ? '' : 's'}`}
        actions={<Track><Pill asChild variant="primary"><Link href="/dashboard/provider-schedule-blocks/create"><Plus aria-hidden />Add block</Link></Pill></Track>}
      />}
    >
      <WardBody>
        <ReadoutStrip>
          <Readout label="Available" tone="ok" value={data.available} />
          <Readout label="On call" tone="info" value={data.onCall} />
          <Readout label="Unavailable" tone="bad" value={data.unavailable} />
          <Readout label="Admin time" tone="idle" value={data.adminTime} />
        </ReadoutStrip>

        <FilterBar>
          <label className="relative w-full sm:min-w-56 sm:flex-1">
            <span className="sr-only">Search provider, specialty, facility, or location</span>
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
            <input className={`${fieldClass} pl-9`} name="search" defaultValue={filters.search} placeholder="Provider, specialty, facility…" />
          </label>
          <label className="w-[calc(50%-0.25rem)] sm:w-40">
            <span className="sr-only">Block type</span>
            <select name="type" defaultValue={filters.blockType} className={fieldClass}>
              <option value="all">All types</option>
              {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="w-[calc(50%-0.25rem)] sm:w-44">
            <span className="sr-only">Time range</span>
            <select name="range" defaultValue={filters.range} className={fieldClass}>
              <option value="upcoming">Current and upcoming</option>
              <option value="past">Past</option>
              <option value="all">All dates</option>
            </select>
          </label>
          <label className="w-full sm:w-40">
            <span className="sr-only">Sort schedules</span>
            <select name="sort" defaultValue={filters.sort} className={fieldClass}>
              <option value="start_asc">Earliest first</option>
              <option value="start_desc">Latest first</option>
            </select>
          </label>
          <Track>
            <Pill type="submit" variant="primary">Apply</Pill>
            <Pill asChild variant="plain"><Link href="/dashboard/platform/schedules">Reset</Link></Pill>
          </Track>
        </FilterBar>

        <BoundedDataNotice messages={data.providerScheduleBlocksCount > blocks.length ? [`Showing ${blocks.length} of ${data.providerScheduleBlocksCount}. Narrow the filters to see more.`] : undefined} />

        <WardSection title="Availability" count={data.providerScheduleBlocksCount} id="schedule-blocks">
          {!blocks.length ? <EmptyBoard title="No matching schedule blocks" /> : (
            <Board>
              {blocks.map(block => {
                const tone = typeTone[block.blockType] || 'idle'
                const label = typeLabels[block.blockType] || block.blockType
                return (
                  <BoardRow
                    key={block.id}
                    tone={tone}
                    status={label}
                    title={<>{block.provider?.displayName || 'Restricted provider'}{block.provider?.specialty && <span className="font-normal text-muted-foreground"> · {block.provider.specialty}</span>}</>}
                    meta={<>
                      <span className="inline-flex items-baseline gap-1.5 font-medium text-foreground"><StatusDot tone={tone} className="size-1.5 -translate-y-[0.1em] shadow-none" />{label}</span>
                      <span className="tabular-nums text-foreground">{formatDateTime(block.startsAt, block.facility?.timeZone)}</span>
                      <span className="font-mono tabular-nums">{durationLabel(block)}</span>
                      <span>{block.facility?.name || 'Restricted facility'}</span>
                      <span>{block.locationName || 'Location not set'}</span>
                    </>}
                    aside={<BlockActions block={block} />}
                  >
                    <BlockDetails block={block} />
                  </BoardRow>
                )
              })}
            </Board>
          )}
        </WardSection>
      </WardBody>
    </PageContainer>
  )
}

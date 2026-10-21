import Link from 'next/link'
import { CalendarClock, CircleOff, Clock3, Plus, Radio, Search } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { BoundedDataNotice } from '@/features/platform/components/BoundedDataNotice'
import { WorkspaceLoadError } from '@/features/platform/components/WorkspaceLoadError'
import { getScheduleWorkspace, normalizeScheduleFilters, type ScheduleBlock } from '../actions/schedules'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

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
    <details className="group">
      <summary className="cursor-pointer rounded-sm text-sm font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        Schedule details
      </summary>
      <dl className="mt-3 grid gap-3 rounded-lg border bg-muted/20 p-3 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-muted-foreground">Ends</dt><dd>{formatDateTime(block.endsAt, block.facility?.timeZone)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Duration</dt><dd>{durationLabel(block)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Recurrence evidence</dt><dd>{block.recurrenceRule || 'Single block'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Operator notes</dt><dd>{block.notes || 'No visible notes'}</dd></div>
      </dl>
    </details>
  )
}

function BlockActions({ block }: { block: ScheduleBlock }) {
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-md border px-3 py-2 text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">Actions</summary>
      <div className="mt-2 flex min-w-44 flex-col gap-1 rounded-md border bg-popover p-1 text-sm shadow-sm md:absolute md:right-0 md:z-10">
        <Link className="rounded px-2 py-1.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={`/dashboard/provider-schedule-blocks/${block.id}`}>Open schedule record</Link>
        {block.provider?.id && <Link className="rounded px-2 py-1.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={`/dashboard/providers/${block.provider.id}`}>Open provider</Link>}
        {block.facility?.id && <Link className="rounded px-2 py-1.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={`/dashboard/facilities/${block.facility.id}`}>Open facility</Link>}
      </div>
    </details>
  )
}

export async function ScheduleListPage({ searchParams }: { searchParams: SearchParams }) {
  const filters = normalizeScheduleFilters(await searchParams)
  const breadcrumbs = [{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Provider schedules' }]
  const response = await getScheduleWorkspace(filters)
  if (!response.success) {
    return <WorkspaceLoadError title="Provider schedules" description="Schedule blocks, scoped counts, or protected notes may be unavailable for this session." breadcrumbs={breadcrumbs} />
  }

  const data = response.data
  const blocks = data.providerScheduleBlocks
  const metrics = [
    { label: 'Accessible blocks', value: data.all, icon: CalendarClock },
    { label: 'Available', value: data.available, icon: Clock3 },
    { label: 'Unavailable', value: data.unavailable, icon: CircleOff },
    { label: 'On call', value: data.onCall, icon: Radio },
  ]

  return (
    <PageContainer
      title="Provider schedules"
      breadcrumbs={breadcrumbs}
      header={<div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-sm font-medium uppercase tracking-[.2em] text-muted-foreground">Scheduling operations</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Provider schedule workspace</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Review facility-time availability and exceptions. These blocks support appointment coordination; they do not establish clinical staffing, credentialing, or care authority.</p></div><Button asChild><Link href="/dashboard/provider-schedule-blocks/create"><Plus className="mr-2 size-4" />Add schedule block</Link></Button></div>}
    >
      <div className="space-y-5 px-4 pb-8 md:px-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(({ label, value, icon: Icon }) => <Card key={label}><CardHeader className="pb-2"><CardDescription className="flex items-center gap-2"><Icon className="size-4" aria-hidden />{label}</CardDescription><CardTitle>{value}</CardTitle></CardHeader></Card>)}
        </div>

        <Card>
          <CardHeader><CardTitle>Find schedule blocks</CardTitle><CardDescription>Search and filters are bounded to records this session can access. Empty results do not prove that no other schedule exists.</CardDescription></CardHeader>
          <CardContent>
            <form className="grid gap-3 lg:grid-cols-[minmax(14rem,1fr)_repeat(3,minmax(10rem,auto))_auto]">
              <label className="relative"><span className="sr-only">Search provider, specialty, facility, or location</span><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden /><Input className="pl-9" name="search" defaultValue={filters.search} placeholder="Provider, specialty, facility…" /></label>
              <label><span className="sr-only">Block type</span><select name="type" defaultValue={filters.blockType} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="all">All block types</option>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label><span className="sr-only">Time range</span><select name="range" defaultValue={filters.range} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="upcoming">Current and upcoming</option><option value="past">Past blocks</option><option value="all">All dates</option></select></label>
              <label><span className="sr-only">Sort schedules</span><select name="sort" defaultValue={filters.sort} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="start_asc">Start: earliest first</option><option value="start_desc">Start: latest first</option></select></label>
              <div className="flex gap-2"><Button type="submit" variant="outline">Apply</Button><Button asChild type="button" variant="ghost"><Link href="/dashboard/platform/schedules">Reset</Link></Button></div>
            </form>
          </CardContent>
        </Card>

        <BoundedDataNotice messages={data.providerScheduleBlocksCount > blocks.length ? [`Showing ${blocks.length} of ${data.providerScheduleBlocksCount} matching schedule blocks. Narrow the filters to reach records outside this 100-row view.`] : undefined} />

        <Card>
          <CardHeader><CardTitle>Schedule blocks</CardTitle><CardDescription>{data.providerScheduleBlocksCount} matching accessible record{data.providerScheduleBlocksCount === 1 ? '' : 's'} · facility-local times</CardDescription></CardHeader>
          <CardContent>
            {!blocks.length ? <div className="rounded-lg border border-dashed p-8 text-center"><CalendarClock className="mx-auto size-6 text-muted-foreground" aria-hidden /><p className="mt-3 font-medium">No accessible schedule blocks match</p><p className="mt-1 text-sm text-muted-foreground">Adjust the bounded filters or confirm your facility scheduling scope with an administrator.</p></div> : <>
              <div className="hidden rounded-lg border md:block"><Table><TableHeader><TableRow><TableHead>Provider</TableHead><TableHead>Facility</TableHead><TableHead>Start</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{blocks.map(block => <TableRow key={block.id}><TableCell className="align-top"><p className="font-medium">{block.provider?.displayName || 'Restricted provider'}</p><p className="text-xs text-muted-foreground">{block.provider?.specialty || 'Specialty not visible'}</p><div className="mt-2"><BlockDetails block={block} /></div></TableCell><TableCell className="align-top">{block.facility?.name || 'Restricted facility'}<p className="text-xs text-muted-foreground">{block.locationName || 'Location not set'}</p></TableCell><TableCell className="align-top">{formatDateTime(block.startsAt, block.facility?.timeZone)}</TableCell><TableCell className="align-top"><Badge variant="secondary">{typeLabels[block.blockType] || block.blockType}</Badge></TableCell><TableCell className="align-top text-right"><BlockActions block={block} /></TableCell></TableRow>)}</TableBody></Table></div>
              <div className="space-y-3 md:hidden">{blocks.map(block => <article key={block.id} className="space-y-3 rounded-lg border p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-medium">{block.provider?.displayName || 'Restricted provider'}</h2><p className="text-sm text-muted-foreground">{block.facility?.name || 'Restricted facility'}</p></div><Badge variant="secondary">{typeLabels[block.blockType] || block.blockType}</Badge></div><p className="text-sm">{formatDateTime(block.startsAt, block.facility?.timeZone)}</p><p className="text-xs text-muted-foreground">{block.locationName || 'Location not set'} · {durationLabel(block)}</p><BlockDetails block={block} /><BlockActions block={block} /></article>)}</div>
            </>}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}

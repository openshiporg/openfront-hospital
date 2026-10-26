'use client'

import { FacilitySearchField } from '@/features/platform/facilities/components/FacilitySearchField'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import {
  Board,
  EmptyBoard,
  FilterBar,
  Notice,
  Pill,
  Readout,
  ReadoutStrip,
  Segmented,
  Track,
  WardBody,
  WardHeader,
  fieldClass,
  labelClass,
} from '@/features/platform/components/ward'
import { AppointmentDetailsCard } from '../components/AppointmentDetailsCard'
import { AppointmentStatusTabs } from '../components/AppointmentStatusTabs'
import type { AppointmentQueueItem } from '../actions/appointments'

const views = [
  { value: 'today', label: 'Facility day' },
  { value: 'needs_action', label: 'Needs action' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'all', label: 'All' },
] as const

export function AppointmentListPageClient({
  initialData,
  statusCounts,
  error,
  facilitiesCount,
  selectedFacility,
}: {
  initialData: { items: AppointmentQueueItem[]; count: number; truncated?: boolean; notice?: string | null; nextCursor?: string | null; requiresFacility?: boolean }
  facilitiesCount?: number
  selectedFacility?: { id: string; name: string; timeZone: string } | null
  statusCounts: Record<string, number>
  error?: string | null
}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const safeSearchParams = searchParams ?? new URLSearchParams()
  const activeView = safeSearchParams.get('view') || 'today'
  const activeCount = (statusCounts.requested || 0) + (statusCounts.confirmed || 0) + (statusCounts.checked_in || 0) + (statusCounts.in_visit || 0)

  const setView = (view: string) => {
    const params = new URLSearchParams(safeSearchParams.toString())
    params.delete('cursor')
    if (view === 'today') params.delete('view')
    else params.set('view', view)
    router.push(`${pathname}?${params.toString()}`)
  }

  const pageHref = (cursor: string | null) => {
    const params = new URLSearchParams(safeSearchParams.toString())
    if (cursor) params.set('cursor', cursor)
    else params.delete('cursor')
    return `${pathname}?${params.toString()}`
  }

  const header = (
    <WardHeader
      title="Appointments"
      tone={(statusCounts.requested || 0) > 0 ? 'warn' : 'accent'}
      status={(statusCounts.requested || 0) > 0 ? 'Requests waiting' : undefined}
      meta={selectedFacility ? `${selectedFacility.name} · ${selectedFacility.timeZone}` : `${activeCount} active`}
    />
  )

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Appointments' },
  ]

  return (
    <PageContainer title="Appointments" header={header} breadcrumbs={breadcrumbs}>
      <WardBody>
        <ReadoutStrip>
          <Readout label="Requested" tone={(statusCounts.requested || 0) > 0 ? 'warn' : 'idle'} value={statusCounts.requested || 0} />
          <Readout label="Confirmed" tone="info" value={statusCounts.confirmed || 0} />
          <Readout label="Checked in" tone="info" value={statusCounts.checked_in || 0} />
          <Readout label="In visit" tone="accent" value={statusCounts.in_visit || 0} />
        </ReadoutStrip>

        <div className="flex min-w-0 flex-col gap-3">
          <Segmented label="Appointment view" value={activeView} onChange={setView} options={views} />

          <FilterBar>
            {safeSearchParams.get('status') && <input type="hidden" name="status" value={safeSearchParams.get('status') || ''} />}
            {activeView !== 'today' && <input type="hidden" name="view" value={activeView} />}
            <div className="w-full lg:w-[28rem]">
              <FacilitySearchField key={selectedFacility?.id || 'none'} id="appointment-facility" required={activeView === 'today'} initialOption={selectedFacility} accessibleFacilityCount={facilitiesCount} />
            </div>
            {activeView === 'today' && (
              <label className={`${labelClass} w-full sm:w-44`}>
                <span>Date{selectedFacility?.timeZone && <span className="tabular-nums font-normal"> · {selectedFacility.timeZone}</span>}</span>
                <input type="date" name="date" defaultValue={safeSearchParams.get('date') || ''} className={fieldClass} />
              </label>
            )}
            <label className="relative w-full sm:min-w-56 sm:flex-1">
              <span className="sr-only">Search appointments</span>
              <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
              <input className={`${fieldClass} pl-9`} name="search" defaultValue={safeSearchParams.get('search') || ''} placeholder="Patient, reference, provider…" />
            </label>
            <label className="w-full sm:w-44">
              <span className="sr-only">Sort appointments</span>
              <select name="sort" defaultValue={safeSearchParams.get('sort') || 'start_asc'} className={fieldClass}>
                <option value="start_asc">Earliest first</option>
                <option value="start_desc">Latest first</option>
              </select>
            </label>
            <Track>
              <Pill type="submit" variant="primary">Apply</Pill>
              <Pill asChild variant="plain"><Link href="/dashboard/platform/appointments">Reset</Link></Pill>
            </Track>
          </FilterBar>

          <AppointmentStatusTabs statusCounts={statusCounts} />
        </div>

        {initialData.notice && <Notice tone="warn" role="status">{initialData.notice}</Notice>}

        <section className="flex min-w-0 flex-col gap-3">
          <nav className="flex min-w-0 flex-wrap items-center justify-between gap-2" aria-label="Appointment pages">
            <span className="tabular-nums text-xs  text-muted-foreground">
              {initialData.requiresFacility ? 'Facility required' : `${initialData.items.length} of ${initialData.count} appointments`}
            </span>
            {(safeSearchParams.has('cursor') || initialData.nextCursor) && (
              <Track>
                {safeSearchParams.has('cursor') && <Pill asChild size="sm"><Link href={pageHref(null)}>First page</Link></Pill>}
                {initialData.nextCursor && <Pill asChild size="sm"><Link href={pageHref(initialData.nextCursor)}>Next page</Link></Pill>}
              </Track>
            )}
          </nav>

          {error ? (
            <Notice tone="bad" role="alert">{error}</Notice>
          ) : initialData.requiresFacility ? (
            <div role="status"><EmptyBoard title="Choose a facility to load its day sheet" /></div>
          ) : initialData.items.length === 0 ? (
            <EmptyBoard title="No appointments in this queue" />
          ) : (
            <Board>
              {initialData.items.map((appointment) => (
                <AppointmentDetailsCard key={appointment.id} appointment={appointment} />
              ))}
            </Board>
          )}
        </section>
      </WardBody>
    </PageContainer>
  )
}

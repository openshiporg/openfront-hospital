'use client'

import { FacilitySearchField } from '@/features/platform/facilities/components/FacilitySearchField'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CalendarClock, Search, Stethoscope } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { AppointmentDetailsCard } from '../components/AppointmentDetailsCard'
import { AppointmentStatusTabs } from '../components/AppointmentStatusTabs'
import type { AppointmentQueueItem } from '../actions/appointments'

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

  const header = (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Appointment Command Center</h1>
        <p className="text-muted-foreground text-sm">
          Confirm requests, manage arrivals, track intake readiness, and move visits through the day.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 text-[11px]">
        <span className="rounded-full border px-2.5 py-1 bg-background">Active: {activeCount}</span>
        <span className="rounded-full border px-2.5 py-1 bg-background">Requested: {statusCounts.requested || 0}</span>
        <span className="rounded-full border px-2.5 py-1 bg-background">Checked in: {statusCounts.checked_in || 0}</span>
      </div>
    </div>
  )

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Appointments' },
  ]

  return (
    <PageContainer title="Appointments" header={header} breadcrumbs={breadcrumbs}>
      <div className="flex flex-col h-full bg-background">
        <div className="space-y-3 border-b bg-background/70 px-4 py-3 md:px-6">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
            <span className="uppercase tracking-wider text-muted-foreground">View</span>
            {([
              { id: 'today', label: 'Facility day' },
              { id: 'needs_action', label: 'Needs action' },
              { id: 'upcoming', label: 'Upcoming' },
              { id: 'all', label: 'All' },
            ] as const).map((view) => (
              <button
                key={view.id}
                type="button"
                aria-pressed={activeView === view.id}
                onClick={() => setView(view.id)}
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  activeView === view.id
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-background border-border hover:border-zinc-400'
                }`}
              >
                {view.label}
              </button>
            ))}
          </div>
          <form className="grid gap-2 sm:grid-cols-[minmax(14rem,1fr)_12rem_auto]">
            {safeSearchParams.get('status') && <input type="hidden" name="status" value={safeSearchParams.get('status') || ''} />}
            {activeView !== 'today' && <input type="hidden" name="view" value={activeView} />}
            <div className="sm:col-span-3"><FacilitySearchField key={selectedFacility?.id || 'none'} id="appointment-facility" required={activeView === 'today'} initialOption={selectedFacility} accessibleFacilityCount={facilitiesCount} />
            {activeView === 'today' && <label className="block text-sm">Calendar date {selectedFacility?.timeZone && `(${selectedFacility.timeZone})`}<Input type="date" name="date" defaultValue={safeSearchParams.get('date') || ''} /></label>}</div>
            <label className="relative"><span className="sr-only">Search appointments</span><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden /><Input className="pl-9" name="search" defaultValue={safeSearchParams.get('search') || ''} placeholder="Patient, reference, provider, facility…" /></label>
            <label><span className="sr-only">Sort appointments</span><select name="sort" defaultValue={safeSearchParams.get('sort') || 'start_asc'} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="start_asc">Start: earliest first</option><option value="start_desc">Start: latest first</option></select></label>
            <div className="flex gap-2"><Button type="submit" variant="outline">Apply</Button><Button asChild type="button" variant="ghost"><Link href="/dashboard/platform/appointments">Reset</Link></Button></div>
          </form>
          <p className="text-xs text-muted-foreground">Search is bounded to appointment references and patient/provider/facility labels visible to this session. Empty results do not prove no appointment exists outside current scope.</p>
        </div>

        <AppointmentStatusTabs statusCounts={statusCounts} />

        {initialData.notice && (
          <div role="status" className="border-b border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-950 md:px-6">
            {initialData.notice}
          </div>
        )}

        <nav className="flex flex-wrap gap-3 border-b p-4" aria-label="Appointment pages">
          {safeSearchParams.has('cursor') && <Link href={`${pathname}?${(() => { const params = new URLSearchParams(safeSearchParams.toString()); params.delete('cursor'); return params.toString() })()}`}>First page</Link>}
          {initialData.nextCursor && <Link href={`${pathname}?${(() => { const params = new URLSearchParams(safeSearchParams.toString()); params.set('cursor', initialData.nextCursor!); return params.toString() })()}`}>Next page</Link>}
          <span className="text-xs text-muted-foreground">{initialData.requiresFacility ? 'Facility selection required' : `${initialData.count} matching appointments; current page ${initialData.items.length}`}</span>
        </nav>
        <div className="flex-1">
          {error ? (
            <div className="p-4 md:p-6">
              <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
            </div>
          ) : initialData.requiresFacility ? <p role="status" className="p-4">Choose a facility above to load its appointments.</p> : initialData.items.length === 0 ? (
            <div className="p-8 md:p-12">
              <EmptyState
                title="No appointments in this queue"
                description="Online booking requests, confirmed visits, and front-desk scheduled appointments will appear here."
                icons={[CalendarClock, Stethoscope, Search]}
              />
            </div>
          ) : (
            <div className="border-t">
              {initialData.items.map((appointment) => (
                <AppointmentDetailsCard key={appointment.id} appointment={appointment} />
              ))}
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  )
}

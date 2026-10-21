'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ClipboardList, FileSearch, Inbox, Search } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { IntakeDetailsCard } from '../components/IntakeDetailsCard'
import { IntakeStatusTabs } from '../components/IntakeStatusTabs'
import type { IntakeQueueItem } from '../actions/intake'

export function IntakeListPageClient({
  initialData,
  statusCounts,
  error,
}: {
  initialData: { items: IntakeQueueItem[]; count: number; truncated?: boolean; notice?: string | null; nextCursor?: string | null }
  statusCounts: Record<string, number>
  error?: string | null
}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const safeSearchParams = searchParams ?? new URLSearchParams()
  const activeView = safeSearchParams.get('view') || 'needs_review'

  const setView = (view: string) => {
    const params = new URLSearchParams(safeSearchParams.toString())
    params.delete('cursor')
    if (view === 'needs_review') params.delete('view')
    else params.set('view', view)
    router.push(`${pathname}?${params.toString()}`)
  }

  const header = (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Intake Review Queue</h1>
        <p className="text-muted-foreground text-sm">
          Review submitted pre-visit forms, verify patient context, and mark intake ready before the visit.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 text-[11px]">
        <span className="rounded-full border px-2.5 py-1 bg-background">Submitted: {statusCounts.submitted || 0}</span>
        <span className="rounded-full border px-2.5 py-1 bg-background">Needs review: {statusCounts.needs_review || 0}</span>
        <span className="rounded-full border px-2.5 py-1 bg-background">Reviewed: {statusCounts.reviewed || 0}</span>
      </div>
    </div>
  )

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Intake' },
  ]

  return (
    <PageContainer title="Intake" header={header} breadcrumbs={breadcrumbs}>
      <div className="flex flex-col h-full bg-background">
        <div className="space-y-3 border-b bg-background/70 px-4 py-3 md:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">View</span>
            {([
              { id: 'needs_review', label: 'Needs review' },
              { id: 'not_ready', label: 'Not ready' },
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
            {activeView !== 'needs_review' && <input type="hidden" name="view" value={activeView} />}
            <label className="relative"><span className="sr-only">Search intake queue</span><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden /><Input className="pl-9" name="search" defaultValue={safeSearchParams.get('search') || ''} placeholder="Patient, reference, facility…" /></label>
            <label><span className="sr-only">Sort intake records</span><select name="sort" defaultValue={safeSearchParams.get('sort') || 'updated_desc'} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="updated_desc">Recently updated</option><option value="updated_asc">Oldest update first</option></select></label>
            <div className="flex gap-2"><Button type="submit" variant="outline">Apply</Button><Button asChild type="button" variant="ghost"><Link href="/dashboard/platform/intake">Reset</Link></Button></div>
          </form>
          <p className="text-xs text-muted-foreground">Search is bounded to visible patient, appointment, facility, and intake labels. Patient-provided answers are not clinical truth.</p>
        </div>

        <IntakeStatusTabs statusCounts={statusCounts} />

        {initialData.truncated && initialData.notice && <div role="status" className="border-b border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-950 md:px-6">{initialData.notice}</div>}

        <nav className="flex flex-wrap gap-3 border-b p-4" aria-label="Intake pages">
          {safeSearchParams.has('cursor') && <Link href={`${pathname}?${(() => { const params = new URLSearchParams(safeSearchParams.toString()); params.delete('cursor'); return params.toString() })()}`}>First page</Link>}
          {initialData.nextCursor && <Link href={`${pathname}?${(() => { const params = new URLSearchParams(safeSearchParams.toString()); params.set('cursor', initialData.nextCursor!); return params.toString() })()}`}>Next page</Link>}
          <span className="text-xs text-muted-foreground">{initialData.count} matching intake records; current page {initialData.items.length}</span>
        </nav>
        <div className="flex-1">
          {error ? (
            <div className="p-4 md:p-6">
              <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
            </div>
          ) : initialData.items.length === 0 ? (
            <div className="p-8 md:p-12">
              <EmptyState
                title="No intake forms in this queue"
                description="Submitted patient intake forms will appear here for review before appointments."
                icons={[ClipboardList, FileSearch, Inbox]}
              />
            </div>
          ) : (
            <div className="border-t">
              {initialData.items.map((intake) => (
                <IntakeDetailsCard key={intake.id} intake={intake} />
              ))}
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  )
}

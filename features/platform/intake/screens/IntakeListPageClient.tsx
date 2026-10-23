'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
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
} from '@/features/platform/components/ward'
import { IntakeDetailsCard } from '../components/IntakeDetailsCard'
import { IntakeStatusTabs } from '../components/IntakeStatusTabs'
import type { IntakeQueueItem } from '../actions/intake'

const views = [
  { value: 'needs_review', label: 'Needs review' },
  { value: 'not_ready', label: 'Not ready' },
  { value: 'all', label: 'All' },
] as const

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
  const waiting = (statusCounts.submitted || 0) + (statusCounts.needs_review || 0)

  const setView = (view: string) => {
    const params = new URLSearchParams(safeSearchParams.toString())
    params.delete('cursor')
    if (view === 'needs_review') params.delete('view')
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
      title="Intake"
      tone={waiting > 0 ? 'warn' : 'ok'}
      status={waiting > 0 ? 'Forms waiting for review' : 'Queue clear'}
      meta={`${waiting} waiting for review`}
    />
  )

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Intake' },
  ]

  return (
    <PageContainer title="Intake" header={header} breadcrumbs={breadcrumbs}>
      <WardBody>
        <ReadoutStrip>
          <Readout label="Submitted" tone={(statusCounts.submitted || 0) > 0 ? 'warn' : 'idle'} value={statusCounts.submitted || 0} />
          <Readout label="Needs review" tone={(statusCounts.needs_review || 0) > 0 ? 'warn' : 'idle'} value={statusCounts.needs_review || 0} />
          <Readout label="Reviewed" tone="ok" value={statusCounts.reviewed || 0} />
        </ReadoutStrip>

        <div className="flex min-w-0 flex-col gap-3">
          <Segmented label="Intake view" value={activeView} onChange={setView} options={views} />
          <FilterBar>
            {safeSearchParams.get('status') && <input type="hidden" name="status" value={safeSearchParams.get('status') || ''} />}
            {activeView !== 'needs_review' && <input type="hidden" name="view" value={activeView} />}
            <label className="relative w-full sm:min-w-56 sm:flex-1">
              <span className="sr-only">Search intake queue</span>
              <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
              <input className={`${fieldClass} pl-9`} name="search" defaultValue={safeSearchParams.get('search') || ''} placeholder="Patient, reference, facility…" />
            </label>
            <label className="w-full sm:w-48">
              <span className="sr-only">Sort intake records</span>
              <select name="sort" defaultValue={safeSearchParams.get('sort') || 'updated_desc'} className={fieldClass}>
                <option value="updated_desc">Recently updated</option>
                <option value="updated_asc">Oldest update first</option>
              </select>
            </label>
            <Track>
              <Pill type="submit" variant="primary">Apply</Pill>
              <Pill asChild variant="plain"><Link href="/dashboard/platform/intake">Reset</Link></Pill>
            </Track>
          </FilterBar>
          <IntakeStatusTabs statusCounts={statusCounts} />
        </div>

        {initialData.truncated && initialData.notice && <Notice tone="warn" role="status">{initialData.notice}</Notice>}

        <section className="flex min-w-0 flex-col gap-3">
          <nav className="flex min-w-0 flex-wrap items-center justify-between gap-2" aria-label="Intake pages">
            <span className="font-mono text-xs tabular-nums text-muted-foreground">{initialData.items.length} of {initialData.count} forms</span>
            {(safeSearchParams.has('cursor') || initialData.nextCursor) && (
              <Track>
                {safeSearchParams.has('cursor') && <Pill asChild size="sm"><Link href={pageHref(null)}>First page</Link></Pill>}
                {initialData.nextCursor && <Pill asChild size="sm"><Link href={pageHref(initialData.nextCursor)}>Next page</Link></Pill>}
              </Track>
            )}
          </nav>

          {error ? (
            <Notice tone="bad" role="alert">{error}</Notice>
          ) : initialData.items.length === 0 ? (
            <EmptyBoard title="No intake forms in this queue" />
          ) : (
            <Board>
              {initialData.items.map((intake) => (
                <IntakeDetailsCard key={intake.id} intake={intake} />
              ))}
            </Board>
          )}
        </section>
      </WardBody>
    </PageContainer>
  )
}

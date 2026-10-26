import Link from 'next/link'

import { Track } from '@/features/platform/components/ward'

import { type ActiveAdmissionsCursorPage, type AdmissionCursorDirection } from '../lib/admissionCursor'
import { inpatientCursorHref, type InpatientCursor } from '../lib/inpatientCursorHref'

type AdmissionCursorPaginationProps = {
  page: Exclude<ActiveAdmissionsCursorPage, { state: 'inconsistent' }>
  direction: AdmissionCursorDirection
  cursorId: string | null
  preservedCursors: InpatientCursor[]
}

function linkClass(disabled = false) {
  return `inline-flex h-7 shrink-0 items-center justify-center whitespace-nowrap rounded-[4px] px-3 text-xs font-medium ${disabled ? 'pointer-events-none text-muted-foreground opacity-50' : 'bg-background text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.12),inset_0_1px_0_rgb(255_255_255/0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-zinc-800 dark:shadow-[0_1px_2px_rgb(0_0_0/0.5),inset_0_1px_0_rgb(255_255_255/0.06)]'}`
}

export function AdmissionCursorPagination({ page, direction, cursorId, preservedCursors }: AdmissionCursorPaginationProps) {
  if (page.state === 'empty' && page.totalCount === 0) return null

  const firstId = page.admissions[0]?.id || cursorId || undefined
  const lastId = page.admissions[page.admissions.length - 1]?.id || cursorId || undefined
  const hasCursor = direction !== 'first' && Boolean(cursorId)
  const firstHref = inpatientCursorHref(null, preservedCursors)

  return (
    <nav aria-label="Active admissions pagination" className="mt-4 flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t pt-3">
      {page.state === 'empty'
        ? <p role="status" className="text-xs text-muted-foreground">No active admissions are available on this side of the cursor.</p>
        : <p className="text-xs tabular-nums text-muted-foreground">Showing {page.admissions.length} active admissions from {page.totalCount} accessible active admissions.</p>}
      {page.overflow && <p role="status" className="text-xs text-muted-foreground">More accessible admissions are available in this direction.</p>}
      <Track>
        {page.hasPrevious && firstId
          ? <Link href={inpatientCursorHref({ key: 'admissionsBefore', id: firstId }, preservedCursors)} rel="prev" className={linkClass()}>Previous</Link>
          : <span aria-disabled="true" className={linkClass(true)}>Previous</span>}
        {page.hasNext && lastId
          ? <Link href={inpatientCursorHref({ key: 'admissionsAfter', id: lastId }, preservedCursors)} rel="next" className={linkClass()}>Next</Link>
          : <span aria-disabled="true" className={linkClass(true)}>Next</span>}
        {hasCursor && <Link href={firstHref} className={linkClass()}>First page</Link>}
      </Track>
    </nav>
  )
}

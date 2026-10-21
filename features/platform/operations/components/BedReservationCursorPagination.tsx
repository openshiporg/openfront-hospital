import Link from 'next/link'

import { inpatientCursorHref, type InpatientCursor } from '../lib/inpatientCursorHref'
import { type BedReservationCursorDirection, type BedReservationCursorPage } from '../lib/bedReservationCursor'

type BedReservationCursorPaginationProps = {
  page: Exclude<BedReservationCursorPage, { state: 'inconsistent' }>
  direction: BedReservationCursorDirection
  cursorId: string | null
  preservedCursors: InpatientCursor[]
  className?: string
}

function linkClass(disabled = false) {
  return `rounded-md border px-3 py-1.5 text-sm ${disabled ? 'pointer-events-none text-muted-foreground opacity-50' : 'text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'}`
}

export function BedReservationCursorPagination({ page, direction, cursorId, preservedCursors, className }: BedReservationCursorPaginationProps) {
  if (page.state === 'empty' && page.totalCount === 0) return null

  const firstId = page.reservations[0]?.id || cursorId || undefined
  const lastId = page.reservations[page.reservations.length - 1]?.id || cursorId || undefined
  const hasCursor = direction !== 'first' && Boolean(cursorId)
  const firstHref = inpatientCursorHref(null, preservedCursors)

  return (
    <nav aria-label="Active bed reservations pagination" className={`mt-4 flex w-full flex-col gap-2 border-t pt-3 ${className || ''}`}>
      {page.state === 'empty'
        ? <p role="status" className="text-sm text-muted-foreground">No active reservations are available on this side of the cursor.</p>
        : <p className="text-sm text-muted-foreground">Showing {page.reservations.length} active reservations from {page.totalCount} accessible active reservations.</p>}
      {page.overflow && <p role="status" className="text-xs text-muted-foreground">More accessible reservations are available in this direction.</p>}
      <div className="flex flex-wrap items-center gap-2">
        {page.hasPrevious && firstId
          ? <Link href={inpatientCursorHref({ key: 'reservationsBefore', id: firstId }, preservedCursors)} rel="prev" className={linkClass()}>Previous</Link>
          : <span aria-disabled="true" className={linkClass(true)}>Previous</span>}
        {page.hasNext && lastId
          ? <Link href={inpatientCursorHref({ key: 'reservationsAfter', id: lastId }, preservedCursors)} rel="next" className={linkClass()}>Next</Link>
          : <span aria-disabled="true" className={linkClass(true)}>Next</span>}
        {hasCursor && <Link href={firstHref} className={linkClass()}>First page</Link>}
      </div>
    </nav>
  )
}

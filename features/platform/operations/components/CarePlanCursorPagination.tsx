import Link from 'next/link'

import { Track } from '@/features/platform/components/ward'

import {
  carePlanCursorHref,
  type CarePlanCursorDirection,
  type CarePlanCursorPage,
  type CarePlanPreservedQueueState,
} from '../lib/carePlanCursor'

type CarePlanCursorPaginationProps = {
  page: Exclude<CarePlanCursorPage, { state: 'inconsistent' }>
  direction: CarePlanCursorDirection
  cursorId: string | null
  preservedQueueState: CarePlanPreservedQueueState
}

function linkClass(disabled = false) {
  return `inline-flex h-7 shrink-0 items-center justify-center whitespace-nowrap rounded-full px-3 text-xs font-medium ${disabled ? 'pointer-events-none text-muted-foreground opacity-50' : 'bg-background text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.12),inset_0_1px_0_rgb(255_255_255/0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-zinc-800 dark:shadow-[0_1px_2px_rgb(0_0_0/0.5),inset_0_1px_0_rgb(255_255_255/0.06)]'}`
}

export function CarePlanCursorPagination({ page, direction, cursorId, preservedQueueState }: CarePlanCursorPaginationProps) {
  if (page.state === 'empty' && page.totalCount === 0) return null

  const firstId = page.carePlans[0]?.id || cursorId || undefined
  const lastId = page.carePlans[page.carePlans.length - 1]?.id || cursorId || undefined
  const hasCursor = direction !== 'first' && Boolean(cursorId)
  const firstHref = carePlanCursorHref(null, null, preservedQueueState)

  return (
    <nav aria-label="Care plan pagination" className="mt-4 flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t pt-3">
      {page.state === 'empty'
        ? <p role="status" className="text-xs text-muted-foreground">No care plans are available on this side of the cursor.</p>
        : <p className="text-xs tabular-nums text-muted-foreground">Showing {page.carePlans.length} care plans from {page.totalCount} accessible care plans.</p>}
      {page.overflow && <p role="status" className="text-xs text-muted-foreground">More accessible care plans are available in this direction.</p>}
      <Track>
        {page.hasPrevious && firstId
          ? <Link href={carePlanCursorHref('carePlansBefore', firstId, preservedQueueState)} rel="prev" className={linkClass()}>Previous</Link>
          : <span aria-disabled="true" className={linkClass(true)}>Previous</span>}
        {page.hasNext && lastId
          ? <Link href={carePlanCursorHref('carePlansAfter', lastId, preservedQueueState)} rel="next" className={linkClass()}>Next</Link>
          : <span aria-disabled="true" className={linkClass(true)}>Next</span>}
        {hasCursor && <Link href={firstHref} className={linkClass()}>First page</Link>}
      </Track>
    </nav>
  )
}

import Link from 'next/link'

import { Track } from '@/features/platform/components/ward'

import {
  prescriptionCursorHref,
  type PrescriptionCursorDirection,
  type PrescriptionCursorPage,
  type PrescriptionPreservedQueueState,
} from '../lib/prescriptionCursor'

type PrescriptionCursorPaginationProps = {
  page: Exclude<PrescriptionCursorPage, { state: 'inconsistent' }>
  direction: PrescriptionCursorDirection
  cursorId: string | null
  preservedQueueState: PrescriptionPreservedQueueState
}

function linkClass(disabled = false) {
  return `inline-flex h-7 shrink-0 items-center justify-center whitespace-nowrap rounded-[4px] px-3 text-xs font-medium ${disabled ? 'pointer-events-none text-muted-foreground opacity-50' : 'bg-background text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.12),inset_0_1px_0_rgb(255_255_255/0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-zinc-800 dark:shadow-[0_1px_2px_rgb(0_0_0/0.5),inset_0_1px_0_rgb(255_255_255/0.06)]'}`
}

export function PrescriptionCursorPagination({ page, direction, cursorId, preservedQueueState }: PrescriptionCursorPaginationProps) {
  if (page.state === 'empty' && page.totalCount === 0) return null

  const firstId = page.prescriptions[0]?.id || cursorId || undefined
  const lastId = page.prescriptions[page.prescriptions.length - 1]?.id || cursorId || undefined
  const hasCursor = direction !== 'first' && Boolean(cursorId)
  const firstHref = prescriptionCursorHref(null, null, preservedQueueState)

  return (
    <nav aria-label="Prescription pagination" className="mt-4 flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t pt-3">
      {page.state === 'empty'
        ? <p role="status" className="text-xs text-muted-foreground">No prescriptions are available on this side of the cursor.</p>
        : <p className="text-xs tabular-nums text-muted-foreground">Showing {page.prescriptions.length} prescriptions from {page.totalCount} accessible prescriptions.</p>}
      {page.overflow && <p role="status" className="text-xs text-muted-foreground">More accessible prescriptions are available in this direction.</p>}
      <Track>
        {page.hasPrevious && firstId
          ? <Link href={prescriptionCursorHref('prescriptionsBefore', firstId, preservedQueueState)} rel="prev" className={linkClass()}>Previous</Link>
          : <span aria-disabled="true" className={linkClass(true)}>Previous</span>}
        {page.hasNext && lastId
          ? <Link href={prescriptionCursorHref('prescriptionsAfter', lastId, preservedQueueState)} rel="next" className={linkClass()}>Next</Link>
          : <span aria-disabled="true" className={linkClass(true)}>Next</span>}
        {hasCursor && <Link href={firstHref} className={linkClass()}>First page</Link>}
      </Track>
    </nav>
  )
}

import Link from 'next/link'

import {
  medicalOrderCursorHref,
  type MedicalOrderCursorDirection,
  type MedicalOrderCursorPage,
  type MedicalOrderPreservedQueueState,
} from '../lib/medicalOrderCursor'

type MedicalOrderCursorPaginationProps = {
  page: Exclude<MedicalOrderCursorPage, { state: 'inconsistent' }>
  direction: MedicalOrderCursorDirection
  cursorId: string | null
  preservedQueueState: MedicalOrderPreservedQueueState
}

function linkClass(disabled = false) {
  return `rounded-md border px-3 py-1.5 text-sm ${disabled ? 'pointer-events-none text-muted-foreground opacity-50' : 'text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'}`
}

export function MedicalOrderCursorPagination({ page, direction, cursorId, preservedQueueState }: MedicalOrderCursorPaginationProps) {
  if (page.state === 'empty' && page.totalCount === 0) return null

  const firstId = page.orders[0]?.id || cursorId || undefined
  const lastId = page.orders[page.orders.length - 1]?.id || cursorId || undefined
  const hasCursor = direction !== 'first' && Boolean(cursorId)
  const firstHref = medicalOrderCursorHref(null, null, preservedQueueState)

  return (
    <nav aria-label="Medical order pagination" className="mt-4 flex w-full flex-col gap-2 border-t pt-3">
      {page.state === 'empty'
        ? <p role="status" className="text-sm text-muted-foreground">No orders are available on this side of the cursor.</p>
        : <p className="text-sm text-muted-foreground">Showing {page.orders.length} orders from {page.totalCount} accessible orders.</p>}
      {page.overflow && <p role="status" className="text-xs text-muted-foreground">More accessible orders are available in this direction.</p>}
      <div className="flex flex-wrap items-center gap-2">
        {page.hasPrevious && firstId
          ? <Link href={medicalOrderCursorHref('ordersBefore', firstId, preservedQueueState)} rel="prev" className={linkClass()}>Previous</Link>
          : <span aria-disabled="true" className={linkClass(true)}>Previous</span>}
        {page.hasNext && lastId
          ? <Link href={medicalOrderCursorHref('ordersAfter', lastId, preservedQueueState)} rel="next" className={linkClass()}>Next</Link>
          : <span aria-disabled="true" className={linkClass(true)}>Next</span>}
        {hasCursor && <Link href={firstHref} className={linkClass()}>First page</Link>}
      </div>
    </nav>
  )
}

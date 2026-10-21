import Link from 'next/link'

import {
  labResultCursorHref,
  type LabResultCursorDirection,
  type LabResultCursorPage,
  type LabResultPreservedQueueState,
} from '../lib/labResultCursor'

type LabResultCursorPaginationProps = {
  page: Exclude<LabResultCursorPage, { state: 'inconsistent' }>
  direction: LabResultCursorDirection
  cursorId: string | null
  preservedQueueState: LabResultPreservedQueueState
}

function linkClass(disabled = false) {
  return `rounded-md border px-3 py-1.5 text-sm ${disabled ? 'pointer-events-none text-muted-foreground opacity-50' : 'text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'}`
}

export function LabResultCursorPagination({ page, direction, cursorId, preservedQueueState }: LabResultCursorPaginationProps) {
  if (page.state === 'empty' && page.totalCount === 0) return null

  const firstId = page.results[0]?.id || cursorId || undefined
  const lastId = page.results[page.results.length - 1]?.id || cursorId || undefined
  const hasCursor = direction !== 'first' && Boolean(cursorId)
  const firstHref = labResultCursorHref(null, null, preservedQueueState)

  return (
    <nav aria-label="Lab result pagination" className="mt-4 flex w-full flex-col gap-2 border-t pt-3">
      {page.state === 'empty'
        ? <p role="status" className="text-sm text-muted-foreground">No lab results are available on this side of the cursor.</p>
        : <p className="text-sm text-muted-foreground">Showing {page.results.length} lab results from {page.totalCount} accessible lab results.</p>}
      {page.overflow && <p role="status" className="text-xs text-muted-foreground">More accessible lab results are available in this direction.</p>}
      <div className="flex flex-wrap items-center gap-2">
        {page.hasPrevious && firstId
          ? <Link href={labResultCursorHref('resultsBefore', firstId, preservedQueueState)} rel="prev" className={linkClass()}>Previous</Link>
          : <span aria-disabled="true" className={linkClass(true)}>Previous</span>}
        {page.hasNext && lastId
          ? <Link href={labResultCursorHref('resultsAfter', lastId, preservedQueueState)} rel="next" className={linkClass()}>Next</Link>
          : <span aria-disabled="true" className={linkClass(true)}>Next</span>}
        {hasCursor && <Link href={firstHref} className={linkClass()}>First page</Link>}
      </div>
    </nav>
  )
}

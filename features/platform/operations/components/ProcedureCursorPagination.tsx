import Link from 'next/link'

import {
  procedureCursorHref,
  type ProcedureCursorDirection,
  type ProcedureCursorPage,
  type ProcedurePreservedQueueState,
} from '../lib/procedureCursor'

type ProcedureCursorPaginationProps = {
  page: Exclude<ProcedureCursorPage, { state: 'inconsistent' }>
  direction: ProcedureCursorDirection
  cursorId: string | null
  preservedQueueState: ProcedurePreservedQueueState
}

function linkClass(disabled = false) {
  return `rounded-md border px-3 py-1.5 text-sm ${disabled ? 'pointer-events-none text-muted-foreground opacity-50' : 'text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'}`
}

export function ProcedureCursorPagination({ page, direction, cursorId, preservedQueueState }: ProcedureCursorPaginationProps) {
  if (page.state === 'empty' && page.totalCount === 0) return null

  const firstId = page.procedures[0]?.id || cursorId || undefined
  const lastId = page.procedures[page.procedures.length - 1]?.id || cursorId || undefined
  const hasCursor = direction !== 'first' && Boolean(cursorId)
  const firstHref = procedureCursorHref(null, null, preservedQueueState)

  return (
    <nav aria-label="Procedure pagination" className="mt-4 flex w-full flex-col gap-2 border-t pt-3">
      {page.state === 'empty'
        ? <p role="status" className="text-sm text-muted-foreground">No procedures are available on this side of the cursor.</p>
        : <p className="text-sm text-muted-foreground">Showing {page.procedures.length} procedures from {page.totalCount} accessible procedures.</p>}
      {page.overflow && <p role="status" className="text-xs text-muted-foreground">More accessible procedures are available in this direction.</p>}
      <div className="flex flex-wrap items-center gap-2">
        {page.hasPrevious && firstId
          ? <Link href={procedureCursorHref('proceduresBefore', firstId, preservedQueueState)} rel="prev" className={linkClass()}>Previous</Link>
          : <span aria-disabled="true" className={linkClass(true)}>Previous</span>}
        {page.hasNext && lastId
          ? <Link href={procedureCursorHref('proceduresAfter', lastId, preservedQueueState)} rel="next" className={linkClass()}>Next</Link>
          : <span aria-disabled="true" className={linkClass(true)}>Next</span>}
        {hasCursor && <Link href={firstHref} className={linkClass()}>First page</Link>}
      </div>
    </nav>
  )
}

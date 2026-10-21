import Link from 'next/link'

import { claimsCursorHref, type ClaimsCursorDirection, type ClaimsCursorPage } from '../lib/claimsCursor'

type ClaimsCursorPaginationProps = {
  page: Exclude<ClaimsCursorPage, { state: 'inconsistent' }>
  direction: ClaimsCursorDirection
  cursorId: string | null
  status?: string | string[]
}

function linkClass(disabled = false) {
  return `rounded-md border px-3 py-1.5 text-sm ${disabled ? 'pointer-events-none text-muted-foreground opacity-50' : 'text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'}`
}

export function ClaimsCursorPagination({ page, direction, cursorId, status }: ClaimsCursorPaginationProps) {
  if (page.state === 'empty' && page.totalCount === 0) return null

  const firstId = page.claims[0]?.id || cursorId || undefined
  const lastId = page.claims[page.claims.length - 1]?.id || cursorId || undefined
  const hasCursor = direction !== 'first' && Boolean(cursorId)
  const firstHref = claimsCursorHref(null, null, status)

  return (
    <nav aria-label="Claim records pagination" className="mt-4 flex w-full flex-col gap-2 border-t pt-3">
      {page.state === 'empty'
        ? <p role="status" className="text-sm text-muted-foreground">No claim records are available on this side of the cursor.</p>
        : <p className="text-sm text-muted-foreground">Showing {page.claims.length} claim records from {page.totalCount} accessible claim records.</p>}
      {page.overflow && <p role="status" className="text-xs text-muted-foreground">More accessible claim records are available in this direction.</p>}
      <div className="flex flex-wrap items-center gap-2">
        {page.hasPrevious && firstId
          ? <Link href={claimsCursorHref('claimsBefore', firstId, status)} rel="prev" className={linkClass()}>Previous</Link>
          : <span aria-disabled="true" className={linkClass(true)}>Previous</span>}
        {page.hasNext && lastId
          ? <Link href={claimsCursorHref('claimsAfter', lastId, status)} rel="next" className={linkClass()}>Next</Link>
          : <span aria-disabled="true" className={linkClass(true)}>Next</span>}
        {hasCursor && <Link href={firstHref} className={linkClass()}>First page</Link>}
      </div>
    </nav>
  )
}

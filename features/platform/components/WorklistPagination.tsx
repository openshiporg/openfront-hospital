import Link from 'next/link'

import {
  MAX_REACHABLE_WORKLIST_ROWS,
  MAX_WORKLIST_PAGE,
  WORKLIST_PAGE_SIZE,
  worklistPageCount,
  worklistPageHref,
} from '../lib/worklistPagination'

type WorklistPaginationProps = {
  label: string
  href: string
  pageKey: string
  page: number
  pageParams: Record<string, number>
  totalCount: number
  preservedParams?: Record<string, string | string[] | undefined>
  className?: string
}

function linkClass(disabled = false) {
  return `rounded-md border px-3 py-1.5 text-sm ${disabled ? 'pointer-events-none text-muted-foreground opacity-50' : 'text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'}`
}

export function WorklistPagination(props: WorklistPaginationProps) {
  const totalPages = worklistPageCount(props.totalCount)
  const pageIsStale = props.page > totalPages
  const visiblePages = Math.min(totalPages, MAX_WORKLIST_PAGE)
  const start = (props.page - 1) * WORKLIST_PAGE_SIZE + 1
  const end = Math.min(props.page * WORKLIST_PAGE_SIZE, props.totalCount)

  if (props.totalCount === 0 && props.page === 1) return null

  return (
    <nav aria-label={`${props.label} pagination`} className={`mt-4 flex w-full flex-col gap-2 border-t pt-3 ${props.className || ''}`}>
      {pageIsStale
        ? <p role="status" className="text-sm text-muted-foreground">This page no longer contains accessible {props.label.toLowerCase()}. The worklist may have changed.</p>
        : <p className="text-sm text-muted-foreground">Showing {start}–{end} of {props.totalCount} {props.label.toLowerCase()} · page {props.page} of {visiblePages}.</p>}
      <div className="flex flex-wrap items-center gap-2">
        {pageIsStale
          ? <Link href={worklistPageHref(props.href, props.pageKey, props.pageParams, Math.max(1, visiblePages), props.preservedParams)} className={linkClass()}>{visiblePages ? 'Return to last available page' : 'Return to first page'}</Link>
          : <>
              {props.page > 1
                ? <Link href={worklistPageHref(props.href, props.pageKey, props.pageParams, props.page - 1, props.preservedParams)} rel="prev" className={linkClass()}>Previous</Link>
                : <span aria-disabled="true" className={linkClass(true)}>Previous</span>}
              {props.page < visiblePages
                ? <Link href={worklistPageHref(props.href, props.pageKey, props.pageParams, props.page + 1, props.preservedParams)} rel="next" className={linkClass()}>Next</Link>
                : <span aria-disabled="true" className={linkClass(true)}>Next</span>}
            </>}
      </div>
      {props.totalCount > MAX_REACHABLE_WORKLIST_ROWS && (
        <p role="status" className="text-xs text-amber-800">
          This bounded offset view can reach only the first {MAX_REACHABLE_WORKLIST_ROWS} accessible items. Later items remain outside its safe pagination limit; narrow the authorized worklist scope before relying on it as complete.
        </p>
      )}
    </nav>
  )
}

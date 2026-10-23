import Link from 'next/link'

import {
  MAX_REACHABLE_WORKLIST_ROWS,
  MAX_WORKLIST_PAGE,
  WORKLIST_PAGE_SIZE,
  worklistPageCount,
  worklistPageHref,
} from '../lib/worklistPagination'
import { Pill, Track } from './ward'

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

export function WorklistPagination(props: WorklistPaginationProps) {
  const totalPages = worklistPageCount(props.totalCount)
  const pageIsStale = props.page > totalPages
  const visiblePages = Math.min(totalPages, MAX_WORKLIST_PAGE)
  const start = (props.page - 1) * WORKLIST_PAGE_SIZE + 1
  const end = Math.min(props.page * WORKLIST_PAGE_SIZE, props.totalCount)

  if (props.totalCount === 0 && props.page === 1) return null

  return (
    <nav aria-label={`${props.label} pagination`} className={`mt-4 flex w-full flex-col gap-2 border-t pt-3 ${props.className || ''}`}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        {pageIsStale
          ? <p role="status" className="text-sm text-muted-foreground">This page is no longer available.</p>
          : <p className="font-mono text-xs tabular-nums text-muted-foreground">{start}–{end} of {props.totalCount} · page {props.page}/{visiblePages}</p>}
        <Track>
          {pageIsStale
            ? <Pill asChild size="sm"><Link href={worklistPageHref(props.href, props.pageKey, props.pageParams, Math.max(1, visiblePages), props.preservedParams)}>{visiblePages ? 'Last available page' : 'First page'}</Link></Pill>
            : <>
                {props.page > 1
                  ? <Pill asChild size="sm"><Link href={worklistPageHref(props.href, props.pageKey, props.pageParams, props.page - 1, props.preservedParams)} rel="prev">Previous</Link></Pill>
                  : <Pill asChild size="sm" variant="plain" className="pointer-events-none opacity-50"><span aria-disabled="true">Previous</span></Pill>}
                {props.page < visiblePages
                  ? <Pill asChild size="sm"><Link href={worklistPageHref(props.href, props.pageKey, props.pageParams, props.page + 1, props.preservedParams)} rel="next">Next</Link></Pill>
                  : <Pill asChild size="sm" variant="plain" className="pointer-events-none opacity-50"><span aria-disabled="true">Next</span></Pill>}
              </>}
        </Track>
      </div>
      {props.totalCount > MAX_REACHABLE_WORKLIST_ROWS && (
        <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
          Only the first {MAX_REACHABLE_WORKLIST_ROWS} items are reachable here. Narrow the scope to see the rest.
        </p>
      )}
    </nav>
  )
}

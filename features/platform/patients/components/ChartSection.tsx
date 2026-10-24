import * as React from 'react'

import { Board, EmptyBoard, Notice, WardSection } from '@/features/platform/components/ward'

export function formatDate(value?: string | null, timeZone?: string | null) {
  if (!value) return null
  return new Intl.DateTimeFormat(undefined, { timeZone: timeZone || 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

export function formatDateTime(value?: string | null, timeZone?: string | null) {
  if (!value) return null
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timeZone || 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(value))
}

export function humanize(value?: string | null) {
  const text = String(value || '').replace(/_/g, ' ').trim()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : null
}

/**
 * A chart section that distinguishes "no records" from "this session cannot read
 * these records". `readable === false` shows a restriction notice; `undefined`
 * means the viewer's permissions could not be verified, so an empty list is not
 * presented as a fact.
 */
export function ChartSection({
  id,
  title,
  count,
  shown,
  readable,
  restrictedLabel,
  emptyLabel,
  failed,
  actions,
  children,
}: {
  id: string
  title: string
  count?: number | null
  shown: number
  readable: boolean | undefined
  restrictedLabel: string
  emptyLabel: string
  failed?: boolean
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  let body: React.ReactNode
  if (failed) body = <Notice tone="bad">{title} could not be loaded.</Notice>
  else if (readable === false && shown === 0) body = <Notice tone="warn">{restrictedLabel}</Notice>
  else if (shown === 0 && readable === undefined) body = <Notice>No visible records. Access could not be verified.</Notice>
  else if (shown === 0) body = <EmptyBoard title={emptyLabel} />
  else body = (
    <>
      <Board>{children}</Board>
      {typeof count === 'number' && count > shown && <p className="mt-2 font-mono text-xs tabular-nums text-muted-foreground">Showing {shown} of {count}</p>}
    </>
  )

  return (
    <WardSection id={id} title={title} count={failed ? undefined : (count ?? shown)} actions={actions}>
      {body}
    </WardSection>
  )
}

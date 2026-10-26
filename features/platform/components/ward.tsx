/**
 * Ward kit: the shared building blocks for the hospital platform screens.
 * Hospital floor wayfinding: each state keeps its line colour, drawn as a short floor-line
 * segment; hairline rules, 4px corners, underline tabs, square buttons, one deep-teal primary.
 */

import * as React from 'react'
import Link from 'next/link'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '@/lib/utils'

export type WardTone = 'ok' | 'warn' | 'bad' | 'info' | 'idle' | 'accent'

const DOT_TONE: Record<WardTone, string> = {
  ok: 'bg-emerald-600 dark:bg-emerald-400',
  warn: 'bg-amber-500',
  bad: 'bg-red-600 dark:bg-red-400',
  info: 'bg-sky-600 dark:bg-sky-400',
  idle: 'bg-zinc-400 dark:bg-zinc-500',
  accent: 'bg-teal-700 dark:bg-teal-400',
}

/** Status → tone for the hospital's workflow states (appointments, encounters, beds, claims, intake, messages). */
export function toneForStatus(status: string | null | undefined): WardTone {
  const value = String(status || '').toLowerCase()
  if (!value) return 'idle'
  if (/(cancel|no_show|denied|reject|fail|error|expired|blocked|overdue|critical|abnormal|void|dead)/.test(value)) return 'bad'
  if (/(request|pending|waiting|queued|draft|needs|hold|review|submitted|due|reserved|partial|retry|appeal|unverified|preliminary)/.test(value)) return 'warn'
  if (/(complete|closed|paid|delivered|reviewed|discharged|confirmed_final|final|resolved|available|active|ready|accepted|sent|clean)/.test(value)) return 'ok'
  if (/(confirm|check|in_visit|in_progress|admitted|occupied|scheduled|open|started|arrived|transfer)/.test(value)) return 'info'
  return 'idle'
}

export function statusLabel(status: string | null | undefined) {
  const value = String(status || '').replace(/_/g, ' ').trim()
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Unknown'
}

/** Floor-line marker: a short segment in the state's line colour. */
export function StatusDot({ tone = 'idle', className }: { tone?: WardTone; className?: string }) {
  return <span aria-hidden="true" className={cn('inline-block h-[3px] w-3.5 shrink-0 rounded-[1px]', DOT_TONE[tone], className)} />
}

/** A heading whose status dot sits on its first line, not vertically centred against wrapped text. */
export function TitleLine({
  tone,
  status,
  children,
  as: Tag = 'h3',
  className,
}: {
  tone?: WardTone
  status?: string
  children: React.ReactNode
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span' | 'div'
  className?: string
}) {
  return (
    <Tag className={cn('flex min-w-0 items-baseline gap-2', className)}>
      {tone && <StatusDot tone={tone} className="-translate-y-[0.3em]" />}
      {status && <span className="sr-only">{status}: </span>}
      <span className="min-w-0 break-words">{children}</span>
    </Tag>
  )
}

/** Status text with its dot, for table cells and row metadata. */
export function StatusTag({ status, tone, className }: { status: string | null | undefined; tone?: WardTone; className?: string }) {
  return (
    <span className={cn('inline-flex items-baseline gap-1.5 whitespace-nowrap text-xs font-medium text-foreground', className)}>
      <StatusDot tone={tone ?? toneForStatus(status)} className="w-3 -translate-y-[0.25em]" />
      {statusLabel(status)}
    </span>
  )
}

/** Page header for PageContainer's `header` slot. */
export function WardHeader({
  title,
  tone,
  status,
  meta,
  actions,
}: {
  title: React.ReactNode
  tone?: WardTone
  status?: string
  meta?: React.ReactNode
  actions?: React.ReactNode
  eyebrow?: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <TitleLine as="h1" tone={tone} status={status} className="text-xl font-semibold tracking-tight text-foreground">
          {title}
        </TitleLine>
        {meta && <div className="mt-0.5 text-sm tabular-nums text-muted-foreground">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Button row. Holding tab links or pressed choices it becomes an underline tab bar on a hairline. */
export function Track({
  children,
  className,
  block,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { block?: boolean }) {
  return (
    <div
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 overflow-x-auto [scrollbar-width:none]',
        '[&:has(>[data-tab])]:gap-0 [&:has(>[data-tab])]:border-b [&:has(>[data-tab])]:border-border',
        block && 'flex w-full [&>*]:flex-1',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

type PillVariant = 'plain' | 'raised' | 'primary' | 'danger'

const PILL_VARIANT: Record<PillVariant, string> = {
  plain: 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
  raised: 'border-border bg-background text-foreground hover:bg-muted',
  primary: 'border-teal-800 bg-teal-700 text-white hover:bg-teal-800 dark:border-teal-400 dark:bg-teal-500 dark:text-teal-950',
  danger: 'border-red-600/40 bg-background text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10',
}

export interface PillProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PillVariant
  /** Selected state: an underline tab when part of a tab row, a pressed toggle otherwise. */
  active?: boolean
  size?: 'sm' | 'md'
  asChild?: boolean
}

/** Square button (4px corners); the legacy name stays so every desk keeps its imports. With `active` it is a tab. */
export const Pill = React.forwardRef<HTMLButtonElement, PillProps>(function Pill(
  { variant, active, size = 'md', asChild, className, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button'
  const tab = active !== undefined && !variant
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? 'button')}
      data-active={active ? 'true' : undefined}
      data-tab={tab ? '' : undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
        tab
          ? cn('-mb-px border-b-2 px-3', size === 'sm' ? 'h-8 text-xs' : 'h-9 text-sm', active ? 'border-teal-700 text-foreground dark:border-teal-400' : 'border-transparent text-muted-foreground hover:text-foreground')
          : cn('rounded-[4px] border', size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm', PILL_VARIANT[variant ?? 'raised']),
        className,
      )}
      {...props}
    />
  )
})

/** One or more in-page actions: a row of square buttons. */
export function Actions({ children, className }: { children: React.ReactNode; className?: string }) {
  return <Track className={className}>{children}</Track>
}

/** View switch: underline tabs on a hairline. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size,
  block,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: ReadonlyArray<{ value: T; label: React.ReactNode; count?: number; tone?: WardTone; disabled?: boolean }>
  label: string
  size?: 'sm' | 'md'
  block?: boolean
  className?: string
}) {
  return (
    <Track role="group" aria-label={label} block={block} className={className}>
      {options.map((option) => (
        <Pill
          key={option.value}
          size={size}
          active={option.value === value}
          aria-pressed={option.value === value}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.tone && <StatusDot tone={option.tone} className="w-2.5" />}
          {option.label}
          {option.count !== undefined && <span className="text-xs tabular-nums text-muted-foreground">{option.count}</span>}
        </Pill>
      ))}
    </Track>
  )
}

/** Segmented navigation where each choice is a link (URL-driven filters). */
export function SegmentedLinks({
  options,
  label,
  size,
  className,
}: {
  options: ReadonlyArray<{ href: string; label: React.ReactNode; active: boolean; count?: number; tone?: WardTone }>
  label: string
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <Track role="navigation" aria-label={label} className={className}>
      {options.map((option, index) => (
        <Pill key={index} asChild size={size} active={option.active}>
          <Link href={option.href} aria-current={option.active ? 'page' : undefined}>
            {option.tone && <StatusDot tone={option.tone} className="w-2.5" />}
            {option.label}
            {option.count !== undefined && <span className="text-xs tabular-nums text-muted-foreground">{option.count}</span>}
          </Link>
        </Pill>
      ))}
    </Track>
  )
}

/** One headline figure. */
export function Readout({
  label,
  value,
  sub,
  tone,
  className,
}: {
  label: React.ReactNode
  value: React.ReactNode
  sub?: React.ReactNode
  tone?: WardTone
  className?: string
}) {
  return (
    <div className={cn('min-w-0 px-4 py-2.5', className)}>
      <TitleLine as="p" tone={tone} className="text-xs font-medium text-muted-foreground">
        {label}
      </TitleLine>
      <p className="mt-1 truncate text-xl font-semibold tabular-nums tracking-tight text-foreground">{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

/** Hairline-divided row of readouts, like a census board; two up on phones. */
export function ReadoutStrip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-px overflow-hidden rounded-[4px] border bg-border md:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] [&>*]:bg-background max-md:[&>*:last-child:nth-child(odd)]:col-span-2',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Titled region separated by spacing and a hairline, not a card. */
export function WardSection({
  title,
  count,
  actions,
  children,
  className,
  id,
}: {
  title: React.ReactNode
  count?: number
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  id?: string
}) {
  return (
    <section className={cn('min-w-0', className)} aria-labelledby={id}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b pb-2">
        <h2 id={id} className="flex items-baseline gap-2 text-sm font-semibold text-foreground">
          {title}
          {count !== undefined && <span className="text-xs font-normal tabular-nums text-muted-foreground">{count}</span>}
        </h2>
        {actions}
      </div>
      <div className="pt-2">{children}</div>
    </section>
  )
}

/** Bordered surface for lists and forms. */
export function Panel({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('min-w-0 rounded-[4px] border bg-background', className)} {...props}>
      {children}
    </div>
  )
}

/** Page body: consistent gutters and vertical rhythm under the PageContainer header. */
export function WardBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex min-w-0 flex-col gap-6 px-4 pb-10 pt-2 md:px-6', className)}>{children}</div>
}

/** Filter bar: search and selectors on one wrapping row. */
export function FilterBar({ children, className, ...props }: React.FormHTMLAttributes<HTMLFormElement>) {
  return (
    <form className={cn('flex min-w-0 flex-wrap items-end gap-2 [&>*]:min-w-0', className)} {...props}>
      {children}
    </form>
  )
}

/** A row on a board list: title line with dot, meta beneath, aside on the right (stacks on phones). */
export function BoardRow({
  title,
  tone,
  status,
  meta,
  aside,
  children,
  className,
}: {
  title: React.ReactNode
  tone?: WardTone
  status?: string
  meta?: React.ReactNode
  aside?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-2 px-3 py-2.5 hover:bg-muted/30 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0 flex-1">
        <TitleLine tone={tone} status={status} className="text-sm font-semibold text-foreground">{title}</TitleLine>
        {meta && <div className="mt-0.5 flex min-w-0 flex-wrap gap-x-3 gap-y-1 pl-[1.375rem] text-xs text-muted-foreground">{meta}</div>}
        {children && <div className="mt-2 pl-[1.375rem]">{children}</div>}
      </div>
      {aside && <div className="flex shrink-0 flex-wrap items-center gap-2 pl-[1.375rem] sm:pl-0">{aside}</div>}
    </div>
  )
}

/** Divided list container for BoardRows. */
export function Board({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('min-w-0 divide-y overflow-hidden rounded-[4px] border bg-background', className)}>{children}</div>
}

/** Empty state for a list. */
export function EmptyBoard({ title, children, className }: { title: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-[4px] border bg-muted/30 px-4 py-4', className)}>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
    </div>
  )
}

/** Label/value pairs in a two-column list. */
export function Facts({
  items,
  className,
}: {
  items: ReadonlyArray<{ label: React.ReactNode; value: React.ReactNode; mono?: boolean } | null | false | undefined>
  className?: string
}) {
  return (
    <dl className={cn('divide-y text-sm', className)}>
      {items.filter(Boolean).map((item, index) => {
        const row = item as { label: React.ReactNode; value: React.ReactNode; mono?: boolean }
        return (
          <div key={index} className="grid min-w-0 grid-cols-[minmax(7rem,40%)_1fr] items-baseline gap-4 py-1.5">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className={cn('min-w-0 break-words text-foreground', row.mono && 'font-medium tabular-nums')}>{row.value}</dd>
          </div>
        )
      })}
    </dl>
  )
}

/** Inline notice for errors and results. */
export function Notice({
  tone = 'idle',
  children,
  className,
  role,
}: {
  tone?: WardTone
  children: React.ReactNode
  className?: string
  role?: 'alert' | 'status'
}) {
  return (
    <div
      role={role ?? (tone === 'bad' ? 'alert' : 'status')}
      className={cn(
        'flex min-w-0 items-baseline gap-2 rounded-[4px] border px-3 py-2 text-sm',
        tone === 'bad' && 'border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-300',
        tone === 'warn' && 'border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-200',
        tone === 'ok' && 'border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-200',
        (tone === 'idle' || tone === 'info' || tone === 'accent') && 'bg-muted/50 text-foreground',
        className,
      )}
    >
      <StatusDot tone={tone} className="-translate-y-[0.25em]" />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  )
}

/** Identifier: MRN, appointment number, claim number. Tabular, tracked, never a costume font. */
export function Code({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('text-[12px] font-medium tabular-nums tracking-[0.02em] text-muted-foreground', className)}>{children}</span>
}

/** Patient identifier band: name plus MRN/DOB, styled like a wristband. */
export function Wristband({ name, identifier, detail, className }: { name: React.ReactNode; identifier?: React.ReactNode; detail?: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 max-w-full items-center overflow-hidden rounded-[3px] border bg-background text-xs', className)}>
      <span className="truncate px-2 py-0.5 font-semibold text-foreground">{name}</span>
      {identifier && <span className="shrink-0 border-l bg-muted/60 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">{identifier}</span>}
      {detail && <span className="hidden shrink-0 border-l px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground sm:inline">{detail}</span>}
    </span>
  )
}

/** Thin segmented meter for a share or progress value from real data (0..1). */
export function Meter({ value, tone = 'accent', segments = 12, label }: { value: number; tone?: WardTone; segments?: number; label?: string }) {
  const filled = Math.round(Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * segments)
  const color = tone === 'ok' ? 'bg-emerald-500' : tone === 'warn' ? 'bg-amber-500' : tone === 'bad' ? 'bg-red-500' : tone === 'info' ? 'bg-sky-500' : 'bg-teal-600 dark:bg-teal-400'
  return (
    <span role="meter" aria-valuemin={0} aria-valuemax={segments} aria-valuenow={filled} aria-label={label} className="inline-flex gap-0.5">
      {Array.from({ length: segments }, (_, index) => (
        <span key={index} className={cn('h-2.5 w-1', index < filled ? color : 'bg-muted-foreground/20')} />
      ))}
    </span>
  )
}

/** Shared field chrome for native inputs and selects inside platform forms. */
export const fieldClass = 'h-8 w-full min-w-0 rounded-[4px] border bg-background px-2.5 text-sm outline-none focus-visible:border-teal-700 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50'
export const labelClass = 'grid min-w-0 gap-1 text-xs font-medium text-muted-foreground'

import type { LucideIcon } from 'lucide-react'
import { TitleLine, type WardTone } from '@/features/platform/components/ward'
import { cn } from '@/lib/utils'

const TONE: Record<'default' | 'good' | 'warning' | 'danger', WardTone | undefined> = {
  default: undefined,
  good: 'ok',
  warning: 'warn',
  danger: 'bad',
}

/** A census-board figure. Sits inside a ReadoutStrip (or alone, with its own border). */
export function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  tone = 'default',
  className,
}: {
  title: string
  value: string | number
  description?: string
  icon: LucideIcon
  tone?: 'default' | 'good' | 'warning' | 'danger'
  className?: string
}) {
  return (
    <section className={cn('min-w-0 px-4 py-3 md:px-5 md:py-4', className)}>
      <div className="flex min-w-0 items-start justify-between gap-2">
        <TitleLine as="h3" tone={TONE[tone]} className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
          {title}
        </TitleLine>
        <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground/60" />
      </div>
      <p className="mt-1.5 truncate text-2xl font-semibold tabular-nums tracking-tight text-foreground">{value}</p>
      {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
    </section>
  )
}

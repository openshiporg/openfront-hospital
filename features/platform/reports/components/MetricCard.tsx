import type { LucideIcon } from 'lucide-react'

export function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  tone = 'default',
}: {
  title: string
  value: string | number
  description?: string
  icon: LucideIcon
  tone?: 'default' | 'good' | 'warning' | 'danger'
}) {
  const toneClass = {
    default: 'text-slate-700 bg-slate-50 border-slate-200',
    good: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    warning: 'text-amber-700 bg-amber-50 border-amber-200',
    danger: 'text-rose-700 bg-rose-50 border-rose-200',
  }[tone]

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
        </div>
        <div className={`rounded-xl border p-3 ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {description && <p className="mt-3 text-sm text-muted-foreground">{description}</p>}
    </section>
  )
}

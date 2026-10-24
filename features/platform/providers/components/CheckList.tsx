'use client'

import { statusLabel } from '@/features/platform/components/ward'
import type { Option } from '../actions/types'

/** Multi-select as a scrollable checkbox list; works with touch and keyboard. */
export function CheckList({
  label,
  options,
  value,
  onChange,
  disabled,
  emptyLabel = 'None available',
}: {
  label: string
  options: Option[]
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  emptyLabel?: string
}) {
  const toggle = (id: string, checked: boolean) => {
    onChange(checked ? [...value, id] : value.filter((v) => v !== id))
  }
  return (
    <fieldset className="grid min-w-0 gap-1" disabled={disabled}>
      <legend className="mb-1 flex w-full items-baseline justify-between text-xs font-medium text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono text-[11px] tabular-nums">{value.length} selected</span>
      </legend>
      {options.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="max-h-44 min-w-0 divide-y overflow-y-auto rounded-lg border bg-background">
          {options.map((option) => (
            <label key={option.id} className="flex min-w-0 cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/50">
              <input
                type="checkbox"
                className="size-4 shrink-0 accent-teal-700 dark:accent-teal-400"
                checked={value.includes(option.id)}
                onChange={(event) => toggle(option.id, event.target.checked)}
              />
              <span className="min-w-0 flex-1 truncate text-foreground">{option.label}</span>
              {option.sub && <span className="shrink-0 text-xs text-muted-foreground">{statusLabel(option.sub)}</span>}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  )
}

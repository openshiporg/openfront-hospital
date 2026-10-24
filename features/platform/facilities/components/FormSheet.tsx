'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Notice, Pill, Track, fieldClass, labelClass } from '@/features/platform/components/ward'
import { cn } from '@/lib/utils'

export type SheetFieldErrors = Record<string, string>
export type SheetResult = { success: true; data?: unknown } | { success: false; error: string; fieldErrors?: SheetFieldErrors }

const ErrorsContext = React.createContext<SheetFieldErrors>({})

/** A labelled control with its validation error underneath. */
export function SheetField({ label, name, children, className }: { label: string; name: string; children: React.ReactNode; className?: string }) {
  const errors = React.useContext(ErrorsContext)
  const error = errors[name]
  return (
    <label className={cn(labelClass, className)}>
      {label}
      {children}
      {error && <span id={`${name}-error`} className="text-xs font-normal text-red-600 dark:text-red-400">{error}</span>}
    </label>
  )
}

export function SheetInput({ name, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { name: string }) {
  const errors = React.useContext(ErrorsContext)
  return <input name={name} aria-invalid={errors[name] ? true : undefined} aria-describedby={errors[name] ? `${name}-error` : undefined} className={cn(fieldClass, errors[name] && 'border-red-500', className)} {...props} />
}

export function SheetSelect({ name, options, className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { name: string; options: ReadonlyArray<{ value: string; label: string }> }) {
  const errors = React.useContext(ErrorsContext)
  return (
    <select name={name} aria-invalid={errors[name] ? true : undefined} className={cn(fieldClass, errors[name] && 'border-red-500', className)} {...props}>
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  )
}

export function SheetTextarea({ name, className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { name: string }) {
  const errors = React.useContext(ErrorsContext)
  return <textarea name={name} rows={3} className={cn(fieldClass, 'h-auto py-2', errors[name] && 'border-red-500', className)} {...props} />
}

function readForm(form: HTMLFormElement) {
  const values: Record<string, string> = {}
  for (const element of Array.from(form.elements)) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) || !element.name) continue
    if (element instanceof HTMLInputElement && element.type === 'checkbox') values[element.name] = element.checked ? 'true' : 'false'
    else values[element.name] = element.value
  }
  return values
}

/** Right-hand drawer holding a create/edit form. Validates on the client, then submits to a server action. */
export function FormSheet({
  trigger,
  triggerVariant = 'raised',
  triggerSize = 'md',
  title,
  description,
  submitLabel,
  validate,
  action,
  onSuccess,
  children,
  bare,
}: {
  bare?: boolean
  trigger: React.ReactNode
  triggerVariant?: 'raised' | 'primary' | 'plain'
  triggerSize?: 'sm' | 'md'
  title: string
  description?: string
  submitLabel: string
  validate?: (values: Record<string, string>) => SheetFieldErrors
  action: (values: Record<string, string>) => Promise<SheetResult>
  onSuccess?: (result: SheetResult) => void
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState('')
  const [fieldErrors, setFieldErrors] = React.useState<SheetFieldErrors>({})

  function changeOpen(next: boolean) {
    if (pending) return
    setOpen(next)
    if (!next) { setError(''); setFieldErrors({}) }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const values = readForm(event.currentTarget)
    const clientErrors = validate?.(values) ?? {}
    setFieldErrors(clientErrors)
    if (Object.keys(clientErrors).length) { setError('Check the highlighted fields.'); return }
    setPending(true); setError('')
    try {
      const result = await action(values)
      if (!result.success) {
        setError(result.error)
        setFieldErrors(result.fieldErrors ?? {})
        return
      }
      setOpen(false)
      onSuccess?.(result)
    } catch {
      setError('Save failed. Try again.')
    } finally {
      setPending(false)
    }
  }

  const triggerPill = <Pill size={triggerSize} variant={triggerVariant} onClick={() => setOpen(true)}>{trigger}</Pill>
  return (
    <>
      {bare ? triggerPill : <Track>{triggerPill}</Track>}
      <Sheet open={open} onOpenChange={changeOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
          <SheetHeader className="border-b px-5 py-4 text-left">
            <SheetTitle>{title}</SheetTitle>
            {description ? <SheetDescription>{description}</SheetDescription> : <SheetDescription className="sr-only">{title}</SheetDescription>}
          </SheetHeader>
          <ErrorsContext.Provider value={fieldErrors}>
            <form noValidate onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
              <fieldset disabled={pending} className="grid min-w-0 gap-4 px-5 py-4">
                {children}
              </fieldset>
              <div className="mt-auto flex flex-col gap-3 border-t px-5 py-4">
                {error && <Notice tone="bad">{error}</Notice>}
                <Track className="self-start">
                  <Pill type="submit" variant="primary" disabled={pending}>
                    {pending && <Loader2 className="animate-spin" aria-hidden />}
                    {submitLabel}
                  </Pill>
                  <Pill variant="plain" disabled={pending} onClick={() => changeOpen(false)}>Cancel</Pill>
                </Track>
              </div>
            </form>
          </ErrorsContext.Provider>
        </SheetContent>
      </Sheet>
    </>
  )
}

/** Pills in one track: optional sheet triggers (bare) plus one-click status changes backed by bound server actions. */
export function ActionGroup({
  actions = [],
  children,
  size = 'sm',
}: {
  actions?: ReadonlyArray<{ label: string; action: () => Promise<SheetResult>; variant?: 'raised' | 'primary' | 'plain' | 'danger' }>
  children?: React.ReactNode
  size?: 'sm' | 'md'
}) {
  const [pending, setPending] = React.useState<string | null>(null)
  const [error, setError] = React.useState('')
  async function run(label: string, action: () => Promise<SheetResult>) {
    if (pending) return
    setPending(label); setError('')
    try {
      const result = await action()
      if (!result.success) setError(result.error)
    } catch {
      setError('Update failed.')
    } finally {
      setPending(null)
    }
  }
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <Track>
        {children}
        {actions.map(item => (
          <Pill key={item.label} size={size} variant={item.variant ?? 'plain'} disabled={pending !== null} onClick={() => run(item.label, item.action)}>
            {pending === item.label && <Loader2 className="animate-spin" aria-hidden />}
            {item.label}
          </Pill>
        ))}
      </Track>
      {error && <span role="alert" className="max-w-64 text-xs text-red-600 dark:text-red-400">{error}</span>}
    </span>
  )
}

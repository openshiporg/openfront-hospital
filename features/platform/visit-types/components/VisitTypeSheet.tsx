'use client'

import { FormEvent, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil, Plus } from 'lucide-react'

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Notice, Pill, StatusDot, Track, fieldClass, labelClass } from '@/features/platform/components/ward'
import { CheckList } from '@/features/platform/providers/components/CheckList'
import type { Option } from '@/features/platform/providers/actions/types'
import { createVisitType, setVisitTypeStatus, updateVisitType } from '../actions/mutations'
import { INTAKE_SECTIONS, VISIT_STATUSES, slugify, validateVisitType, type VisitTypeInput } from '../actions/types'

type Draft = Omit<VisitTypeInput, 'durationMinutes' | 'bufferBeforeMinutes' | 'bufferAfterMinutes' | 'priceCents'> & {
  durationMinutes: string
  bufferBeforeMinutes: string
  bufferAfterMinutes: string
  price: string
}

const EMPTY: VisitTypeInput = {
  name: '',
  slug: '',
  description: '',
  durationMinutes: 30,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  priceCents: 0,
  intakeSections: ['contact', 'reason_for_visit'],
  status: 'bookable',
  providerIds: [],
}

function toDraft(input: VisitTypeInput): Draft {
  return {
    ...input,
    durationMinutes: String(input.durationMinutes),
    bufferBeforeMinutes: String(input.bufferBeforeMinutes),
    bufferAfterMinutes: String(input.bufferAfterMinutes),
    price: (input.priceCents / 100).toFixed(2),
  }
}

function toNumber(value: string) {
  return value.trim() === '' ? NaN : Number(value)
}

function fromDraft(draft: Draft): VisitTypeInput {
  const { price, ...rest } = draft
  const priceNumber = toNumber(price)
  return {
    ...rest,
    durationMinutes: toNumber(draft.durationMinutes),
    bufferBeforeMinutes: toNumber(draft.bufferBeforeMinutes),
    bufferAfterMinutes: toNumber(draft.bufferAfterMinutes),
    priceCents: Number.isFinite(priceNumber) ? Math.round(priceNumber * 100) : NaN,
  }
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((v) => b.includes(v))

export function VisitTypeSheet({
  mode,
  visitTypeId,
  initial,
  providers,
}: {
  mode: 'create' | 'edit'
  visitTypeId?: string
  initial?: VisitTypeInput
  providers: Option[]
}) {
  const router = useRouter()
  const start = initial ?? EMPTY
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>(toDraft(start))
  const [slugTouched, setSlugTouched] = useState(mode === 'edit')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Partial<Record<keyof VisitTypeInput, string>>>({})

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setDraft(toDraft(initial ?? EMPTY))
      setSlugTouched(mode === 'edit')
      setError(null)
      setErrors({})
    }
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const input = fromDraft(draft)
    const found = validateVisitType(input, false)
    setErrors(found)
    if (Object.keys(found).length) return
    setPending(true)
    setError(null)
    try {
      if (mode === 'create') {
        const result = await createVisitType(input)
        if (!result.success) return setError(result.error)
        setOpen(false)
        if (result.data?.id) router.push(`/dashboard/platform/visit-types/${result.data.id}`)
        else router.refresh()
      } else if (visitTypeId) {
        const changed: Partial<VisitTypeInput> = {}
        for (const key of Object.keys(input) as Array<keyof VisitTypeInput>) {
          const a = input[key]
          const b = start[key]
          const same = Array.isArray(a) && Array.isArray(b) ? sameSet(a, b) : a === b
          if (!same) (changed as Record<string, unknown>)[key] = a
        }
        const result = await updateVisitType(visitTypeId, changed)
        if (!result.success) return setError(result.error)
        setOpen(false)
        router.refresh()
      }
    } catch {
      setError(mode === 'create' ? 'Visit type could not be created.' : 'Visit type could not be saved.')
    } finally {
      setPending(false)
    }
  }

  const err = (key: keyof VisitTypeInput) => errors[key] && <span className="text-red-600 dark:text-red-400">{errors[key]}</span>

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <Track>
        <Pill variant={mode === 'create' ? 'primary' : 'raised'} onClick={() => onOpenChange(true)}>
          {mode === 'create' ? <Plus aria-hidden /> : <Pencil aria-hidden />}
          {mode === 'create' ? 'New visit type' : 'Edit'}
        </Pill>
      </Track>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <SheetHeader className="border-b px-5 py-4 text-left">
          <SheetTitle>{mode === 'create' ? 'New visit type' : 'Edit visit type'}</SheetTitle>
        </SheetHeader>
        <form onSubmit={onSubmit} className="flex min-w-0 flex-1 flex-col" noValidate>
          <fieldset disabled={pending} className="grid min-w-0 gap-3 px-5 py-4 sm:grid-cols-2">
            <label className={`${labelClass} sm:col-span-2`}>
              <span className="flex justify-between">Name {err('name')}</span>
              <input
                className={fieldClass}
                value={draft.name}
                maxLength={200}
                aria-invalid={Boolean(errors.name)}
                onChange={(e) => {
                  const name = e.target.value
                  setDraft((d) => ({ ...d, name, slug: slugTouched ? d.slug : slugify(name) }))
                }}
              />
            </label>
            <label className={`${labelClass} sm:col-span-2`}>
              <span className="flex justify-between">Slug {err('slug')}</span>
              <input
                className={`${fieldClass} tabular-nums`}
                value={draft.slug}
                maxLength={80}
                aria-invalid={Boolean(errors.slug)}
                onChange={(e) => {
                  setSlugTouched(true)
                  set('slug', e.target.value.toLowerCase())
                }}
              />
            </label>
            <label className={`${labelClass} sm:col-span-2`}>
              <span className="flex justify-between">Description {err('description')}</span>
              <textarea className={`${fieldClass} h-24 py-2`} value={draft.description} maxLength={5000} onChange={(e) => set('description', e.target.value)} />
            </label>
            <label className={labelClass}>
              <span className="flex justify-between">Duration (min) {err('durationMinutes')}</span>
              <input type="number" inputMode="numeric" min={5} max={480} step={5} className={fieldClass} value={draft.durationMinutes} aria-invalid={Boolean(errors.durationMinutes)} onChange={(e) => set('durationMinutes', e.target.value)} />
            </label>
            <label className={labelClass}>
              <span className="flex justify-between">Price (USD) {err('priceCents')}</span>
              <input type="number" inputMode="decimal" min={0} step="0.01" className={fieldClass} value={draft.price} aria-invalid={Boolean(errors.priceCents)} onChange={(e) => set('price', e.target.value)} />
            </label>
            <label className={labelClass}>
              <span className="flex justify-between">Buffer before (min) {err('bufferBeforeMinutes')}</span>
              <input type="number" inputMode="numeric" min={0} max={240} className={fieldClass} value={draft.bufferBeforeMinutes} aria-invalid={Boolean(errors.bufferBeforeMinutes)} onChange={(e) => set('bufferBeforeMinutes', e.target.value)} />
            </label>
            <label className={labelClass}>
              <span className="flex justify-between">Buffer after (min) {err('bufferAfterMinutes')}</span>
              <input type="number" inputMode="numeric" min={0} max={240} className={fieldClass} value={draft.bufferAfterMinutes} aria-invalid={Boolean(errors.bufferAfterMinutes)} onChange={(e) => set('bufferAfterMinutes', e.target.value)} />
            </label>
            <label className={`${labelClass} sm:col-span-2`}>
              Status
              <select className={fieldClass} value={draft.status} onChange={(e) => set('status', e.target.value)}>
                {VISIT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            <div className="sm:col-span-2">
              <CheckList
                label="Intake sections"
                options={INTAKE_SECTIONS.map((s) => ({ id: s.value, label: s.label }))}
                value={draft.intakeSections}
                onChange={(v) => set('intakeSections', v)}
              />
            </div>
            <div className="sm:col-span-2">
              <CheckList label="Providers" options={providers} value={draft.providerIds} onChange={(v) => set('providerIds', v)} />
            </div>
          </fieldset>
          <div className="mt-auto grid gap-3 border-t px-5 py-4">
            {error && <Notice tone="bad">{error}</Notice>}
            <Track className="self-end">
              <Pill variant="plain" onClick={() => setOpen(false)}>Cancel</Pill>
              <Pill type="submit" variant="primary" disabled={pending}>
                {pending && <Loader2 className="animate-spin" aria-hidden />}
                {mode === 'create' ? 'Create visit type' : 'Save'}
              </Pill>
            </Track>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

export function VisitTypeStatusPills({ visitTypeId, status }: { visitTypeId: string; status: string | null }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [target, setTarget] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="grid min-w-0 gap-2">
      <Track role="group" aria-label="Visit type status">
        {VISIT_STATUSES.map((s) => {
          const current = s.value === status
          return (
            <Pill
              key={s.value}
              active={current}
              aria-pressed={current}
              disabled={pending}
              onClick={() => {
                if (current) return
                setTarget(s.value)
                startTransition(async () => {
                  setError(null)
                  const result = await setVisitTypeStatus(visitTypeId, s.value)
                  if (!result.success) setError(result.error)
                  else router.refresh()
                })
              }}
            >
              {pending && target === s.value ? <Loader2 className="animate-spin" aria-hidden /> : <StatusDot tone={s.tone} className="size-1.5 shadow-none" />}
              {current ? s.label : s.action}
            </Pill>
          )
        })}
      </Track>
      {error && <Notice tone="bad">{error}</Notice>}
    </div>
  )
}

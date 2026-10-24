'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil, Plus } from 'lucide-react'

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Notice, Pill, Track, fieldClass, labelClass } from '@/features/platform/components/ward'
import { createProvider, updateProvider } from '../actions/mutations'
import { PROVIDER_STATUSES, type Option, type ProviderInput } from '../actions/types'
import { CheckList } from './CheckList'

const EMPTY: ProviderInput = {
  firstName: '',
  lastName: '',
  credentials: '',
  specialty: '',
  bio: '',
  locationName: '',
  status: 'active',
  facilityIds: [],
  appointmentTypeIds: [],
}

export function ProviderSheet({
  mode,
  providerId,
  initial,
  facilities,
  appointmentTypes,
}: {
  mode: 'create' | 'edit'
  providerId?: string
  initial?: ProviderInput
  facilities: Option[]
  appointmentTypes: Option[]
}) {
  const router = useRouter()
  const start = initial ?? EMPTY
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<ProviderInput>(start)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ProviderInput, string>>>({})

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setForm(initial ?? EMPTY)
      setError(null)
      setFieldErrors({})
    }
  }

  const set = <K extends keyof ProviderInput>(key: K, value: ProviderInput[K]) => setForm((f) => ({ ...f, [key]: value }))
  const displayName = `${form.firstName.trim()} ${form.lastName.trim()}${form.credentials.trim() ? `, ${form.credentials.trim()}` : ''}`.trim()

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const errors: Partial<Record<keyof ProviderInput, string>> = {}
    if (!form.firstName.trim()) errors.firstName = 'Required'
    if (!form.lastName.trim()) errors.lastName = 'Required'
    setFieldErrors(errors)
    if (Object.keys(errors).length) return
    setPending(true)
    setError(null)
    try {
      if (mode === 'create') {
        const result = await createProvider(form)
        if (!result.success) return setError(result.error)
        setOpen(false)
        if (result.data?.id) router.push(`/dashboard/platform/providers/${result.data.id}`)
        else router.refresh()
      } else if (providerId) {
        const changed: Partial<ProviderInput> = {}
        for (const key of Object.keys(form) as Array<keyof ProviderInput>) {
          const a = form[key]
          const b = start[key]
          const same = Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((v) => b.includes(v)) : a === b
          if (!same) (changed as Record<string, unknown>)[key] = a
        }
        const result = await updateProvider(providerId, changed)
        if (!result.success) return setError(result.error)
        setOpen(false)
        router.refresh()
      }
    } catch {
      setError(mode === 'create' ? 'Provider could not be created.' : 'Provider could not be saved.')
    } finally {
      setPending(false)
    }
  }

  const err = (key: keyof ProviderInput) => fieldErrors[key] && <span className="text-red-600 dark:text-red-400">{fieldErrors[key]}</span>

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <Track>
        <Pill variant={mode === 'create' ? 'primary' : 'raised'} onClick={() => onOpenChange(true)}>
          {mode === 'create' ? <Plus aria-hidden /> : <Pencil aria-hidden />}
          {mode === 'create' ? 'New provider' : 'Edit'}
        </Pill>
      </Track>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <SheetHeader className="border-b px-5 py-4 text-left">
          <SheetTitle>{mode === 'create' ? 'New provider' : 'Edit provider'}</SheetTitle>
        </SheetHeader>
        <form onSubmit={onSubmit} className="flex min-w-0 flex-1 flex-col" noValidate>
          <fieldset disabled={pending} className="grid min-w-0 gap-3 px-5 py-4 sm:grid-cols-2">
            <label className={labelClass}>
              <span className="flex justify-between">First name {err('firstName')}</span>
              <input className={fieldClass} value={form.firstName} onChange={(e) => set('firstName', e.target.value)} aria-invalid={Boolean(fieldErrors.firstName)} maxLength={200} required />
            </label>
            <label className={labelClass}>
              <span className="flex justify-between">Last name {err('lastName')}</span>
              <input className={fieldClass} value={form.lastName} onChange={(e) => set('lastName', e.target.value)} aria-invalid={Boolean(fieldErrors.lastName)} maxLength={200} required />
            </label>
            <label className={labelClass}>
              Credentials
              <input className={fieldClass} value={form.credentials} onChange={(e) => set('credentials', e.target.value)} placeholder="MD" maxLength={200} />
            </label>
            <label className={labelClass}>
              Specialty
              <input className={fieldClass} value={form.specialty} onChange={(e) => set('specialty', e.target.value)} maxLength={200} />
            </label>
            <div className={`${labelClass} sm:col-span-2`}>
              Display name
              <p className="flex h-9 items-center rounded-lg border border-dashed px-3 text-sm text-foreground">{displayName || '—'}</p>
            </div>
            <label className={labelClass}>
              Primary location
              <input className={fieldClass} value={form.locationName} onChange={(e) => set('locationName', e.target.value)} maxLength={200} />
            </label>
            <label className={labelClass}>
              Status
              <select className={fieldClass} value={form.status} onChange={(e) => set('status', e.target.value)}>
                {PROVIDER_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            <label className={`${labelClass} sm:col-span-2`}>
              Bio
              <textarea className={`${fieldClass} h-24 py-2`} value={form.bio} onChange={(e) => set('bio', e.target.value)} maxLength={5000} />
            </label>
            <div className="sm:col-span-2">
              <CheckList label="Facilities" options={facilities} value={form.facilityIds} onChange={(v) => set('facilityIds', v)} />
            </div>
            <div className="sm:col-span-2">
              <CheckList label="Visit types" options={appointmentTypes} value={form.appointmentTypeIds} onChange={(v) => set('appointmentTypeIds', v)} />
            </div>
          </fieldset>
          <div className="mt-auto grid gap-3 border-t px-5 py-4">
            {error && <Notice tone="bad">{error}</Notice>}
            <Track className="self-end">
              <Pill variant="plain" onClick={() => setOpen(false)}>Cancel</Pill>
              <Pill type="submit" variant="primary" disabled={pending}>
                {pending && <Loader2 className="animate-spin" aria-hidden />}
                {mode === 'create' ? 'Create provider' : 'Save'}
              </Pill>
            </Track>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

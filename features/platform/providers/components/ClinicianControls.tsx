'use client'

import { FormEvent, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil, Plus } from 'lucide-react'

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Notice, Pill, Track, fieldClass, labelClass } from '@/features/platform/components/ward'
import { createClinician, updateClinician } from '../actions/mutations'
import { CLINICIAN_TYPES, type ClinicianInput, type ClinicianRecord, type Option } from '../actions/types'

function toInput(record?: ClinicianRecord): ClinicianInput {
  return {
    displayName: record?.displayName ?? '',
    clinicianType: record?.clinicianType ?? 'physician',
    licenseNumber: record?.licenseNumber ?? '',
    email: record?.email ?? '',
    phone: record?.phone ?? '',
    active: record?.active ?? true,
    departmentId: record?.department?.id ?? '',
  }
}

export function ClinicianSheet({
  providerId,
  clinician,
  departments,
}: {
  providerId: string
  clinician?: ClinicianRecord
  departments: Option[]
}) {
  const router = useRouter()
  const mode = clinician ? 'edit' : 'create'
  const start = toInput(clinician)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<ClinicianInput>(start)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState(false)

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setForm(toInput(clinician))
      setError(null)
      setNameError(false)
    }
  }

  const set = <K extends keyof ClinicianInput>(key: K, value: ClinicianInput[K]) => setForm((f) => ({ ...f, [key]: value }))

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!form.displayName.trim()) return setNameError(true)
    setNameError(false)
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setError('Email is invalid.')
    setPending(true)
    setError(null)
    try {
      let result
      if (clinician) {
        // Only send changed fields: sensitive fields read as empty without permission and must not be blanked.
        const changed: Partial<ClinicianInput> = {}
        for (const key of ['displayName', 'clinicianType', 'licenseNumber', 'email', 'phone', 'active'] as const) {
          if (form[key] !== start[key]) (changed as Record<string, unknown>)[key] = form[key]
        }
        result = await updateClinician(providerId, clinician.id, changed)
      } else {
        result = await createClinician(providerId, form)
      }
      if (!result.success) return setError(result.error)
      setOpen(false)
      router.refresh()
    } catch {
      setError('Clinician record could not be saved.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {clinician ? (
        <Pill size="sm" onClick={() => onOpenChange(true)}><Pencil aria-hidden />Edit</Pill>
      ) : (
        <Track><Pill size="sm" onClick={() => onOpenChange(true)}><Plus aria-hidden />Add clinician</Pill></Track>
      )}
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="border-b px-5 py-4 text-left">
          <SheetTitle>{mode === 'create' ? 'New clinician record' : 'Edit clinician record'}</SheetTitle>
        </SheetHeader>
        <form onSubmit={onSubmit} className="flex min-w-0 flex-1 flex-col" noValidate>
          <fieldset disabled={pending} className="grid min-w-0 gap-3 px-5 py-4 sm:grid-cols-2">
            <label className={`${labelClass} sm:col-span-2`}>
              <span className="flex justify-between">Display name {nameError && <span className="text-red-600 dark:text-red-400">Required</span>}</span>
              <input className={fieldClass} value={form.displayName} onChange={(e) => set('displayName', e.target.value)} aria-invalid={nameError} maxLength={200} required />
            </label>
            <label className={labelClass}>
              Type
              <select className={fieldClass} value={form.clinicianType} onChange={(e) => set('clinicianType', e.target.value)}>
                {CLINICIAN_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className={labelClass}>
              License number
              <input className={`${fieldClass} font-mono`} value={form.licenseNumber} onChange={(e) => set('licenseNumber', e.target.value)} maxLength={200} />
            </label>
            <label className={labelClass}>
              Email
              <input type="email" className={fieldClass} value={form.email} onChange={(e) => set('email', e.target.value)} maxLength={200} />
            </label>
            <label className={labelClass}>
              Phone
              <input type="tel" className={fieldClass} value={form.phone} onChange={(e) => set('phone', e.target.value)} maxLength={200} />
            </label>
            {clinician ? (
              <div className={`${labelClass} sm:col-span-2`}>
                Department
                <p className="flex h-9 items-center rounded-lg border border-dashed px-3 text-sm text-foreground">{clinician.department?.name || 'None'}</p>
              </div>
            ) : (
              <label className={`${labelClass} sm:col-span-2`}>
                Department
                <select className={fieldClass} value={form.departmentId} onChange={(e) => set('departmentId', e.target.value)}>
                  <option value="">None</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              </label>
            )}
            <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
              <input type="checkbox" className="size-4 accent-teal-700 dark:accent-teal-400" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
              Active
            </label>
          </fieldset>
          <div className="mt-auto grid gap-3 border-t px-5 py-4">
            {error && <Notice tone="bad">{error}</Notice>}
            <Track className="self-end">
              <Pill variant="plain" onClick={() => setOpen(false)}>Cancel</Pill>
              <Pill type="submit" variant="primary" disabled={pending}>
                {pending && <Loader2 className="animate-spin" aria-hidden />}
                {mode === 'create' ? 'Create record' : 'Save'}
              </Pill>
            </Track>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

export function ClinicianActiveToggle({ providerId, clinicianId, active }: { providerId: string; clinicianId: string; active: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <Pill
        size="sm"
        variant={active ? 'plain' : 'raised'}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await updateClinician(providerId, clinicianId, { active: !active })
            if (!result.success) setError(result.error)
            else router.refresh()
          })
        }
      >
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {active ? 'Deactivate' : 'Activate'}
      </Pill>
      {error && <span role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </>
  )
}

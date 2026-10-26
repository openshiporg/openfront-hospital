'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { Pill, Track, fieldClass, labelClass } from '@/features/platform/components/ward'
import { FacilitySearchField } from '@/features/platform/facilities/components/FacilitySearchField'
import type { OperationsOption, OperationsWorkspaceOptions } from '@/features/platform/operations/types'
import { searchEncounterOpenPatientCandidates, searchOperationalDepartments, searchOperationalProviders } from '@/features/platform/operations/actions/workflows'
import { openEncounter } from '../actions/transitions'
import { EpisodeClosurePanel } from './EpisodePolicyWorkspace'

const selectClassName = fieldClass
const hintClass = 'text-xs text-muted-foreground'

function readOperationKey(key: string) {
  try { return sessionStorage.getItem(key) } catch { return null }
}
function saveOperationKey(key: string, value: string) {
  try { sessionStorage.setItem(key, value) } catch { /* in-memory retry remains available */ }
}
function clearOperationKey(key: string) {
  try { sessionStorage.removeItem(key) } catch { /* no persisted key to clear */ }
}

function SelectField({ id, name, label, options, required = true, onChange }: { id: string; name: string; label: string; options: OperationsOption[]; required?: boolean; onChange?: (value: string) => void }) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <label htmlFor={id} className={labelClass}>{label}{required ? '' : ' (optional)'}</label>
      <select id={id} name={name} required={required} className={selectClassName} defaultValue="" onChange={event => onChange?.(event.target.value)}>
        <option value="">Select {label.toLowerCase()}</option>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  )
}

function DepartmentSearchField({ facilityId }: { facilityId: string }) {
  const id = useId().replaceAll(':', '')
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<OperationsOption[]>([])
  const [count, setCount] = useState(0)
  const [selected, setSelected] = useState<OperationsOption | null>(null)
  const [pending, setPending] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    const normalized = search.trim()
    if (!facilityId || normalized.length < 2) {
      setOptions([])
      setCount(0)
      setSelected(null)
      setPending(false)
      setUnavailable(false)
      return
    }

    setPending(true)
    setUnavailable(false)
    setOptions([])
    setCount(0)
    setSelected(null)
    const timer = setTimeout(() => {
      void searchOperationalDepartments(facilityId, normalized).then(response => {
        if (cancelled) return
        if (!response.success) {
          setUnavailable(true)
          return
        }
        setOptions(response.data.departments.map(row => ({ value: row.id, label: row.name })))
        setCount(response.data.departmentsCount)
      }).catch(() => {
        if (!cancelled) setUnavailable(true)
      }).finally(() => {
        if (!cancelled) setPending(false)
      })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [facilityId, search])

  const noMatches = !pending && !unavailable && Boolean(facilityId) && search.trim().length >= 2 && count === 0

  return (
    <div className="grid min-w-0 gap-1.5">
      <label htmlFor={`${id}-search`} className={labelClass}>Department (optional)</label>
      <input
        className={fieldClass}
        id={`${id}-search`}
        type="search"
        value={search}
        onChange={event => {
          const next = event.target.value
          setSearch(next)
          setSelected(null)
          setOptions([])
          setCount(0)
          setPending(Boolean(facilityId && next.trim().length >= 2))
          setUnavailable(false)
        }}
        placeholder={facilityId ? 'Search active departments in this facility' : 'Select a facility first'}
        aria-label="Search active departments in selected facility"
        maxLength={100}
        disabled={!facilityId}
      />
      <select
        id={`${id}-select`}
        name="departmentId"
        className={selectClassName}
        value={selected?.value || ''}
        aria-label="Department (optional)"
        disabled={!facilityId}
        onChange={event => setSelected(options.find(option => option.value === event.target.value) || null)}
      >
        <option value="">{!facilityId ? 'Select a facility first' : pending ? 'Searching…' : search.trim().length < 2 ? 'No department selected (optional)' : 'Select department (optional)'}</option>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {count > options.length && <p className={hintClass}>Showing {options.length} of {count} departments. Narrow the search.</p>}
      {unavailable && <p role="status" className={hintClass}>Department search is unavailable.</p>}
      {noMatches && <p role="status" className={hintClass}>No matching departments in this facility.</p>}
    </div>
  )
}

function EncounterPatientSearchField({ facilityId }: { facilityId: string }) {
  const id = useId().replaceAll(':', '')
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<OperationsOption[]>([])
  const [count, setCount] = useState(0)
  const [selected, setSelected] = useState<OperationsOption | null>(null)
  const [pending, setPending] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    const normalized = search.trim()
    if (!facilityId || normalized.length < 2) {
      setOptions([])
      setCount(0)
      setSelected(null)
      setPending(false)
      setUnavailable(false)
      return
    }

    setPending(true)
    setUnavailable(false)
    setOptions([])
    setCount(0)
    setSelected(null)
    const timer = setTimeout(() => {
      void searchEncounterOpenPatientCandidates(facilityId, normalized).then(response => {
        if (cancelled) return
        if (!response.success) {
          setUnavailable(true)
          return
        }
        setOptions(response.data.patients.map(row => ({ value: row.id, label: row.displayName! })))
        setCount(response.data.patientsCount)
      }).catch(() => {
        if (!cancelled) setUnavailable(true)
      }).finally(() => {
        if (!cancelled) setPending(false)
      })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [facilityId, search])

  const noMatches = !pending && !unavailable && Boolean(facilityId) && search.trim().length >= 2 && count === 0

  return (
    <div className="grid min-w-0 gap-1.5">
      <label htmlFor={`${id}-search`} className={labelClass}>Patient</label>
      <input
        className={fieldClass}
        id={`${id}-search`}
        type="search"
        value={search}
        onChange={event => {
          const next = event.target.value
          setSearch(next)
          setSelected(null)
          setOptions([])
          setCount(0)
          setPending(Boolean(facilityId && next.trim().length >= 2))
          setUnavailable(false)
        }}
        placeholder={facilityId ? 'Search patient name' : 'Select a facility first'}
        aria-label="Search active patients in selected facility by name"
        maxLength={100}
        disabled={!facilityId}
      />
      <select
        id={`${id}-select`}
        name="patientId"
        required
        className={selectClassName}
        value={selected?.value || ''}
        aria-label="Patient"
        disabled={!facilityId}
        onChange={event => setSelected(options.find(option => option.value === event.target.value) || null)}
      >
        <option value="">{!facilityId ? 'Select a facility first' : pending ? 'Searching…' : search.trim().length < 2 ? 'Enter at least 2 characters to search patients' : 'Select patient'}</option>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {count > options.length && <p className={hintClass}>Showing {options.length} of {count} patients. Narrow the search.</p>}
      {unavailable && <p role="status" className={hintClass}>Patient search is unavailable.</p>}
      {noMatches && <p role="status" className={hintClass}>No matching patients in this facility.</p>}
    </div>
  )
}

function ProviderSearchField({ facilityId }: { facilityId: string }) {
  const id = useId().replaceAll(':', '')
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<OperationsOption[]>([])
  const [count, setCount] = useState(0)
  const [selected, setSelected] = useState<OperationsOption | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setSearch('')
    setOptions([])
    setCount(0)
    setSelected(null)
    setError('')
  }, [facilityId])

  useEffect(() => {
    let cancelled = false
    const normalized = search.trim()
    if (!facilityId || normalized.length < 2) {
      setOptions([])
      setCount(0)
      setPending(false)
      return
    }
    const timer = setTimeout(() => {
      setPending(true)
      setError('')
      setOptions([])
      void searchOperationalProviders(facilityId, normalized).then(response => {
        if (cancelled) return
        if (!response.success) throw new Error(response.error || 'Provider search is unavailable')
        const rows = response.data.providers.map(row => ({
          value: row.id,
          label: [row.displayName || 'Provider', row.specialty].filter(Boolean).join(' · '),
        }))
        setOptions(rows)
        setCount(response.data.providersCount)
        setError(rows.length ? '' : 'No matching providers found in this facility.')
      }).catch(caught => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Provider search is unavailable')
      }).finally(() => {
        if (!cancelled) setPending(false)
      })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [facilityId, search])

  const visibleOptions = selected && !options.some(option => option.value === selected.value)
    ? [selected, ...options]
    : options

  return (
    <div className="grid min-w-0 gap-1.5">
      <label htmlFor={`${id}-search`} className={labelClass}>Provider</label>
      <input
        className={fieldClass}
        id={`${id}-search`}
        type="search"
        value={search}
        onChange={event => setSearch(event.target.value)}
        placeholder="Search provider name or specialty"
        aria-label="Search provider name or specialty"
        maxLength={100}
        disabled={!facilityId}
      />
      <select
        id={`${id}-select`}
        name="providerId"
        required
        className={selectClassName}
        value={selected?.value || ''}
        onChange={event => setSelected(visibleOptions.find(option => option.value === event.target.value) || null)}
      >
        <option value="">{!facilityId ? 'Select a facility first' : search.trim().length < 2 ? 'Enter at least 2 characters to search' : pending ? 'Searching…' : 'Select provider'}</option>
        {visibleOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {count > options.length && <p className={hintClass}>Showing {options.length} of {count} providers. Narrow the search.</p>}
      {error && <p role="status" className={hintClass}>{error}</p>}
    </div>
  )
}

export function OpenEncounterForm({ options }: { options: OperationsWorkspaceOptions }) {
  const formRef = useRef<HTMLFormElement>(null)
  const formId = useId().replaceAll(':', '')
  const operationKeyRef = useRef<string | null>(null)
  const [facilityId, setFacilityId] = useState('')
  const [formResetVersion, setFormResetVersion] = useState(0)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const missingReferences = options.facilitiesCount === 0

  return (
    <details className="group min-w-0 rounded-[4px] border bg-card" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold marker:hidden md:px-5 [&::-webkit-details-marker]:hidden">
        <span>Open encounter</span>
        <span aria-hidden className="text-xs font-normal text-muted-foreground group-open:rotate-180">▾</span>
      </summary>
      <form
        ref={formRef}
        className="grid min-w-0 gap-4 border-t p-4 md:grid-cols-2 md:p-5"
        action={async formData => {
          setPending(true)
          setMessage(null)
          const input = {
            facilityId: String(formData.get('facilityId') || ''),
            patientId: String(formData.get('patientId') || ''),
            providerId: String(formData.get('providerId') || ''),
            appointmentId: String(formData.get('appointmentId') || '') || undefined,
            departmentId: String(formData.get('departmentId') || '') || undefined,
            chiefComplaint: String(formData.get('chiefComplaint') || '') || undefined,
          }
          const storageKey = `openfront:operation:${window.location.pathname}:${formId}`
          const operationKey = operationKeyRef.current || readOperationKey(storageKey) || `encounter-ui-${crypto.randomUUID()}`
          operationKeyRef.current = operationKey
          saveOperationKey(storageKey, operationKey)
          try {
            const response = await openEncounter({ ...input, operationKey })
            if (!response.success) {
              setMessage({ type: 'error', text: response.error })
              return
            }
            operationKeyRef.current = null
            clearOperationKey(storageKey)
            formRef.current?.reset()
            setFacilityId('')
            setFormResetVersion(version => version + 1)
            setMessage({ type: 'success', text: 'Encounter opened' })
          } catch {
            setMessage({ type: 'error', text: 'The result could not be verified. Retry the same details; the saved operation identity will safely replay an already-completed request.' })
          } finally {
            setPending(false)
          }
        }}
      >
        <FacilitySearchField key={formResetVersion} id="encounter-facility" onSelect={setFacilityId} accessibleFacilityCount={options.facilitiesCount} />
        <EncounterPatientSearchField key={`patient:${facilityId}:${formResetVersion}`} facilityId={facilityId} />
        <ProviderSearchField key={`provider:${facilityId}:${formResetVersion}`} facilityId={facilityId} />
        <SelectField key={`appointment:${facilityId}:${formResetVersion}`} id="encounter-appointment" name="appointmentId" label="Checked-in appointment" options={options.checkedInAppointments} required={false} />
        <DepartmentSearchField key={`department:${facilityId}:${formResetVersion}`} facilityId={facilityId} />
        <div className="grid min-w-0 gap-1.5 md:col-span-2">
          <label htmlFor="encounter-chief-complaint" className={labelClass}>Reason for encounter (optional)</label>
          <textarea id="encounter-chief-complaint" name="chiefComplaint" maxLength={4000} rows={3} className={`${fieldClass} h-auto py-2`} />
        </div>
        {missingReferences && <p role="status" className="text-sm text-muted-foreground md:col-span-2">No accessible active facility.</p>}
        {message && <p role={message.type === 'error' ? 'alert' : 'status'} className={`text-sm md:col-span-2 ${message.type === 'error' ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-300'}`}>{message.text}</p>}
        <div className="md:col-span-2">
          <Track>
            <Pill type="submit" variant="primary" disabled={pending || missingReferences}>
              {pending && <Loader2 className="animate-spin" />}
              Open encounter
            </Pill>
          </Track>
        </div>
      </form>
    </details>
  )
}

export function EncounterTransitionControls({ encounter }: { encounter: { id: string; status: string; transitionVersion: number } }) {
  return <EpisodeClosurePanel encounterId={encounter.id} />
}

'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { FacilitySearchField } from '@/features/platform/facilities/components/FacilitySearchField'
import type { OperationsOption, OperationsWorkspaceOptions } from '@/features/platform/operations/types'
import { searchEncounterOpenPatientCandidates, searchOperationalDepartments, searchOperationalProviders } from '@/features/platform/operations/actions/workflows'
import { openEncounter } from '../actions/transitions'
import { EpisodeClosurePanel } from './EpisodePolicyWorkspace'

const selectClassName = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring'

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
    <div className="space-y-2">
      <Label htmlFor={id}>{label}{required ? '' : ' (optional)'}</Label>
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
    <div className="space-y-2">
      <Label htmlFor={`${id}-search`}>Department (optional)</Label>
      <Input
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
      {count > options.length && <p className="text-xs text-muted-foreground">Showing {options.length} of {count} matching active departments in this facility. Add characters to narrow results.</p>}
      {unavailable && <p role="status" className="text-xs text-muted-foreground">Department search is unavailable for this session. Authority or facility scope could not be verified; no empty result is being inferred.</p>}
      {noMatches && <p role="status" className="text-xs text-muted-foreground">No matching active departments were found in the selected accessible facility.</p>}
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
    <div className="space-y-2">
      <Label htmlFor={`${id}-search`}>Patient</Label>
      <Input
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
      {count > options.length && <p className="text-xs text-muted-foreground">Showing {options.length} of {count} matching active patients in this facility. Add characters to narrow results.</p>}
      {unavailable && <p role="status" className="text-xs text-muted-foreground">Patient search is unavailable for this session. Authority or facility scope could not be verified; no empty result is being inferred.</p>}
      {noMatches && <p role="status" className="text-xs text-muted-foreground">No matching active patients were found in the selected accessible facility.</p>}
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
    <div className="space-y-2">
      <Label htmlFor={`${id}-search`}>Provider</Label>
      <Input
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
      {count > options.length && <p className="text-xs text-muted-foreground">Showing {options.length} of {count} matches. Add more characters to narrow results.</p>}
      {error && <p role="status" className="text-xs text-muted-foreground">{error}</p>}
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
    <details className="rounded-lg border bg-card" open>
      <summary className="cursor-pointer list-none px-4 py-3 marker:hidden">
        <span className="block font-medium">Open encounter</span>
        <span className="mt-1 block text-sm text-muted-foreground">Start an encounter for a patient, provider, and facility.</span>
      </summary>
      <form
        ref={formRef}
        className="grid gap-4 border-t p-4 md:grid-cols-2"
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
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="encounter-chief-complaint">Reason for encounter (optional)</Label>
          <Textarea id="encounter-chief-complaint" name="chiefComplaint" maxLength={4000} />
        </div>
        {missingReferences && <p role="status" className="text-sm text-muted-foreground md:col-span-2">An accessible active facility is required before opening an encounter. Search for a patient and provider after choosing the facility.</p>}
        {message && <p role={message.type === 'error' ? 'alert' : 'status'} className={`text-sm md:col-span-2 ${message.type === 'error' ? 'text-destructive' : 'text-emerald-700'}`}>{message.text}</p>}
        <div className="md:col-span-2">
          <Button disabled={pending || missingReferences}>
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Open encounter
          </Button>
        </div>
      </form>
    </details>
  )
}

export function EncounterTransitionControls({ encounter }: { encounter: { id: string; status: string; transitionVersion: number } }) {
  return <EpisodeClosurePanel encounterId={encounter.id} />
}

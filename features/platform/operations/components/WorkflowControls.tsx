'use client'

import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type LabelHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { DeviceTimeNotice } from '@/features/platform/components/DeviceTimeNotice'
import { deviceLocalDateTimeToIso } from '@/features/platform/lib/deviceDateTime'
import { useDraftExitGuard } from '@/features/platform/lib/useDraftExitGuard'
import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Notice, Pill, Track, fieldClass, labelClass } from '@/features/platform/components/ward'
import { FacilitySearchField } from '@/features/platform/facilities/components/FacilitySearchField'
import * as actions from '../actions/workflows'
import { recoverLabCommand } from '../actions/labResults'
import type { OperationsOption, OperationsWorkspaceOptions } from '../types'

type ActionResponse = { success: boolean; error?: string; readback?: unknown }
type Field = {
  name: string
  label: string
  kind?: 'text' | 'textarea' | 'select' | 'searchable' | 'facility' | 'facility-patient-search' | 'lab-test-search' | 'lab-order-search' | 'medication-order-search' | 'procedure-order-search' | 'lab-result-search' | 'clinician-search' | 'datetime-local' | 'currency' | 'decimal' | 'integer'
  options?: OperationsOption[]
  required?: boolean
  placeholder?: string
  maxLength?: number
}

type OperationFormProps = {
  title: string
  description: string
  fields: Field[]
  submitLabel: string
  onSubmit: (data: Record<string, unknown>) => Promise<ActionResponse>
  recoverOriginal?: (data: Record<string, unknown>) => Promise<ActionResponse>
  expanded?: boolean
  accessibleFacilityCount?: number
}

const selectClassName = fieldClass

function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(fieldClass, className)} />
}

function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(fieldClass, 'h-auto min-h-20 py-2', className)} />
}

function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label {...props} className={cn(labelClass, className)} />
}

/** Search-field state line: small, muted, wraps. */
const hintClass = 'text-xs text-muted-foreground'

function operationFieldId(formId: string, fieldName: string) {
  return `${formId}--field-${fieldName}`
}

function intentFingerprint(intent: string) {
  let left = 0x811c9dc5
  let right = 0x9e3779b9
  for (let index = 0; index < intent.length; index += 1) {
    const code = intent.charCodeAt(index)
    left = Math.imul(left ^ code, 0x01000193)
    right = Math.imul(right ^ code, 0x85ebca6b)
  }
  return `${(left >>> 0).toString(36)}-${(right >>> 0).toString(36)}`
}

function useOperationKeys() {
  const keys = useRef(new Map<string, string>())
  const controlId = useId().replaceAll(':', '')
  const storageKey = (fingerprint: string) => `openfront:operation:${window.location.pathname}:${controlId}:${fingerprint}`
  return {
    get(intent: string) {
      const fingerprint = intentFingerprint(intent)
      let key = keys.current.get(fingerprint)
      if (!key) {
        try { key = sessionStorage.getItem(storageKey(fingerprint)) || undefined } catch { /* memory-only retry */ }
      }
      key ||= `hospital-ui-${crypto.randomUUID()}`
      keys.current.set(fingerprint, key)
      try { sessionStorage.setItem(storageKey(fingerprint), key) } catch { /* memory-only retry */ }
      return key
    },
    clear(intent: string) {
      const fingerprint = intentFingerprint(intent)
      keys.current.delete(fingerprint)
      try { sessionStorage.removeItem(storageKey(fingerprint)) } catch { /* no persisted key to clear */ }
    },
  }
}

function SearchableField({
  field,
  id,
  facilityId,
  patientId,
  onSelect,
}: {
  field: Field
  id: string
  facilityId: string
  patientId: string
  onSelect: (name: string, value: string) => void
}) {
  const required = field.required !== false
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<OperationsOption[]>([])
  const [resultCount, setResultCount] = useState(0)
  const [selected, setSelected] = useState<OperationsOption | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const providerSearch = ['attendingProviderId', 'orderingProviderId', 'providerId'].includes(field.name)
  const bedSearch = ['bedId', 'bedVersion'].includes(field.name)
  const coverageSearch = field.name === 'coverageId'
  const contextKey = field.name === 'patientId' ? facilityId
    : ['encounterId', 'coverageId'].includes(field.name) ? `${facilityId}:${patientId}`
      : facilityId

  useEffect(() => {
    setOptions([])
    setResultCount(0)
    setSelected(null)
    setSearch('')
    setError('')
  }, [contextKey])

  useEffect(() => {
    let cancelled = false
    if (search.trim().length < 2 || !facilityId || (['encounterId', 'coverageId'].includes(field.name) && !patientId)) {
      setOptions([])
      setResultCount(0)
      setPending(false)
      return
    }
    const timer = setTimeout(() => {
      setPending(true)
      setError('')
      setOptions([])
      setResultCount(0)
      const request = field.name === 'patientId'
        ? actions.searchOperationalPatients(facilityId, search)
        : field.name === 'encounterId'
          ? actions.searchOperationalEncounters(facilityId, patientId, search)
          : coverageSearch
            ? actions.searchOperationalCoverages(facilityId, patientId, search)
            : providerSearch
            ? actions.searchOperationalProviders(facilityId, search)
            : actions.searchOperationalBeds(facilityId, search)
      void request.then(response => {
        if (cancelled) return
        if (!response.success) throw new Error((response as any).error || 'Search is unavailable')
        const data = response.data as any
        const rows = field.name === 'patientId' ? data?.workflowPatientCandidates || []
          : field.name === 'encounterId' ? data?.workflowEncounterCandidates || []
            : coverageSearch ? data?.patientCoverages || []
              : providerSearch ? data?.providers || [] : data?.beds || []
        const mapped: OperationsOption[] = rows.map((row: any) => ({
          value: bedSearch && field.name === 'bedVersion' ? `${row.id}::${row.transitionVersion}` : row.id,
          label: field.name === 'patientId'
            ? `${row.displayName || 'Restricted patient'} · ref ${String(row.id).slice(-6)}`
            : field.name === 'encounterId'
              ? `${row.encounterNumber} · ${String(row.status).replaceAll('_', ' ')}`
              : coverageSearch
                ? `${row.coverageNumber} · ${row.payerName}`
                : providerSearch
                ? [row.displayName || 'Provider', row.specialty].filter(Boolean).join(' · ')
                : [row.room?.ward?.name, row.room?.roomNumber ? `Room ${row.room.roomNumber}` : null, `Bed ${row.bedNumber}`].filter(Boolean).join(' · '),
        }))
        const count = field.name === 'patientId' ? mapped.length
          : field.name === 'encounterId' ? mapped.length
            : coverageSearch ? Number(data?.patientCoveragesCount || 0)
              : providerSearch ? Number(data?.providersCount || 0) : Number(data?.bedsCount || 0)
        setOptions(mapped)
        setResultCount(count)
        setError(mapped.length ? '' : coverageSearch
          ? 'No matching active coverage was found for this patient at this facility.'
          : `No matching ${field.label.toLowerCase()} found in this facility.`)
      }).catch(caught => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Search is unavailable')
      }).finally(() => {
        if (!cancelled) setPending(false)
      })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [field.name, field.label, facilityId, patientId, providerSearch, bedSearch, search])

  const visibleOptions = selected && !options.some(option => option.value === selected.value)
    ? [selected, ...options]
    : options
  const requiresPatient = ['encounterId', 'coverageId'].includes(field.name) && !patientId
  const placeholder = field.name === 'patientId' ? 'Search patient name or reference'
    : field.name === 'encounterId' ? 'Search encounters by number'
      : coverageSearch ? 'Search active coverage number or payer'
        : providerSearch ? 'Search provider name or specialty'
          : 'Search ward, room, or bed number'

  return (
    <div className="grid min-w-0 gap-1.5">
      <Input
        id={`${id}-search`}
        type="search"
        value={search}
        onChange={event => setSearch(event.target.value)}
        placeholder={placeholder}
        aria-label={`Search ${field.label.toLowerCase()}`}
        maxLength={100}
        disabled={!facilityId || requiresPatient}
      />
      <select
        id={id}
        name={field.name}
        required={required}
        className={selectClassName}
        value={selected?.value || ''}
        onChange={event => {
          const option = visibleOptions.find(item => item.value === event.target.value) || null
          setSelected(option)
          onSelect(field.name, option?.value || '')
        }}
      >
        <option value="">{requiresPatient ? 'Select facility and patient first' : pending ? 'Searching…' : search.trim().length < 2 ? 'Enter at least 2 characters to search' : `Select ${field.label.toLowerCase()}`}</option>
        {visibleOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {resultCount > options.length && <p className={hintClass}>Showing {options.length} of {resultCount} matches.</p>}
      {(field.name === 'patientId' || field.name === 'encounterId') && options.length === 25 && resultCount === options.length && <p className={hintClass}>Showing up to 25 matches.</p>}
      {requiresPatient && <p role="status" className={hintClass}>Select a facility and patient before searching {coverageSearch ? 'coverage' : 'encounters'}.</p>}
      {error && <p role="status" className={hintClass}>{error}</p>}
    </div>
  )
}

function AdmissionPatientSearchField({
  id,
  facilityId,
  onSelect,
}: {
  id: string
  facilityId: string
  onSelect: (name: string, value: string) => void
}) {
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<OperationsOption[]>([])
  const [resultCount, setResultCount] = useState(0)
  const [selected, setSelected] = useState<OperationsOption | null>(null)
  const [pending, setPending] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    const normalized = search.trim()
    if (!facilityId || normalized.length < 2) {
      setOptions([])
      setResultCount(0)
      setPending(false)
      setUnavailable(false)
      return
    }

    setPending(true)
    setOptions([])
    setResultCount(0)
    setUnavailable(false)
    const timer = setTimeout(() => {
      void actions.searchAdmissionPatientCandidates(facilityId, normalized).then(response => {
        if (cancelled) return
        if (!response.success) {
          setUnavailable(true)
          return
        }
        setOptions(response.data.patients.map(row => ({ value: row.id, label: row.displayName! })))
        setResultCount(response.data.patientsCount)
      }).catch(() => {
        if (!cancelled) setUnavailable(true)
      }).finally(() => {
        if (!cancelled) setPending(false)
      })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [facilityId, search])

  const noMatches = !pending && !unavailable && Boolean(facilityId) && search.trim().length >= 2 && resultCount === 0

  return (
    <div className="grid min-w-0 gap-1.5">
      <Input
        id={`${id}-search`}
        type="search"
        value={search}
        onChange={event => {
          const next = event.target.value
          setSearch(next)
          setSelected(null)
          setOptions([])
          setResultCount(0)
          setPending(Boolean(facilityId && next.trim().length >= 2))
          setUnavailable(false)
          onSelect('patientId', '')
        }}
        placeholder={facilityId ? 'Search patient name' : 'Select a facility first'}
        aria-label="Search active patients in selected facility by name"
        maxLength={100}
        disabled={!facilityId}
      />
      <select
        id={id}
        name="patientId"
        required
        className={selectClassName}
        value={selected?.value || ''}
        disabled={!facilityId}
        onChange={event => {
          const option = options.find(item => item.value === event.target.value) || null
          setSelected(option)
          onSelect('patientId', option?.value || '')
        }}
      >
        <option value="">{!facilityId ? 'Select a facility first' : pending ? 'Searching…' : search.trim().length < 2 ? 'Enter at least 2 characters to search' : 'Select a patient'}</option>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {resultCount > options.length && <p className={hintClass}>Showing {options.length} of {resultCount} matching active patients in this facility.</p>}
      {unavailable && <p role="status" className={hintClass}>Patient search is unavailable for this session. Admission authority or facility/patient scope could not be verified; no empty result is being inferred.</p>}
      {noMatches && <p role="status" className={hintClass}>No matching active patients were found in the selected accessible facility.</p>}
    </div>
  )
}

function LabTestSearchField({
  id,
  onSelect,
}: {
  id: string
  onSelect: (name: string, value: string) => void
}) {
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<OperationsOption[]>([])
  const [resultCount, setResultCount] = useState(0)
  const [selected, setSelected] = useState<OperationsOption | null>(null)
  const [pending, setPending] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    const normalized = search.trim()
    if (normalized.length < 2) {
      setOptions([])
      setResultCount(0)
      setPending(false)
      setUnavailable(false)
      return
    }

    setPending(true)
    setOptions([])
    setResultCount(0)
    setUnavailable(false)
    const timer = setTimeout(() => {
      void actions.searchOperationalLabTests(normalized).then(response => {
        if (cancelled) return
        if (!response.success) {
          setUnavailable(true)
          return
        }
        const data = response.data as any
        const rows = data?.labTests
        const count = data?.labTestsCount
        if (!Array.isArray(rows) || rows.length > 25 || !rows.every((row: any) => typeof row.id === 'string' && typeof row.name === 'string' && Boolean(row.name.trim()) && (row.code == null || typeof row.code === 'string')) || !Number.isSafeInteger(count) || count < rows.length || (count > 25 ? rows.length !== 25 : count !== rows.length)) {
          setUnavailable(true)
          return
        }
        setOptions(rows.map((row: { id: string; name: string; code?: string | null }) => ({
          value: row.id,
          label: [row.name, row.code].filter(Boolean).join(' · '),
        })))
        setResultCount(count)
      }).catch(() => {
        if (!cancelled) setUnavailable(true)
      }).finally(() => {
        if (!cancelled) setPending(false)
      })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [search])

  const noMatches = !pending && !unavailable && search.trim().length >= 2 && resultCount === 0

  return (
    <div className="grid min-w-0 gap-1.5">
      <Input
        id={`${id}-search`}
        type="search"
        value={search}
        onChange={event => {
          setSearch(event.target.value)
          setSelected(null)
          setOptions([])
          setResultCount(0)
          setPending(event.target.value.trim().length >= 2)
          setUnavailable(false)
          onSelect('labTestId', '')
        }}
        placeholder="Search active lab tests by name or code"
        aria-label="Search active lab tests by name or code"
        maxLength={100}
      />
      <select
        id={id}
        name="labTestId"
        required
        className={selectClassName}
        value={selected?.value || ''}
        onChange={event => {
          const option = options.find(item => item.value === event.target.value) || null
          setSelected(option)
          onSelect('labTestId', option?.value || '')
        }}
      >
        <option value="">{pending ? 'Searching…' : search.trim().length < 2 ? 'Enter at least 2 characters to search' : 'Select a lab test'}</option>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {pending && <p role="status" className={hintClass}>Searching active lab tests…</p>}
      {resultCount > options.length && <p role="status" className={hintClass}>Showing {options.length} of {resultCount} matching active lab tests.</p>}
      {unavailable && <p role="status" className={hintClass}>Lab-test search is unavailable for this session; clinical fulfillment authority or the accessible catalog could not be verified.</p>}
      {noMatches && <p role="status" className={hintClass}>No matching active lab tests were found in the accessible catalog.</p>}
    </div>
  )
}

function LabOrderSearchField({
  id,
  facilityId,
  patientId,
  encounterId,
  onSelect,
}: {
  id: string
  facilityId: string
  patientId: string
  encounterId: string
  onSelect: (name: string, value: string) => void
}) {
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<OperationsOption[]>([])
  const [resultCount, setResultCount] = useState(0)
  const [selected, setSelected] = useState<OperationsOption | null>(null)
  const [pending, setPending] = useState(false)
  const [denied, setDenied] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    const normalized = search.trim()
    if (!facilityId || !patientId || !encounterId || normalized.length < 2) return

    setPending(true)
    setOptions([])
    setResultCount(0)
    setDenied(false)
    setUnavailable(false)
    const timer = setTimeout(() => {
      void actions.searchOperationalLabOrders(facilityId, patientId, encounterId, normalized).then(response => {
        if (cancelled) return
        if (!response.success) {
          setDenied(response.reason === 'denied')
          setUnavailable(response.reason !== 'denied')
          return
        }
        setDenied(false)
        const rows = response.data?.medicalOrders
        const count = response.data?.medicalOrdersCount
        if (!Array.isArray(rows) || rows.length > 25 || !rows.every((row: any) => typeof row.id === 'string' && typeof row.orderNumber === 'string' && Boolean(row.orderNumber.trim()) && typeof row.status === 'string') || typeof count !== 'number' || !Number.isSafeInteger(count) || count < rows.length || (count > 25 ? rows.length !== 25 : count !== rows.length)) {
          setUnavailable(true)
          return
        }
        setOptions(rows.map((row: { id: string; orderNumber: string; status: string }) => ({
          value: row.id,
          label: `${row.orderNumber} · ${row.status.replaceAll('_', ' ')}`,
        })))
        setResultCount(count)
      }).catch(() => {
        if (!cancelled) setUnavailable(true)
      }).finally(() => {
        if (!cancelled) setPending(false)
      })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [facilityId, patientId, encounterId, search])

  const hasContext = Boolean(facilityId && patientId && encounterId)
  const noMatches = !pending && !denied && !unavailable && hasContext && search.trim().length >= 2 && resultCount === 0

  return (
    <div className="grid min-w-0 gap-1.5">
      <Input
        id={`${id}-search`}
        type="search"
        value={search}
        onChange={event => {
          const next = event.target.value
          setSearch(next)
          setSelected(null)
          setOptions([])
          setResultCount(0)
          setPending(Boolean(hasContext && next.trim().length >= 2))
          setDenied(false)
          setUnavailable(false)
          onSelect('medicalOrderId', '')
        }}
        placeholder={hasContext ? 'Search active lab orders by order number' : 'Select a facility, patient, and encounter first'}
        aria-label="Search active laboratory orders in the selected facility, patient, and encounter"
        maxLength={100}
        disabled={!hasContext}
      />
      <select
        id={id}
        name="medicalOrderId"
        required
        className={selectClassName}
        value={selected?.value || ''}
        disabled={!hasContext}
        onChange={event => {
          const option = options.find(item => item.value === event.target.value) || null
          setSelected(option)
          onSelect('medicalOrderId', option?.value || '')
        }}
      >
        <option value="">{!hasContext ? 'Select a facility, patient, and encounter first' : pending ? 'Searching…' : search.trim().length < 2 ? 'Enter at least 2 characters to search' : 'Select a laboratory order'}</option>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {pending && <p role="status" className={hintClass}>Searching active laboratory orders in this encounter…</p>}
      {resultCount > options.length && <p role="status" className={hintClass}>Showing {options.length} of {resultCount} matching active laboratory orders.</p>}
      {denied && <p role="status" className={hintClass}>Laboratory-order search is denied for this session or selected scope.</p>}
      {unavailable && <p role="status" className={hintClass}>Laboratory-order search is temporarily unavailable; facility, patient, encounter, or candidate data could not be verified.</p>}
      {noMatches && <p role="status" className={hintClass}>No matching active laboratory orders were found in the selected facility, patient, and encounter.</p>}
    </div>
  )
}

function MedicationOrderSearchField({
  id,
  facilityId,
  patientId,
  encounterId,
}: {
  id: string
  facilityId: string
  patientId: string
  encounterId: string
}) {
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<OperationsOption[]>([])
  const [resultCount, setResultCount] = useState(0)
  const [selected, setSelected] = useState<OperationsOption | null>(null)
  const [pending, setPending] = useState(false)
  const [denied, setDenied] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    const normalized = search.trim()
    if (!facilityId || !patientId || !encounterId || normalized.length < 2) return

    setPending(true)
    setOptions([])
    setResultCount(0)
    setDenied(false)
    setUnavailable(false)
    const timer = setTimeout(() => {
      void actions.searchOperationalMedicationOrders(facilityId, patientId, encounterId, normalized).then(response => {
        if (cancelled) return
        if (!response.success) {
          setDenied(response.reason === 'denied')
          setUnavailable(response.reason !== 'denied')
          return
        }
        setDenied(false)
        const rows = response.data?.medicalOrders
        const count = response.data?.medicalOrdersCount
        if (!Array.isArray(rows) || rows.length > 25 || !rows.every((row: any) =>
          typeof row.id === 'string' && typeof row.orderNumber === 'string' && Boolean(row.orderNumber.trim()) &&
          ['ordered', 'in_progress'].includes(row.status),
        ) || typeof count !== 'number' || !Number.isSafeInteger(count) || count < rows.length || (count > 25 ? rows.length !== 25 : count !== rows.length)) {
          setUnavailable(true)
          return
        }
        setOptions(rows.map((row: { id: string; orderNumber: string; status: string }) => ({
          value: row.id,
          label: `${row.orderNumber} · ${row.status.replaceAll('_', ' ')}`,
        })))
        setResultCount(count)
      }).catch(() => {
        if (!cancelled) {
          setDenied(false)
          setUnavailable(true)
        }
      }).finally(() => {
        if (!cancelled) setPending(false)
      })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [facilityId, patientId, encounterId, search])

  const hasContext = Boolean(facilityId && patientId && encounterId)
  const noMatches = !pending && !denied && !unavailable && hasContext && search.trim().length >= 2 && resultCount === 0

  return (
    <div className="grid min-w-0 gap-1.5">
      <Input
        id={`${id}-search`}
        type="search"
        value={search}
        onChange={event => {
          const next = event.target.value
          setSearch(next)
          setSelected(null)
          setOptions([])
          setResultCount(0)
          setPending(Boolean(hasContext && next.trim().length >= 2))
          setDenied(false)
          setUnavailable(false)
        }}
        placeholder={hasContext ? 'Search medication orders by order number (optional)' : 'Select a facility, patient, and encounter to search'}
        aria-label="Search optional medication order in the selected facility, patient, and encounter"
        maxLength={100}
        disabled={!hasContext}
      />
      <select
        id={id}
        name="medicalOrderId"
        className={selectClassName}
        value={selected?.value || ''}
        onChange={event => setSelected(options.find(option => option.value === event.target.value) || null)}
      >
        <option value="">No related medication order (optional)</option>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {hasContext && search.trim().length === 1 && <p role="status" className={hintClass}>Enter at least 2 characters to search.</p>}
      {pending && <p role="status" className={hintClass}>Searching eligible medication orders…</p>}
      {resultCount > options.length && <p role="status" className={hintClass}>Showing {options.length} of {resultCount} matching medication orders.</p>}
      {denied && <p role="status" className={hintClass}>Medication-order search is denied for this session or selected scope.</p>}
      {unavailable && <p role="status" className={hintClass}>Medication-order search is unavailable; clinical authority, scope, or candidates could not be verified.</p>}
      {noMatches && <p role="status" className={hintClass}>No matching eligible medication orders were found in this scope.</p>}
    </div>
  )
}

function ProcedureOrderSearchField({
  id,
  facilityId,
  patientId,
  encounterId,
}: {
  id: string
  facilityId: string
  patientId: string
  encounterId: string
}) {
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<OperationsOption[]>([])
  const [resultCount, setResultCount] = useState(0)
  const [selected, setSelected] = useState<OperationsOption | null>(null)
  const [pending, setPending] = useState(false)
  const [denied, setDenied] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    const normalized = search.trim()
    if (!facilityId || !patientId || !encounterId || normalized.length < 2) return

    setPending(true)
    setOptions([])
    setResultCount(0)
    setDenied(false)
    setUnavailable(false)
    const timer = setTimeout(() => {
      void actions.searchOperationalProcedureOrders(facilityId, patientId, encounterId, normalized).then(response => {
        if (cancelled) return
        if (!response.success) {
          setDenied(response.reason === 'denied')
          setUnavailable(response.reason !== 'denied')
          return
        }
        setDenied(false)
        const rows = response.data?.medicalOrders
        const count = response.data?.medicalOrdersCount
        if (!Array.isArray(rows) || rows.length > 25 || !rows.every((row: any) =>
          typeof row.id === 'string' && typeof row.orderNumber === 'string' && Boolean(row.orderNumber.trim()) &&
          ['ordered', 'in_progress'].includes(row.status),
        ) || typeof count !== 'number' || !Number.isSafeInteger(count) || count < rows.length || (count > 25 ? rows.length !== 25 : count !== rows.length)) {
          setUnavailable(true)
          return
        }
        setOptions(rows.map((row: { id: string; orderNumber: string; status: string }) => ({
          value: row.id,
          label: `${row.orderNumber} · ${row.status.replaceAll('_', ' ')}`,
        })))
        setResultCount(count)
      }).catch(() => {
        if (!cancelled) {
          setDenied(false)
          setUnavailable(true)
        }
      }).finally(() => {
        if (!cancelled) setPending(false)
      })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [facilityId, patientId, encounterId, search])

  const hasContext = Boolean(facilityId && patientId && encounterId)
  const noMatches = !pending && !denied && !unavailable && hasContext && search.trim().length >= 2 && resultCount === 0

  return (
    <div className="grid min-w-0 gap-1.5">
      <Input
        id={`${id}-search`}
        type="search"
        value={search}
        onChange={event => {
          const next = event.target.value
          setSearch(next)
          setSelected(null)
          setOptions([])
          setResultCount(0)
          setPending(Boolean(hasContext && next.trim().length >= 2))
          setDenied(false)
          setUnavailable(false)
        }}
        placeholder={hasContext ? 'Search procedure orders by order number (optional)' : 'Select a facility, patient, and encounter to search'}
        aria-label="Search optional procedure order in the selected facility, patient, and encounter"
        maxLength={100}
        disabled={!hasContext}
      />
      <select
        id={id}
        name="medicalOrderId"
        className={selectClassName}
        value={selected?.value || ''}
        onChange={event => setSelected(options.find(option => option.value === event.target.value) || null)}
      >
        <option value="">No related procedure order (optional)</option>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {hasContext && search.trim().length === 1 && <p role="status" className={hintClass}>Enter at least 2 characters to search.</p>}
      {pending && <p role="status" className={hintClass}>Searching eligible procedure orders…</p>}
      {resultCount > options.length && <p role="status" className={hintClass}>Showing {options.length} of {resultCount} matching procedure orders.</p>}
      {denied && <p role="status" className={hintClass}>Procedure-order search is denied for this session or selected scope.</p>}
      {unavailable && <p role="status" className={hintClass}>Procedure-order search is unavailable; clinical authority, scope, or candidates could not be verified.</p>}
      {noMatches && <p role="status" className={hintClass}>No matching eligible procedure orders were found in this scope.</p>}
    </div>
  )
}

function CorrectableLabResultSearchField({ id }: { id: string }) {
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<OperationsOption[]>([])
  const [resultCount, setResultCount] = useState(0)
  const [selected, setSelected] = useState<OperationsOption | null>(null)
  const [pending, setPending] = useState(false)
  const [denied, setDenied] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    const normalized = search.trim()
    if (normalized.length < 2) return

    setPending(true)
    setOptions([])
    setResultCount(0)
    setDenied(false)
    setUnavailable(false)
    const timer = setTimeout(() => {
      void actions.searchCorrectableLabResults(normalized).then(response => {
        if (cancelled) return
        if (!response.success) {
          setDenied(response.reason === 'denied')
          setUnavailable(response.reason !== 'denied')
          return
        }
        setDenied(false)
        const rows = response.data?.labResults
        const count = response.data?.labResultsCount
        if (!Array.isArray(rows) || rows.length > 25 || !rows.every((row: any) =>
          typeof row.id === 'string' && typeof row.resultNumber === 'string' && Boolean(row.resultNumber.trim()) &&
          Number.isSafeInteger(row.version) && row.version > 0 && ['final', 'acknowledged', 'corrected'].includes(row.status),
        ) || typeof count !== 'number' || !Number.isSafeInteger(count) || count < rows.length || (count > 25 ? rows.length !== 25 : count !== rows.length)) {
          setUnavailable(true)
          return
        }
        setOptions(rows.map((row: { id: string; resultNumber: string; version: number; status: string }) => ({
          value: row.id,
          label: `${row.resultNumber} · v${row.version} · ${row.status}`,
        })))
        setResultCount(count)
      }).catch(() => {
        if (!cancelled) {
          setDenied(false)
          setUnavailable(true)
        }
      }).finally(() => {
        if (!cancelled) setPending(false)
      })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [search])

  const noMatches = !pending && !denied && !unavailable && search.trim().length >= 2 && resultCount === 0

  return (
    <div className="grid min-w-0 gap-1.5">
      <Input
        id={`${id}-search`}
        type="search"
        value={search}
        onChange={event => {
          const next = event.target.value
          setSearch(next)
          setSelected(null)
          setOptions([])
          setResultCount(0)
          setPending(next.trim().length >= 2)
          setDenied(false)
          setUnavailable(false)
        }}
        placeholder="Search eligible lab results by result number"
        aria-label="Search eligible non-superseded lab results by result number"
        maxLength={100}
      />
      <select
        id={id}
        name="resultId"
        required
        className={selectClassName}
        value={selected?.value || ''}
        onChange={event => setSelected(options.find(option => option.value === event.target.value) || null)}
      >
        <option value="">{pending ? 'Searching…' : search.trim().length < 2 ? 'Enter at least 2 characters to search' : 'Select a correction target'}</option>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {pending && <p role="status" className={hintClass}>Searching non-superseded final, acknowledged, or corrected results…</p>}
      {resultCount > options.length && <p role="status" className={hintClass}>Showing {options.length} of {resultCount} matching correction targets.</p>}
      {denied && <p role="status" className={hintClass}>Lab-result search is denied for this session.</p>}
      {unavailable && <p role="status" className={hintClass}>Lab-result search is unavailable; correction authority or the accessible candidate list could not be verified.</p>}
      {noMatches && <p role="status" className={hintClass}>No matching non-superseded final, acknowledged, or corrected results were found in the accessible list.</p>}
    </div>
  )
}

function ClinicianSearchField({
  id,
  facilityId,
  onSelect,
}: {
  id: string
  facilityId: string
  onSelect: (name: string, value: string) => void
}) {
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<OperationsOption[]>([])
  const [resultCount, setResultCount] = useState(0)
  const [selected, setSelected] = useState<OperationsOption | null>(null)
  const [pending, setPending] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    const normalized = search.trim()
    if (!facilityId || normalized.length < 2) return

    setPending(true)
    setOptions([])
    setResultCount(0)
    setUnavailable(false)
    const timer = setTimeout(() => {
      void actions.searchOperationalClinicians(facilityId, normalized).then(response => {
        if (cancelled) return
        if (!response.success) {
          setUnavailable(true)
          return
        }
        const rows = response.data?.clinicians
        const count = response.data?.cliniciansCount
        const isClinicianRow = (row: { id: string; displayName?: string | null; clinicianType?: string | null }): row is { id: string; displayName: string; clinicianType?: string | null } =>
          typeof row.id === 'string' && typeof row.displayName === 'string' && Boolean(row.displayName.trim()) && (row.clinicianType == null || typeof row.clinicianType === 'string')
        if (!Array.isArray(rows) || rows.length > 25 || !rows.every(isClinicianRow) || !Number.isSafeInteger(count) || count < rows.length || (count > 25 ? rows.length !== 25 : count !== rows.length)) {
          setUnavailable(true)
          return
        }
        setOptions(rows.map(row => ({
          value: row.id,
          label: [row.displayName, row.clinicianType?.replaceAll('_', ' ')].filter(Boolean).join(' · '),
        })))
        setResultCount(count)
      }).catch(() => {
        if (!cancelled) setUnavailable(true)
      }).finally(() => {
        if (!cancelled) setPending(false)
      })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [facilityId, search])

  const noMatches = !pending && !unavailable && Boolean(facilityId) && search.trim().length >= 2 && resultCount === 0

  return (
    <div className="grid min-w-0 gap-1.5">
      <Input
        id={`${id}-search`}
        type="search"
        value={search}
        onChange={event => {
          const next = event.target.value
          setSearch(next)
          setSelected(null)
          setOptions([])
          setResultCount(0)
          setPending(Boolean(facilityId && next.trim().length >= 2))
          setUnavailable(false)
          onSelect('clinicianId', '')
        }}
        placeholder={facilityId ? 'Search active clinicians by name or type' : 'Select a facility first'}
        aria-label="Search active clinicians by name or type in the selected facility"
        maxLength={100}
        disabled={!facilityId}
      />
      <select
        id={id}
        name="clinicianId"
        required
        className={selectClassName}
        value={selected?.value || ''}
        disabled={!facilityId}
        onChange={event => {
          const option = options.find(item => item.value === event.target.value) || null
          setSelected(option)
          onSelect('clinicianId', option?.value || '')
        }}
      >
        <option value="">{!facilityId ? 'Select a facility first' : pending ? 'Searching…' : search.trim().length < 2 ? 'Enter at least 2 characters to search' : 'Select a clinician'}</option>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {pending && <p role="status" className={hintClass}>Searching active clinicians in this facility…</p>}
      {resultCount > options.length && <p role="status" className={hintClass}>Showing {options.length} of {resultCount} matching active clinicians in this facility.</p>}
      {unavailable && <p role="status" className={hintClass}>Clinician search is unavailable for this session; clinical fulfillment authority, active facility access, or the accessible clinician list could not be verified.</p>}
      {noMatches && <p role="status" className={hintClass}>No matching active clinicians were found in the selected accessible facility.</p>}
    </div>
  )
}

function FieldControl({
  field,
  id,
  scope,
  accessibleFacilityCount,
  onContextChange,
}: {
  field: Field
  id: string
  scope: { facilityId: string; patientId: string; encounterId: string }
  accessibleFacilityCount?: number
  onContextChange: (name: string, value: string) => void
}) {
  const required = field.required !== false
  if (field.kind === 'facility') {
    return <FacilitySearchField id={id} name={field.name} label={field.label} required={required} accessibleFacilityCount={accessibleFacilityCount} onSelect={value => onContextChange('facilityId', value)} />
  }
  if (field.kind === 'facility-patient-search') {
    return <AdmissionPatientSearchField id={id} facilityId={scope.facilityId} onSelect={onContextChange} />
  }
  if (field.kind === 'lab-test-search') {
    return <LabTestSearchField id={id} onSelect={onContextChange} />
  }
  if (field.kind === 'lab-order-search') {
    return <LabOrderSearchField id={id} facilityId={scope.facilityId} patientId={scope.patientId} encounterId={scope.encounterId} onSelect={onContextChange} />
  }
  if (field.kind === 'medication-order-search') {
    return <MedicationOrderSearchField id={id} facilityId={scope.facilityId} patientId={scope.patientId} encounterId={scope.encounterId} />
  }
  if (field.kind === 'procedure-order-search') {
    return <ProcedureOrderSearchField id={id} facilityId={scope.facilityId} patientId={scope.patientId} encounterId={scope.encounterId} />
  }
  if (field.kind === 'lab-result-search') {
    return <CorrectableLabResultSearchField id={id} />
  }
  if (field.kind === 'clinician-search') {
    return <ClinicianSearchField id={id} facilityId={scope.facilityId} onSelect={onContextChange} />
  }
  if (field.kind === 'searchable' || field.name === 'patientId' || field.name === 'encounterId' || field.name === 'coverageId') {
    return <SearchableField field={field} id={id} facilityId={scope.facilityId} patientId={scope.patientId} onSelect={onContextChange} />
  }
  if (field.kind === 'select') {
    return (
      <select
        id={id}
        name={field.name}
        required={required}
        className={selectClassName}
        defaultValue=""
        onChange={event => {
          if (field.name === 'facilityId' || field.name === 'patientId') onContextChange(field.name, event.target.value)
        }}
      >
        <option value="">{field.options?.length ? `Select ${field.label.toLowerCase()}` : `No ${field.label.toLowerCase()} available`}</option>
        {field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    )
  }
  if (field.kind === 'textarea') {
    return <Textarea id={id} name={field.name} required={required} maxLength={field.maxLength} placeholder={field.placeholder} />
  }
  return (
    <Input
      id={id}
      name={field.name}
      type={field.kind === 'datetime-local' ? 'datetime-local' : ['currency', 'decimal', 'integer'].includes(field.kind || '') ? 'number' : 'text'}
      required={required}
      maxLength={field.maxLength}
      min={['currency', 'decimal', 'integer'].includes(field.kind || '') ? '0' : undefined}
      step={field.kind === 'currency' ? '0.01' : field.kind === 'decimal' ? '0.1' : field.kind === 'integer' ? '1' : undefined}
      placeholder={field.placeholder}
    />
  )
}

function OperationForm({ title, description, fields, submitLabel, onSubmit, recoverOriginal, expanded = false, accessibleFacilityCount }: OperationFormProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const formId = useId()
  const titleId = `${formId}--form-title`
  const descriptionId = `${formId}--form-description`
  const operationKeys = useOperationKeys()
  const lastIntent = useRef<string | null>(null)
  const [savedRequest, setSavedRequest] = useState<Record<string, unknown> | null>(null)
  const originalRequest = useRef<Record<string, unknown> | null>(null)
  const [dirty, setDirty] = useState(false)
  const exitGuard = useDraftExitGuard(dirty || Boolean(savedRequest), Boolean(savedRequest))
  const [labReadback, setLabReadback] = useState<unknown>(null)
  const [scopeContext, setScopeContext] = useState({ facilityId: '', patientId: '', encounterId: '' })
  const [formResetVersion, setFormResetVersion] = useState(0)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const missingFacility = accessibleFacilityCount === 0 && fields.some(field => field.kind === 'facility' && field.required !== false)
  const missingRequiredOptions = missingFacility || fields.some(field =>
    field.kind === 'select' && !['patientId', 'encounterId'].includes(field.name) && field.required !== false && !field.options?.length,
  )

  return (
    <details className="group min-w-0 rounded-xl border bg-card" open={expanded}>
      <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
        <span id={titleId} className="min-w-0 text-sm font-semibold text-foreground">{title}</span>
        <span id={descriptionId} className="sr-only">{description}</span>
        <span aria-hidden="true" className="shrink-0 font-mono text-xs text-muted-foreground group-open:hidden">+</span>
        <span aria-hidden="true" className="hidden shrink-0 font-mono text-xs text-muted-foreground group-open:inline">−</span>
      </summary>
      <form
        ref={formRef}
        onChange={() => setDirty(true)}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="grid min-w-0 gap-4 border-t p-4 sm:grid-cols-2"
        onSubmit={async event => {
          event.preventDefault()
          const formData = new FormData(event.currentTarget)
          setPending(true)
          setError('')
          setSuccess('')
          let dispatched = false
          try {
          const data: Record<string, unknown> = {}
          for (const field of fields) {
            const raw = String(formData.get(field.name) ?? '').trim()
            if (!raw) continue
            if (field.kind === 'currency') data[field.name] = Math.round(Number(raw) * 100)
            else if (field.kind === 'integer' || field.kind === 'decimal') data[field.name] = Number(raw)
            else if (field.kind === 'datetime-local') data[field.name] = deviceLocalDateTimeToIso(raw)
            else data[field.name] = raw
          }
          const intent = JSON.stringify(data)
          if (!savedRequest) lastIntent.current = intent
          const request = originalRequest.current || { ...data, operationKey: operationKeys.get(intent) }
          originalRequest.current = request
          setSavedRequest(request)
            dispatched = true
          const response = await onSubmit(structuredClone(request))
            if (!response.success) {
              setError(response.error || `${title} could not be verified. Retry the same details or refresh before starting a new action.`)
              return
            }
            operationKeys.clear(lastIntent.current || intent)
            lastIntent.current = null
            setSavedRequest(null)
            originalRequest.current = null
            setDirty(false)
            setScopeContext({ facilityId: '', patientId: '', encounterId: '' })
            setFormResetVersion(version => version + 1)
            formRef.current?.reset()
            setSuccess(`${title} completed`)
          } catch (failure) {
            setError(!dispatched && failure instanceof Error ? failure.message : `${title} outcome is unknown. Retry its original command and reconcile before a separate operation.`)
          } finally {
            setPending(false)
          }
        }}
      >
        {exitGuard}
        {fields.some(field => field.kind === 'datetime-local') && <DeviceTimeNotice />}
        <fieldset className="contents" disabled={pending || Boolean(savedRequest)}>
        {fields.map(field => {
          const fieldId = operationFieldId(formId, field.name)
          return (
            <div key={`${field.name}:${formResetVersion}:${['lab-order-search', 'medication-order-search', 'procedure-order-search'].includes(field.kind || '') ? `${scopeContext.facilityId}:${scopeContext.patientId}:${scopeContext.encounterId}` : field.name === 'patientId' ? scopeContext.facilityId : ['encounterId', 'coverageId'].includes(field.name) ? `${scopeContext.facilityId}:${scopeContext.patientId}` : ['attendingProviderId', 'orderingProviderId', 'providerId', 'bedId', 'bedVersion', 'labTestId', 'clinicianId'].includes(field.name) ? scopeContext.facilityId : ''}`} className={field.kind === 'textarea' ? 'grid min-w-0 gap-1.5 sm:col-span-2' : 'grid min-w-0 gap-1.5'}>
              {field.kind !== 'facility' && <Label htmlFor={fieldId}>{field.label}{field.required === false ? ' (optional)' : ''}</Label>}
              <FieldControl
                field={field}
                id={fieldId}
                scope={scopeContext}
                accessibleFacilityCount={accessibleFacilityCount}
                onContextChange={(name, value) => setScopeContext(context => {
                  if (name === 'facilityId') return context.facilityId === value ? context : { facilityId: value, patientId: '', encounterId: '' }
                  if (name === 'patientId') return context.patientId === value ? context : { ...context, patientId: value, encounterId: '' }
                  if (name === 'encounterId') return context.encounterId === value ? context : { ...context, encounterId: value }
                  return context
                })}
              />
            </div>
          )
        })}
        </fieldset>
        {missingFacility && <Notice role="status" className="sm:col-span-2">No accessible active facility is available for this session.</Notice>}
        {missingRequiredOptions && !missingFacility && <Notice role="status" className="sm:col-span-2">Required workspace records are not available for this action.</Notice>}
        {error && <Notice tone="bad" role="alert" className="sm:col-span-2">{error}</Notice>}
        {savedRequest && recoverOriginal && <div className="grid min-w-0 gap-2 sm:col-span-2"><Notice tone="warn" role="status">Original command held in memory; editing is locked until its receipt is verified. Reloading may lose it.</Notice><Track className="justify-self-start"><Pill type="button" disabled={pending} onClick={async () => {
          setPending(true)
          try {
            const response = await recoverOriginal(savedRequest)
            setLabReadback(response.readback)
            if (!response.success) setError(response.error || 'Original outcome remains unknown; keep the same command.')
            else {
              if (lastIntent.current) operationKeys.clear(lastIntent.current)
              lastIntent.current = null; originalRequest.current = null; setSavedRequest(null); setError(''); setSuccess('Exact owned original receipt verified. A separate command can now be reviewed.')
              formRef.current?.reset(); setScopeContext({ facilityId: '', patientId: '', encounterId: '' }); setFormResetVersion(version => version + 1)
            }
          } catch { setError('Recovery unavailable; keep the same command and identity.') }
          finally { setPending(false) }
        }}>Read-only original receipt recovery</Pill></Track></div>}
        {labReadback != null && <pre className="max-h-96 min-w-0 overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/40 p-3 font-mono text-xs sm:col-span-2">{JSON.stringify(labReadback, null, 2)}</pre>}
        {savedRequest && !recoverOriginal && <Notice tone="warn" role="status" className="sm:col-span-2">Original command held in memory. Retry it exactly and reconcile its receipt before a separate command. Reloading may lose it.</Notice>}
        {success && <Notice tone="ok" role="status" className="sm:col-span-2">{success}</Notice>}
        <div className="sm:col-span-2">
          <Track>
            <Pill variant="primary" disabled={pending || missingRequiredOptions} type="submit">
              {pending && <Loader2 className="animate-spin" />}
              {savedRequest ? 'Retry exact original command' : submitLabel}
            </Pill>
          </Track>
        </div>
      </form>
    </details>
  )
}

export function AdmissionCreateForm({ options }: { options: OperationsWorkspaceOptions }) {
  return (
    <OperationForm
      title="New admission"
      description="Assign an accessible patient to an available bed and attending provider."
      submitLabel="Admit patient"
      expanded
      accessibleFacilityCount={options.facilitiesCount}
      fields={[
        { name: 'facilityId', label: 'Facility', kind: 'facility' },
        { name: 'patientId', label: 'Patient', kind: 'facility-patient-search' },
        { name: 'encounterId', label: 'Encounter', kind: 'select', options: options.encounters, required: false },
        { name: 'attendingProviderId', label: 'Attending provider', kind: 'searchable' },
        { name: 'bedId', label: 'Available bed', kind: 'searchable' },
        { name: 'notes', label: 'Admission notes', kind: 'textarea', required: false, maxLength: 4000 },
      ]}
      onSubmit={actions.admitPatient}
    />
  )
}

export function BedReservationCreateForm({ options }: { options: OperationsWorkspaceOptions }) {
  return (
    <OperationForm
      title="Reserve a bed temporarily"
      description="Hold an available bed for an accessible patient for no more than 24 hours. This is not an admission."
      submitLabel="Reserve bed"
      accessibleFacilityCount={options.facilitiesCount}
      fields={[
        { name: 'facilityId', label: 'Facility', kind: 'facility' },
        { name: 'patientId', label: 'Patient', kind: 'select', options: options.patients },
        { name: 'bedVersion', label: 'Available bed', kind: 'searchable' },
        { name: 'expiresAt', label: 'Expires at', kind: 'datetime-local' },
        { name: 'reasonCode', label: 'Reason code', maxLength: 80 },
      ]}
      onSubmit={async data => {
        const [bedId, version] = String(data.bedVersion).split('::')
        delete data.bedVersion
        return actions.reserveBed({ ...data, bedId, expectedBedVersion: Number(version) })
      }}
    />
  )
}

export function BedReservationReleaseForm({ id, version }: { id: string; version: number }) {
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [locked, setLocked] = useState(false)
  const original = useRef<{ id: string; version: number; reason: string; key: string } | null>(null)
  const exitGuard = useDraftExitGuard(Boolean(reason) || locked, locked)
  return <form className="mt-2 flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center" onSubmit={async event => {
    event.preventDefault()
    if (pending) return
    original.current ||= { id, version, reason, key: `hospital-ui-${crypto.randomUUID()}` }
    setPending(true); setLocked(true); setError('')
    try {
      const request = original.current
      const response = await actions.releaseBedReservation(request.id, request.version, request.reason, request.key)
      if (!response.success) setError('Release outcome could not be verified. Retry the original command; reconcile before another operation.')
      else { original.current = null; setLocked(false); setReason('') }
    } catch { setError('Release outcome is unknown. Retry the original command; reconcile before another operation.') }
    finally { setPending(false) }
  }}>
    {exitGuard}
    <Label className="sr-only" htmlFor={`reservation-reason-${id}`}>Release reason</Label>
    <Input id={`reservation-reason-${id}`} name="reasonCode" required maxLength={80} placeholder="Release reason" className="sm:w-auto sm:flex-1" disabled={pending || locked} value={reason} onChange={event => setReason(event.target.value)} />
    <Track className="self-start sm:self-auto"><Pill type="submit" size="sm" disabled={pending}>{locked ? 'Retry original release' : 'Release reservation'}</Pill></Track>
    {error && <Notice tone="bad" role="alert" className="text-xs sm:basis-full">{error}</Notice>}
  </form>
}

export function ClinicalCreateForms({ options }: { options: OperationsWorkspaceOptions }) {
  return (
    <div className="grid min-w-0 gap-3 xl:grid-cols-2">
      <OperationForm
        title="Record an order coordination item"
        description="Record operational order status for an accessible encounter. This does not transmit an order or replace the authoritative clinical system."
        submitLabel="Record draft order"
        accessibleFacilityCount={options.facilitiesCount}
        fields={[
          { name: 'facilityId', label: 'Facility', kind: 'facility' },
          { name: 'patientId', label: 'Patient', kind: 'select', options: options.patients },
          { name: 'encounterId', label: 'Encounter', kind: 'select', options: options.encounters },
          { name: 'orderingProviderId', label: 'Ordering provider', kind: 'searchable' },
          { name: 'orderType', label: 'Order type', kind: 'select', options: [
            { value: 'lab', label: 'Laboratory' }, { value: 'medication', label: 'Medication' },
            { value: 'imaging', label: 'Imaging' }, { value: 'procedure', label: 'Procedure' },
            { value: 'consult', label: 'Consult' },
          ] },
          { name: 'summary', label: 'Order details', kind: 'textarea', maxLength: 4000 },
        ]}
        onSubmit={actions.placeMedicalOrder}
      />
      <OperationForm
        title="Record externally reported lab information"
        description="Attach manually transcribed operational information to an active laboratory order. This does not validate laboratory truth or replace the laboratory system."
        submitLabel="Record pending information"
        accessibleFacilityCount={options.facilitiesCount}
        fields={[
          { name: 'facilityId', label: 'Facility', kind: 'facility' },
          { name: 'patientId', label: 'Patient', kind: 'select', options: options.patients },
          { name: 'encounterId', label: 'Encounter', kind: 'select', options: options.encounters },
          { name: 'medicalOrderId', label: 'Laboratory order', kind: 'lab-order-search' },
          { name: 'labTestId', label: 'Lab test', kind: 'lab-test-search' },
          { name: 'resultValue', label: 'Result value', kind: 'textarea', maxLength: 4000 },
          { name: 'referenceRange', label: 'Reference range', required: false, maxLength: 1000 },
          { name: 'abnormalFlag', label: 'Result flag', kind: 'select', options: [
            { value: 'normal', label: 'Normal' }, { value: 'low', label: 'Low' },
            { value: 'high', label: 'High' }, { value: 'critical', label: 'Critical' },
          ] },
        ]}
        onSubmit={actions.recordLabResult}
        recoverOriginal={data => recoverLabCommand(data)}
      />
      <OperationForm
        title="Record an externally issued correction"
        description="Create linked operational evidence for a correction already issued by the authoritative laboratory system."
        submitLabel="Record correction evidence"
        fields={[
          { name: 'resultId', label: 'Result to correct', kind: 'lab-result-search' },
          { name: 'humanReviewReference', label: 'Human-reviewed upstream correction reference (no PHI)', maxLength: 200 },
          { name: 'humanReviewed', label: 'Upstream correction was reviewed by an authorized human', kind: 'select', options: [{ value: 'true', label: 'Explicit human review recorded' }] },
          { name: 'resultValue', label: 'Corrected value', kind: 'textarea', maxLength: 4000 },
          { name: 'referenceRange', label: 'Reference range', required: false, maxLength: 1000 },
          { name: 'abnormalFlag', label: 'Result flag', kind: 'select', options: [
            { value: 'normal', label: 'Normal' }, { value: 'low', label: 'Low' },
            { value: 'high', label: 'High' }, { value: 'critical', label: 'Critical' },
          ] },
        ]}
        onSubmit={data => actions.correctLabResult({ ...data, humanReviewed: data.humanReviewed === 'true' })}
        recoverOriginal={data => recoverLabCommand({ ...data, humanReviewed: data.humanReviewed === 'true' }, true)}
      />
      <OperationForm
        title="Record prescription information"
        description="Record medication information reported from an external record or manual reconciliation. This does not prescribe, transmit, dispense, or provide medical advice."
        submitLabel="Record information"
        accessibleFacilityCount={options.facilitiesCount}
        fields={[
          { name: 'facilityId', label: 'Facility', kind: 'facility' },
          { name: 'patientId', label: 'Patient', kind: 'select', options: options.patients },
          { name: 'encounterId', label: 'Encounter', kind: 'select', options: options.encounters },
          { name: 'providerId', label: 'Prescribing provider', kind: 'searchable' },
          { name: 'medicalOrderId', label: 'Related medication order', kind: 'medication-order-search', required: false },
          { name: 'recordingBasis', label: 'Recording basis', kind: 'select', options: [
            { value: 'external_record', label: 'Reported from an external record' },
            { value: 'manual_reconciliation', label: 'Manual medication reconciliation' },
          ] },
          { name: 'medicationName', label: 'Medication' },
          { name: 'dosage', label: 'Dosage' },
          { name: 'frequency', label: 'Frequency' },
          { name: 'notes', label: 'Prescription notes', kind: 'textarea', required: false, maxLength: 3000 },
        ]}
        onSubmit={actions.recordPrescription}
      />
      <OperationForm
        title="Record procedure coordination"
        description="Track an externally authorized procedure schedule. This does not authorize or perform a procedure."
        submitLabel="Record schedule"
        accessibleFacilityCount={options.facilitiesCount}
        fields={[
          { name: 'facilityId', label: 'Facility', kind: 'facility' },
          { name: 'patientId', label: 'Patient', kind: 'select', options: options.patients },
          { name: 'encounterId', label: 'Encounter', kind: 'select', options: options.encounters },
          { name: 'providerId', label: 'Provider', kind: 'searchable' },
          { name: 'medicalOrderId', label: 'Related procedure order', kind: 'procedure-order-search', required: false },
          { name: 'procedureName', label: 'Procedure' },
          { name: 'scheduledAt', label: 'Scheduled time', kind: 'datetime-local', required: false },
          { name: 'notes', label: 'Procedure notes', kind: 'textarea', required: false, maxLength: 3000 },
        ]}
        onSubmit={actions.scheduleProcedure}
      />
      <OperationForm
        title="Draft operational encounter note"
        description="Create an unsigned working note. It is not a signed clinical chart document and cannot be finalized in this release."
        submitLabel="Create unsigned draft"
        accessibleFacilityCount={options.facilitiesCount}
        fields={[
          { name: 'facilityId', label: 'Facility', kind: 'facility' },
          { name: 'patientId', label: 'Patient', kind: 'select', options: options.patients },
          { name: 'encounterId', label: 'Encounter', kind: 'select', options: options.encounters },
          { name: 'providerId', label: 'Author', kind: 'searchable' },
          { name: 'documentType', label: 'Document type', kind: 'select', options: [{ value: 'progress_note', label: 'Progress note' }, { value: 'discharge_summary', label: 'Discharge summary' }, { value: 'procedure_note', label: 'Procedure note' }] },
          { name: 'title', label: 'Title' },
          { name: 'content', label: 'Document content', kind: 'textarea', maxLength: 50000 },
        ]}
        onSubmit={actions.draftClinicalDocument}
      />
      <OperationForm
        title="Record specimen handoff"
        description="Record operational collection/handoff evidence against an external laboratory order. This does not control a laboratory process."
        submitLabel="Record handoff"
        accessibleFacilityCount={options.facilitiesCount}
        fields={[
          { name: 'facilityId', label: 'Facility', kind: 'facility' },
          { name: 'patientId', label: 'Patient', kind: 'select', options: options.patients },
          { name: 'encounterId', label: 'Encounter', kind: 'select', options: options.encounters },
          { name: 'medicalOrderId', label: 'Laboratory order', kind: 'lab-order-search' },
          { name: 'specimenType', label: 'Specimen type' },
        ]}
        onSubmit={actions.collectSpecimen}
      />
      <OperationForm
        title="Record vital signs"
        description="Append a clinician-attributed vital-sign observation to an active encounter."
        submitLabel="Record vital signs"
        accessibleFacilityCount={options.facilitiesCount}
        fields={[
          { name: 'facilityId', label: 'Facility', kind: 'facility' },
          { name: 'patientId', label: 'Patient', kind: 'select', options: options.patients },
          { name: 'encounterId', label: 'Encounter', kind: 'select', options: options.encounters },
          { name: 'clinicianId', label: 'Recording clinician', kind: 'clinician-search' },
          { name: 'temperatureC', label: 'Temperature (°C, one decimal)', kind: 'decimal', required: false },
          { name: 'systolicBp', label: 'Systolic BP', kind: 'integer', required: false },
          { name: 'diastolicBp', label: 'Diastolic BP', kind: 'integer', required: false },
          { name: 'heartRate', label: 'Heart rate', kind: 'integer', required: false },
          { name: 'respiratoryRate', label: 'Respiratory rate', kind: 'integer', required: false },
          { name: 'oxygenSaturation', label: 'Oxygen saturation', kind: 'integer', required: false },
          { name: 'notes', label: 'Notes', kind: 'textarea', required: false, maxLength: 2000 },
        ]}
        onSubmit={actions.recordVitalSign}
      />
      <OperationForm
        title="Record care-plan coordination"
        description="Track operational goals and interventions from a reviewed care plan. This is not treatment decision support or the clinical source of truth."
        submitLabel="Record draft plan"
        accessibleFacilityCount={options.facilitiesCount}
        fields={[
          { name: 'facilityId', label: 'Facility', kind: 'facility' },
          { name: 'patientId', label: 'Patient', kind: 'select', options: options.patients },
          { name: 'encounterId', label: 'Encounter', kind: 'select', options: options.encounters, required: false },
          { name: 'providerId', label: 'Provider', kind: 'searchable' },
          { name: 'title', label: 'Plan title' },
          { name: 'goals', label: 'Goals', kind: 'textarea', maxLength: 4000 },
          { name: 'interventions', label: 'Interventions', kind: 'textarea', maxLength: 4000 },
        ]}
        onSubmit={actions.establishCarePlan}
      />
    </div>
  )
}

export function ClaimCreateForm({ options }: { options: Pick<OperationsWorkspaceOptions, 'facilitiesCount'> }) {
  return (
    <OperationForm
      title="New claim record"
      description="Start a claim record from an accessible encounter."
      submitLabel="Create claim record"
      expanded
      accessibleFacilityCount={options.facilitiesCount}
      fields={[
        { name: 'facilityId', label: 'Facility', kind: 'facility' },
        { name: 'patientId', label: 'Patient', kind: 'searchable' },
        { name: 'encounterId', label: 'Encounter', kind: 'searchable' },
        { name: 'coverageId', label: 'Active coverage', kind: 'searchable', required: false },
        { name: 'payerName', label: 'Payer name', maxLength: 300 },
        { name: 'billedAmountCents', label: 'Billed amount', kind: 'currency' },
      ]}
      onSubmit={actions.prepareInsuranceClaim}
    />
  )
}

function InlineAction({ label, onRun, onComplete, variant = 'outline' }: { label: string; onRun: () => Promise<ActionResponse>; onComplete?: () => void; variant?: 'outline' | 'default' }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  return (
    <span className="inline-flex min-w-0 flex-col items-start gap-1">
      <Track>
      <Pill
        size="sm"
        variant={variant === 'default' ? 'primary' : 'raised'}
        disabled={pending}
        onClick={async () => {
          setPending(true)
          setError('')
          try {
            const response = await onRun()
            if (!response.success) setError(response.error || `${label} could not be verified. Retry the same action or refresh.`)
            else onComplete?.()
          } catch {
            setError(`${label} could not be verified. Retry the same action or refresh.`)
          } finally {
            setPending(false)
          }
        }}
      >
        {pending && <Loader2 className="animate-spin" />}
        {label}
      </Pill>
      </Track>
      {error && <span role="alert" className="max-w-56 break-words text-xs text-red-700 dark:text-red-300">{error}</span>}
    </span>
  )
}

export function TransitionButton({ kind, id, toStatus, version }: { kind: 'order' | 'result' | 'prescription' | 'procedure' | 'carePlan'; id: string; toStatus: string; version: number }) {
  const move = {
    order: actions.moveMedicalOrder,
    result: actions.moveLabResult,
    prescription: actions.movePrescription,
    procedure: actions.moveProcedure,
    carePlan: actions.moveCarePlan,
  }[kind]
  const operationKeys = useOperationKeys()
  const intent = `${kind}:${id}:${toStatus}:${version}`
  const [originalLabTransition, setOriginalLabTransition] = useState<{ id: string; toStatus: string; version: number; operationKey: string; intent: string } | null>(null)
  return <InlineAction label={originalLabTransition ? 'Retry exact original lab transition' : toStatus.replaceAll('_', ' ')} onRun={() => {
    if (kind !== 'result') return move(id, toStatus, version, operationKeys.get(intent))
    const original = originalLabTransition || { id, toStatus, version, operationKey: operationKeys.get(intent), intent }
    setOriginalLabTransition(original)
    return move(original.id, original.toStatus, original.version, original.operationKey)
  }} onComplete={() => {
    operationKeys.clear(originalLabTransition?.intent || intent)
    setOriginalLabTransition(null)
  }} />
}

export function AdmissionDischargeForm({ id, version }: { id: string; version: number }) {
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const operationKeys = useOperationKeys()
  return (
    <form
      className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
      onSubmit={async event => {
          event.preventDefault()
          const formData = new FormData(event.currentTarget)
        const payload = {
          admissionId: id,
          toStatus: 'discharged',
          expectedVersion: version,
          dischargeDisposition: String(formData.get('dischargeDisposition') || ''),
        }
        const intent = JSON.stringify(payload)
        setPending(true)
        setError('')
        try {
          const response = await actions.moveAdmission({ ...payload, operationKey: operationKeys.get(intent) })
          if (!response.success) setError(response.error || 'Discharge could not be verified. Retry the same disposition or refresh.')
          else operationKeys.clear(intent)
        } catch {
          setError('Discharge could not be verified. Retry the same disposition or refresh.')
        } finally {
          setPending(false)
        }
      }}
    >
      <Label className="sr-only" htmlFor={`discharge-${id}`}>Discharge disposition</Label>
      <Input id={`discharge-${id}`} name="dischargeDisposition" required maxLength={500} placeholder="Discharge disposition" className="sm:w-auto sm:flex-1" />
      <Track className="self-start sm:self-auto"><Pill type="submit" size="sm" variant="primary" disabled={pending}>Discharge</Pill></Track>
      {error && <Notice tone="bad" role="alert" className="text-xs sm:basis-full">{error}</Notice>}
    </form>
  )
}

export function AdmissionTransferForm({ id, version, facilityId }: { id: string; version: number; facilityId: string }) {
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const operationKeys = useOperationKeys()
  return (
    <form
      className="mt-3 grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start"
      onSubmit={async event => {
          event.preventDefault()
          const formData = new FormData(event.currentTarget)
        const payload = {
          admissionId: id,
          toStatus: 'transferred',
          expectedVersion: version,
          bedId: String(formData.get('bedId') || ''),
          reasonCode: String(formData.get('reasonCode') || ''),
        }
        const intent = JSON.stringify(payload)
        setPending(true)
        setError('')
        try {
          const response = await actions.moveAdmission({ ...payload, operationKey: operationKeys.get(intent) })
          if (!response.success) setError(response.error || 'Transfer could not be verified. Retry the same destination or refresh.')
          else operationKeys.clear(intent)
        } catch {
          setError('Transfer could not be verified. Retry the same destination or refresh.')
        } finally {
          setPending(false)
        }
      }}
    >
      <Label className="sr-only" htmlFor={`bed-${id}`}>Destination bed</Label>
      <SearchableField
        field={{ name: 'bedId', label: 'Destination bed', kind: 'searchable' }}
        id={`bed-${id}`}
        facilityId={facilityId}
        patientId=""
        onSelect={() => undefined}
      />
      <Label className="sr-only" htmlFor={`transfer-reason-${id}`}>Transfer reason</Label>
      <Input id={`transfer-reason-${id}`} name="reasonCode" required maxLength={80} placeholder="Transfer reason" />
      <Track className="self-start"><Pill type="submit" size="sm" disabled={pending || !facilityId}>Transfer</Pill></Track>
      {error && <Notice tone="bad" role="alert" className="text-xs sm:col-span-3">{error}</Notice>}
    </form>
  )
}

export function BedButton({ id, toStatus, version }: { id: string; toStatus: string; version: number }) {
  const operationKeys = useOperationKeys()
  const intent = `bed:${id}:${toStatus}:${version}`
  return <InlineAction label={toStatus.replaceAll('_', ' ')} onRun={() => actions.setBedReadiness(id, toStatus, version, operationKeys.get(intent))} onComplete={() => operationKeys.clear(intent)} />
}

export function ClaimButton({ id, toStatus, version }: { id: string; toStatus: string; version: number }) {
  const label = toStatus === 'submitted' ? 'Record manual submission' : toStatus.replaceAll('_', ' ')
  const operationKeys = useOperationKeys()
  const intent = `claim:${id}:${toStatus}:${version}`
  return <InlineAction label={label} onRun={() => actions.moveInsuranceClaim({ claimId: id, toStatus, expectedVersion: version, reasonCode: 'operator_action', operationKey: operationKeys.get(intent) })} onComplete={() => operationKeys.clear(intent)} />
}

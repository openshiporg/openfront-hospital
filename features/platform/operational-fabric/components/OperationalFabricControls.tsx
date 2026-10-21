'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { DeviceTimeNotice } from '@/features/platform/components/DeviceTimeNotice'
import { deviceLocalDateTimeToIso } from '@/features/platform/lib/deviceDateTime'
import { useDraftExitGuard } from '@/features/platform/lib/useDraftExitGuard'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { FacilitySearchField } from '@/features/platform/facilities/components/FacilitySearchField'
import * as actions from '../actions/workflows'
import type { ConsentCandidateSearchResult, EncounterHoldCandidateSearchResult, FabricPatientCandidateSearchResult, IntegrationCandidateSearchResult, InventoryCandidateSearchResult, PaymentClaimCandidateSearchResult, RefundPaymentCandidateSearchResult } from '../actions/workflows'
import type { FabricOption, FabricWorkspace } from '../lib/getOperationalFabricWorkspace'

type Response = { success: boolean; error?: string; data?: any }
type Field = {
  name: string
  label: string
  kind?: 'text' | 'textarea' | 'select' | 'facility' | 'patient-search' | 'encounter-search' | 'claim-search' | 'payment-search' | 'coverage-search' | 'inventory-search' | 'integration-search' | 'current-consent-search' | 'granted-consent-search' | 'integer' | 'signed-integer' | 'currency' | 'datetime-local' | 'csv' | 'comma-list'
  options?: FabricOption[]
  required?: boolean
  value?: string
  placeholder?: string
}

const controlClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring'

function CoverageCandidateField({ id, name, label, required }: { id: string; name: string; label: string; required: boolean }) {
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<Array<{ id: string; coverageNumber: string; payerName: string; transitionVersion: number }>>([])
  const [count, setCount] = useState(0)
  const [selected, setSelected] = useState<{ id: string; coverageNumber: string; payerName: string; transitionVersion: number } | null>(null)
  const [pending, setPending] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    const normalized = search.trim()
    if (normalized.length < 2) {
      setOptions([])
      setCount(0)
      setPending(false)
      setUnavailable(false)
      return
    }
    const timer = setTimeout(() => {
      setPending(true)
      setUnavailable(false)
      setOptions([])
      setCount(0)
      void actions.searchUnverifiedCoverageCandidates(normalized).then(response => {
        if (cancelled) return
        if (!response.success) {
          setUnavailable(true)
          return
        }
        setOptions(response.data.patientCoverages)
        setCount(response.data.patientCoveragesCount)
      }).catch(() => {
        if (!cancelled) setUnavailable(true)
      }).finally(() => {
        if (!cancelled) setPending(false)
      })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [search])

  const valueFor = (option: { id: string; transitionVersion: number }) => `${option.id}::${option.transitionVersion}`
  const visibleOptions = selected && !options.some(option => valueFor(option) === valueFor(selected))
    ? [selected, ...options]
    : options
  const noMatches = !pending && !unavailable && search.trim().length >= 2 && options.length === 0

  return (
    <div className="space-y-2">
      <Input id={`${id}-search`} type="search" value={search} onChange={event => {
        setSearch(event.target.value)
        if (selected) setSelected(null)
      }} placeholder="Search coverage number or payer" aria-label={`Search ${label.toLowerCase()} by coverage number or payer`} maxLength={100} />
      <select id={id} name={name} required={required} aria-label={label} className={controlClass} value={selected ? valueFor(selected) : ''} onChange={event => setSelected(visibleOptions.find(option => valueFor(option) === event.target.value) || null)}>
        <option value="">{pending ? 'Searching…' : search.trim().length < 2 ? 'Enter at least 2 characters to search' : 'Select unverified coverage'}</option>
        {visibleOptions.map(option => <option key={option.id} value={valueFor(option)}>{option.coverageNumber} · {option.payerName}</option>)}
      </select>
      {count > options.length && <p className="text-xs text-muted-foreground">Showing {options.length} of {count} matching unverified coverage records. Add more characters to narrow results.</p>}
      {unavailable && <p role="status" className="text-xs text-muted-foreground">Coverage search is unavailable for this session. Access could not be verified; no empty result is being inferred.</p>}
      {noMatches && <p role="status" className="text-xs text-muted-foreground">No matching unverified coverage records were found in the accessible scope.</p>}
    </div>
  )
}

type EncounterHoldCandidate = EncounterHoldCandidateSearchResult['encounters'][number]

function EncounterHoldCandidateField({ id, name, label, facilityId }: { id: string; name: string; label: string; facilityId: string }) {
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<EncounterHoldCandidate[]>([])
  const [count, setCount] = useState(0)
  const [selected, setSelected] = useState<EncounterHoldCandidate | null>(null)
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
      void actions.searchEncounterHoldCandidates(facilityId, normalized).then(response => {
        if (cancelled) return
        if (!response.success) {
          setUnavailable(true)
          return
        }
        setOptions(response.data.encounters)
        setCount(response.data.encountersCount)
      }).catch(() => {
        if (!cancelled) setUnavailable(true)
      }).finally(() => {
        if (!cancelled) setPending(false)
      })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [facilityId, search])

  const hasUniqueMatch = !pending && !unavailable && count === 1 && options.length === 1
  const noMatches = !pending && !unavailable && Boolean(facilityId) && search.trim().length >= 2 && count === 0

  return (
    <div className="space-y-2">
      <Input id={`${id}-search`} type="search" value={search} onChange={event => {
        setSearch(event.target.value)
        setSelected(null)
        setOptions([])
        setCount(0)
        setUnavailable(false)
      }} placeholder={facilityId ? 'Search by encounter number' : 'Select a facility first'} aria-label={`Search ${label.toLowerCase()} by encounter number`} maxLength={100} disabled={!facilityId} />
      <select id={id} name={name} required aria-label={label} className={controlClass} value={selected?.id || ''} disabled={!facilityId} onChange={event => setSelected(hasUniqueMatch && options[0]?.id === event.target.value ? options[0] : null)}>
        <option value="">{!facilityId ? 'Select a facility first' : pending ? 'Searching…' : search.trim().length < 2 ? 'Enter at least 2 characters to search' : hasUniqueMatch ? 'Select the single matching encounter' : 'Refine search to one encounter'}</option>
        {hasUniqueMatch && <option value={options[0].id}>One eligible encounter matched</option>}
      </select>
      {count > options.length && <p className="text-xs text-muted-foreground">Search matched {count} eligible encounters; only the first {options.length} candidate IDs were retrieved. Add characters to narrow to one. No encounter choices are shown while the match is ambiguous.</p>}
      {!pending && !unavailable && count > 1 && count <= 25 && <p role="status" className="text-xs text-muted-foreground">Multiple eligible encounters match. Add characters to narrow to one; no encounter identifiers are displayed.</p>}
      {unavailable && <p role="status" className="text-xs text-muted-foreground">Encounter search is unavailable for this session. Authority or scope could not be verified; no empty result is being inferred.</p>}
      {noMatches && <p role="status" className="text-xs text-muted-foreground">No eligible encounter matched in the selected accessible active facility.</p>}
    </div>
  )
}

type PatientCandidate = FabricPatientCandidateSearchResult['patients'][number]

function PatientCandidateField({ id, name, label, required, facilityId, onSelect }: { id: string; name: string; label: string; required: boolean; facilityId: string; onSelect?: (patientId: string) => void }) {
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<PatientCandidate[]>([])
  const [count, setCount] = useState(0)
  const [selected, setSelected] = useState<PatientCandidate | null>(null)
  const [pending, setPending] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    const normalized = search.trim()
    if (!facilityId || normalized.length < 2) {
      setOptions([])
      setCount(0)
      setPending(false)
      setUnavailable(false)
      return
    }

    setPending(true)
    setUnavailable(false)
    setOptions([])
    setCount(0)
    const timer = setTimeout(() => {
      void actions.searchOperationalFabricPatientCandidates(facilityId, normalized).then(response => {
        if (cancelled) return
        if (!response.success) {
          setUnavailable(true)
          return
        }
        setOptions(response.data.patients)
        setCount(response.data.patientsCount)
      }).catch(() => {
        if (!cancelled) setUnavailable(true)
      }).finally(() => {
        if (!cancelled) setPending(false)
      })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [facilityId, search])

  const visibleOptions = selected && !options.some(option => option.id === selected.id) ? [selected, ...options] : options
  const noMatches = !pending && !unavailable && Boolean(facilityId) && search.trim().length >= 2 && count === 0

  return (
    <div className="space-y-2">
      <Input id={`${id}-search`} type="search" value={search} onChange={event => {
        setSearch(event.target.value)
        setSelected(null)
        onSelect?.('')
        setOptions([])
        setCount(0)
        setUnavailable(false)
      }} placeholder={facilityId ? 'Search active patients by name' : 'Select a facility first'} aria-label={`Search ${label.toLowerCase()} by patient name`} maxLength={100} disabled={!facilityId} />
      <select id={id} name={name} required={required} aria-label={label} className={controlClass} value={selected?.id || ''} disabled={!facilityId} onChange={event => {
        const next = visibleOptions.find(option => option.id === event.target.value) || null
        setSelected(next)
        onSelect?.(next?.id || '')
      }}>
        <option value="">{!facilityId ? 'Select a facility first' : pending ? 'Searching…' : search.trim().length < 2 ? 'Enter at least 2 characters to search' : 'Select active patient'}</option>
        {visibleOptions.map(option => <option key={option.id} value={option.id}>{option.displayName}</option>)}
      </select>
      {count > options.length && <p className="text-xs text-muted-foreground">Showing {options.length} of {count} matching active patients in this facility. Add more characters to narrow results.</p>}
      {unavailable && <p role="status" className="text-xs text-muted-foreground">Patient search is unavailable for this session. Access could not be verified; no empty result is being inferred.</p>}
      {noMatches && <p role="status" className="text-xs text-muted-foreground">No matching active patients were found in this accessible facility scope.</p>}
    </div>
  )
}

type ConsentCandidate = ConsentCandidateSearchResult['patientConsents'][number]

function ConsentCandidateField({ id, name, label, required, mode, facilityId, patientId, consentType }: {
  id: string
  name: string
  label: string
  required: boolean
  mode: 'current' | 'granted'
  facilityId: string
  patientId: string
  consentType: string
}) {
  const [options, setOptions] = useState<ConsentCandidate[]>([])
  const [count, setCount] = useState(0)
  const [selected, setSelected] = useState<ConsentCandidate | null>(null)
  const [pending, setPending] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const normalizedType = consentType.trim()
  const hasContext = Boolean(facilityId && patientId && normalizedType)

  useEffect(() => {
    let cancelled = false
    if (!hasContext) {
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
      const search = mode === 'granted'
        ? actions.searchCurrentGrantedConsentCandidates(facilityId, patientId, normalizedType)
        : actions.searchCurrentConsentCandidates(facilityId, patientId, normalizedType)
      void search.then(response => {
        if (cancelled) return
        if (!response.success) {
          setUnavailable(true)
          return
        }
        setOptions(response.data.patientConsents)
        setCount(response.data.patientConsentsCount)
      }).catch(() => {
        if (!cancelled) setUnavailable(true)
      }).finally(() => {
        if (!cancelled) setPending(false)
      })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [facilityId, hasContext, mode, normalizedType, patientId])

  const valueFor = (candidate: ConsentCandidate) => mode === 'current' ? candidate.id : [
    candidate.id,
    facilityId,
    patientId,
    encodeURIComponent(candidate.consentType),
    encodeURIComponent(candidate.policyVersion),
    encodeURIComponent(candidate.statementKey),
  ].join('::')
  const ambiguous = !pending && !unavailable && count > 1
  const visibleOptions = selected && !options.some(option => option.id === selected.id) ? [selected, ...options] : options
  const noMatches = !pending && !unavailable && hasContext && count === 0
  const placeholder = !hasContext
    ? 'Select facility and patient, then enter the exact consent type'
    : pending ? 'Searching…'
      : ambiguous ? 'Administrator review required'
        : mode === 'granted' ? 'Select current granted decision' : 'Select current decision to supersede'

  return (
    <div className="space-y-2">
      <select id={id} name={name} required={required} aria-label={label} className={controlClass} value={selected ? valueFor(selected) : ''} onChange={event => setSelected(visibleOptions.find(option => valueFor(option) === event.target.value) || null)}>
        <option value="">{placeholder}</option>
        {!ambiguous && visibleOptions.map(option => <option key={option.id} value={valueFor(option)}>{option.decision} · {option.policyVersion} · {option.effectiveAt}</option>)}
      </select>
      {count > options.length && <p className="text-xs text-muted-foreground">Showing {options.length} of {count} current decisions matching this facility, patient, and exact consent type.</p>}
      {ambiguous && <p role="status" className="text-xs text-muted-foreground">Multiple current decisions match this scope. The server refuses ambiguous consent history; administrator review is required and no selection is offered.</p>}
      {unavailable && <p role="status" className="text-xs text-muted-foreground">Consent search is unavailable for this session. Access could not be verified; no empty result is being inferred.</p>}
      {noMatches && <p role="status" className="text-xs text-muted-foreground">No current {mode === 'granted' ? 'granted ' : ''}consent decision matched this facility, patient, and exact consent type in the accessible scope.</p>}
    </div>
  )
}

type PaymentClaimCandidate = PaymentClaimCandidateSearchResult['insuranceClaims'][number]

function PaymentClaimCandidateField({ id, name, label, facilityId, patientId }: { id: string; name: string; label: string; facilityId: string; patientId: string }) {
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<PaymentClaimCandidate[]>([])
  const [count, setCount] = useState(0)
  const [selected, setSelected] = useState<PaymentClaimCandidate | null>(null)
  const [pending, setPending] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    const normalized = search.trim()
    if (!facilityId || !patientId || normalized.length < 2) {
      setOptions([])
      setCount(0)
      setPending(false)
      setUnavailable(false)
      return
    }

    setPending(true)
    setUnavailable(false)
    setOptions([])
    setCount(0)
    const timer = setTimeout(() => {
      void actions.searchPaymentClaimCandidates(facilityId, patientId, normalized).then(response => {
        if (cancelled) return
        if (!response.success) {
          setUnavailable(true)
          return
        }
        setOptions(response.data.insuranceClaims)
        setCount(response.data.insuranceClaimsCount)
      }).catch(() => {
        if (!cancelled) setUnavailable(true)
      }).finally(() => {
        if (!cancelled) setPending(false)
      })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [facilityId, patientId, search])

  const visibleOptions = selected && !options.some(option => option.id === selected.id) ? [selected, ...options] : options
  const hasContext = Boolean(facilityId && patientId)
  const noMatches = !pending && !unavailable && hasContext && search.trim().length >= 2 && count === 0

  return (
    <div className="space-y-2">
      <Input id={`${id}-search`} type="search" value={search} onChange={event => {
        setSearch(event.target.value)
        setSelected(null)
        setOptions([])
        setCount(0)
        setUnavailable(false)
      }} placeholder={hasContext ? 'Search claim number for selected patient' : 'Choose facility and patient first'} aria-label={`Search ${label.toLowerCase()} by claim number`} maxLength={100} disabled={!hasContext} />
      <select id={id} name={name} aria-label={label} className={controlClass} value={selected?.id || ''} disabled={!hasContext} onChange={event => setSelected(visibleOptions.find(option => option.id === event.target.value) || null)}>
        <option value="">{!hasContext ? 'Choose facility and patient first' : pending ? 'Searching…' : search.trim().length < 2 ? 'Enter at least 2 characters to search' : 'No claim selected (optional)'}</option>
        {visibleOptions.map(option => <option key={option.id} value={option.id}>{option.claimNumber} · {option.status}</option>)}
      </select>
      {count > options.length && <p className="text-xs text-muted-foreground">Showing {options.length} of {count} claims matching this patient and facility. Add more characters to narrow results.</p>}
      {unavailable && <p role="status" className="text-xs text-muted-foreground">Claim search is unavailable for this session. Access could not be verified; no empty result is being inferred.</p>}
      {noMatches && <p role="status" className="text-xs text-muted-foreground">No matching claims were found for this patient in the accessible facility scope.</p>}
    </div>
  )
}

type RefundPaymentCandidate = RefundPaymentCandidateSearchResult['patientPayments'][number]

function RefundPaymentCandidateField({ id, name, label, required }: { id: string; name: string; label: string; required: boolean }) {
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<RefundPaymentCandidate[]>([])
  const [count, setCount] = useState(0)
  const [selected, setSelected] = useState<RefundPaymentCandidate | null>(null)
  const [pending, setPending] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    const normalized = search.trim()
    if (normalized.length < 2) {
      setOptions([])
      setCount(0)
      setPending(false)
      setUnavailable(false)
      return
    }

    setPending(true)
    setUnavailable(false)
    setOptions([])
    setCount(0)
    const timer = setTimeout(() => {
      void actions.searchRefundPaymentCandidates(normalized).then(response => {
        if (cancelled) return
        if (!response.success) {
          setUnavailable(true)
          return
        }
        setOptions(response.data.patientPayments)
        setCount(response.data.patientPaymentsCount)
      }).catch(() => {
        if (!cancelled) setUnavailable(true)
      }).finally(() => {
        if (!cancelled) setPending(false)
      })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [search])

  const visibleOptions = selected && !options.some(option => option.id === selected.id) ? [selected, ...options] : options
  const noMatches = !pending && !unavailable && search.trim().length >= 2 && count === 0
  const hasNoRecordedBalance = !pending && !unavailable && options.some(option => option.refundedAmountCents >= option.amountCents)

  return (
    <div className="space-y-2">
      <Input id={`${id}-search`} type="search" value={search} onChange={event => {
        setSearch(event.target.value)
        setSelected(null)
        setOptions([])
        setCount(0)
        setUnavailable(false)
      }} placeholder="Search succeeded payment number" aria-label={`Search ${label.toLowerCase()} by payment number`} maxLength={100} />
      <select id={id} name={name} required={required} aria-label={label} className={controlClass} value={selected?.id || ''} onChange={event => setSelected(visibleOptions.find(option => option.id === event.target.value) || null)}>
        <option value="">{pending ? 'Searching…' : search.trim().length < 2 ? 'Enter at least 2 characters to search' : 'Select succeeded payment'}</option>
        {visibleOptions.map(option => <option key={option.id} value={option.id} disabled={option.refundedAmountCents >= option.amountCents}>{option.paymentNumber} · {option.currency} · {option.method}</option>)}
      </select>
      {count > options.length && <p className="text-xs text-muted-foreground">Showing {options.length} of {count} matching succeeded payments. Narrow the payment number to find later results.</p>}
      {hasNoRecordedBalance && <p className="text-xs text-muted-foreground">Matches with no recorded unrefunded balance are disabled. Pending refund reservations are rechecked by the server.</p>}
      {unavailable && <p role="status" className="text-xs text-muted-foreground">Payment search is unavailable for this session. Access could not be verified; no empty result is being inferred.</p>}
      {noMatches && <p role="status" className="text-xs text-muted-foreground">No succeeded payment matched in the accessible billing scope.</p>}
    </div>
  )
}

type InventoryCandidate = InventoryCandidateSearchResult['inventoryItems'][number]

function InventoryCandidateField({ id, name, label, required }: { id: string; name: string; label: string; required: boolean }) {
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<InventoryCandidate[]>([])
  const [count, setCount] = useState(0)
  const [selected, setSelected] = useState<InventoryCandidate | null>(null)
  const [pending, setPending] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    const normalized = search.trim()
    if (normalized.length < 2) {
      setOptions([])
      setCount(0)
      setPending(false)
      setUnavailable(false)
      return
    }

    setPending(true)
    setUnavailable(false)
    setOptions([])
    setCount(0)
    const timer = setTimeout(() => {
      void actions.searchInventoryCandidates(normalized).then(response => {
        if (cancelled) return
        if (!response.success) {
          setUnavailable(true)
          return
        }
        setOptions(response.data.inventoryItems)
        setCount(response.data.inventoryItemsCount)
      }).catch(() => {
        if (!cancelled) setUnavailable(true)
      }).finally(() => {
        if (!cancelled) setPending(false)
      })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [search])

  const valueFor = (option: { id: string; transitionVersion: number }) => `${option.id}::${option.transitionVersion}`
  const visibleOptions = selected && !options.some(option => valueFor(option) === valueFor(selected))
    ? [selected, ...options]
    : options
  const noMatches = !pending && !unavailable && search.trim().length >= 2 && count === 0

  return (
    <div className="space-y-2">
      <Input id={`${id}-search`} type="search" value={search} onChange={event => {
        setSearch(event.target.value)
        setSelected(null)
        setOptions([])
        setCount(0)
        setUnavailable(false)
      }} placeholder="Search active inventory by SKU or name" aria-label={`Search ${label.toLowerCase()} by SKU or name`} maxLength={100} />
      <select id={id} name={name} required={required} aria-label={label} className={controlClass} value={selected ? valueFor(selected) : ''} onChange={event => setSelected(visibleOptions.find(option => valueFor(option) === event.target.value) || null)}>
        <option value="">{pending ? 'Searching…' : search.trim().length < 2 ? 'Enter at least 2 characters to search' : 'Select active inventory item'}</option>
        {visibleOptions.map(option => <option key={option.id} value={valueFor(option)}>{option.sku} · {option.name} · {option.facility?.name || 'Facility'} · {option.quantityOnHand - option.quantityReserved} available</option>)}
      </select>
      {count > options.length && <p className="text-xs text-muted-foreground">Showing {options.length} of {count} matching active inventory items. Add more characters to narrow results.</p>}
      {unavailable && <p role="status" className="text-xs text-muted-foreground">Inventory search is unavailable for this session. Access could not be verified; no empty result is being inferred.</p>}
      {noMatches && <p role="status" className="text-xs text-muted-foreground">No matching active inventory items were found in the accessible facility scope.</p>}
    </div>
  )
}

type IntegrationCandidate = IntegrationCandidateSearchResult['integrationInstallations'][number]

function IntegrationCandidateField({ id, name, label, required }: { id: string; name: string; label: string; required: boolean }) {
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<IntegrationCandidate[]>([])
  const [count, setCount] = useState(0)
  const [selected, setSelected] = useState<IntegrationCandidate | null>(null)
  const [pending, setPending] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    const normalized = search.trim()
    if (normalized.length < 2) {
      setOptions([])
      setCount(0)
      setPending(false)
      setUnavailable(false)
      return
    }

    setPending(true)
    setUnavailable(false)
    setOptions([])
    setCount(0)
    const timer = setTimeout(() => {
      void actions.searchActiveIntegrationCandidates(normalized).then(response => {
        if (cancelled) return
        if (!response.success) {
          setUnavailable(true)
          return
        }
        setOptions(response.data.integrationInstallations)
        setCount(response.data.integrationInstallationsCount)
      }).catch(() => {
        if (!cancelled) setUnavailable(true)
      }).finally(() => {
        if (!cancelled) setPending(false)
      })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [search])

  const visibleOptions = selected && !options.some(option => option.id === selected.id)
    ? [selected, ...options]
    : options
  const noMatches = !pending && !unavailable && search.trim().length >= 2 && count === 0

  return (
    <div className="space-y-2">
      <Input id={`${id}-search`} type="search" value={search} onChange={event => {
        setSearch(event.target.value)
        setSelected(null)
        setOptions([])
        setCount(0)
        setUnavailable(false)
      }} placeholder="Search active integrations by name or type" aria-label={`Search ${label.toLowerCase()} by name or type`} maxLength={100} />
      <select id={id} name={name} required={required} aria-label={label} className={controlClass} value={selected?.id || ''} onChange={event => setSelected(visibleOptions.find(option => option.id === event.target.value) || null)}>
        <option value="">{pending ? 'Searching…' : search.trim().length < 2 ? 'Enter at least 2 characters to search' : 'Select active integration'}</option>
        {visibleOptions.map(option => <option key={option.id} value={option.id}>{option.name} · {option.kind} · {option.facility?.name || 'Facility'}</option>)}
      </select>
      {count > options.length && <p className="text-xs text-muted-foreground">Showing {options.length} of {count} matching active integrations. Add more characters to narrow results.</p>}
      {unavailable && <p role="status" className="text-xs text-muted-foreground">Integration search is unavailable for this session. Access could not be verified; no empty result is being inferred.</p>}
      {noMatches && <p role="status" className="text-xs text-muted-foreground">No matching active integrations were found in the accessible facility scope.</p>}
    </div>
  )
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

function Form({ title, description, fields, submit, action, accessibleFacilityCount }: {
  title: string
  description: string
  fields: Field[]
  submit: string
  action: (data: Record<string, unknown>) => Promise<Response>
  accessibleFacilityCount?: number
}) {
  const ref = useRef<HTMLFormElement>(null)
  const controlId = useId().replaceAll(':', '')
  const intentKeys = useRef(new Map<string, string>())
  const original = useRef<Record<string, unknown> | null>(null)
  const [locked, setLocked] = useState(false)
  const [dirty, setDirty] = useState(false)
  const exitGuard = useDraftExitGuard(dirty || locked, locked)
  const [pending, setPending] = useState(false)
  const [facilityId, setFacilityId] = useState('')
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [consentType, setConsentType] = useState('')
  const [formResetVersion, setFormResetVersion] = useState(0)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const missingFacility = fields.some(field => field.kind === 'facility' && field.required !== false) && accessibleFacilityCount === 0
  const missing = missingFacility || fields.some(field => field.kind === 'select' && field.required !== false && !field.options?.length)
  return (
    <details className="rounded-lg border bg-card">
      <summary className="cursor-pointer list-none px-4 py-3">
        <span className="block font-medium">{title}</span>
        <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
      </summary>
      <form ref={ref} onChange={() => setDirty(true)} className="grid gap-4 border-t p-4 md:grid-cols-2" onSubmit={async event => {
          event.preventDefault()
          const formData = new FormData(event.currentTarget)
        setPending(true); setError(''); setMessage('')
        let dispatched = false
        try {
        const data: Record<string, unknown> = {}
        for (const field of fields) {
          const raw = String(formData.get(field.name) ?? '').trim()
          if (!raw) continue
          if (field.kind === 'integer' || field.kind === 'signed-integer') data[field.name] = Number(raw)
          else if (field.kind === 'currency') data[field.name] = Math.round(Number(raw) * 100)
          else if (field.kind === 'datetime-local') data[field.name] = deviceLocalDateTimeToIso(raw)
          else if (field.kind === 'comma-list') data[field.name] = raw.split(',').map(value => value.trim()).filter(Boolean)
          else data[field.name] = raw
        }
        const originalBody = original.current ? Object.fromEntries(Object.entries(original.current).filter(([key]) => key !== 'operationKey')) : null
        const intent = JSON.stringify(originalBody || data)
        const fingerprint = intentFingerprint(intent)
        const storageKey = `openfront:operation:${window.location.pathname}:${controlId}:${fingerprint}`
        let operationKey = intentKeys.current.get(fingerprint)
        if (!operationKey) {
          try { operationKey = sessionStorage.getItem(storageKey) || undefined } catch { /* memory-only retry */ }
        }
        operationKey ||= `hospital-ui-${crypto.randomUUID()}`
        intentKeys.current.set(fingerprint, operationKey)
        try { sessionStorage.setItem(storageKey, operationKey) } catch { /* memory-only retry */ }
        const request = original.current || { ...data, operationKey }
        original.current = request
        setLocked(true)
          dispatched = true
          const response = await action(structuredClone(request))
          if (!response.success) { setError(response.error || `${title} could not be verified. Retry the original command; reconcile before another operation.`); return }
          intentKeys.current.delete(fingerprint)
          try { sessionStorage.removeItem(storageKey) } catch { /* no persisted retry key */ }
          original.current = null
          setLocked(false)
          setDirty(false)
          const payload = response.data ? Object.values(response.data)[0] as any : null
          const secret = payload?.signingSecret || payload?.credential || payload?.accessToken
          const oneTimeSecretExpected = title === 'Install webhook integration' || title === 'Issue machine credential'
          if (oneTimeSecretExpected && !secret) {
            setError('The operation was recorded, but its one-time secret was not returned. It cannot be recovered; revoke or replace the credential before using it.')
          } else {
            setMessage(secret ? `Completed. Copy this one-time value now: ${secret}` : 'Completed. The workspace has been refreshed.')
          }
          setFacilityId('')
          setSelectedPatientId('')
          setConsentType('')
          setFormResetVersion(version => version + 1)
          ref.current?.reset()
        } catch (failure) {
          setError(!dispatched && failure instanceof Error ? failure.message : `${title} outcome is unknown. Retry its original command and reconcile before a separate operation.`)
        } finally {
          setPending(false)
        }
      }}>
        {exitGuard}
        {fields.some(field => field.kind === 'datetime-local') && <DeviceTimeNotice />}
        <fieldset className="contents" disabled={pending || locked}>
        {fields.map(field => (
          <div key={`${field.name}:${formResetVersion}:${field.kind === 'claim-search' ? `${facilityId}:${selectedPatientId}` : field.kind === 'encounter-search' ? facilityId : field.kind === 'current-consent-search' || field.kind === 'granted-consent-search' ? `${facilityId}:${selectedPatientId}:${consentType}` : ['patientId', 'localId', 'supersedesConsentId', 'grantedConsent'].includes(field.name) ? facilityId : ''}`} className={(field.kind === 'textarea' || field.kind === 'csv') ? 'space-y-2 md:col-span-2' : 'space-y-2'}>
            {field.kind !== 'facility' && <Label htmlFor={`${title}-${field.name}`}>{field.label}{field.required === false ? ' (optional)' : ''}</Label>}
            {field.kind === 'patient-search' ? (
              <PatientCandidateField id={`${title}-${field.name}`} name={field.name} label={field.label} required={field.required !== false} facilityId={facilityId} onSelect={field.name === 'patientId' ? setSelectedPatientId : undefined} />
            ) : field.kind === 'encounter-search' ? (
              <EncounterHoldCandidateField id={`${title}-${field.name}`} name={field.name} label={field.label} facilityId={facilityId} />
            ) : field.kind === 'claim-search' ? (
              <PaymentClaimCandidateField id={`${title}-${field.name}`} name={field.name} label={field.label} facilityId={facilityId} patientId={selectedPatientId} />
            ) : field.kind === 'current-consent-search' || field.kind === 'granted-consent-search' ? (
              <ConsentCandidateField id={`${title}-${field.name}`} name={field.name} label={field.label} required={field.required !== false} mode={field.kind === 'granted-consent-search' ? 'granted' : 'current'} facilityId={facilityId} patientId={selectedPatientId} consentType={consentType} />
            ) : field.kind === 'payment-search' ? (
              <RefundPaymentCandidateField id={`${title}-${field.name}`} name={field.name} label={field.label} required={field.required !== false} />
            ) : field.kind === 'coverage-search' ? (
              <CoverageCandidateField id={`${title}-${field.name}`} name={field.name} label={field.label} required={field.required !== false} />
            ) : field.kind === 'inventory-search' ? (
              <InventoryCandidateField id={`${title}-${field.name}`} name={field.name} label={field.label} required={field.required !== false} />
            ) : field.kind === 'integration-search' ? (
              <IntegrationCandidateField id={`${title}-${field.name}`} name={field.name} label={field.label} required={field.required !== false} />
            ) : field.kind === 'facility' ? (
              <FacilitySearchField id={`${title}-${field.name}`} name={field.name} label={field.label} required={field.required !== false} accessibleFacilityCount={accessibleFacilityCount} onSelect={value => {
                setFacilityId(value)
                setSelectedPatientId('')
              }} />
            ) : field.name === 'consentType' ? (
              <Input id={`${title}-${field.name}`} name={field.name} required={field.required !== false} type="text" maxLength={100} value={consentType} onChange={event => setConsentType(event.target.value)} placeholder="Enter the exact consent type" />
            ) : field.kind === 'select' ? (
              <select id={`${title}-${field.name}`} name={field.name} required={field.required !== false} className={controlClass} defaultValue={field.value || ''}>
                <option value="">{field.options?.length ? `Select ${field.label.toLowerCase()}` : `No ${field.label.toLowerCase()} available`}</option>
                {field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            ) : field.kind === 'textarea' || field.kind === 'csv' ? (
              <Textarea id={`${title}-${field.name}`} name={field.name} required={field.required !== false} rows={field.kind === 'csv' ? 7 : 3} placeholder={field.placeholder} defaultValue={field.value} />
            ) : (
              <Input id={`${title}-${field.name}`} name={field.name} required={field.required !== false}
                type={field.kind === 'integer' || field.kind === 'signed-integer' || field.kind === 'currency' ? 'number' : field.kind === 'datetime-local' ? 'datetime-local' : 'text'}
                min={field.kind === 'integer' || field.kind === 'currency' ? 0 : undefined} step={field.kind === 'currency' ? '0.01' : field.kind === 'integer' || field.kind === 'signed-integer' ? 1 : undefined}
                placeholder={field.placeholder} defaultValue={field.value} />
            )}
          </div>
        ))}
        </fieldset>
        {locked && <p role="status" className="text-xs md:col-span-2">Original command retained in memory. Retry the same submission; verify its original receipt before a separate operation. Reload may lose this private draft.</p>}
        {missingFacility && <p role="status" className="text-sm text-muted-foreground md:col-span-2">No accessible active facility is available for this session.</p>}
        {missing && !missingFacility && <p role="status" className="text-sm text-muted-foreground md:col-span-2">Required records are not available for the selected facility.</p>}
        {error && <p role="alert" className="text-sm text-destructive md:col-span-2">{error}</p>}
        {message && <p role="status" className="break-all rounded-md bg-muted p-3 text-sm md:col-span-2">{message}</p>}
        <div className="md:col-span-2"><Button disabled={pending || missing}>{pending && <Loader2 className="mr-2 size-4 animate-spin" />}{submit}</Button></div>
      </form>
    </details>
  )
}

function ExportWorkflowForm({ accessibleFacilityCount }: { accessibleFacilityCount: number }) {
  const controlId = useId().replaceAll(':', '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [job, setJob] = useState<{ id: string; transitionVersion: number; accessToken: string; format: string; ready: boolean } | null>(null)
  const requestKeys = useRef(new Map<string, string>())
  const processKeys = useRef(new Map<string, string>())
  const getOperationKey = (scope: string, intent: string, keys: Map<string, string>) => {
    const fingerprint = intentFingerprint(`${scope}:${intent}`)
    const storageKey = `openfront:operation:${window.location.pathname}:${controlId}:${fingerprint}`
    let key = keys.get(intent)
    if (!key) {
      try { key = sessionStorage.getItem(storageKey) || undefined } catch { /* memory-only retry */ }
    }
    key ||= `hospital-ui-${crypto.randomUUID()}`
    keys.set(intent, key)
    try { sessionStorage.setItem(storageKey, key) } catch { /* memory-only retry */ }
    return { key, storageKey }
  }
  const clearOperationKey = (intent: string, keys: Map<string, string>, storageKey: string) => {
    keys.delete(intent)
    try { sessionStorage.removeItem(storageKey) } catch { /* no persisted retry key */ }
  }

  const prepare = async (current: NonNullable<typeof job>) => {
    const intent = `export-process:${current.id}:${current.transitionVersion}`
    const { key: operationKey, storageKey } = getOperationKey('process', intent, processKeys.current)
    setPending(true); setError(''); setMessage('')
    try {
      const response = await actions.processExport(current.id, current.transitionVersion, operationKey)
      if (!response.success) { setError(response.error || 'Export preparation could not be verified. Retry or refresh.'); return }
      clearOperationKey(intent, processKeys.current, storageKey)
      const payload = (response.data as any)?.processExportJob
      setJob({ ...current, transitionVersion: Number(payload?.transitionVersion || current.transitionVersion + 1), ready: true })
      setMessage('Export ready. Download it now; the link works once.')
    } catch {
      setError('Export preparation could not be verified. Retry or refresh.')
    } finally {
      setPending(false)
    }
  }

  const download = async (current: NonNullable<typeof job>) => {
    setPending(true); setError(''); setMessage('')
    try {
      const response = await fetch(`/api/exports/${encodeURIComponent(current.id)}`, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { authorization: `Bearer ${current.accessToken}` },
      })
      if (!response.ok) throw new Error('Export download is unavailable or has already been used')
      const blob = await response.blob()
      const disposition = response.headers.get('content-disposition') || ''
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `hospital-export.${current.format === 'csv' ? 'csv' : 'json'}`
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      setJob(null)
      setMessage('Export downloaded. Its one-time link is now closed.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Export download failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <details className="rounded-lg border bg-card">
      <summary className="cursor-pointer list-none px-4 py-3">
        <span className="block font-medium">Request export</span>
        <span className="mt-1 block text-sm text-muted-foreground">Prepare a bounded encrypted export and download it once from this browser.</span>
      </summary>
      <form className="grid gap-4 border-t p-4 md:grid-cols-2" onSubmit={async event => {
          event.preventDefault()
          const formData = new FormData(event.currentTarget)
        setPending(true); setError(''); setMessage('')
        const format = String(formData.get('format') || '')
        const facilityId = String(formData.get('facilityId') || '')
        const exportType = String(formData.get('exportType') || '')
        const intent = JSON.stringify({ facilityId, exportType, format })
        const { key: operationKey, storageKey } = getOperationKey('request', intent, requestKeys.current)
        try {
          const response = await actions.requestExport({ operationKey, facilityId, exportType, format })
          if (!response.success) { setError(response.error || 'Export request could not be verified. Retry the same request or refresh.'); return }
          const payload = (response.data as any)?.requestExportJob
          if (!payload?.id || !payload?.accessToken) {
            clearOperationKey(intent, requestKeys.current, storageKey)
            setError('The export request was recorded without a one-time download link. Do not use that job; submit a fresh request to issue a new link.')
            return
          }
          clearOperationKey(intent, requestKeys.current, storageKey)
          setJob({ id: payload.id, transitionVersion: Number(payload.transitionVersion), accessToken: payload.accessToken, format, ready: payload.status === 'ready' })
          setMessage(payload.status === 'ready' ? 'Export ready to download.' : 'Export queued. Prepare it, then download it before leaving this page.')
        } catch {
          setError('Export request could not be verified. Retry the same request or refresh.')
        } finally {
          setPending(false)
        }
      }}>
        <div className="space-y-2">
          <FacilitySearchField id="export-facility" accessibleFacilityCount={accessibleFacilityCount} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="export-type">Export type</Label>
          <select id="export-type" name="exportType" required className={controlClass} defaultValue="">
            <option value="">Select export type</option>
            {['patients','appointments','audit','inventory'].map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="export-format">Format</Label>
          <select id="export-format" name="format" required className={controlClass} defaultValue="csv">
            <option value="csv">CSV</option><option value="json">JSON</option>
          </select>
        </div>
        {error && <p role="alert" className="text-sm text-destructive md:col-span-2">{error}</p>}
        {message && <p role="status" className="rounded-md bg-muted p-3 text-sm md:col-span-2">{message}</p>}
        <div className="flex flex-wrap gap-2 md:col-span-2">
          {!job && <Button disabled={pending || accessibleFacilityCount === 0}>{pending && <Loader2 className="mr-2 size-4 animate-spin" />}Request export</Button>}
          {job && !job.ready && <Button type="button" disabled={pending} onClick={() => prepare(job)}>{pending && <Loader2 className="mr-2 size-4 animate-spin" />}Prepare export</Button>}
          {job?.ready && <Button type="button" disabled={pending} onClick={() => download(job)}>{pending && <Loader2 className="mr-2 size-4 animate-spin" />}Download once</Button>}
        </div>
      </form>
    </details>
  )
}

function CoverageDecisionForm() {
  return <Form title="Review unverified coverage" description="Record a staff verification or rejection decision. This does not perform payer eligibility or guarantee payment." submit="Record coverage decision"
    fields={[
      { name: 'coverageVersion', label: 'Unverified coverage', kind: 'coverage-search' },
      { name: 'toStatus', label: 'Decision', kind: 'select', options: [{ value: 'active', label: 'Verified from reviewed evidence' }, { value: 'rejected', label: 'Rejected' }] },
      { name: 'reasonCode', label: 'Reviewed-evidence reason code' },
    ]}
    action={async data => {
      const [coverageId, version] = String(data.coverageVersion).split('::')
      delete data.coverageVersion
      return actions.transitionCoverage({ ...data, coverageId, expectedVersion: Number(version) })
    }} />
}

function ConsentDecisionForms({ workspace }: { workspace: FabricWorkspace }) {
  return <>
    <Form title="Record consent decision" description="Append a granted or declined patient decision. If a current decision exists, select it so the history remains explicit." submit="Record decision" accessibleFacilityCount={workspace.facilitiesCount}
      fields={[
        { name: 'facilityId', label: 'Facility', kind: 'facility' },
        { name: 'patientId', label: 'Patient', kind: 'patient-search' },
        { name: 'consentType', label: 'Consent type' },
        { name: 'policyVersion', label: 'Policy version' },
        { name: 'statementKey', label: 'Statement key' },
        { name: 'decision', label: 'Decision', kind: 'select', options: [{ value: 'granted', label: 'Granted' }, { value: 'declined', label: 'Declined' }] },
        { name: 'supersedesConsentId', label: 'Current decision to supersede', kind: 'current-consent-search', required: false },
        { name: 'reasonCode', label: 'Reason code', required: false },
      ]}
      action={actions.recordConsent} />
    <Form title="Withdraw granted consent" description="Select a facility, patient, and exact consent type to find its current grant. Append a withdrawal; prior evidence remains unchanged." submit="Record withdrawal" accessibleFacilityCount={workspace.facilitiesCount}
      fields={[
        { name: 'facilityId', label: 'Facility', kind: 'facility' },
        { name: 'patientId', label: 'Patient', kind: 'patient-search' },
        { name: 'consentType', label: 'Exact consent type' },
        { name: 'grantedConsent', label: 'Current granted decision', kind: 'granted-consent-search' },
        { name: 'reasonCode', label: 'Withdrawal reason code' },
      ]}
      action={async data => {
        const [supersedesConsentId, facilityId, patientId, encodedType, encodedPolicy, encodedStatement] = String(data.grantedConsent).split('::')
        return actions.recordConsent({
          operationKey: data.operationKey,
          supersedesConsentId,
          facilityId,
          patientId,
          consentType: decodeURIComponent(encodedType),
          policyVersion: decodeURIComponent(encodedPolicy),
          statementKey: decodeURIComponent(encodedStatement),
          decision: 'withdrawn',
          reasonCode: data.reasonCode,
        })
      }} />
  </>
}

function InventoryMovementForm() {
  return <Form title="Inventory movement" description="Receive, consume, reserve, release, or adjust an active item in your existing facility scope. The latest transition version is checked when the movement is recorded." submit="Record movement"
    fields={[
      { name: 'itemVersion', label: 'Inventory item', kind: 'inventory-search' },
      { name: 'movementType', label: 'Movement type', kind: 'select', options: ['receive','consume','reserve','release','adjust'].map(value => ({ value, label: value })) },
      { name: 'quantityDelta', label: 'On-hand change', kind: 'signed-integer', value: '0' },
      { name: 'reservedDelta', label: 'Reserved change', kind: 'signed-integer', value: '0' },
      { name: 'reasonCode', label: 'Reason code', value: 'operator_adjustment' },
    ]}
    action={async data => {
      const [itemId, version] = String(data.itemVersion).split('::')
      delete data.itemVersion
      return actions.moveInventory({ ...data, itemId, expectedVersion: Number(version) })
    }} />
}

export function OperationalFabricControls({ workspace }: { workspace: FabricWorkspace }) {
  const communicationEvents = 'message.queued'
  const { capabilities: can, availability: available } = workspace
  const facilityScopeReady = available.facilities
  const patientDirectoryReady = available.patients
  const billingReady = can.billing && available.billing
  const consentReady = can.mayRecordConsent && available.consents && facilityScopeReady && patientDirectoryReady
  const inventoryReady = can.inventory && available.inventory
  const integrationReady = can.integrations && available.integrations
  const retentionReady = can.retention && available.retention
  const portabilityReady = can.dataPortability && available.portability
  const communicationsReady = can.communications
  const showInventorySection = inventoryReady || (portabilityReady && facilityScopeReady)
  const showIntegrationSection = (communicationsReady && facilityScopeReady) || integrationReady
  const showRetentionSection = (retentionReady && facilityScopeReady) || (portabilityReady && facilityScopeReady)
  const hasVisibleControls = billingReady || consentReady || showInventorySection || showIntegrationSection || showRetentionSection
  if (!hasVisibleControls) return null

  return (
    <div className="space-y-8">
      {billingReady && <section aria-labelledby="billing-workflows" className="space-y-3">
        <h2 id="billing-workflows" className="text-lg font-semibold">Coverage and patient payments</h2>
        <div className="grid gap-3 xl:grid-cols-2">
          {facilityScopeReady && patientDirectoryReady && <Form title="Record coverage" description="Record coverage details as unverified. This does not check eligibility or guarantee payment." submit="Record coverage" action={actions.recordCoverage} accessibleFacilityCount={workspace.facilitiesCount} fields={[
            { name: 'facilityId', label: 'Facility', kind: 'facility' }, { name: 'patientId', label: 'Patient', kind: 'patient-search' },
            { name: 'payerName', label: 'Payer name' }, { name: 'memberId', label: 'Member ID' }, { name: 'groupNumber', label: 'Group number', required: false },
          ]} />}
          <CoverageDecisionForm />
          {facilityScopeReady && patientDirectoryReady && <Form title="Record manual payment" description="Record cash or check received outside this application. This does not process cards or banks." submit="Record payment" action={actions.recordPayment} accessibleFacilityCount={workspace.facilitiesCount} fields={[
            { name: 'facilityId', label: 'Facility', kind: 'facility' }, { name: 'patientId', label: 'Patient', kind: 'patient-search' },
            { name: 'claimId', label: 'Claim', kind: 'claim-search', required: false }, { name: 'amountCents', label: 'Amount', kind: 'currency' },
            { name: 'currency', label: 'Currency', value: 'USD' }, { name: 'method', label: 'Method', kind: 'select', options: [{ value: 'cash', label: 'Cash' }, { value: 'check', label: 'Check' }] },
          ]} />}
          <Form title="Request refund" description="Record a manual refund or queue one through the payment integration linked to the payment." submit="Request refund" action={actions.requestRefund} fields={[
            { name: 'paymentId', label: 'Succeeded payment', kind: 'payment-search' }, { name: 'amountCents', label: 'Amount', kind: 'currency' }, { name: 'reasonCode', label: 'Reason code' },
          ]} />
        </div>
      </section>}

      {consentReady && <section aria-labelledby="consent-workflows" className="space-y-3">
        <h2 id="consent-workflows" className="text-lg font-semibold">Consent decisions</h2>
        <div className="grid gap-3 xl:grid-cols-2"><ConsentDecisionForms workspace={workspace} /></div>
      </section>}

      {showInventorySection && <section aria-labelledby="inventory-workflows" className="space-y-3">
        <h2 id="inventory-workflows" className="text-lg font-semibold">Inventory and imports</h2>
        <div className="grid gap-3 xl:grid-cols-2">
          {inventoryReady && facilityScopeReady && <Form title="Register inventory item" description="Create an item for this facility and record its opening balance." submit="Register item" action={actions.registerInventory} accessibleFacilityCount={workspace.facilitiesCount} fields={[
            { name: 'facilityId', label: 'Facility', kind: 'facility' }, { name: 'sku', label: 'SKU' }, { name: 'name', label: 'Name' }, { name: 'unit', label: 'Unit' },
            { name: 'initialQuantity', label: 'Opening quantity', kind: 'integer', value: '0' }, { name: 'reorderPoint', label: 'Reorder point', kind: 'integer', value: '0' },
          ]} />}
          {inventoryReady && <InventoryMovementForm />}
          {portabilityReady && facilityScopeReady && <Form title="Preview inventory CSV" description="Validate up to 100 rows before any inventory is applied. Required header: sku,name,unit,quantity,reorderPoint." submit="Create preview" action={actions.previewImport} accessibleFacilityCount={workspace.facilitiesCount} fields={[
            { name: 'facilityId', label: 'Facility', kind: 'facility' }, { name: 'csv', label: 'CSV', kind: 'csv', placeholder: 'sku,name,unit,quantity,reorderPoint\nGAUZE-1,Sterile gauze,box,12,3' },
          ]} />}
        </div>
      </section>}

      {showIntegrationSection && <section aria-labelledby="communications-integrations" className="space-y-3">
        <h2 id="communications-integrations" className="text-lg font-semibold">Communications and integrations</h2>
        <div className="grid gap-3 xl:grid-cols-2">
          {communicationsReady && facilityScopeReady && patientDirectoryReady && <Form title="Communication preference" description="Record an allowed or opted-out channel and purpose for a patient." submit="Record preference" action={actions.setPreference} accessibleFacilityCount={workspace.facilitiesCount} fields={[
            { name: 'facilityId', label: 'Facility', kind: 'facility' }, { name: 'patientId', label: 'Patient', kind: 'patient-search' },
            { name: 'channel', label: 'Channel', kind: 'select', options: ['sms','email'].map(value => ({ value, label: value })) },
            { name: 'purpose', label: 'Purpose', kind: 'select', options: ['care_operations','billing','general'].map(value => ({ value, label: value.replaceAll('_',' ') })) },
            { name: 'status', label: 'Preference', kind: 'select', options: [{ value: 'allowed', label: 'Allowed' }, { value: 'opted_out', label: 'Opted out' }] }, { name: 'reasonCode', label: 'Reason code' },
          ]} />}
          {communicationsReady && facilityScopeReady && <Form title="Communication template" description="Create a reusable communication template for this facility." submit="Register template" action={actions.registerTemplate} accessibleFacilityCount={workspace.facilitiesCount} fields={[
            { name: 'facilityId', label: 'Facility', kind: 'facility' }, { name: 'templateKey', label: 'Template key' }, { name: 'name', label: 'Name' },
            { name: 'channel', label: 'Channel', kind: 'select', options: ['sms','email'].map(value => ({ value, label: value })) }, { name: 'subjectTemplate', label: 'Subject', required: false }, { name: 'bodyTemplate', label: 'Body', kind: 'textarea' },
          ]} />}
          {integrationReady && facilityScopeReady && <Form title="Install webhook integration" description="Register an allowlisted endpoint. The signing secret is shown once." submit="Install integration" action={actions.installIntegration} accessibleFacilityCount={workspace.facilitiesCount} fields={[
            { name: 'facilityId', label: 'Facility', kind: 'facility' }, { name: 'name', label: 'Name' },
            { name: 'kind', label: 'Kind', kind: 'select', options: ['communications','payment','laboratory','pharmacy','webhook'].map(value => ({ value, label: value })) },
            { name: 'endpointUrl', label: 'Allowlisted HTTPS endpoint' }, { name: 'allowedEventTypes', label: 'Allowed events', kind: 'comma-list', value: communicationEvents },
          ]} />}
          {integrationReady && <Form title="Issue machine credential" description="Create a one-time inbound webhook credential with a bounded expiry." submit="Issue credential" action={actions.issueCredential} fields={[
            { name: 'installationId', label: 'Integration', kind: 'integration-search' }, { name: 'name', label: 'Credential name' },
            { name: 'scopes', label: 'Scopes', kind: 'comma-list', value: 'webhook:write' }, { name: 'expiresAt', label: 'Expires at', kind: 'datetime-local' },
          ]} />}
          {can.mayLinkPatientIdentity && integrationReady && facilityScopeReady && patientDirectoryReady && <Form title="Link external patient identity" description="Patient identity links require both integration and patient-operation authority." submit="Link identity" action={actions.linkExternalIdentity} accessibleFacilityCount={workspace.facilitiesCount} fields={[
            { name: 'facilityId', label: 'Facility', kind: 'facility' }, { name: 'localId', label: 'Patient', kind: 'patient-search' },
            { name: 'localType', label: 'Local type', value: 'patient' }, { name: 'system', label: 'External system' }, { name: 'resourceType', label: 'Resource type', value: 'Patient' }, { name: 'externalId', label: 'External ID' },
          ]} />}
        </div>
      </section>}

      {showRetentionSection && <section aria-labelledby="retention-portability" className="space-y-3">
        <h2 id="retention-portability" className="text-lg font-semibold">Retention and portability</h2>
        <div className="grid gap-3 xl:grid-cols-2">
          {retentionReady && facilityScopeReady && <Form title="Retention policy" description="Set a review horizon for a facility record type." submit="Create policy" action={actions.establishPolicy} accessibleFacilityCount={workspace.facilitiesCount} fields={[
            { name: 'facilityId', label: 'Facility', kind: 'facility' },
            { name: 'recordType', label: 'Record type', kind: 'select', options: ['patient','appointment','encounter','clinical_document','claim','export_job'].map(value => ({ value, label: value.replaceAll('_',' ') })) },
            { name: 'retentionDays', label: 'Retention days', kind: 'integer' },
          ]} />}
          {can.mayPlaceEncounterHold && retentionReady && available.encounters && facilityScopeReady && <Form title="Place encounter hold" description="Clinical encounter holds require both retention and patient-operation authority." submit="Place hold" action={actions.placeHold} accessibleFacilityCount={workspace.facilitiesCount} fields={[
            { name: 'facilityId', label: 'Facility', kind: 'facility' }, { name: 'aggregateId', label: 'Encounter', kind: 'encounter-search' },
            { name: 'aggregateType', label: 'Aggregate type', value: 'encounter' }, { name: 'reasonCode', label: 'Reason code' }, { name: 'notes', label: 'Notes', kind: 'textarea', required: false },
          ]} />}
          {portabilityReady && facilityScopeReady && <ExportWorkflowForm accessibleFacilityCount={workspace.facilitiesCount} />}
        </div>
      </section>}
    </div>
  )
}

export function OperationalQueueActions({ workspace }: { workspace: FabricWorkspace }) {
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const controlId = useId().replaceAll(':', '')
  const operationKeys = useRef(new Map<string, string>())
  const run = async (intent: string, action: (operationKey: string) => Promise<Response>) => {
    if (pending) return
    const fingerprint = intentFingerprint(intent)
    const storageKey = `openfront:operation:${window.location.pathname}:${controlId}:${fingerprint}`
    let operationKey = operationKeys.current.get(fingerprint)
    if (!operationKey) {
      try { operationKey = sessionStorage.getItem(storageKey) || undefined } catch { /* memory-only retry */ }
    }
    operationKey ||= `hospital-ui-${crypto.randomUUID()}`
    operationKeys.current.set(fingerprint, operationKey)
    try { sessionStorage.setItem(storageKey, operationKey) } catch { /* memory-only retry */ }
    setPending(true)
    try {
      const response = await action(operationKey)
      if (response.success) {
        operationKeys.current.delete(fingerprint)
        try { sessionStorage.removeItem(storageKey) } catch { /* no persisted retry key */ }
      }
      setMessage(response.success ? 'Action completed.' : response.error || 'Action could not be verified. Retry the same operation.')
    } catch {
      setMessage('Action could not be verified. Retry the same operation.')
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {workspace.capabilities.mayDispatchOutbox && <Button variant="outline" disabled={pending} onClick={() => run('dispatch-integrations', () => actions.dispatchIntegrations())}>Dispatch integration queue</Button>}
        {workspace.capabilities.dataPortability && workspace.availability.portability && workspace.batches.filter(batch => batch.status === 'previewed' && batch.errorCount === 0).map(batch => <Button key={batch.id} variant="outline" disabled={pending} onClick={() => run(`apply:${batch.id}:v${batch.transitionVersion}`, key => actions.applyImport(batch.id, batch.transitionVersion, key))}>Apply import ({batch.rowCount} rows)</Button>)}
        {workspace.capabilities.dataPortability && workspace.availability.portability && workspace.batches.filter(batch => batch.status === 'applied').map(batch => <Button key={batch.id} variant="outline" disabled={pending} onClick={() => run(`rollback:${batch.id}:v${batch.transitionVersion}`, key => actions.rollbackImport(batch.id, batch.transitionVersion, key))}>Rollback import</Button>)}
        {workspace.capabilities.dataPortability && workspace.availability.portability && workspace.exports.filter(job => job.status === 'queued').map(job => <Button key={job.id} variant="outline" disabled={pending} onClick={() => run(`export:${job.id}:v${job.transitionVersion}`, key => actions.processExport(job.id, job.transitionVersion, key))}>Prepare {job.exportType} export</Button>)}
      </div>
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </div>
  )
}

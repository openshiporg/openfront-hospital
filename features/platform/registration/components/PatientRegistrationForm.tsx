'use client'

import { FormEvent, useId, useRef, useState } from 'react'
import { useDraftExitGuard } from '@/features/lib/useDraftExitGuard'
import { Loader2 } from 'lucide-react'

import { Board, BoardRow, Code, Notice, Panel, Pill, Track, fieldClass } from '@/features/platform/components/ward'
import { FacilitySearchField } from '@/features/platform/facilities/components/FacilitySearchField'
import { submitPatientRegistration, type RegistrationResult, type RegistrationSubmission } from '../actions/registration'

function newKey() {
  return `registration-ui-${crypto.randomUUID()}`
}

function duplicateReasonLabel(reason: string) {
  return ({
    date_of_birth_and_email: 'Same date of birth and email',
    date_of_birth_and_phone: 'Same date of birth and phone',
    date_of_birth_and_name: 'Same date of birth and name',
  } as Record<string, string>)[reason] || reason.replaceAll('_', ' ')
}

export function PatientRegistrationForm({ accessibleFacilityCount }: { accessibleFacilityCount: number }) {
  const formId = useId().replaceAll(':', '')
  const [facilityResetVersion, setFacilityResetVersion] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const idempotencyKeyRef = useRef<string | null>(null)
  const [result, setResult] = useState<RegistrationResult | null>(null)
  const [draft, setDraft] = useState<RegistrationSubmission | null>(null)

  const original = useRef<RegistrationSubmission | null>(null)
  const [locked, setLocked] = useState(false)
  const [dirty, setDirty] = useState(false)
  const exitGuard = useDraftExitGuard(dirty || locked, locked)

  async function submit(data: RegistrationSubmission) {
    if (pending) return
    original.current ||= structuredClone(data)
    const request = original.current
    setLocked(true)
    setPending(true)
    setError(null)
    try {
      const response = await submitPatientRegistration(request)
      if (!response.success) {
        setError('Registration outcome could not be verified. Retry the original command; reconcile before a separate registration.')
        return
      }
      setDraft(request)
      setResult(response.data.registerPatient)
      original.current = null
      setLocked(false)
      if (response.data.registerPatient.status === 'completed') {
        setDirty(false)
        idempotencyKeyRef.current = null
        try { sessionStorage.removeItem(`openfront:operation:${window.location.pathname}:${formId}`) } catch { /* no persisted key to clear */ }
        formRef.current?.reset()
        setFacilityResetVersion(version => version + 1)
      }
    } catch {
      setError('Registration outcome is unknown. Retry the original command; reconcile before a separate registration.')
    } finally {
      setPending(false)
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (original.current) { await submit(original.current); return }
    setResult(null)
    setDraft(null)
    const form = new FormData(event.currentTarget)
    const draft = {
      facilityId: String(form.get('facilityId') || ''),
      medicalRecordNumber: String(form.get('medicalRecordNumber') || ''),
      firstName: String(form.get('firstName') || ''),
      lastName: String(form.get('lastName') || ''),
      dateOfBirth: String(form.get('dateOfBirth') || ''),
      email: String(form.get('email') || ''),
      phone: String(form.get('phone') || ''),
      preferredContactMethod: String(form.get('preferredContactMethod') || 'phone'),
      registrationAcknowledged: form.get('registrationAcknowledged') === 'on',
    }
    const storageKey = `openfront:operation:${window.location.pathname}:${formId}`
    let idempotencyKey = idempotencyKeyRef.current
    if (!idempotencyKey) {
      try { idempotencyKey = sessionStorage.getItem(storageKey) } catch { /* memory-only retry */ }
    }
    idempotencyKey ||= newKey()
    idempotencyKeyRef.current = idempotencyKey
    try { sessionStorage.setItem(storageKey, idempotencyKey) } catch { /* memory-only retry */ }
    await submit({ ...draft, idempotencyKey })
  }

  async function resolveDuplicate(resolution: 'create_new' | 'link_existing', patientId?: string) {
    if (!draft) return
    await submit({
      ...draft,
      duplicateResolution: resolution,
      duplicatePatientId: resolution === 'link_existing' ? patientId : undefined,
    })
  }

  const fieldLabel = 'text-xs font-medium text-muted-foreground'
  const panelTitle = 'font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground'

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
      {exitGuard}
      <Panel className="p-4 md:p-5">
        <h2 className={panelTitle}>New patient</h2>
        <form ref={formRef} onChange={() => setDirty(true)} className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2" onSubmit={onSubmit} aria-busy={pending}>
          <fieldset className="contents" disabled={pending || locked || Boolean(result && result.status !== 'completed')}>
          <div className="sm:col-span-2"><FacilitySearchField key={facilityResetVersion} id="facilityId" accessibleFacilityCount={accessibleFacilityCount} /></div>
          <div className="grid min-w-0 gap-1.5"><label className={fieldLabel} htmlFor="firstName">First name</label><input className={fieldClass} id="firstName" name="firstName" required /></div>
          <div className="grid min-w-0 gap-1.5"><label className={fieldLabel} htmlFor="lastName">Last name</label><input className={fieldClass} id="lastName" name="lastName" required /></div>
          <div className="grid min-w-0 gap-1.5"><label className={fieldLabel} htmlFor="dateOfBirth">Date of birth</label><input className={fieldClass} id="dateOfBirth" name="dateOfBirth" type="date" required /></div>
          <div className="grid min-w-0 gap-1.5"><label className={fieldLabel} htmlFor="medicalRecordNumber">MRN</label><input className={`${fieldClass} font-mono`} id="medicalRecordNumber" name="medicalRecordNumber" placeholder="NS-0042" required /></div>
          <div className="grid min-w-0 gap-1.5"><label className={fieldLabel} htmlFor="phone">Phone</label><input className={fieldClass} id="phone" name="phone" type="tel" /></div>
          <div className="grid min-w-0 gap-1.5"><label className={fieldLabel} htmlFor="email">Email</label><input className={fieldClass} id="email" name="email" type="email" /></div>
          <div className="grid min-w-0 gap-1.5 sm:col-span-2"><label className={fieldLabel} htmlFor="preferredContactMethod">Preferred contact</label><select id="preferredContactMethod" name="preferredContactMethod" className={fieldClass}><option value="phone">Phone</option><option value="sms">SMS</option><option value="email">Email</option></select></div>
          <label className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3 text-sm sm:col-span-2" htmlFor="registrationAcknowledged"><input id="registrationAcknowledged" name="registrationAcknowledged" type="checkbox" required className="mt-0.5 size-4 shrink-0 accent-teal-700 dark:accent-teal-400" /><span>Patient was shown and acknowledged the registration notice.</span></label>
          </fieldset>
          {error && <Notice tone="bad" role="alert" className="sm:col-span-2">{error}</Notice>}
          <div className="sm:col-span-2">
            <Track>
              <Pill variant="primary" disabled={pending || accessibleFacilityCount === 0 || Boolean(result && result.status !== 'completed' && !locked)} type="submit">
                {pending && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
                {pending ? 'Checking…' : locked ? 'Retry registration' : 'Register'}
              </Pill>
            </Track>
          </div>
        </form>
      </Panel>

      <Panel className="p-4 md:p-5">
        <h2 className={panelTitle}>Match check</h2>
        <div className="mt-3 space-y-3" aria-live="polite">
          {!result && <p className="text-sm text-muted-foreground">Not submitted</p>}
          {result?.status === 'completed' && <Notice tone="ok"><p className="font-medium">Registration completed</p><p className="mt-0.5">MRN <Code className="text-current">{result.medicalRecordNumber}</Code>{result.replayed ? ' · existing request returned' : ''}</p></Notice>}
          {result?.status === 'candidate_overflow' && <Notice tone="warn" role="alert"><p className="font-medium">Manual identity review required</p><p className="mt-0.5">At least {result.candidateCount} records share this date of birth (review limit {result.candidateLimit}). No patient or MRN was created.</p></Notice>}
          {result?.status === 'duplicate_review' && <>
            <Notice tone="warn"><p className="font-medium">Possible match</p><p className="mt-0.5">Use an existing patient or create a separate record.</p></Notice>
            <Board>
              {result.candidates.map((candidate) => (
                <BoardRow
                  key={candidate.patientId}
                  tone="warn"
                  title={candidate.displayName}
                  meta={<>
                    <span className="tabular-nums">DOB {candidate.dateOfBirth ?? 'unknown'}</span>
                    <span>{candidate.maskedEmail ?? 'no email'}</span>
                    <span className="tabular-nums">{candidate.maskedPhone ?? 'no phone'}</span>
                  </>}
                  aside={<Track><Pill size="sm" variant="primary" disabled={pending} onClick={() => resolveDuplicate('link_existing', candidate.patientId)}>Use this patient</Pill></Track>}
                >
                  <ul className="flex flex-wrap gap-1.5 text-xs">{candidate.reasons.map(reason => <li key={reason} className="rounded-full border bg-background px-2 py-0.5 text-muted-foreground">{duplicateReasonLabel(reason)}</li>)}</ul>
                </BoardRow>
              ))}
            </Board>
          </>}
          {result && result.status !== 'completed' && (
            <Track>
              {result.status === 'duplicate_review' && <Pill disabled={pending} onClick={() => resolveDuplicate('create_new')}>Create separate patient</Pill>}
              {!locked && <Pill variant="plain" disabled={pending} onClick={() => { setResult(null); setDraft(null); idempotencyKeyRef.current = null; try { sessionStorage.removeItem(`openfront:operation:${window.location.pathname}:${formId}`) } catch { /* known non-effect review ended */ } }}>Edit details</Pill>}
            </Track>
          )}
        </div>
      </Panel>
    </div>
  )
}

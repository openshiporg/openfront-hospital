'use client'

import { FormEvent, useId, useRef, useState } from 'react'
import { useDraftExitGuard } from '@/features/lib/useDraftExitGuard'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
      {exitGuard}
      <Card>
        <CardHeader>
          <CardTitle>Register a patient</CardTitle>
          <CardDescription>Enter the patient&apos;s identity and contact details, then review any possible match before assigning an MRN.</CardDescription>
        </CardHeader>
        <CardContent>
          <form ref={formRef} onChange={() => setDirty(true)} className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit} aria-busy={pending}>
            <fieldset className="contents" disabled={pending || locked || Boolean(result && result.status !== 'completed')}>
            <div className="md:col-span-2"><FacilitySearchField key={facilityResetVersion} id="facilityId" accessibleFacilityCount={accessibleFacilityCount} /></div>
            <div className="space-y-2"><Label htmlFor="medicalRecordNumber">Medical record number</Label><Input id="medicalRecordNumber" name="medicalRecordNumber" placeholder="NS-0042" required /></div>
            <div className="space-y-2"><Label htmlFor="dateOfBirth">Date of birth</Label><Input id="dateOfBirth" name="dateOfBirth" type="date" required /></div>
            <div className="space-y-2"><Label htmlFor="firstName">First name</Label><Input id="firstName" name="firstName" required /></div>
            <div className="space-y-2"><Label htmlFor="lastName">Last name</Label><Input id="lastName" name="lastName" required /></div>
            <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" /></div>
            <div className="space-y-2"><Label htmlFor="phone">Phone</Label><Input id="phone" name="phone" /></div>
            <div className="space-y-2 md:col-span-2"><Label htmlFor="preferredContactMethod">Preferred contact</Label><select id="preferredContactMethod" name="preferredContactMethod" className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="phone">Phone</option><option value="sms">SMS</option><option value="email">Email</option></select></div>
            <label className="flex items-start gap-3 rounded-md border p-3 text-sm md:col-span-2" htmlFor="registrationAcknowledged"><input id="registrationAcknowledged" name="registrationAcknowledged" type="checkbox" required className="mt-0.5 size-4" /><span>I confirm the patient was shown and acknowledged the registration notice.</span></label>
            </fieldset>
            {error && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive md:col-span-2">{error}</div>}
            <div className="md:col-span-2"><Button disabled={pending || accessibleFacilityCount === 0 || Boolean(result && result.status !== 'completed' && !locked)} type="submit">{pending && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}{pending ? 'Reviewing registration…' : locked ? 'Retry original registration' : 'Review and register'}</Button></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Review outcome</CardTitle><CardDescription>Possible matches are bounded and deterministic; an overflow is sent for manual identity review instead of being treated as no match.</CardDescription></CardHeader>
        <CardContent className="space-y-3" aria-live="polite">
          {result && result.status !== 'completed' && !locked && <Button type="button" variant="outline" disabled={pending} onClick={() => { setResult(null); setDraft(null); idempotencyKeyRef.current = null; try { sessionStorage.removeItem(`openfront:operation:${window.location.pathname}:${formId}`) } catch { /* known non-effect review ended */ } }}>Edit registration details</Button>}
          {!result && <p className="text-sm text-muted-foreground">Submit the form to complete registration or review a possible match.</p>}
          {result?.status === 'completed' && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4"><CheckCircle2 className="mb-2 size-5 text-emerald-600" /><p className="font-medium">Registration completed</p><p className="mt-1 text-sm text-muted-foreground">MRN {result.medicalRecordNumber}{result.replayed ? ' · existing request returned' : ''}</p></div>}
          {result?.status === 'candidate_overflow' && <div role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4"><AlertTriangle className="mb-2 size-5 text-amber-600" /><p className="font-medium">Manual identity review required</p><p className="mt-1 text-sm text-muted-foreground">At least {result.candidateCount} records share this date of birth; the {result.candidateLimit}-record review bound was exceeded. No patient or MRN was created. Use the patient workspace to narrow the identity review before continuing.</p></div>}
          {result?.status === 'duplicate_review' && <><div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4"><AlertTriangle className="mb-2 size-5 text-amber-600" /><p className="font-medium">Review a possible match</p><p className="mt-1 text-sm text-muted-foreground">Choose an existing patient or create a separate record.</p></div>{result.candidates.map((candidate) => <div key={candidate.patientId} className="rounded-lg border p-4"><p className="font-medium">{candidate.displayName}</p><p className="text-sm text-muted-foreground">DOB {candidate.dateOfBirth ?? 'unknown'} · {candidate.maskedEmail ?? 'no email'} · {candidate.maskedPhone ?? 'no phone'}</p><ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">{candidate.reasons.map(reason => <li key={reason}>{duplicateReasonLabel(reason)}</li>)}</ul><Button className="mt-3" size="sm" disabled={pending} onClick={() => resolveDuplicate('link_existing', candidate.patientId)}>Use this patient</Button></div>)}<Button variant="outline" disabled={pending} onClick={() => resolveDuplicate('create_new')}>Create separate patient</Button></>}
        </CardContent>
      </Card>
    </div>
  )
}

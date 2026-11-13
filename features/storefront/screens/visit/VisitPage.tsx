'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { cancelVisitAction, findVisitAction, type PatientVisitView } from '../../actions/visit'

const STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' }> = {
  requested: { label: 'Requested: the clinic will confirm your time', tone: 'warn' },
  confirmed: { label: 'Confirmed', tone: 'ok' },
  checked_in: { label: 'Checked in', tone: 'ok' },
  in_visit: { label: 'In your visit', tone: 'ok' },
  completed: { label: 'Completed', tone: 'ok' },
  cancelled: { label: 'Cancelled', tone: 'bad' },
  no_show: { label: 'Missed', tone: 'bad' },
}

function when(visit: PatientVisitView) {
  const zone = visit.facilityTimeZone || 'UTC'
  return new Intl.DateTimeFormat('en-US', { timeZone: zone, dateStyle: 'full', timeStyle: 'short' }).format(new Date(visit.startsAt))
}

// Patient self-service for one visit: open it from the email link, or look it up with the request number and date of
// birth; see the time, place and status, and cancel before it starts.
export function VisitPage() {
  const [visit, setVisit] = useState<PatientVisitView | null>(null)
  const [number, setNumber] = useState('')
  const [dob, setDob] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [loadingLink, setLoadingLink] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const token = new URLSearchParams(window.location.hash.slice(1)).get('access')
    if (!token) return
    window.history.replaceState(null, '', '/visit')
    setLoadingLink(true)
    findVisitAction({ accessToken: token }).then(found => {
      setVisit(found)
      if (!found) setMessage('This visit link is not valid any more. Look your visit up below.')
    }).catch(() => setMessage('We could not open this visit. Look it up below.')).finally(() => setLoadingLink(false))
  }, [])

  async function lookup(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      const found = await findVisitAction({ appointmentNumber: number.trim(), dateOfBirth: dob })
      setVisit(found)
      if (!found) setMessage('We could not find a visit with those details. Check the request number you were given, or call the clinic.')
    } finally { setBusy(false) }
  }

  async function cancel() {
    if (!visit) return
    setBusy(true); setMessage('')
    try {
      const result = await cancelVisitAction(visit.accessToken, 'Cancelled by the patient online.')
      if (result.success && result.visit) { setVisit(result.visit); setConfirmCancel(false); setMessage('Your visit is cancelled. The time has been released.') }
      else setMessage(result.success ? 'This visit could not be cancelled online. Call the clinic.' : result.error)
    } finally { setBusy(false) }
  }

  const status = visit ? STATUS[visit.status] ?? { label: visit.status.replaceAll('_', ' '), tone: 'warn' as const } : null
  return <div className="sf-container" style={{ paddingBlock: '4rem', maxWidth: '42rem' }}>
    <h1 className="sf-display sf-display--page">Your visit</h1>
    {!visit && <>
      <p style={{ marginTop: '.75rem' }}>{loadingLink ? 'Opening your visit…' : 'Enter the request number shown when you sent the request and your date of birth.'}</p>
      <form onSubmit={lookup} className="sf-form" style={{ marginTop: '2rem' }}>
        <label className="sf-field"><span className="sf-label">Request number</span><input className="sf-input" required autoComplete="off" placeholder="APT-20261106-…" value={number} onChange={event => setNumber(event.target.value)} /></label>
        <label className="sf-field"><span className="sf-label">Date of birth</span><input className="sf-input" required type="date" value={dob} onChange={event => setDob(event.target.value)} /></label>
        <div className="sf-form-actions"><button className="sf-pill sf-pill--primary" disabled={busy || loadingLink} type="submit">{busy ? 'Looking…' : 'Find my visit'}</button></div>
      </form>
    </>}
    {visit && status && <section style={{ marginTop: '1.5rem', display: 'grid', gap: '1.25rem' }}>
      <p className={`sf-notice ${status.tone === 'ok' ? 'sf-notice--success' : status.tone === 'bad' ? 'sf-notice--error' : 'sf-notice--warn'}`}><span aria-hidden="true" className={`sf-dot sf-dot--${status.tone}`} /><span>{status.label}</span></p>
      <dl className="sf-dl">
        <div><dt>When</dt><dd>{when(visit)}</dd></div>
        {visit.visitTypeName && <div><dt>Visit</dt><dd>{visit.visitTypeName}</dd></div>}
        {visit.providerName && <div><dt>With</dt><dd>{visit.providerName}</dd></div>}
        <div><dt>Where</dt><dd>{[visit.facilityName, visit.facilityAddress].filter(Boolean).join(', ')}</dd></div>
        <div><dt>Request number</dt><dd>{visit.appointmentNumber}</dd></div>
      </dl>
      {visit.canCancel && !confirmCancel && <div className="sf-form-actions"><button className="sf-pill" disabled={busy} onClick={() => setConfirmCancel(true)}>Cancel this visit</button>{visit.facilityPhone && <a className="sf-pill" href={`tel:${visit.facilityPhone.replace(/[^+\d]/g, '')}`}>Call to reschedule</a>}</div>}
      {confirmCancel && <div className="sf-notice sf-notice--warn" style={{ display: 'grid', gap: '.75rem' }}>
        <span>Cancel your visit on {when(visit)}? The time is released to other patients.</span>
        <div className="sf-form-actions"><button className="sf-pill sf-pill--primary" disabled={busy} onClick={cancel}>{busy ? 'Cancelling…' : 'Yes, cancel visit'}</button><button className="sf-pill" disabled={busy} onClick={() => setConfirmCancel(false)}>Keep visit</button></div>
      </div>}
      {visit.status === 'cancelled' && <div className="sf-form-actions"><Link className="sf-pill sf-pill--primary" href="/book">Request a new time</Link></div>}
    </section>}
    {message && <p role="status" className="sf-notice sf-notice--warn" style={{ marginTop: '1rem' }}>{message}</p>}
  </div>
}

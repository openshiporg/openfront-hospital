'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'

import { patientSignIn, patientSignOut, patientSignUp, resendConfirmationAction, type AccountFormState, type PatientAppointments } from '../../actions/account'
import type { PatientVisitView } from '../../actions/visit'

const STATUS: Record<string, string> = {
  requested: 'Requested',
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  in_visit: 'In your visit',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'Missed',
}
const TONE: Record<string, 'ok' | 'warn' | 'bad'> = { requested: 'warn', confirmed: 'ok', checked_in: 'ok', in_visit: 'ok', completed: 'ok', cancelled: 'bad', no_show: 'bad' }

// Built from parts so the server (Node ICU) and browser render identical text: whole-string formats differ in the
// spacing and joiner before AM/PM, which breaks hydration.
function when(visit: PatientVisitView) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: visit.facilityTimeZone || 'UTC', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(new Date(visit.startsAt)).map(p => [p.type, p.value]))
  return `${parts.month} ${parts.day}, ${parts.year}, ${parts.hour}:${parts.minute} ${String(parts.dayPeriod).toUpperCase()}`
}

function VisitRow({ visit }: { visit: PatientVisitView }) {
  return <li className="sf-visit">
    <div>
      <div className="sf-visit__name">{visit.visitTypeName || 'Visit'}{visit.providerName ? ` with ${visit.providerName}` : ''}</div>
      <div className="sf-visit__meta">
        <span><span aria-hidden="true" className={`sf-dot sf-dot--${TONE[visit.status] ?? 'warn'}`} /> {STATUS[visit.status] ?? visit.status.replaceAll('_', ' ')}</span>
        <span>{when(visit)}</span>
        <span>{visit.facilityName}</span>
        <span className="sf-mono">{visit.appointmentNumber}</span>
      </div>
    </div>
    <Link className="sf-pill sf-pill--sm" href={`/visit#access=${encodeURIComponent(visit.accessToken)}`}>{visit.canCancel ? 'Manage' : 'Details'}</Link>
  </li>
}

function SignedIn({ data }: { data: PatientAppointments }) {
  const [resent, setResent] = useState('')
  return <div className="sf-container" style={{ paddingBlock: '4rem', maxWidth: '48rem' }}>
    <h1 className="sf-display sf-display--page">Your visits</h1>
    <p className="sf-muted" style={{ marginTop: '.5rem', overflowWrap: 'anywhere' }}>Signed in as {data.name} · {data.email}</p>
    {!data.emailConfirmed ? <div className="sf-notice sf-notice--warn" style={{ marginTop: '2rem', display: 'grid', gap: '.75rem' }}>
      <span>Confirm your email to see your visits. We sent a link to {data.email}. Your visits are the ones requested with this address.</span>
      <div className="sf-form-actions"><button className="sf-pill" type="button" onClick={async () => { const r = await resendConfirmationAction(); setResent(r.ok ? 'Sent. Check your inbox.' : r.error) }}>Send the link again</button></div>
      {resent && <span role="status">{resent}</span>}
    </div> : <>
      <section style={{ marginTop: '2.5rem' }} aria-labelledby="upcoming">
        <h2 id="upcoming" className="sf-display sf-display--section">Upcoming</h2>
        {data.upcoming.length ? <ul className="sf-visits" style={{ marginTop: '1rem' }}>{data.upcoming.map(v => <VisitRow key={v.appointmentNumber} visit={v} />)}</ul>
          : <p style={{ marginTop: '.75rem' }}>No upcoming visits. <Link href="/book">Request a visit</Link>.</p>}
      </section>
      {data.past.length > 0 && <section style={{ marginTop: '2.5rem' }} aria-labelledby="past">
        <h2 id="past" className="sf-display sf-display--section">Past and cancelled</h2>
        <ul className="sf-visits" style={{ marginTop: '1rem' }}>{data.past.map(v => <VisitRow key={v.appointmentNumber} visit={v} />)}</ul>
      </section>}
    </>}
    <div className="sf-form-actions" style={{ marginTop: '2.5rem' }}>
      <Link className="sf-pill sf-pill--primary" href="/book">Request a visit</Link>
      <form action={patientSignOut}><button className="sf-pill" type="submit">Sign out</button></form>
    </div>
  </div>
}

function AuthForms({ next }: { next: string }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const initial: AccountFormState = { message: null, email: '' }
  const [signInState, signIn, signingIn] = useActionState(patientSignIn, initial)
  const [signUpState, signUp, signingUp] = useActionState(patientSignUp, initial)
  const state = mode === 'signin' ? signInState : signUpState
  return <div className="sf-container" style={{ paddingBlock: '4rem', maxWidth: '34rem' }}>
    <h1 className="sf-display sf-display--page">{mode === 'signin' ? 'Sign in' : 'Create your account'}</h1>
    <p style={{ marginTop: '.75rem' }}>{mode === 'signin' ? 'See and manage all your visits in one place.' : 'Use the email you request visits with. Those visits then appear in your account.'}</p>
    <form action={mode === 'signin' ? signIn : signUp} className="sf-form" style={{ marginTop: '2rem' }} key={mode}>
      <input type="hidden" name="next" value={next} />
      {mode === 'signup' && <label className="sf-field"><span className="sf-label">Full name</span><input className="sf-input" name="name" required autoComplete="name" /></label>}
      <label className="sf-field"><span className="sf-label">Email</span><input className="sf-input" name="email" type="email" required autoComplete="email" defaultValue={state.email} /></label>
      <label className="sf-field"><span className="sf-label">Password</span><input className="sf-input" name="password" type="password" required minLength={mode === 'signup' ? 10 : undefined} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />{mode === 'signup' && <span className="sf-hint">At least 10 characters.</span>}</label>
      {state.message && <p role="alert" className="sf-notice sf-notice--error">{state.message}</p>}
      <div className="sf-form-actions">
        <button className="sf-pill sf-pill--primary" type="submit" disabled={signingIn || signingUp}>{mode === 'signin' ? (signingIn ? 'Signing in…' : 'Sign in') : (signingUp ? 'Creating…' : 'Create account')}</button>
      </div>
    </form>
    <p style={{ marginTop: '1.5rem' }}>
      {mode === 'signin' ? <>New here? <button type="button" className="sf-link-button" onClick={() => setMode('signup')}>Create an account</button></> : <>Have an account? <button type="button" className="sf-link-button" onClick={() => setMode('signin')}>Sign in</button></>}
    </p>
    <p className="sf-muted" style={{ marginTop: '.75rem' }}>No account? You can still <Link href="/visit">look a visit up</Link> with its request number.</p>
  </div>
}

export function AccountPage({ data, next }: { data: PatientAppointments | null; next: string }) {
  return data ? <SignedIn data={data} /> : <AuthForms next={next} />
}

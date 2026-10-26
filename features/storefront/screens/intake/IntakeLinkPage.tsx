'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { StorefrontShell } from '@/features/storefront/components/StorefrontShell'
import { loadPatientIntakeAction } from '@/features/storefront/actions/intake'
import type { PatientIntakeForm } from '@/features/storefront/lib/data/intake'
import type { HospitalBranding } from '@/features/storefront/lib/data/branding'
import { IntakePageContent } from './IntakePage'
import { INTAKE_LOAD_TIMEOUT_MS, intakeLinkFragment } from './intakeLinkState'

type IntakeViewState =
  | { kind: 'missing' | 'invalid' | 'loading' | 'failed'; intakeForm: null }
  | { kind: 'ready'; intakeForm: PatientIntakeForm }

export function IntakeLinkPage({ profile }: { profile: HospitalBranding }) {
  // Missing-link guidance is the server-rendered fallback. A browser that does
  // not hydrate can never remain on an indefinite progress message.
  const [state, setState] = useState<IntakeViewState>({ kind: 'missing', intakeForm: null })

  const privateCode = useRef<string | null>(null)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const link = privateCode.current ? { kind: 'load' as const, accessCode: privateCode.current } : intakeLinkFragment(window.location.hash)
    window.history.replaceState(null, '', '/intake')
    if (link.kind !== 'load') {
      setState({ kind: link.kind, intakeForm: null })
      return
    }

    privateCode.current = link.accessCode
    let completed = false
    setState({ kind: 'loading', intakeForm: null })
    const timeout = window.setTimeout(() => {
      completed = true
      setState({ kind: 'failed', intakeForm: null })
    }, INTAKE_LOAD_TIMEOUT_MS)

    loadPatientIntakeAction(link.accessCode).then(result => {
      if (completed) return
      completed = true
      window.clearTimeout(timeout)
      setState(result.success
        ? { kind: 'ready', intakeForm: result.data }
        : { kind: 'failed', intakeForm: null })
    }).catch(() => {
      if (completed) return
      completed = true
      window.clearTimeout(timeout)
      setState({ kind: 'failed', intakeForm: null })
    })

    return () => {
      completed = true
      window.clearTimeout(timeout)
    }
  }, [retry])

  if (state.kind === 'ready') return <IntakePageContent intakeForm={state.intakeForm} profile={profile} />

  const copy = state.kind === 'loading'
    ? {
        title: 'Opening your intake form…',
        body: 'Checking your private link.',
      }
    : state.kind === 'missing'
      ? {
          title: 'Private intake link required',
          body: 'Open the full private link sent for your appointment, or request a new one from scheduling.',
        }
      : state.kind === 'invalid'
        ? {
            title: 'Intake link is incomplete',
            body: 'This link cannot be checked. No intake information was opened.',
          }
        : {
            title: 'Intake could not be opened',
            body: 'The link may be expired, already used, or temporarily unavailable. Contact scheduling for a new link.',
          }

  const tone = state.kind === 'loading' ? 'accent' : state.kind === 'failed' ? 'bad' : 'warn'
  return (
    <StorefrontShell profile={profile}>
      <section className="sf-container sf-state">
        <div
          role={state.kind === 'loading' ? 'status' : 'alert'}
          aria-live="polite"
          aria-busy={state.kind === 'loading'}
          className="sf-receipt"
          style={{ borderTopColor: state.kind === 'failed' ? 'var(--color-dot-bad)' : state.kind === 'loading' ? 'var(--color-accent)' : 'var(--color-dot-warn)' }}
        >
          <h1 className="sf-step-title sf-titleline"><span aria-hidden="true" className={`sf-dot sf-dot--${tone}`} /><span>{copy.title}</span></h1>
          <p>{copy.body}</p>
          {state.kind !== 'loading' && (
            <div className="sf-track">
              {state.kind === 'failed' && privateCode.current && <button className="sf-pill sf-pill--raised" type="button" onClick={() => setRetry(value => value + 1)}>Retry</button>}
              {profile.supportPhoneHref && <a className="sf-pill" href={profile.supportPhoneHref}>Call {profile.supportPhone}</a>}
              <Link className="sf-pill" href="/book">Appointments</Link>
            </div>
          )}
        </div>
      </section>
    </StorefrontShell>
  )
}

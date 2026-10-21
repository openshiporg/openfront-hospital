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
        title: 'Opening your private intake form…',
        body: 'Please keep this page open while the private link is checked.',
      }
    : state.kind === 'missing'
      ? {
          title: 'Private intake link required',
          body: 'Open the complete private link sent for your appointment. If the link was copied without its private access section, request a new link from scheduling.',
        }
      : state.kind === 'invalid'
        ? {
            title: 'Intake link is incomplete',
            body: 'This link cannot be checked. No intake information was opened. Request a new private link from scheduling.',
          }
        : {
            title: 'Intake could not be opened',
            body: 'The private link may be expired, already used, or temporarily unavailable. Do not send personal information by email; contact scheduling for a new link.',
          }

  return (
    <StorefrontShell profile={profile}>
      <section className="sf-container" style={{ paddingBlock: 'var(--space-2xl)' }}>
        <div
          role={state.kind === 'loading' ? 'status' : 'alert'}
          aria-live="polite"
          aria-busy={state.kind === 'loading'}
          className={`sf-notice ${state.kind === 'loading' ? '' : 'sf-notice--info'}`}
        >
          <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 600 }}>{copy.title}</h1>
          <p style={{ marginTop: 'var(--space-xs)', lineHeight: 1.6 }}>{copy.body}</p>
          {state.kind === 'failed' && privateCode.current && <button className="sf-btn sf-btn--secondary" type="button" onClick={() => setRetry(value => value + 1)}>Retry opening this link</button>}
          {state.kind !== 'loading' && (
            <p style={{ marginTop: 'var(--space-sm)', lineHeight: 1.6 }}>
              {profile.supportPhoneHref && <><a href={profile.supportPhoneHref}>Call scheduling at {profile.supportPhone}</a>. </>}
              <Link href="/book">Return to appointment requests</Link>.
            </p>
          )}
        </div>
      </section>
    </StorefrontShell>
  )
}

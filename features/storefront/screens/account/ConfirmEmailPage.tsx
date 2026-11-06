'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { confirmEmailAction } from '../../actions/account'

// The confirmation link carries its token in the URL fragment, so it never reaches server logs or referrers.
export function ConfirmEmailPage() {
  const [state, setState] = useState<'working' | 'ok' | 'bad'>('working')
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token')
    window.history.replaceState(null, '', '/account/confirm')
    ;(token ? confirmEmailAction(token) : Promise.resolve(false)).then(ok => setState(ok ? 'ok' : 'bad')).catch(() => setState('bad'))
  }, [])
  return <div className="sf-container" style={{ paddingBlock: '4rem', maxWidth: '34rem' }}>
    <h1 className="sf-display sf-display--page">{state === 'ok' ? 'Email confirmed' : state === 'bad' ? 'This link has expired' : 'Confirming…'}</h1>
    <p role="status" style={{ marginTop: '.75rem' }}>{state === 'ok' ? 'Your visits now appear in your account.' : state === 'bad' ? 'Sign in and send yourself a new confirmation link.' : 'One moment.'}</p>
    {state !== 'working' && <div className="sf-form-actions" style={{ marginTop: '2rem' }}><Link className="sf-pill sf-pill--primary" href="/account">Go to your account</Link></div>}
  </div>
}

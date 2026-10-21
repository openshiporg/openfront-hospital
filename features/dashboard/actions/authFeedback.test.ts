import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

import {
  AUTHENTICATION_UNAVAILABLE_MESSAGE,
  INVALID_AUTHENTICATION_MESSAGE,
  PASSWORD_RECOVERY_UNAVAILABLE_MESSAGE,
  authenticationFailureMessage,
  authenticationResponseKind,
} from './authFeedback'

test('authentication feedback separates rejected credentials from a service failure without account disclosure', () => {
  assert.equal(authenticationFailureMessage('credentials'), INVALID_AUTHENTICATION_MESSAGE)
  assert.equal(authenticationFailureMessage('service'), AUTHENTICATION_UNAVAILABLE_MESSAGE)
  assert.match(INVALID_AUTHENTICATION_MESSAGE, /^Authentication failed$/)
  assert.doesNotMatch(PASSWORD_RECOVERY_UNAVAILABLE_MESSAGE, /account (?:exists|does not exist)/i)
})

test('authentication response classification fails closed unless Keystone returns an explicit session token', () => {
  assert.equal(authenticationResponseKind({ success: false, error: 'network' }), 'service')
  assert.equal(authenticationResponseKind({ success: true, data: { authenticate: { message: 'wrong password' } } }), 'credentials')
  assert.equal(authenticationResponseKind({ success: true, data: { authenticate: null } }), 'service')
  assert.equal(authenticationResponseKind({ success: true, data: { authenticate: {} } }), 'service')
  assert.equal(authenticationResponseKind({ success: true, data: { authenticate: { sessionToken: 'synthetic-session' } } }), 'authenticated')
})

test('sign-in source exposes deterministic pending and alert states without rendering Keystone errors', async () => {
  const [action, form] = await Promise.all([
    readFile('features/dashboard/actions/auth.ts', 'utf8'),
    readFile('features/dashboard/screens/SignInPage/SignInForm.tsx', 'utf8'),
  ])
  assert.match(action, /authenticationResponseKind\(response\)/)
  assert.match(action, /catch \{[\s\S]*authenticationFailureMessage\('service'\)/)
  assert.match(form, /Signing in…/)
  assert.match(form, /role="alert" aria-live="assertive"/)
})

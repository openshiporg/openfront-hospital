import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

import { passwordResetLinkState } from './resetLinkState'

test('password recovery renders request mode without waiting for client initialization', () => {
  assert.deepEqual(passwordResetLinkState(''), { mode: 'request', token: null })
  assert.deepEqual(passwordResetLinkState('#'), { mode: 'request', token: null })
})

test('password recovery accepts only the bounded fragment token format', () => {
  const token = `reset_${'a'.repeat(43)}`
  assert.deepEqual(passwordResetLinkState(`#token=${token}`), { mode: 'reset', token })
  for (const fragment of ['#token=short', '#token=reset_<script>', '#other=value', '#token=']) {
    assert.deepEqual(passwordResetLinkState(fragment), { mode: 'invalid', token: null })
  }
})

test('password recovery source renders a usable request form before fragment enhancement', async () => {
  const source = await readFile('features/dashboard/screens/ResetPage/ResetForm.tsx', 'utf8')
  assert.match(source, /useState<PasswordResetLinkState>\(\{ mode: 'request'/)
  assert.doesNotMatch(source, /Preparing password recovery/)
  assert.match(source, /invalid or incomplete/)
  assert.match(source, /aria-label=\{showPassword/)
  assert.match(source, /catch \{[\s\S]*PASSWORD_RECOVERY_UNAVAILABLE_MESSAGE/)
  assert.match(source, /Requesting reset link…/)
})

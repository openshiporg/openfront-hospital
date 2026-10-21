import assert from 'node:assert/strict'
import test from 'node:test'

import { safeDashboardPath } from './safeDashboardPath'

test('accepts only local dashboard return paths', () => {
  assert.equal(safeDashboardPath('/dashboard'), '/dashboard')
  assert.equal(safeDashboardPath('/dashboard/platform/patients?tab=active#ignored'), '/dashboard/platform/patients?tab=active')

  for (const unsafe of [
    'https://example.test/steal',
    '//example.test/steal',
    '/\\example.test/steal',
    '/dashboard.evil/steal',
    '/book',
    'javascript:alert(1)',
    '/dashboard\n/steal',
  ]) {
    assert.equal(safeDashboardPath(unsafe), '/dashboard')
  }
})

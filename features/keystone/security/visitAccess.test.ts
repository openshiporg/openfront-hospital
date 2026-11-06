import assert from 'node:assert/strict'
import test from 'node:test'

import { createVisitAccessToken, verifyVisitAccessToken } from './visitAccess'

const key = 'k'.repeat(48)

test('a visit link opens only the visit it was issued for', () => {
  const token = createVisitAccessToken('cmabc12345', key)
  assert.equal(verifyVisitAccessToken(token, key), 'cmabc12345')
  assert.equal(verifyVisitAccessToken(token, 'x'.repeat(48)), null)
  const [prefix, rest] = [token.slice(0, 9), token.slice(9)]
  const forged = `${prefix}${Buffer.from('cmother9999').toString('base64url')}.${rest.split('.')[1]}`
  assert.equal(verifyVisitAccessToken(forged, key), null)
  assert.equal(verifyVisitAccessToken('visit_v1_garbage', key), null)
  assert.equal(verifyVisitAccessToken(undefined, key), null)
})

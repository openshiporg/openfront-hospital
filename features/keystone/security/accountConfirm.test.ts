import assert from 'node:assert/strict'
import test from 'node:test'

import { createAccountConfirmToken, createVisitAccessToken, verifyAccountConfirmToken } from './visitAccess'

const KEY = 'k'.repeat(40)

test('an account confirmation link proves the account and the exact email it was sent to', () => {
  const token = createAccountConfirmToken('user_123456', 'Pat@Example.com', 60_000, KEY)
  assert.deepEqual(verifyAccountConfirmToken(token, KEY), { userId: 'user_123456', email: 'pat@example.com' })
})

test('expired, forged, re-keyed or visit tokens never confirm an account', () => {
  assert.equal(verifyAccountConfirmToken(createAccountConfirmToken('user_123456', 'a@b.co', -1, KEY), KEY), null)
  const token = createAccountConfirmToken('user_123456', 'a@b.co', 60_000, KEY)
  assert.equal(verifyAccountConfirmToken(token, 'z'.repeat(40)), null)
  assert.equal(verifyAccountConfirmToken(token.slice(0, -2) + 'xx', KEY), null)
  assert.equal(verifyAccountConfirmToken(createVisitAccessToken('appt_123456', KEY), KEY), null)
})

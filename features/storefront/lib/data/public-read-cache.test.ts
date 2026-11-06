import assert from 'node:assert/strict'
import test from 'node:test'

import { cachedPublicRead, clearPublicReadCache } from './public-read-cache'

test('public reads are shared within the window and reloaded after it', async () => {
  clearPublicReadCache()
  let clock = 1_000
  let calls = 0
  const load = async () => ++calls
  assert.equal(await cachedPublicRead('k', load, 100, () => clock), 1)
  assert.equal(await cachedPublicRead('k', load, 100, () => clock), 1)
  clock += 101
  assert.equal(await cachedPublicRead('k', load, 100, () => clock), 2)
})

test('failed public reads are not cached', async () => {
  clearPublicReadCache()
  let calls = 0
  const load = async () => { calls++; if (calls === 1) throw new Error('down'); return 'ok' }
  await assert.rejects(cachedPublicRead('f', load))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(await cachedPublicRead('f', load), 'ok')
  assert.equal(calls, 2)
})

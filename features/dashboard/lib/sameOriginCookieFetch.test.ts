import assert from 'node:assert/strict'
import test from 'node:test'

import { createSameOriginCookieFetch } from './sameOriginCookieFetch'

type SeenRequest = { url: string; cookie: string | null }

function recordingFetch(seen: SeenRequest[], delayMs = 0) {
  return async (input: string | URL, init?: RequestInit) => {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs))
    seen.push({
      url: String(input),
      cookie: new Headers(init?.headers).get('cookie'),
    })
    return new Response(null, { status: 204 })
  }
}

test('attaches the request cookie only to the configured exact origin', async () => {
  const seen: SeenRequest[] = []
  const scopedFetch = createSameOriginCookieFetch({
    endpoint: new URL('https://hospital.local/api/mcp-transport/http'),
    cookie: 'keystonejs-session=session-a',
    fetchImpl: recordingFetch(seen),
  })

  await scopedFetch('https://hospital.local/api/mcp-transport/http', {
    headers: { 'x-test': 'same-origin' },
  })
  await scopedFetch('https://hospital.local/another-path')
  await scopedFetch('https://hospital.local.evil.test/collect', {
    headers: { cookie: 'caller-supplied-cookie' },
  })
  await scopedFetch('http://hospital.local/collect')
  await scopedFetch('https://hospital.local:444/collect')

  assert.deepEqual(seen.map((request) => request.cookie), [
    'keystonejs-session=session-a',
    'keystonejs-session=session-a',
    null,
    null,
    null,
  ])
})

test('keeps concurrent request cookies instance-scoped without replacing global fetch', async () => {
  const originalGlobalFetch = globalThis.fetch
  const seen: SeenRequest[] = []
  const fetchImpl = recordingFetch(seen, 5)
  const endpoint = new URL('https://hospital.local/api/mcp-transport/http')
  const requestA = createSameOriginCookieFetch({
    endpoint,
    cookie: 'keystonejs-session=session-a',
    fetchImpl,
  })
  const requestB = createSameOriginCookieFetch({
    endpoint,
    cookie: 'keystonejs-session=session-b',
    fetchImpl,
  })

  await Promise.all([
    requestA(new URL('https://hospital.local/api/mcp-transport/http?request=a')),
    requestB(new URL('https://hospital.local/api/mcp-transport/http?request=b')),
  ])

  assert.equal(globalThis.fetch, originalGlobalFetch)
  assert.deepEqual(
    seen.map((request) => request.cookie).sort(),
    ['keystonejs-session=session-a', 'keystonejs-session=session-b'],
  )
})

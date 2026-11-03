import assert from 'node:assert/strict'
import test from 'node:test'

import { requestIdentity } from '../security/graphqlSecurity'
import { signInternalClientIdentity } from '../security/internalIdentity'
import {
  clientSourceFromHeaders,
  createInternalGraphqlFetch,
  internalGraphqlEndpoint,
  internalIdentityHeaders,
  loopbackOrigin,
} from './internal-origin'

const SECRET = 'a'.repeat(40)

test('loopback origin comes from the process PORT only', () => {
  assert.equal(loopbackOrigin('4321'), 'http://127.0.0.1:4321')
  assert.equal(internalGraphqlEndpoint('4321'), 'http://127.0.0.1:4321/api/graphql')
  assert.equal(loopbackOrigin(undefined), null)
  assert.equal(loopbackOrigin('abc'), null)
  assert.equal(loopbackOrigin('70000'), null)
})

test('source is the end user real IP, never a shared constant', () => {
  const h = (o: Record<string, string>) => ({ get: (n: string) => o[n] ?? null })
  assert.equal(clientSourceFromHeaders(h({ 'x-real-ip': '203.0.113.7' })), '203.0.113.7')
  assert.equal(clientSourceFromHeaders(h({ 'x-forwarded-for': '198.51.100.2, 10.0.0.1' })), '198.51.100.2')
  assert.equal(clientSourceFromHeaders(h({})), null)
  assert.equal(clientSourceFromHeaders(null), null)
})

test('signed headers are produced for a source and secret, and distinct per visitor', () => {
  const a = internalIdentityHeaders('203.0.113.7', SECRET)
  const b = internalIdentityHeaders('203.0.113.8', SECRET)
  assert.deepEqual(Object.keys(a).sort(), ['x-openfront-client-identity', 'x-openfront-client-signature', 'x-openfront-client-timestamp'])
  assert.notEqual(a['x-openfront-client-identity'], b['x-openfront-client-identity'])
})

test('short secret, missing secret or missing source sends unsigned and never throws', () => {
  assert.deepEqual(internalIdentityHeaders('203.0.113.7', 'short'), {})
  assert.deepEqual(internalIdentityHeaders('203.0.113.7', ''), {})
  assert.deepEqual(internalIdentityHeaders(null, SECRET), {})
})

test('verifier accepts a fresh loopback signature as the forwarded identity', () => {
  const now = Date.now()
  const signed = signInternalClientIdentity('203.0.113.7', SECRET, now)!
  const headers = {
    'x-openfront-client-identity': signed.identity,
    'x-openfront-client-timestamp': signed.timestamp,
    'x-openfront-client-signature': signed.signature,
  }
  assert.equal(requestIdentity(headers, '127.0.0.1', SECRET, now), `forwarded:${signed.identity}`)
  assert.equal(requestIdentity(headers, '::ffff:127.0.0.1', SECRET, now), `forwarded:${signed.identity}`)
})

test('verifier ignores non-loopback sockets, stale timestamps and bad signatures', () => {
  const now = Date.now()
  const signed = signInternalClientIdentity('203.0.113.7', SECRET, now)!
  const headers = {
    'x-openfront-client-identity': signed.identity,
    'x-openfront-client-timestamp': signed.timestamp,
    'x-openfront-client-signature': signed.signature,
  }
  const ignored = (h: typeof headers, socket: string, at = now) => !requestIdentity(h, socket, SECRET, at).startsWith('forwarded:')
  assert.ok(ignored(headers, '203.0.113.99'))
  assert.ok(ignored(headers, '127.0.0.1', now + 120_000))
  assert.ok(ignored({ ...headers, 'x-openfront-client-signature': 'b'.repeat(64) }, '127.0.0.1'))
  assert.ok(ignored({ ...headers, 'x-openfront-client-identity': 'c'.repeat(64) }, '127.0.0.1'))
  assert.ok(!requestIdentity(headers, '127.0.0.1', 'z'.repeat(40), now).startsWith('forwarded:'))
})

test('internal fetch signs each server request and refuses other targets', async () => {
  const original = globalThis.fetch
  const prev = process.env.SESSION_SECRET
  process.env.SESSION_SECRET = SECRET
  let seen: Headers | undefined
  globalThis.fetch = (async (_url: any, init: any) => {
    seen = new Headers(init.headers)
    return new Response('{}')
  }) as typeof fetch
  try {
    const f = createInternalGraphqlFetch('203.0.113.7', 'http://127.0.0.1:4321/api/graphql')
    await f('http://127.0.0.1:4321/api/graphql', { method: 'POST', headers: { cookie: 'keystonejs-session=x' } })
    assert.equal(seen?.get('cookie'), 'keystonejs-session=x')
    assert.match(seen?.get('x-openfront-client-identity') || '', /^[a-f0-9]{64}$/)
    await assert.rejects(() => f('https://evil.example/api/graphql', {}), /loopback GraphQL endpoint/)
    await assert.rejects(() => f('http://127.0.0.1:4321/other', {}), /loopback GraphQL endpoint/)
    process.env.SESSION_SECRET = 'short'
    await f('http://127.0.0.1:4321/api/graphql', {})
    assert.equal(seen?.get('x-openfront-client-identity'), null)
  } finally {
    globalThis.fetch = original
    if (prev === undefined) delete process.env.SESSION_SECRET
    else process.env.SESSION_SECRET = prev
  }
})

test('browser never signs: the dashboard target falls back to the public endpoint when window exists', async () => {
  ;(globalThis as any).window = { location: { origin: 'https://hospital.example' } }
  try {
    const { getServerGraphQLTarget } = await import('../../dashboard/lib/getBaseUrl')
    const target = await getServerGraphQLTarget()
    assert.equal(target.endpoint, 'https://hospital.example/api/graphql')
    assert.equal(target.fetch, undefined)
  } finally {
    delete (globalThis as any).window
  }
})

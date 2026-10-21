import assert from 'node:assert/strict'
import test from 'node:test'

import * as baseUrl from './getBaseUrl'

type ServerBaseUrlResolver = (env: Record<string, string | undefined>) => string

function isServerBaseUrlResolver(value: unknown): value is ServerBaseUrlResolver {
  return typeof value === 'function'
}

// The restored family core (E-commerce's getBaseUrl) derives the server GraphQL origin from
// request Host headers and no longer exports resolveServerBaseUrl. That is an open family
// item (shared-core request-selected Host forwarding, Construction D-003), fixed upstream in
// E-commerce first. Until then this test stays red at runtime instead of hiding as a type error.
function resolveServerBaseUrl(env: Record<string, string | undefined>) {
  const resolver: unknown = Object.getOwnPropertyDescriptor(baseUrl, 'resolveServerBaseUrl')?.value
  if (!isServerBaseUrlResolver(resolver)) assert.fail('core getBaseUrl must export a process-owned resolveServerBaseUrl (family D-003, pending upstream)')
  return resolver(env)
}

test('server GraphQL origin is process-owned and never derived from request headers', () => {
  assert.equal(resolveServerBaseUrl({ NODE_ENV: 'production', PORT: '4321' }), 'http://127.0.0.1:4321')
  assert.equal(resolveServerBaseUrl({ NODE_ENV: 'production', OPENFRONT_INTERNAL_URL: 'https://internal.example.test/path' }), 'https://internal.example.test')
  assert.equal(resolveServerBaseUrl({ NODE_ENV: 'production', RAILWAY_PUBLIC_DOMAIN: 'hospital.example.test' }), 'https://hospital.example.test')
  assert.equal(resolveServerBaseUrl({ NODE_ENV: 'development' }), 'http://127.0.0.1:3000')

  assert.throws(() => resolveServerBaseUrl({ NODE_ENV: 'production' }), /Production requires/)
  assert.throws(() => resolveServerBaseUrl({ NODE_ENV: 'production', OPENFRONT_INTERNAL_URL: 'https://user:secret@example.test' }), /credential-free/)
  assert.throws(() => resolveServerBaseUrl({ NODE_ENV: 'production', RAILWAY_PUBLIC_DOMAIN: 'evil.test/path' }), /invalid/)
})

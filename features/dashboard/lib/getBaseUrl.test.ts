import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveServerBaseUrl } from './getBaseUrl'

test('server GraphQL origin is process-owned and never derived from request headers', () => {
  assert.equal(resolveServerBaseUrl({ NODE_ENV: 'production', PORT: '4321' }), 'http://127.0.0.1:4321')
  assert.equal(resolveServerBaseUrl({ NODE_ENV: 'production', OPENFRONT_INTERNAL_URL: 'https://internal.example.test/path' }), 'https://internal.example.test')
  assert.equal(resolveServerBaseUrl({ NODE_ENV: 'production', RAILWAY_PUBLIC_DOMAIN: 'hospital.example.test' }), 'https://hospital.example.test')
  assert.equal(resolveServerBaseUrl({ NODE_ENV: 'development' }), 'http://127.0.0.1:3000')

  assert.throws(() => resolveServerBaseUrl({ NODE_ENV: 'production' }), /Production requires/)
  assert.throws(() => resolveServerBaseUrl({ NODE_ENV: 'production', OPENFRONT_INTERNAL_URL: 'https://user:secret@example.test' }), /credential-free/)
  assert.throws(() => resolveServerBaseUrl({ NODE_ENV: 'production', RAILWAY_PUBLIC_DOMAIN: 'evil.test/path' }), /invalid/)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { NextRequest } from 'next/server'
import { readFile } from 'node:fs/promises'

import { handleDashboardRoutes } from './middleware'
import redirectToInit from '@/features/keystone/mutations/redirectToInit'

const request = (path: string) => new NextRequest(`https://hospital.local${path}`)
const initContext = (users: number) => ({ sudo: () => ({ prisma: { user: { count: async () => users } } }) }) as any

test('initialization opens only while the deployment has no users', async () => {
  assert.equal(await redirectToInit(null, null, initContext(0)), true)
  assert.equal(await redirectToInit(null, null, initContext(1)), false)
})

test('owner-approved empty install reaches normal private initialization without an operator session', async () => {
  const redirected = await handleDashboardRoutes(request('/dashboard'), null, true)
  assert.equal(redirected?.status, 307)
  assert.equal(redirected?.headers.get('location'), 'https://hospital.local/dashboard/init')

  const init = await handleDashboardRoutes(request('/dashboard/init'), null, true)
  assert.equal(init?.status, 200)
  assert.equal(init?.headers.get('x-middleware-next'), '1')
})

test('initialized installs never reopen bootstrap and retain visible sign-in/recovery entry routes', async () => {
  const init = await handleDashboardRoutes(request('/dashboard/init'), null, false)
  assert.equal(init?.status, 307)
  assert.equal(init?.headers.get('location'), 'https://hospital.local/dashboard')

  for (const path of ['/dashboard/signin', '/dashboard/reset']) {
    const response = await handleDashboardRoutes(request(path), null, false)
    assert.equal(response?.status, 200)
    assert.equal(response?.headers.get('x-middleware-next'), '1')
  }
})

test('an owner-restored operator reaches the dashboard only with dashboard authority', async () => {
  const authorized = await handleDashboardRoutes(
    request('/dashboard'),
    { id: 'synthetic-operator', role: { canAccessDashboard: true } },
    false,
  )
  assert.equal(authorized?.status, 200)
  assert.equal(authorized?.headers.get('x-middleware-next'), '1')

  const denied = await handleDashboardRoutes(
    request('/dashboard/platform/appointments'),
    { id: 'synthetic-limited', role: { canAccessDashboard: false } },
    false,
  )
  assert.equal(denied?.status, 307)
  assert.equal(denied?.headers.get('location'), 'https://hospital.local/dashboard/no-access')
})

test('initialization uses the shared init page and Keystone initFirstItem, as in E-commerce', async () => {
  const route = await readFile('app/dashboard/init/page.tsx', 'utf8')
  const keystone = await readFile('features/keystone/index.ts', 'utf8')
  assert.match(route, /InitPage/)
  assert.match(keystone, /initFirstItem/)
})

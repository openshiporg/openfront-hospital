import { createHash } from 'node:crypto'
import type { Context } from '.keystone/types'

import { consumeSharedRateLimit, requestIdentity } from './graphqlSecurity'

export async function enforcePublicIntakeRateLimit(
  context: Context,
  accessCode: string,
  operation: 'lookup' | 'submit',
) {
  const production = process.env.NODE_ENV === 'production'
  const request = (context as any).req
  const networkIdentity = requestIdentity(request?.headers || {}, request?.socket?.remoteAddress)
  const capabilityIdentity = createHash('sha256').update(String(accessCode || '')).digest('hex')
  const now = new Date()
  const prisma = context.sudo().prisma
  const globalAllowed = await consumeSharedRateLimit(
    prisma,
    `public-intake-${operation}-global`,
    'all-capabilities',
    production ? (operation === 'submit' ? 200 : 600) : 2_000,
    now,
    60,
  )
  if (!globalAllowed) throw new Error('Intake access is invalid or no longer active')
  const networkAllowed = await consumeSharedRateLimit(
    prisma,
    `public-intake-${operation}-network`,
    networkIdentity,
    production ? (operation === 'submit' ? 20 : 60) : 500,
    now,
    60,
  )
  if (!networkAllowed) throw new Error('Intake access is invalid or no longer active')
  const capabilityAllowed = await consumeSharedRateLimit(
    prisma,
    `public-intake-${operation}-capability`,
    capabilityIdentity,
    production ? (operation === 'submit' ? 5 : 15) : 100,
    now,
    15 * 60,
  )
  if (!capabilityAllowed) throw new Error('Intake access is invalid or no longer active')
}

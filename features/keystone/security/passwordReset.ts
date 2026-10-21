import { createHash, createHmac, randomBytes } from 'node:crypto'
import { Prisma } from '@prisma/client'

import { keystoneContext } from '../context'
import { sendPasswordResetEmail } from '../lib/mail'
import { consumeSharedRateLimit } from './graphqlSecurity'

const RESET_TTL_MS = 30 * 60_000
const RESEND_COOLDOWN_MS = 5 * 60_000
const MAX_PENDING_TOKENS = 3

function pepper() {
  const value = String(process.env.PASSWORD_RESET_PEPPER || '')
  if (value.length < 48) throw new Error('Password reset pepper is not configured')
  return value
}

function normalizeEmail(value: unknown) {
  const email = String(value || '').trim().toLowerCase()
  return /^\S+@\S+\.\S+$/.test(email) && email.length <= 254 ? email : ''
}

function accountDigest(email: string) {
  return createHmac('sha256', pepper()).update(`password-reset-account:${email}`).digest('hex')
}

function tokenDigest(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function requestPasswordReset(emailInput: unknown, networkIdentity: string) {
  const email = normalizeEmail(emailInput)
  const normalizedForBucket = email || 'invalid-account'
  const digest = accountDigest(normalizedForBucket)
  const now = new Date()
  const prisma = keystoneContext.prisma as any

  const [networkAllowed, accountAllowed] = await Promise.all([
    consumeSharedRateLimit(prisma, 'password-reset-network', networkIdentity, 20, now, 3_600),
    consumeSharedRateLimit(prisma, 'password-reset-account', digest, 3, now, 3_600),
  ])
  if (!networkAllowed || !accountAllowed || !email) return

  const prepared = await keystoneContext.transaction(async (transactionContext: any) => {
    const tx = transactionContext.sudo().prisma
    // Keystone 6.5 declares `isolationLevel` as the enum object while Prisma expects the
    // string, so set it as the transaction's first statement (as in labResultRecovery.ts).
    await tx.$executeRaw(Prisma.sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`)
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`password-reset-account:${digest}`}, 0))::text AS "lock"`)
    await tx.passwordResetRequest.updateMany({
      where: { accountDigest: digest, status: 'pending', expiresAt: { lte: now } },
      data: { status: 'expired' },
    })
    const recent = await tx.passwordResetRequest.findFirst({
      where: {
        accountDigest: digest,
        status: 'pending',
        mailSentAt: { gt: new Date(now.getTime() - RESEND_COOLDOWN_MS) },
      },
      select: { id: true },
    })
    if (recent) return null

    const user = await tx.user.findUnique({ where: { email }, select: { id: true, email: true } })
    if (!user) return null
    const pending = await tx.passwordResetRequest.count({
      where: { userId: user.id, status: 'pending', expiresAt: { gt: now } },
    })
    if (pending >= MAX_PENDING_TOKENS) return null

    const token = `reset_${randomBytes(32).toString('base64url')}`
    const request = await tx.passwordResetRequest.create({
      data: {
        tokenDigest: tokenDigest(token),
        accountDigest: digest,
        status: 'pending',
        userId: user.id,
        expiresAt: new Date(now.getTime() + RESET_TTL_MS),
        createdAt: now,
      },
    })
    return { id: request.id, token, email: user.email }
  }, { timeout: 30_000 })

  if (!prepared) return
  const globalMailAllowed = await consumeSharedRateLimit(
    prisma,
    'password-reset-mail-global',
    'all-accounts',
    500,
    now,
    3_600,
  )
  if (!globalMailAllowed) {
    await prisma.passwordResetRequest.updateMany({
      where: { id: prepared.id, status: 'pending' },
      data: { status: 'delivery_failed', deliveryFailedAt: new Date() },
    })
    return
  }

  try {
    await sendPasswordResetEmail(prepared.token, prepared.email)
    await prisma.passwordResetRequest.updateMany({
      where: { id: prepared.id, status: 'pending' },
      data: { mailSentAt: new Date() },
    })
  } catch {
    await prisma.passwordResetRequest.updateMany({
      where: { id: prepared.id, status: 'pending' },
      data: { status: 'delivery_failed', deliveryFailedAt: new Date() },
    })
  }
}

export async function redeemPasswordReset(input: { email: unknown; token: unknown; password: unknown }, networkIdentity: string) {
  const email = normalizeEmail(input.email)
  const token = String(input.token || '').trim()
  const password = String(input.password || '')
  if (!email || !/^reset_[A-Za-z0-9_-]{43}$/.test(token) || password.length < 16 || password.length > 200) return false
  const digest = tokenDigest(token)
  const expectedAccountDigest = accountDigest(email)
  const now = new Date()
  const prisma = keystoneContext.prisma as any
  const [globalAllowed, networkAllowed, tokenAllowed] = await Promise.all([
    consumeSharedRateLimit(prisma, 'password-reset-redeem-global', 'all-clients', 2_000, now, 60),
    consumeSharedRateLimit(prisma, 'password-reset-redeem-network', networkIdentity, 30, now, 3_600),
    consumeSharedRateLimit(prisma, 'password-reset-redeem-token', digest, 5, now, 3_600),
  ])
  if (!globalAllowed || !networkAllowed || !tokenAllowed) return false

  try {
    return await keystoneContext.transaction(async (transactionContext: any) => {
      const tx = transactionContext.sudo().prisma
      // Keystone 6.5 declares `isolationLevel` as the enum object while Prisma expects the
      // string, so set it as the transaction's first statement (as in labResultRecovery.ts).
      await tx.$executeRaw(Prisma.sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`)
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`password-reset-token:${digest}`}, 0))::text AS "lock"`)
      const initial = await tx.passwordResetRequest.findUnique({
        where: { tokenDigest: digest },
        include: { user: { select: { id: true, email: true } } },
      })
      if (
        !initial || initial.status !== 'pending' || initial.expiresAt <= now ||
        initial.accountDigest !== expectedAccountDigest || initial.user.email.toLowerCase() !== email
      ) return false

      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`password-reset-user:${initial.userId}`}, 0))::text AS "lock"`)
      const current = await tx.passwordResetRequest.findUnique({ where: { id: initial.id } })
      if (!current || current.status !== 'pending' || current.expiresAt <= now) return false

      await transactionContext.sudo().db.User.updateOne({
        where: { id: initial.userId },
        data: { password },
      })
      await tx.passwordResetRequest.update({
        where: { id: current.id },
        data: { status: 'redeemed', redeemedAt: now },
      })
      await tx.passwordResetRequest.updateMany({
        where: { userId: initial.userId, status: 'pending', id: { not: current.id } },
        data: { status: 'superseded', supersededAt: now },
      })
      return true
    }, { timeout: 30_000 })
  } catch {
    return false
  }
}

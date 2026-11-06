import { createHmac } from 'node:crypto'
import type { Context } from '.keystone/types'

import { consumeSharedRateLimit, requestIdentity } from '../../security/graphqlSecurity'
import { createAccountConfirmToken, createVisitAccessToken, verifyAccountConfirmToken } from '../../security/visitAccess'
import { providerDisplayName } from '../intake/getIntakeFormByAccessCode'

// Patient accounts, the way patient portals do it (MyChart, Zocdoc, One Medical): sign up with email and password,
// confirm the email, then see your visits in one place. An account carries no staff role, so the dashboard stays
// closed to it. Visits are matched by the email they were requested with, and only after the account has proved it
// owns that mailbox (the same proof the visit emails rely on). Each visit view hands back the signed manage-visit
// token the email link uses, so cancelling goes through the one audited path.

const ACTIVE = new Set(['requested', 'confirmed'])
const EMAIL = /^\S+@\S+\.\S+$/

type RegisterArgs = { name: string; email: string; password: string }

function peppered(kind: string, value: string) {
  const secret = String(process.env.AUTH_RATE_LIMIT_PEPPER || process.env.SESSION_SECRET || '')
  if (secret.length < 32) throw new Error('Account sign-up is not configured')
  return createHmac('sha256', secret).update(`${kind}:${value}`).digest('hex')
}

export async function registerPatientAccount(_root: unknown, args: RegisterArgs, context: Context) {
  const name = String(args.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 120)
  const email = String(args.email ?? '').trim().toLowerCase()
  const password = String(args.password ?? '')
  if (!name) throw new Error('Enter your name')
  if (!EMAIL.test(email) || email.length > 254) throw new Error('Enter a valid email address')
  if (password.length < 10 || password.length > 200) throw new Error('Use a password of at least 10 characters')

  const prisma = context.sudo().prisma as any
  const production = process.env.NODE_ENV === 'production'
  const request = (context as any).req
  const now = new Date()
  const network = requestIdentity(request?.headers || {}, request?.socket?.remoteAddress)
  const limited = () => { throw new Error('Too many sign-up attempts. Try again later.') }
  if (!await consumeSharedRateLimit(prisma, 'patient-signup-network', network, production ? 5 : 100, now, 60 * 60)) limited()
  if (!await consumeSharedRateLimit(prisma, 'patient-signup-email', peppered('patient-signup-email', email), production ? 3 : 100, now, 60 * 60)) limited()

  // Same answer whether or not the email exists, so sign-up can't be used to discover who has an account.
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (existing) return { ok: true }
  // Created through Keystone (not raw Prisma) so the password is hashed and the User hooks run.
  const user = await context.sudo().db.User.createOne({ data: { name, email, password } })
  await sendConfirmation(prisma, { id: String(user.id), email, name })
  return { ok: true }
}

async function sendConfirmation(prisma: any, user: { id: string; email: string; name: string }) {
  try {
    const { sendAccountConfirmEmail } = await import('../../lib/mail')
    const profile = await prisma.hospitalProfile.findFirst({ where: { profileKey: 'primary', status: 'active' }, select: { name: true } })
    const result = await sendAccountConfirmEmail(user.email, { name: user.name, facilityName: profile?.name || 'Your care team', token: createAccountConfirmToken(user.id, user.email) })
    if (!result.sent) console.error(JSON.stringify({ component: 'patient-account', status: 'confirm_email_failed', error: result.error }))
  } catch (error) {
    console.error(JSON.stringify({ component: 'patient-account', status: 'confirm_email_failed', error: error instanceof Error ? error.message : String(error) }))
  }
}

/** Marks the account's email confirmed when the link is genuine, unexpired and still for the account's current email. */
export async function confirmPatientAccountEmail(_root: unknown, args: { token: string }, context: Context) {
  const claim = verifyAccountConfirmToken(args.token)
  if (!claim) return { ok: false }
  const prisma = context.sudo().prisma as any
  const user = await prisma.user.findUnique({ where: { id: claim.userId }, select: { id: true, email: true, emailVerifiedAt: true } })
  if (!user || user.email.toLowerCase() !== claim.email) return { ok: false }
  if (!user.emailVerifiedAt) await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } })
  return { ok: true }
}

/** Sends a fresh confirmation link to the signed-in, unconfirmed account. */
export async function resendPatientAccountConfirmation(_root: unknown, _args: unknown, context: Context) {
  const user = await signedInPatient(context)
  if (user.emailVerifiedAt) return { ok: true }
  const prisma = context.sudo().prisma as any
  if (!await consumeSharedRateLimit(prisma, 'patient-confirm-resend', user.id, process.env.NODE_ENV === 'production' ? 3 : 100, new Date(), 60 * 60)) throw new Error('Too many emails sent. Try again later.')
  await sendConfirmation(prisma, user)
  return { ok: true }
}

async function signedInPatient(context: Context) {
  const session = (context as any).session
  if (!session?.itemId) throw new Error('Sign in to see your visits')
  const user = await (context.sudo().prisma as any).user.findUnique({ where: { id: session.itemId }, select: { id: true, email: true, name: true, emailVerifiedAt: true } })
  if (!user?.email) throw new Error('Sign in to see your visits')
  return user as { id: string; email: string; name: string; emailVerifiedAt: Date | null }
}

function serialize(appointment: any) {
  return {
    appointmentNumber: appointment.appointmentNumber,
    status: appointment.status,
    startsAt: appointment.startsAt,
    endsAt: appointment.endsAt,
    facilityName: appointment.facility?.name || appointment.locationName || '',
    facilityTimeZone: appointment.facility?.timeZone || 'UTC',
    facilityPhone: appointment.facility?.phone || '',
    facilityAddress: [appointment.facility?.addressLine1, appointment.facility?.city].filter(Boolean).join(', '),
    providerName: providerDisplayName(appointment.provider) || '',
    visitTypeName: appointment.appointmentType?.name || '',
    canCancel: ACTIVE.has(appointment.status) && new Date(appointment.startsAt).getTime() > Date.now(),
    accessToken: createVisitAccessToken(appointment.id),
  }
}

/** The signed-in patient's visits: upcoming first (soonest at the top), then past ones (latest first). */
export async function myPatientAppointments(_root: unknown, _args: unknown, context: Context) {
  const user = await signedInPatient(context)
  if (!user.emailVerifiedAt) return { name: user.name, email: user.email, emailConfirmed: false, upcoming: [], past: [] }
  const prisma = context.sudo().prisma as any
  const appointments = await prisma.appointment.findMany({
    where: { OR: [{ patient: { userId: user.id } }, { patient: { email: { equals: user.email, mode: 'insensitive' } } }] },
    include: { provider: true, appointmentType: true, facility: { select: { name: true, timeZone: true, phone: true, addressLine1: true, city: true } } },
    orderBy: { startsAt: 'desc' },
    take: 100,
  })
  const now = Date.now()
  const upcoming = appointments.filter((a: any) => new Date(a.startsAt).getTime() > now && !['cancelled', 'no_show', 'completed'].includes(a.status)).reverse()
  const past = appointments.filter((a: any) => !upcoming.includes(a))
  return { name: user.name, email: user.email, emailConfirmed: true, upcoming: upcoming.map(serialize), past: past.map(serialize) }
}

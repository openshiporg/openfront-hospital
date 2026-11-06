import { createHmac, timingSafeEqual } from 'node:crypto'

// A patient's link to manage one visit. It is an HMAC over the appointment id, so nothing secret is stored and the
// link in the receipt email keeps working for the life of the visit. It grants only: see the visit's status, time and
// location, and cancel it before it starts.

const PREFIX = 'visit_v1_'

function secret(candidate = String(process.env.VISIT_ACCESS_SIGNING_KEY || process.env.SESSION_SECRET || '')) {
  if (candidate.length < 32) throw new Error('Visit access signing secret is not configured')
  return candidate
}

function sign(payload: string, key?: string) {
  return createHmac('sha256', secret(key)).update(`visit-manage-v1:${payload}`).digest('base64url')
}

export function createVisitAccessToken(appointmentId: string, key?: string) {
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(appointmentId)) throw new Error('Invalid appointment id')
  const payload = Buffer.from(appointmentId, 'utf8').toString('base64url')
  return `${PREFIX}${payload}.${sign(payload, key)}`
}

/** The appointment id the token was issued for, or null for anything forged, truncated or malformed. */
export function verifyVisitAccessToken(token: unknown, key?: string): string | null {
  const value = String(token ?? '')
  if (!value.startsWith(PREFIX) || value.length > 400) return null
  const [payload, signature] = value.slice(PREFIX.length).split('.')
  if (!payload || !signature) return null
  const expected = Buffer.from(sign(payload, key))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  const id = Buffer.from(payload, 'base64url').toString('utf8')
  return /^[A-Za-z0-9_-]{8,200}$/.test(id) ? id : null
}

// Account email confirmation: an HMAC over the user id, the email it was sent to and an expiry. Changing the email
// invalidates it; nothing is stored.
const CONFIRM_PREFIX = 'acct_v1_'

export function createAccountConfirmToken(userId: string, email: string, ttlMs = 2 * 86_400_000, key?: string) {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: email.toLowerCase(), x: Date.now() + ttlMs }), 'utf8').toString('base64url')
  return `${CONFIRM_PREFIX}${payload}.${createHmac('sha256', secret(key)).update(`account-confirm-v1:${payload}`).digest('base64url')}`
}

/** { userId, email } for a genuine, unexpired confirmation token; null otherwise. */
export function verifyAccountConfirmToken(token: unknown, key?: string): { userId: string; email: string } | null {
  const value = String(token ?? '')
  if (!value.startsWith(CONFIRM_PREFIX) || value.length > 800) return null
  const [payload, signature] = value.slice(CONFIRM_PREFIX.length).split('.')
  if (!payload || !signature) return null
  const expected = Buffer.from(createHmac('sha256', secret(key)).update(`account-confirm-v1:${payload}`).digest('base64url'))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof data.u !== 'string' || typeof data.e !== 'string' || !(Number(data.x) > Date.now())) return null
    return { userId: data.u, email: data.e }
  } catch { return null }
}

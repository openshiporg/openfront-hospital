import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const ACCESS_TOKEN_PREFIX = 'intake_'
const ACCESS_TOKEN_BYTES = 32
const ACCESS_TTL_MS = 7 * 24 * 60 * 60 * 1000
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/
const DUMMY_DIGEST = createHash('sha256').update('invalid-intake-access').digest('hex')

export type IntakeAccessRecord = {
  accessCodeHash: string | null
  accessExpiresAt: Date | string | null
  accessUsedAt: Date | string | null
  accessRevokedAt: Date | string | null
}

export function hashIntakeAccessToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function createIntakeAccessToken(now = new Date()) {
  const token = `${ACCESS_TOKEN_PREFIX}${randomBytes(ACCESS_TOKEN_BYTES).toString('base64url')}`
  return {
    token,
    tokenHash: hashIntakeAccessToken(token),
    expiresAt: new Date(now.getTime() + ACCESS_TTL_MS),
  }
}

function intakeDeliverySecret(candidate = String(process.env.INTAKE_DELIVERY_SIGNING_KEY || process.env.SESSION_SECRET || '')) {
  if (candidate.length < 32) throw new Error('Intake delivery signing secret is not configured')
  return candidate
}

/**
 * Produce a high-entropy signed bearer that can be reconstructed by the outbox
 * worker from non-secret intake metadata. Only its SHA-256 digest is persisted;
 * the queue never stores a plaintext or decryptable intake credential.
 */
export function deliverableIntakeAccessToken(
  intakeFormId: string,
  expiresAt: Date,
  secret?: string,
) {
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(intakeFormId) || Number.isNaN(expiresAt.getTime())) {
    throw new Error('Invalid intake delivery metadata')
  }
  const payload = Buffer.from(`${intakeFormId}:${Math.floor(expiresAt.getTime() / 1_000)}`, 'utf8').toString('base64url')
  const signature = createHmac('sha256', intakeDeliverySecret(secret)).update(`intake-delivery-v1:${payload}`).digest('base64url')
  const token = `intake_v1_${payload}.${signature}`
  return { token, tokenHash: hashIntakeAccessToken(token), expiresAt }
}

export function createDeliverableIntakeAccessToken(intakeFormId: string, now = new Date(), secret?: string) {
  return deliverableIntakeAccessToken(intakeFormId, new Date(now.getTime() + ACCESS_TTL_MS), secret)
}

/**
 * Compares fixed-length SHA-256 buffers even when the stored digest is malformed.
 * The final validity branch runs only after timingSafeEqual has executed.
 */
export function verifyIntakeAccessToken(token: string, expectedDigest: string | null | undefined) {
  const actual = Buffer.from(hashIntakeAccessToken(token), 'hex')
  const digestIsValid = Boolean(expectedDigest && SHA256_HEX_PATTERN.test(expectedDigest))
  const expected = Buffer.from(digestIsValid ? expectedDigest! : DUMMY_DIGEST, 'hex')
  const matches = timingSafeEqual(actual, expected)
  return digestIsValid && matches
}

export function isActiveIntakeAccess(
  token: string,
  access: IntakeAccessRecord | null | undefined,
  now = new Date(),
) {
  const matches = verifyIntakeAccessToken(token, access?.accessCodeHash)
  if (!access || !matches || access.accessUsedAt || access.accessRevokedAt || !access.accessExpiresAt) return false

  const expiresAt = new Date(access.accessExpiresAt)
  return !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() > now.getTime()
}

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

function decodeKey(value: string | undefined, name: string) {
  const text = String(value || '').trim()
  const key = /^[a-f0-9]{64}$/i.test(text) ? Buffer.from(text, 'hex') : Buffer.from(text, 'base64')
  if (key.length !== 32) throw new Error(`${name} must decode to exactly 32 bytes`)
  return key
}

export function integrationEncryptionKey() {
  return decodeKey(process.env.INTEGRATION_SECRET_ENCRYPTION_KEY, 'INTEGRATION_SECRET_ENCRYPTION_KEY')
}

export function exportEncryptionKey() {
  return decodeKey(process.env.EXPORT_ENCRYPTION_KEY, 'EXPORT_ENCRYPTION_KEY')
}

export function encryptSecret(plaintext: string, key: Buffer) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  }
}

export function decryptSecret(input: { ciphertext: string; iv: string; tag: string }, key: Buffer) {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(input.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(input.tag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

export function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex')
}

export function hmacSignature(secret: string, timestamp: string, body: string) {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
}

export function safeEqualHex(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'))
}

export function safeEqualText(left: string, right: string) {
  const leftHash = Buffer.from(sha256(left), 'hex')
  const rightHash = Buffer.from(sha256(right), 'hex')
  return timingSafeEqual(leftHash, rightHash)
}

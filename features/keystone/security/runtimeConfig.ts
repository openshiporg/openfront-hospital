const REQUIRED_PRODUCTION_VALUES = [
  'DATABASE_URL',
  'SESSION_SECRET',
  'INTEGRATION_SECRET_ENCRYPTION_KEY',
  'EXPORT_ENCRYPTION_KEY',
  'OUTBOX_WORKER_SECRET',
  'BOOTSTRAP_ADMIN_SECRET',
  'PASSWORD_RESET_PEPPER',
  'AUTH_RATE_LIMIT_PEPPER',
  'INTAKE_DELIVERY_SIGNING_KEY',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'SMTP_FROM',
  'SMTP_STORE_LINK',
  'S3_BUCKET_NAME',
  'S3_REGION',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_ENDPOINT',
] as const

function decodesTo32Bytes(value: string) {
  try {
    const buffer = /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64')
    return buffer.length === 32
  } catch {
    return false
  }
}

export function validateProductionEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  if (environment.NODE_ENV !== 'production') return
  const missing = REQUIRED_PRODUCTION_VALUES.filter(name => !String(environment[name] || '').trim())
  if (missing.length) throw new Error(`Missing production configuration: ${missing.join(', ')}`)
  if (!String(environment.DATABASE_URL).startsWith('postgresql://')) throw new Error('Production DATABASE_URL must use PostgreSQL')
  if (!decodesTo32Bytes(String(environment.INTEGRATION_SECRET_ENCRYPTION_KEY))) throw new Error('INTEGRATION_SECRET_ENCRYPTION_KEY must decode to 32 bytes')
  if (!decodesTo32Bytes(String(environment.EXPORT_ENCRYPTION_KEY))) throw new Error('EXPORT_ENCRYPTION_KEY must decode to 32 bytes')
  if (String(environment.SESSION_SECRET).length < 48) throw new Error('SESSION_SECRET must contain at least 48 characters')
  if (String(environment.OUTBOX_WORKER_SECRET).length < 48) throw new Error('OUTBOX_WORKER_SECRET must contain at least 48 characters')
  if (String(environment.BOOTSTRAP_ADMIN_SECRET).length < 48) throw new Error('BOOTSTRAP_ADMIN_SECRET must contain at least 48 characters')
  if (String(environment.PASSWORD_RESET_PEPPER).length < 48) throw new Error('PASSWORD_RESET_PEPPER must contain at least 48 characters')
  if (String(environment.AUTH_RATE_LIMIT_PEPPER).length < 48) throw new Error('AUTH_RATE_LIMIT_PEPPER must contain at least 48 characters')
  if (String(environment.INTAKE_DELIVERY_SIGNING_KEY).length < 48) throw new Error('INTAKE_DELIVERY_SIGNING_KEY must contain at least 48 characters')
  const smtpPort = Number(environment.SMTP_PORT)
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65_535) throw new Error('SMTP_PORT must be an integer between 1 and 65535')
  let resetOrigin: URL
  try { resetOrigin = new URL(String(environment.SMTP_STORE_LINK)) } catch { throw new Error('SMTP_STORE_LINK must be a valid HTTPS URL') }
  if (resetOrigin.protocol !== 'https:' || resetOrigin.username || resetOrigin.password || resetOrigin.search || resetOrigin.hash) {
    throw new Error('SMTP_STORE_LINK must be a credential-free HTTPS URL without query or fragment')
  }
  let endpoint: URL
  try { endpoint = new URL(String(environment.S3_ENDPOINT)) } catch { throw new Error('S3_ENDPOINT must be a valid HTTPS URL') }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) throw new Error('S3_ENDPOINT must be a credential-free HTTPS URL')
}

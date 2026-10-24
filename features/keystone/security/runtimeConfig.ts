const REQUIRED_PRODUCTION_VALUES = [
  'DATABASE_URL',
  'SESSION_SECRET',
  'S3_BUCKET_NAME',
  'S3_REGION',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_ENDPOINT',
] as const

// Matches E-commerce: production needs the database, the session secret and the bucket.
export function validateProductionEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  if (environment.NODE_ENV !== 'production') return
  const missing = REQUIRED_PRODUCTION_VALUES.filter(name => !String(environment[name] || '').trim())
  if (missing.length) throw new Error(`Missing production configuration: ${missing.join(', ')}`)
  if (String(environment.SESSION_SECRET).length < 32) throw new Error('SESSION_SECRET must be at least 32 characters long')
}

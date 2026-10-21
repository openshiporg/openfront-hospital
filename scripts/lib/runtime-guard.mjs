export function assertSafeRuntimeDatabase(databaseUrl, label = 'runtime proof') {
  if (!databaseUrl) throw new Error(`${label} requires DATABASE_URL`)
  const parsed = new URL(databaseUrl)
  const name = parsed.pathname.replace(/^\//, '')
  const constrained = parsed.searchParams.get('connection_limit') === '1' && parsed.searchParams.get('pool_timeout') === '20'
  if (!constrained) throw new Error(`${label} requires connection_limit=1 and pool_timeout=20`)
  const maintainedAllowed = name === 'runtime_hospital' && process.env.OPENFRONT_ALLOW_MAINTAINED_DB === '1'
  const disposableAllowed = /^runtime_hospital_(?:launch|retained|proof|test|ephemeral|fresh|final|shadow|miggen)[a-z0-9_]*$/i.test(name) && process.env.OPENFRONT_ALLOW_DISPOSABLE_DB === '1'
  if (!maintainedAllowed && !disposableAllowed) {
    throw new Error(`${label} refuses database ${name || '(unknown)'}; explicitly select an approved maintained or disposable Hospital runtime`)
  }
  return { parsed, name, disposable: disposableAllowed }
}

export async function beginDisposableCleanup(prisma) {
  if (process.env.OPENFRONT_ALLOW_DISPOSABLE_DB !== '1') return false
  await prisma.$executeRawUnsafe('SET session_replication_role = replica')
  return true
}

export async function endDisposableCleanup(prisma, enabled) {
  if (enabled) await prisma.$executeRawUnsafe('SET session_replication_role = origin')
}

export function assertLocalGraphqlEndpoint(endpoint, label = 'runtime proof') {
  if (!endpoint) throw new Error(`${label} requires OPENFRONT_GRAPHQL_URL`)
  const url = new URL(endpoint)
  if (!['localhost', '127.0.0.1'].includes(url.hostname) && !url.hostname.endsWith('.local')) {
    throw new Error(`${label} requires a local GraphQL endpoint`)
  }
  return url
}

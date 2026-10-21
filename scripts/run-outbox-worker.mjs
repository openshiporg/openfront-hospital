const production = process.env.NODE_ENV === 'production'
let workerUrl
try {
  workerUrl = new URL(String(process.env.OUTBOX_WORKER_URL || ''))
} catch {
  throw new Error('OUTBOX_WORKER_URL is invalid')
}
const secret = String(process.env.OUTBOX_WORKER_SECRET || '')
const intervalSeconds = Number(process.env.OUTBOX_WORKER_INTERVAL_SECONDS || 60)

if (workerUrl.username || workerUrl.password || workerUrl.search || workerUrl.hash) {
  throw new Error('OUTBOX_WORKER_URL must not contain credentials, query parameters, or fragments')
}
if (workerUrl.pathname !== '/api/internal/outbox/dispatch') {
  throw new Error('OUTBOX_WORKER_URL must target /api/internal/outbox/dispatch exactly')
}
if (production && workerUrl.protocol !== 'https:') {
  throw new Error('OUTBOX_WORKER_URL must use HTTPS in production')
}
if (!['https:', 'http:'].includes(workerUrl.protocol) || secret.length < 48) {
  throw new Error('Outbox worker URL or secret is not configured safely')
}
if (!Number.isInteger(intervalSeconds) || intervalSeconds < 15 || intervalSeconds > 300) {
  throw new Error('OUTBOX_WORKER_INTERVAL_SECONDS must be an integer from 15 to 300')
}

let stopping = false
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { stopping = true })
}

async function dispatch() {
  const response = await fetch(workerUrl, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ limit: 25 }),
  })
  if (!response.ok) throw new Error(`worker dispatch returned HTTP ${response.status}`)
  const body = await response.json()
  if (body?.status !== 'ok') throw new Error('worker dispatch did not acknowledge success')
}

console.log(`Outbox worker started for ${workerUrl.origin}; interval=${intervalSeconds}s`)
while (!stopping) {
  try {
    await dispatch()
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Outbox worker dispatch failed')
  }
  if (!stopping) await new Promise(resolve => setTimeout(resolve, intervalSeconds * 1_000))
}
console.log('Outbox worker stopped')

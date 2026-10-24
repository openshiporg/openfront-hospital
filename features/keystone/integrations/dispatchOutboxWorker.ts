import { readBoundedBody } from './boundedBody'
import { dispatchExternalOutbox } from './outboxWorker'
import { keystoneContext } from '../context'
import { dispatchInternalOutbox } from '../mutations/clinical/dispatchClinicalOutbox'
import { safeEqualText } from './crypto'

export async function dispatchOutboxWorker(request: Request) {
  const configured = String(process.env.OUTBOX_WORKER_SECRET || '')
  const candidate = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (configured.length < 48 || !candidate || !safeEqualText(configured, candidate)) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } })
  }
  let limit = 10
  const contentLength = Number(request.headers.get('content-length') || 0)
  if (!Number.isSafeInteger(contentLength) || contentLength < 0 || contentLength > 1_000) return Response.json({ error: 'request_too_large' }, { status: 413 })
  try {
    const text = await readBoundedBody(request, 1_000)
    if (text.trim()) {
      const body = JSON.parse(text)
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'limit')) throw new Error('invalid_body')
      if (body.limit !== undefined) {
        if (!Number.isInteger(body.limit) || body.limit < 1 || body.limit > 50) throw new Error('invalid_limit')
        limit = body.limit
      }
    }
  } catch { return Response.json({ error: 'invalid_or_oversized_body' }, { status: 400, headers: { 'cache-control': 'no-store' } }) }
  try {
    const internal = await dispatchInternalOutbox(keystoneContext.prisma, limit)
    const external = await dispatchExternalOutbox(keystoneContext.prisma, limit)
    return Response.json({ status: 'ok', internal, external }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503, headers: { 'cache-control': 'no-store' } })
  }
}

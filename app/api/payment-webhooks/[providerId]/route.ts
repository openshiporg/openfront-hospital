import { NextRequest, NextResponse } from 'next/server'
import { keystoneContext } from '@/features/keystone/context'
import { handlePatientPaymentWebhook } from '@/features/keystone/mutations/payments/webhook'

export async function POST(request: NextRequest, { params }: { params: Promise<{ providerId: string }> }) {
  const length = Number(request.headers.get('content-length') || 0)
  if (length > 1_000_000) return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  const rawBody = await request.text()
  if (Buffer.byteLength(rawBody) > 1_000_000) return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  let event: any
  try { event = JSON.parse(rawBody) } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  try {
    const { providerId } = await params
    const result = await handlePatientPaymentWebhook(providerId, event, Object.fromEntries(request.headers.entries()), rawBody, keystoneContext)
    return NextResponse.json(result)
  } catch { return NextResponse.json({ error: 'Webhook could not be accepted' }, { status: 400 }) }
}

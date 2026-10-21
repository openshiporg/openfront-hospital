import { keystoneContext } from '@/features/keystone/context'
import { handleIntegrationWebhook } from '@/features/keystone/integrations/webhookHandler'
import { consumeSharedRateLimit, requestIdentity } from '@/features/keystone/security/graphqlSecurity'

export const dynamic = 'force-dynamic'

function rateLimited() {
  return Response.json(
    { error: 'rate_limit_exceeded' },
    { status: 429, headers: { 'cache-control': 'no-store', 'retry-after': '60' } },
  )
}

export async function POST(request: Request, context: { params: Promise<{ installationKey: string }> }) {
  const { installationKey } = await context.params
  const headers = Object.fromEntries(request.headers.entries())
  const identity = requestIdentity(headers, null)
  const maximum = process.env.NODE_ENV === 'production' ? 300 : 2_000
  const globalMaximum = process.env.NODE_ENV === 'production' ? 3_000 : 10_000

  try {
    if (!await consumeSharedRateLimit(keystoneContext.prisma, 'webhook-global-ingress', 'all-clients', globalMaximum)) return rateLimited()
    // These shared counters execute before installation or credential lookups.
    // A global client ceiling prevents key rotation from becoming unbounded DB
    // work; the second ceiling isolates each installation/client pair.
    if (!await consumeSharedRateLimit(keystoneContext.prisma, 'webhook-client', identity, maximum)) return rateLimited()
    if (!await consumeSharedRateLimit(keystoneContext.prisma, 'webhook-installation', `${identity}:${installationKey}`, maximum)) return rateLimited()
  } catch {
    return Response.json(
      { error: 'request_controls_unavailable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    )
  }

  return handleIntegrationWebhook(request, installationKey)
}

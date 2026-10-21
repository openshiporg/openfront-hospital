import { dispatchOutboxWorker } from '@/features/keystone/integrations/dispatchOutboxWorker'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return dispatchOutboxWorker(request)
}

import { getHealthResponse } from '@/features/platform/health/getHealthResponse'

export const dynamic = 'force-dynamic'

export async function GET() {
  return getHealthResponse()
}

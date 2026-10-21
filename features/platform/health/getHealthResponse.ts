import { keystoneContext } from '@/features/keystone/context'

export async function getHealthResponse() {
  try {
    await keystoneContext.prisma.$queryRaw`SELECT 1`
    return Response.json(
      { status: 'ok' },
      { status: 200, headers: { 'cache-control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { status: 'unavailable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    )
  }
}

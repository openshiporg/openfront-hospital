import { downloadExport } from '@/features/keystone/portability/exportDownload'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params
  return downloadExport(request, jobId)
}

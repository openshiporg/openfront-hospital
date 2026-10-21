import { Prisma } from '@prisma/client'

import { keystoneContext } from '../context'
import { decryptSecret, exportEncryptionKey, safeEqualHex, sha256 } from '../integrations/crypto'

export async function downloadExport(request: Request, jobId: string) {
  const candidate = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!candidate || candidate.length > 200) return Response.json({ error: 'invalid_export_token' }, { status: 401 })

  // The one-time capability is necessary but not sufficient: bind downloads to
  // a currently authenticated portability operator who can read this job's
  // direct facility. Exclude the export bearer from session parsing.
  const requestContext = await keystoneContext.withRequest({
    headers: { cookie: request.headers.get('cookie') || '' },
  } as any, {} as any) as any
  const role = requestContext.session?.data?.role
  if (!role?.canManageDataPortability) {
    return Response.json({ error: 'invalid_export_token' }, { status: 401, headers: { 'cache-control': 'no-store' } })
  }
  const scopedJob = await requestContext.query.ExportJob.findOne({ where: { id: jobId }, query: 'id exportType' })
  if (!scopedJob || (scopedJob.exportType === 'audit' && !role?.canViewReports)) {
    return Response.json({ error: 'invalid_export_token' }, { status: 401, headers: { 'cache-control': 'no-store' } })
  }

  try {
    const outcome = await keystoneContext.prisma.$transaction(async (tx: any) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`export-download:${jobId}`}, 0))::text AS "lock"`)
      const job = await tx.exportJob.findUnique({ where: { id: jobId } })
      const now = new Date()
      if (
        !job || (job.exportType === 'audit' && !role?.canViewReports) ||
        job.status !== 'ready' || job.consumedAt || job.expiresAt <= now ||
        !safeEqualHex(job.accessTokenDigest, sha256(candidate)) ||
        !job.resultCiphertext || !job.resultIv || !job.resultTag
      ) throw new Error('invalid_export_token')
      const artifact = decryptSecret({ ciphertext: job.resultCiphertext, iv: job.resultIv, tag: job.resultTag }, exportEncryptionKey())
      if (!safeEqualHex(job.resultDigest, sha256(artifact))) throw new Error('export_integrity_failure')
      await tx.exportJob.update({ where: { id: job.id }, data: { consumedAt: now } })
      const metadata = {
        source: 'portability_download', aggregateId: job.id, exportType: job.exportType, format: job.format,
        oneTimeCapabilityConsumed: true, authority: 'authenticated_portability_operator',
      }
      await tx.clinicalAuditLog.create({ data: {
        eventType: 'export.downloaded', occurredAt: now, actorType: 'staff_user', actorReference: requestContext.session.itemId,
        facilityId: job.facilityId, metadata, createdAt: now,
      } })
      await tx.clinicalOutboxEvent.create({ data: {
        eventKey: `export_job:${job.id}:downloaded`, eventType: 'export.downloaded', aggregateType: 'export_job', aggregateId: job.id,
        contractVersion: 'hospital.event.v1', deliveryMode: 'internal', status: 'recorded', attempts: 0, nextAttemptAt: null,
        facilityId: job.facilityId, payload: metadata, createdAt: now,
      } })
      return { artifact, format: job.format, jobNumber: job.jobNumber }
    }, { timeout: 30_000 })
    const extension = outcome.format === 'csv' ? 'csv' : 'json'
    return new Response(outcome.artifact, {
      status: 200,
      headers: {
        'content-type': outcome.format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="${outcome.jobNumber}.${extension}"`,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    })
  } catch (error) {
    const integrity = error instanceof Error && error.message === 'export_integrity_failure'
    return Response.json({ error: integrity ? 'export_unavailable' : 'invalid_export_token' }, { status: integrity ? 503 : 401, headers: { 'cache-control': 'no-store' } })
  }
}

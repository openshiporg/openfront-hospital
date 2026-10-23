import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { BoundedDataNotice } from '@/features/platform/components/BoundedDataNotice'
import { WorkspaceLoadError } from '@/features/platform/components/WorkspaceLoadError'
import {
  Board,
  BoardRow,
  Code,
  EmptyBoard,
  Notice,
  Readout,
  ReadoutStrip,
  StatusTag,
  WardBody,
  WardHeader,
  WardSection,
  statusLabel,
  toneForStatus,
  type WardTone,
} from '@/features/platform/components/ward'
import { OperationalFabricControls, OperationalQueueActions } from '../components/OperationalFabricControls'
import { getOperationalFabricWorkspace } from '../lib/getOperationalFabricWorkspace'

export async function OperationalFabricPage() {
  const breadcrumbs = [{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Operational fabric' }]
  const workspace = await getOperationalFabricWorkspace().catch(() => null)
  if (!workspace) {
    return <WorkspaceLoadError title="Operational fabric" description="The signed-in account's operational authority could not be verified. No operational data or actions are shown." breadcrumbs={breadcrumbs} />
  }
  if (!workspace.capabilities.hasOperationalAccess) {
    return (
      <PageContainer title="Operational fabric" breadcrumbs={breadcrumbs} header={<WardHeader eyebrow="Permission required" title="Operational fabric" tone="warn" status="Unavailable" />}>
        <WardBody>
          <Notice tone="warn" role="alert">
            <p className="font-medium">No operational-fabric area is enabled for this role.</p>
            <p className="mt-1">No cross-domain data was requested.</p>
          </Notice>
        </WardBody>
      </PageContainer>
    )
  }
  const metrics: Array<{ label: string; value: number; tone: WardTone }> = [
    ...(workspace.outbox ? [
      { label: 'Pending events', value: workspace.outbox.pending, tone: (workspace.outbox.pending > 0 ? 'info' : 'ok') as WardTone },
      { label: 'Retry events', value: workspace.outbox.retry, tone: (workspace.outbox.retry > 0 ? 'warn' : 'ok') as WardTone },
      { label: 'Dead letters', value: workspace.outbox.deadLetter, tone: (workspace.outbox.deadLetter > 0 ? 'bad' : 'ok') as WardTone },
    ] : []),
    ...(workspace.availability.inventory && workspace.totals.inventory !== null ? [{ label: 'Inventory items', value: workspace.totals.inventory, tone: 'accent' as WardTone }] : []),
    ...(workspace.totals.succeededPayments !== null ? [{ label: 'Payments in scope', value: workspace.totals.succeededPayments, tone: 'ok' as WardTone }] : []),
    ...(workspace.availability.portability && workspace.totals.exports !== null ? [{ label: 'Export jobs', value: workspace.totals.exports, tone: 'idle' as WardTone }] : []),
  ]
  const deadLetters = workspace.outbox?.deadLetter ?? 0
  const headerTone: WardTone = workspace.unavailable.length > 0 || deadLetters > 0 ? 'bad' : (workspace.outbox?.retry ?? 0) > 0 ? 'warn' : 'ok'
  return (
    <PageContainer
      title="Operational fabric"
      breadcrumbs={breadcrumbs}
      header={(
        <WardHeader
          eyebrow="Hospital operations"
          title="Operational fabric"
          tone={headerTone}
          status={deadLetters > 0 ? `${deadLetters} dead letters` : workspace.unavailable.length > 0 ? 'Some data unverified' : 'Operational'}
          meta="Billing, inventory, integrations, communications, portability and retention"
        />
      )}
    >
      <WardBody>
        <BoundedDataNotice messages={workspace.notices} />
        {workspace.unavailable.length > 0 && (
          <Notice tone="warn" role="alert">
            <p className="font-medium">Some authorized operational data could not be verified.</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">{workspace.unavailable.map(message => <li key={message}>{message}</li>)}</ul>
          </Notice>
        )}
        {metrics.length > 0 && (
          <ReadoutStrip>
            {metrics.map(metric => <Readout key={metric.label} label={metric.label} value={metric.value} tone={metric.tone} />)}
          </ReadoutStrip>
        )}
        {((workspace.capabilities.dataPortability && workspace.availability.portability) || workspace.capabilities.mayDispatchOutbox) && (
          <WardSection id="queued-actions" title="Worker and queued actions">
            <OperationalQueueActions workspace={workspace} />
          </WardSection>
        )}
        <OperationalFabricControls workspace={workspace} />
        {workspace.capabilities.dataPortability && workspace.availability.portability && (
          <WardSection id="recent-exports" title="Recent export jobs" count={workspace.exports.length}>
            {workspace.exports.length ? (
              <Board>
                {workspace.exports.map(job => (
                  <BoardRow
                    key={job.id}
                    tone={toneForStatus(job.status)}
                    status={statusLabel(job.status)}
                    title={<Code className="text-sm font-semibold text-foreground">{job.jobNumber}</Code>}
                    meta={<><span>{job.exportType}</span><span className="uppercase">{job.format}</span></>}
                    aside={<StatusTag status={job.status} />}
                  />
                ))}
              </Board>
            ) : <EmptyBoard title="No export jobs for this facility" />}
          </WardSection>
        )}
      </WardBody>
    </PageContainer>
  )
}

import { AlertTriangle, ArrowRightLeft, Boxes, Cable, FileClock, WalletCards } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { BoundedDataNotice } from '@/features/platform/components/BoundedDataNotice'
import { WorkspaceLoadError } from '@/features/platform/components/WorkspaceLoadError'
import { OperationalFabricControls, OperationalQueueActions } from '../components/OperationalFabricControls'
import { getOperationalFabricWorkspace } from '../lib/getOperationalFabricWorkspace'

export async function OperationalFabricPage() {
  const breadcrumbs = [{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Operational fabric' }]
  const workspace = await getOperationalFabricWorkspace().catch(() => null)
  if (!workspace) {
    return <WorkspaceLoadError title="Operational fabric" description="The signed-in account's operational authority could not be verified. No operational data or actions are shown." breadcrumbs={breadcrumbs} />
  }
  if (!workspace.capabilities.hasOperationalAccess) {
    return <PageContainer title="Operational fabric" breadcrumbs={breadcrumbs} header={<div><p className="text-sm font-medium uppercase tracking-[.2em] text-muted-foreground">Permission required</p><h1 className="mt-2 text-3xl font-semibold">Operational fabric</h1></div>}><div className="px-4 pb-8 md:px-6"><div role="alert" className="rounded-lg border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-medium">No operational-fabric area is enabled for this role.</p><p className="mt-1">No cross-domain data was requested. Ask an administrator to review the approved duty matrix if this workspace is required.</p></div></div></PageContainer>
  }
  const metrics = [
    ...(workspace.outbox ? [
      { label: 'Pending events', value: workspace.outbox.pending, icon: ArrowRightLeft },
      { label: 'Retry events', value: workspace.outbox.retry, icon: Cable },
      { label: 'Dead letters', value: workspace.outbox.deadLetter, icon: AlertTriangle },
    ] : []),
    ...(workspace.availability.inventory && workspace.totals.inventory !== null ? [{ label: 'Inventory items', value: workspace.totals.inventory, icon: Boxes }] : []),
    ...(workspace.totals.succeededPayments !== null ? [{ label: 'Succeeded payments in scope', value: workspace.totals.succeededPayments, icon: WalletCards }] : []),
    ...(workspace.availability.portability && workspace.totals.exports !== null ? [{ label: 'Export jobs', value: workspace.totals.exports, icon: FileClock }] : []),
  ]
  return (
    <PageContainer
      title="Operational fabric"
      breadcrumbs={breadcrumbs}
      header={<div><p className="text-sm font-medium uppercase tracking-[.2em] text-muted-foreground">Hospital operations</p><h1 className="mt-2 text-3xl font-semibold">Operational fabric</h1><p className="mt-2 text-sm text-muted-foreground">Only role-authorized operational areas are loaded; actions remain subject to Keystone access checks.</p></div>}
    >
      <div className="space-y-8 px-4 pb-8 md:px-6">
        <BoundedDataNotice messages={workspace.notices} />
        {workspace.unavailable.length > 0 && <div role="alert" className="rounded-lg border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-medium">Some authorized operational data could not be verified.</p><ul className="mt-2 list-disc space-y-1 pl-5">{workspace.unavailable.map(message => <li key={message}>{message}</li>)}</ul></div>}
        {metrics.length > 0 && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {metrics.map(metric => {
            const Icon = metric.icon
            return <Card key={metric.label}><CardHeader className="pb-2"><CardDescription className="flex items-center gap-2"><Icon className="size-4" />{metric.label}</CardDescription><CardTitle className="text-2xl">{metric.value}</CardTitle></CardHeader></Card>
          })}
        </div>}
        {((workspace.capabilities.dataPortability && workspace.availability.portability) || workspace.capabilities.mayDispatchOutbox) && <Card>
          <CardHeader><CardTitle>Worker and queued actions</CardTitle><CardDescription>Only actions enabled for this role are shown. Outbox dispatch is restricted to the global maintenance administrator.</CardDescription></CardHeader>
          <CardContent><OperationalQueueActions workspace={workspace} /></CardContent>
        </Card>}
        <OperationalFabricControls workspace={workspace} />
        {workspace.capabilities.dataPortability && workspace.availability.portability && <Card>
          <CardHeader><CardTitle>Recent export jobs</CardTitle><CardDescription>Download tokens are returned only at request time and are consumed after one download.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {workspace.exports.length ? workspace.exports.map(job => (
              <div key={job.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                <span>{job.jobNumber} · {job.exportType} · {job.format}</span><Badge variant={job.status === 'failed' ? 'destructive' : 'secondary'}>{job.status}</Badge>
              </div>
            )) : <p className="text-sm text-muted-foreground">No export jobs are available for this facility.</p>}
          </CardContent>
        </Card>}
      </div>
    </PageContainer>
  )
}

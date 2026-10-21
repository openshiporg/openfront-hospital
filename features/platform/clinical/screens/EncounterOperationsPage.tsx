import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { BoundedDataNotice } from '@/features/platform/components/BoundedDataNotice'
import { WorkspaceLoadError } from '@/features/platform/components/WorkspaceLoadError'
import { getOperationsWorkspaceOptions } from '@/features/platform/operations/lib/getOperationsWorkspaceOptions'
import { EpisodePolicyConfiguration, EpisodeReceiptLookup } from '../components/EpisodePolicyWorkspace'
import { EncounterTransitionControls, OpenEncounterForm } from '../components/EncounterWorkflowControls'

type Encounter = {
  id: string
  encounterNumber: string
  status: string
  transitionVersion: number
  createdAt: string
  startedAt?: string | null
  patient?: { displayName?: string | null } | null
  provider?: { displayName?: string | null } | null
  facility?: { name?: string | null } | null
  department?: { name?: string | null } | null
  appointment?: { appointmentNumber?: string | null } | null
}

type Data = {
  encounters: Encounter[]
  openCount: number
  inProgressCount: number
  closedCount: number
}

const query = `
  query EncounterOperations {
    encounters(
      where: { status: { in: ["open", "in_progress"] } }
      orderBy: [{ createdAt: asc }]
      take: 100
    ) {
      id encounterNumber status transitionVersion createdAt startedAt
      patient { displayName }
      provider { displayName }
      facility { name }
      department { name }
      appointment { appointmentNumber }
    }
    openCount: encountersCount(where: { status: { equals: "open" } })
    inProgressCount: encountersCount(where: { status: { equals: "in_progress" } })
    closedCount: encountersCount(where: { status: { equals: "closed" } })
  }
`

export default async function EncounterOperationsPage({ searchParams }: { searchParams?: Promise<{ encounterId?: string }> } = {}) {
  const selected = searchParams ? await searchParams : {}
  const selectedEncounterId = typeof selected.encounterId === 'string' ? selected.encounterId.slice(0, 128) : ''
  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Encounters' },
  ]
  const [response, options] = await Promise.all([
    keystoneClient<Data>(query),
    getOperationsWorkspaceOptions(),
  ]).catch(() => [null, null] as const)
  if (!response?.success || !options) {
    return <>
      <WorkspaceLoadError title="Encounters" description="Encounter work items or required selectors may be incomplete. Policy/owned receipt checks below are independent and remain permission-gated." breadcrumbs={breadcrumbs} />
      <div className="space-y-4 px-4 pb-8 md:px-6"><EpisodePolicyConfiguration /><EpisodeReceiptLookup initialEncounterId={selectedEncounterId} /></div>
    </>
  }
  const data = response.data

  return (
    <PageContainer
      title="Encounters"
      breadcrumbs={breadcrumbs}
      header={(
        <div>
          <p className="text-sm font-medium uppercase tracking-[.2em] text-muted-foreground">Visit workspace</p>
          <h1 className="mt-2 text-3xl font-semibold">Encounters</h1>
          <p className="mt-2 text-sm text-muted-foreground">Open visits, start care, and close completed encounters.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border px-2.5 py-1">Open: {data.openCount}</span>
            <span className="rounded-full border px-2.5 py-1">In progress: {data.inProgressCount}</span>
            <span className="rounded-full border px-2.5 py-1">Closed: {data.closedCount}</span>
          </div>
        </div>
      )}
    >
      <div className="space-y-5 px-4 pb-8 md:px-6">
        <BoundedDataNotice messages={[
          ...options.notices,
          ...(data.openCount + data.inProgressCount > data.encounters.length
            ? [`Active encounters: showing the first ${data.encounters.length} of ${data.openCount + data.inProgressCount}.`]
            : []),
        ]} />
        <EpisodePolicyConfiguration />
        <EpisodeReceiptLookup initialEncounterId={selectedEncounterId} />
        <OpenEncounterForm options={options} />
        <Card>
          <CardHeader>
            <CardTitle>Active encounters</CardTitle>
            <CardDescription>Open and in-progress encounters, oldest first.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 xl:grid-cols-2">
            {data.encounters.map(encounter => (
              <div key={encounter.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{encounter.patient?.displayName ?? 'Restricted patient'}</p>
                    <p className="text-sm text-muted-foreground">
                      {encounter.encounterNumber} · {encounter.provider?.displayName || 'Provider'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {encounter.facility?.name || 'Facility'}
                      {encounter.department?.name ? ` · ${encounter.department.name}` : ''}
                      {encounter.appointment?.appointmentNumber ? ` · ${encounter.appointment.appointmentNumber}` : ''}
                    </p>
                  </div>
                  <Badge>{encounter.status.replaceAll('_', ' ')}</Badge>
                </div>
                <EncounterTransitionControls encounter={encounter} />
              </div>
            ))}
            {!data.encounters.length && <p className="text-sm text-muted-foreground">No active encounters.</p>}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}

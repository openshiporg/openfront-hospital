import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { BoundedDataNotice } from '@/features/platform/components/BoundedDataNotice'
import { WorkspaceLoadError } from '@/features/platform/components/WorkspaceLoadError'
import {
  Board,
  BoardRow,
  Code,
  EmptyBoard,
  Readout,
  ReadoutStrip,
  WardBody,
  WardHeader,
  WardSection,
  Wristband,
  statusLabel,
  toneForStatus,
} from '@/features/platform/components/ward'
import { cn } from '@/lib/utils'
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

const STAGES = [
  { key: 'arrived', label: 'Arrived' },
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'closed', label: 'Closed' },
] as const

/** Where an encounter sits between arrival and closure. */
function StageTrack({ encounter }: { encounter: Encounter }) {
  const reached = encounter.status === 'in_progress' ? 2 : encounter.status === 'closed' ? 3 : 1
  return (
    <ol aria-label={`Stage: ${statusLabel(encounter.status)}`} className="flex min-w-0 flex-wrap items-center gap-y-1">
      {STAGES.map((stage, index) => {
        const done = index < reached
        const current = index === reached
        return (
          <li key={stage.key} className="flex min-w-0 flex-wrap items-center gap-y-1">
            {index > 0 && <span aria-hidden className={cn('h-px w-3 sm:w-5', index <= reached ? 'bg-teal-600 dark:bg-teal-400' : 'bg-border')} />}
            <span
              aria-current={current ? 'step' : undefined}
              className={cn(
                'whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium',
                current && 'bg-teal-700 text-white dark:bg-teal-500 dark:text-teal-950',
                done && 'text-teal-700 dark:text-teal-300',
                !done && !current && 'text-muted-foreground',
              )}
            >
              {stage.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

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
      <WardBody><EpisodePolicyConfiguration /><EpisodeReceiptLookup initialEncounterId={selectedEncounterId} /></WardBody>
    </>
  }
  const data = response.data
  const lanes = [
    { status: 'open', title: 'Open', encounters: data.encounters.filter(encounter => encounter.status === 'open') },
    { status: 'in_progress', title: 'In progress', encounters: data.encounters.filter(encounter => encounter.status === 'in_progress') },
  ]

  return (
    <PageContainer
      title="Encounters"
      breadcrumbs={breadcrumbs}
      header={(
        <WardHeader
          title="Encounters"
          tone={data.openCount + data.inProgressCount > 0 ? 'info' : 'idle'}
          meta={<span className="font-mono text-xs tabular-nums">{data.openCount + data.inProgressCount} active</span>}
        />
      )}
    >
      <WardBody>
        <BoundedDataNotice messages={[
          ...options.notices,
          ...(data.openCount + data.inProgressCount > data.encounters.length
            ? [`Active encounters: showing the first ${data.encounters.length} of ${data.openCount + data.inProgressCount}.`]
            : []),
        ]} />

        <ReadoutStrip>
          <Readout label="Open" value={data.openCount} tone={data.openCount ? 'info' : 'idle'} />
          <Readout label="In progress" value={data.inProgressCount} tone={data.inProgressCount ? 'warn' : 'idle'} />
          <Readout label="Closed" value={data.closedCount} tone="ok" />
        </ReadoutStrip>

        {!data.encounters.length
          ? <EmptyBoard title="No active encounters." />
          : lanes.filter(lane => lane.encounters.length).map(lane => (
            <WardSection key={lane.status} title={lane.title} count={lane.encounters.length} id={`encounters-${lane.status}`}>
              <Board>
                {lane.encounters.map(encounter => (
                  <BoardRow
                    key={encounter.id}
                    tone={toneForStatus(encounter.status)}
                    status={statusLabel(encounter.status)}
                    title={<Wristband name={encounter.patient?.displayName ?? 'Restricted patient'} identifier={encounter.encounterNumber} />}
                    meta={<>
                      <span>{encounter.provider?.displayName || 'Provider'}</span>
                      <span>{encounter.facility?.name || 'Facility'}{encounter.department?.name ? ` · ${encounter.department.name}` : ''}</span>
                      {encounter.appointment?.appointmentNumber && <Code>{encounter.appointment.appointmentNumber}</Code>}
                    </>}
                    aside={<StageTrack encounter={encounter} />}
                  >
                    <EncounterTransitionControls encounter={encounter} />
                  </BoardRow>
                ))}
              </Board>
            </WardSection>
          ))}

        <OpenEncounterForm options={options} />

        <WardSection title="Episode closure" id="encounters-episode">
          <div className="flex min-w-0 flex-col gap-3">
            <EpisodeReceiptLookup initialEncounterId={selectedEncounterId} />
            <EpisodePolicyConfiguration />
          </div>
        </WardSection>
      </WardBody>
    </PageContainer>
  )
}

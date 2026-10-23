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
  StatusTag,
  WardBody,
  WardHeader,
  WardSection,
  Wristband,
  toneForStatus,
  statusLabel,
} from '@/features/platform/components/ward'
import type { OperationsOption } from '@/features/platform/operations/types'
import { CareQueueControls } from '../components/CareQueueControls'

type Ticket = {
  id: string
  ticketNumber: string
  status: string
  priority: string
  reasonCode: string
  transitionVersion: number
  arrivedAt: string
  patient?: { id: string; displayName?: string | null } | null
  appointment?: { appointmentNumber?: string | null } | null
  encounter?: { id: string; encounterNumber?: string | null } | null
  facility?: { id: string; name?: string | null; timeZone?: string | null } | null
}

type Appointment = {
  id: string
  appointmentNumber: string
  status: string
  startsAt: string
  careQueueTickets?: Array<{ id: string }> | null
  patient?: { id: string; displayName?: string | null } | null
  provider?: { displayName?: string | null } | null
  facility?: { id: string; name?: string | null; timeZone?: string | null } | null
}

type Data = { careQueueTickets: Ticket[]; careQueueTicketsCount: number; appointments: Appointment[]; appointmentsCount: number }

const query = `
  query CareQueuePage {
    careQueueTickets(
      orderBy: [{ arrivedAt: asc }]
      where: { status: { in: ["waiting", "called", "in_care"] } }
      take: 100
    ) {
      id ticketNumber status priority reasonCode transitionVersion arrivedAt
      patient { id displayName }
      appointment { appointmentNumber }
      encounter { id encounterNumber }
      facility { id name timeZone }
    }
    careQueueTicketsCount(where:{status:{in:["waiting","called","in_care"]}})
    appointments(
      where: { status: { in: ["confirmed", "checked_in"] }, careQueueTickets: { none: {} } }
      orderBy: [{ startsAt: asc }]
      take: 100
    ) {
      id appointmentNumber status startsAt careQueueTickets(take:1) { id }
      patient { id displayName }
      provider { displayName }
      facility { id name timeZone }
    }
    appointmentsCount(where:{status:{in:["confirmed","checked_in"]},careQueueTickets:{none:{}}})
  }
`

function formatFacilityTime(value: string, timeZone?: string | null) {
  if (!timeZone) return 'facility time unavailable'
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    timeZoneName: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

const LANES = [
  { status: 'waiting', title: 'Waiting' },
  { status: 'called', title: 'Called' },
  { status: 'in_care', title: 'In care' },
] as const

/** Time-sensitive first, then oldest arrival (query already returns oldest first). */
function byUrgency(tickets: Ticket[]) {
  return tickets
    .map((ticket, index) => ({ ticket, index }))
    .sort((a, b) => Number(b.ticket.priority === 'time_sensitive') - Number(a.ticket.priority === 'time_sensitive') || a.index - b.index)
    .map(entry => entry.ticket)
}

function TicketRow({ ticket }: { ticket: Ticket }) {
  const urgent = ticket.priority === 'time_sensitive'
  return (
    <BoardRow
      tone={urgent && ticket.status === 'waiting' ? 'bad' : toneForStatus(ticket.status)}
      status={statusLabel(ticket.status)}
      title={<span className="inline-flex flex-wrap items-center gap-2">
        <Wristband name={ticket.patient?.displayName ?? 'Restricted patient'} identifier={ticket.appointment?.appointmentNumber || undefined} />
        {urgent && <span className="rounded-full border border-red-500/30 bg-red-500/5 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:text-red-300">Time sensitive</span>}
      </span>}
      meta={<>
        <span>Arrived {formatFacilityTime(ticket.arrivedAt, ticket.facility?.timeZone)}</span>
        <span>{ticket.facility?.name || 'Facility unavailable'}</span>
        <span>{ticket.reasonCode.replaceAll('_', ' ')}</span>
        {!urgent && <span>Priority: {ticket.priority ? ticket.priority.replaceAll('_', ' ') : 'unavailable'}</span>}
        <Code>{ticket.ticketNumber}</Code>
        {ticket.encounter?.encounterNumber && <Code>{ticket.encounter.encounterNumber}</Code>}
      </>}
      aside={<div className="flex min-w-0 flex-col items-start gap-2 sm:max-w-sm sm:items-end">
        <StatusTag status={ticket.status} />
        <CareQueueControls ticket={ticket} />
      </div>}
    />
  )
}

export default async function CareQueuePage() {
  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Care queue' },
  ]
  const response = await keystoneClient<Data>(query).catch(() => null)
  if (!response?.success) return <WorkspaceLoadError title="Care queue" description="Arrival or queue data is unavailable." breadcrumbs={breadcrumbs} />
  const data = response.data
  const unqueuedAppointments = data.appointments.filter(appointment => !appointment.careQueueTickets?.length)
  const appointmentOptions: OperationsOption[] = unqueuedAppointments.map(appointment => ({
    value: appointment.id,
    label: `${appointment.status === 'checked_in' ? 'Already checked in · reconcile' : 'Confirmed'} · ${appointment.appointmentNumber} · ${appointment.patient?.displayName || 'Patient'} · ${appointment.provider?.displayName || 'Provider'} · ${formatFacilityTime(appointment.startsAt, appointment.facility?.timeZone)}`,
  }))
  const lanes = LANES.map(lane => ({ ...lane, tickets: byUrgency(data.careQueueTickets.filter(ticket => ticket.status === lane.status)) }))
  const urgentWaiting = data.careQueueTickets.filter(ticket => ticket.status === 'waiting' && ticket.priority === 'time_sensitive').length

  return (
    <PageContainer
      title="Care queue"
      breadcrumbs={breadcrumbs}
      header={(
        <WardHeader
          title="Care queue"
          tone={data.careQueueTicketsCount > 0 ? 'accent' : 'idle'}
          meta={<span className="font-mono text-xs tabular-nums">{data.careQueueTicketsCount} active · {appointmentOptions.length} to arrive</span>}
        />
      )}
    >
      <WardBody>
        <BoundedDataNotice messages={[
          ...(data.careQueueTicketsCount > data.careQueueTickets.length ? [`Care queue: showing the first ${data.careQueueTickets.length} of ${data.careQueueTicketsCount} active tickets.`] : []),
          ...(data.appointmentsCount > data.appointments.length ? [`Arrivals: checking the first ${data.appointments.length} of ${data.appointmentsCount} confirmed or checked-in appointments for a missing queue handoff.`] : []),
        ]} />

        <ReadoutStrip>
          <Readout label="Waiting" value={lanes[0].tickets.length} tone={lanes[0].tickets.length ? 'warn' : 'idle'} sub={urgentWaiting ? `${urgentWaiting} time sensitive` : undefined} />
          <Readout label="Called" value={lanes[1].tickets.length} tone={lanes[1].tickets.length ? 'info' : 'idle'} />
          <Readout label="In care" value={lanes[2].tickets.length} tone={lanes[2].tickets.length ? 'ok' : 'idle'} />
          <Readout label="To arrive" value={appointmentOptions.length} />
        </ReadoutStrip>

        <WardSection title="Record arrival" count={appointmentOptions.length} id="care-queue-arrival">
          <CareQueueControls appointments={appointmentOptions} />
        </WardSection>

        {!data.careQueueTickets.length
          ? <EmptyBoard title="No active queue tickets." />
          : lanes.filter(lane => lane.tickets.length).map(lane => (
            <WardSection key={lane.status} title={lane.title} count={lane.tickets.length} id={`care-queue-${lane.status}`}>
              <Board>
                {lane.tickets.map(ticket => <TicketRow key={ticket.id} ticket={ticket} />)}
              </Board>
            </WardSection>
          ))}
      </WardBody>
    </PageContainer>
  )
}

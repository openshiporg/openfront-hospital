import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { BoundedDataNotice } from '@/features/platform/components/BoundedDataNotice'
import { WorkspaceLoadError } from '@/features/platform/components/WorkspaceLoadError'
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

  return (
    <PageContainer
      title="Care queue"
      breadcrumbs={breadcrumbs}
      header={(
        <div>
          <p className="text-sm font-medium uppercase tracking-[.2em] text-muted-foreground">Arrival and handoff</p>
          <h1 className="mt-2 text-3xl font-semibold">Care queue</h1>
          <p className="mt-2 text-sm text-muted-foreground">Move arrivals from waiting to called, in care, and complete with a consistent handoff history.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border px-2.5 py-1">Active queue: {data.careQueueTicketsCount}</span>
            <span className="rounded-full border px-2.5 py-1">Arrival / handoff candidates: {appointmentOptions.length}</span>
          </div>
        </div>
      )}
    >
      <div className="space-y-5 px-4 pb-8 md:px-6">
        <BoundedDataNotice messages={[
          ...(data.careQueueTicketsCount > data.careQueueTickets.length ? [`Care queue: showing the first ${data.careQueueTickets.length} of ${data.careQueueTicketsCount} active tickets.`] : []),
          ...(data.appointmentsCount > data.appointments.length ? [`Arrivals: checking the first ${data.appointments.length} of ${data.appointmentsCount} confirmed or checked-in appointments for a missing queue handoff.`] : []),
        ]} />
        <CareQueueControls appointments={appointmentOptions} />
        <Card>
          <CardHeader>
            <CardTitle>Active queue</CardTitle>
            <CardDescription>Oldest arrivals appear first.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!data.careQueueTickets.length && <p className="text-sm text-muted-foreground">No active queue tickets.</p>}
            {data.careQueueTickets.map(ticket => (
              <div key={ticket.id} className="flex flex-col gap-3 rounded-lg border p-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="font-medium">{ticket.patient?.displayName ?? 'Restricted patient'} · {ticket.appointment?.appointmentNumber}</p>
                  <p className="text-sm text-muted-foreground">
                    {ticket.facility?.name || 'Facility unavailable'} · Operational priority: {ticket.priority || 'unavailable'} · {ticket.ticketNumber} · arrived {formatFacilityTime(ticket.arrivedAt, ticket.facility?.timeZone)} · {ticket.reasonCode.replaceAll('_', ' ')}
                  </p>
                  {ticket.encounter?.encounterNumber && <p className="mt-1 text-xs text-muted-foreground">{ticket.encounter.encounterNumber}</p>}
                </div>
                <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
                  <Badge>{ticket.status.replaceAll('_', ' ')}</Badge>
                  <CareQueueControls ticket={ticket} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}

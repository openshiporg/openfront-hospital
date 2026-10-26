import Link from 'next/link'
import { ChevronRight, Search } from 'lucide-react'

import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { BoundedDataNotice } from '@/features/platform/components/BoundedDataNotice'
import { WorkspaceLoadError } from '@/features/platform/components/WorkspaceLoadError'
import {
  Board,
  BoardRow,
  Code,
  EmptyBoard,
  Facts,
  FilterBar,
  Pill,
  Readout,
  ReadoutStrip,
  StatusTag,
  Track,
  WardBody,
  WardHeader,
  WardSection,
  fieldClass,
  type WardTone,
} from '@/features/platform/components/ward'
import { getCommunicationTasks, type CommunicationTask } from '../actions/messages'
import { normalizeCommunicationFilters } from '../lib/communicationFilters'
import { ManualFollowUpButton } from '../components/ManualFollowUpButton'

const statusTone: Record<string, WardTone> = {
  manual_required: 'warn',
  queued: 'warn',
  failed: 'bad',
  sent: 'info',
  delivered: 'ok',
  completed: 'ok',
}

function formatFacilityDateTime(value?: string | null, timeZone?: string | null) {
  if (!value || !timeZone) return 'Facility time unavailable'
  return new Intl.DateTimeFormat(undefined, { timeZone, timeZoneName: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function CommunicationDetails({ message }: { message: CommunicationTask }) {
  return (
    <details className="group min-w-0">
      <summary className="w-fit cursor-pointer list-none rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <Track><Pill asChild size="sm" variant="plain"><span><ChevronRight className="transition-transform group-open:rotate-90" aria-hidden />Delivery</span></Pill></Track>
      </summary>
      <Facts
        className="mt-2 max-w-xl rounded-[4px] border bg-muted/30 px-3"
        items={[
          { label: 'Purpose', value: `${message.purpose?.replaceAll('_', ' ') || 'Not recorded'} · ${message.direction || 'unknown'}` },
          { label: 'Integration', value: `${message.installation?.name || (message.status === 'manual_required' ? 'No external delivery attempted' : 'Not visible')}${message.installation?.status ? ` · ${message.installation.status}` : ''}` },
          { label: 'Sent', value: formatFacilityDateTime(message.sentAt, message.facility?.timeZone) },
          { label: 'Delivered', value: formatFacilityDateTime(message.deliveredAt, message.facility?.timeZone) },
          { label: 'External ref', value: <span className="break-all">{message.externalId || 'None recorded'}</span>, mono: true },
        ]}
      />
    </details>
  )
}

function CommunicationActions({ message }: { message: CommunicationTask }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-2 sm:items-end">
      {message.status === 'manual_required' && <ManualFollowUpButton messageId={message.id} version={message.transitionVersion} />}
      <Track>
        <Pill asChild size="sm"><Link href={`/dashboard/patient-messages/${message.id}`}>Message</Link></Pill>
        {message.patient?.id && <Pill asChild size="sm" variant="plain"><Link href={`/dashboard/patients/${message.patient.id}`}>Patient</Link></Pill>}
        {message.appointment?.id && <Pill asChild size="sm" variant="plain"><Link href={`/dashboard/appointments/${message.appointment.id}`}>Appointment</Link></Pill>}
      </Track>
    </div>
  )
}

export async function CommunicationListPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = normalizeCommunicationFilters(searchParams ? await searchParams : {})
  const breadcrumbs = [{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Communications' }]
  const response = await getCommunicationTasks(filters)
  if (!response.success) return <WorkspaceLoadError title="Communications" description="Messages, status counts, or patient labels may be unavailable for this session." breadcrumbs={breadcrumbs} />
  const data = response.data
  const messages = data.patientMessages

  return <PageContainer
    title="Communications"
    breadcrumbs={breadcrumbs}
    header={<WardHeader
      title="Communications"
      tone={data.failed > 0 ? 'bad' : data.manualRequired > 0 ? 'warn' : 'ok'}
      status={data.failed > 0 ? 'Failed messages' : data.manualRequired > 0 ? 'Manual follow-up required' : 'No open tasks'}
      meta={`${data.open} open follow-up${data.open === 1 ? '' : 's'}`}
    />}
  >
    <WardBody>
      <ReadoutStrip>
        <Readout label="Open" tone={data.open > 0 ? 'warn' : 'idle'} value={data.open} />
        <Readout label="Manual" tone={data.manualRequired > 0 ? 'warn' : 'idle'} value={data.manualRequired} />
        <Readout label="Failed" tone={data.failed > 0 ? 'bad' : 'idle'} value={data.failed} />
        <Readout label="All records" value={data.all} />
      </ReadoutStrip>

      <FilterBar>
        <label className="relative w-full sm:min-w-56 sm:flex-1">
          <span className="sr-only">Search communication evidence</span>
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <input className={`${fieldClass} pl-9`} name="search" defaultValue={filters.search} placeholder="Patient, reference, subject…" />
        </label>
        <label className="w-full sm:w-44">
          <span className="sr-only">Communication status</span>
          <select name="status" defaultValue={filters.status} className={fieldClass}>
            <option value="open">Open follow-up</option>
            <option value="all">All</option>
            <option value="manual_required">Manual required</option>
            <option value="queued">Queued</option>
            <option value="failed">Failed</option>
            <option value="sent">Sent</option>
            <option value="delivered">Delivered</option>
            <option value="completed">Completed manually</option>
          </select>
        </label>
        <label className="w-[calc(50%-0.25rem)] sm:w-36">
          <span className="sr-only">Channel</span>
          <select name="channel" defaultValue={filters.channel} className={fieldClass}>
            <option value="all">All channels</option>
            <option value="phone">Phone</option>
            <option value="sms">SMS</option>
            <option value="email">Email</option>
          </select>
        </label>
        <label className="w-[calc(50%-0.25rem)] sm:w-36">
          <span className="sr-only">Sort communications</span>
          <select name="sort" defaultValue={filters.sort} className={fieldClass}>
            <option value="oldest">Oldest first</option>
            <option value="newest">Newest first</option>
          </select>
        </label>
        <Track>
          <Pill type="submit" variant="primary">Apply</Pill>
          <Pill asChild variant="plain"><Link href="/dashboard/platform/communications">Reset</Link></Pill>
        </Track>
      </FilterBar>

      <BoundedDataNotice messages={data.patientMessagesCount > messages.length ? [`Showing ${messages.length} of ${data.patientMessagesCount}. Narrow the filters to see more.`] : undefined} />

      <WardSection title="Follow-up queue" count={data.patientMessagesCount} id="communication-queue">
        {!messages.length ? <EmptyBoard title="No matching messages" /> : (
          <Board>
            {messages.map(message => {
              const tone = statusTone[message.status] || 'idle'
              return (
                <BoardRow
                  key={message.id}
                  tone={tone}
                  status={message.status.replaceAll('_', ' ')}
                  title={<>{message.patient?.displayName || 'Restricted patient'}<span className="font-normal text-muted-foreground"> · {message.subject || 'Patient follow-up'}</span></>}
                  meta={<>
                    <StatusTag status={message.status} tone={tone} className="font-normal" />
                    <span className="uppercase">{message.channel}</span>
                    <Code>{message.appointment?.appointmentNumber || 'No appointment'}</Code>
                    <span>{message.facility?.name || 'Restricted facility'}</span>
                    <span className="tabular-nums">{formatFacilityDateTime(message.createdAt, message.facility?.timeZone)}</span>
                  </>}
                  aside={<CommunicationActions message={message} />}
                >
                  <CommunicationDetails message={message} />
                </BoardRow>
              )
            })}
          </Board>
        )}
      </WardSection>
    </WardBody>
  </PageContainer>
}

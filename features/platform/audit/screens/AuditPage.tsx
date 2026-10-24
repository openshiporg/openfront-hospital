import Link from 'next/link'
import { ArrowRight, ChevronLeft, ChevronRight, Search } from 'lucide-react'

import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { WorkspaceLoadError } from '@/features/platform/components/WorkspaceLoadError'
import {
  Board,
  BoardRow,
  Code,
  EmptyBoard,
  FilterBar,
  Notice,
  Pill,
  SegmentedLinks,
  StatusTag,
  Track,
  WardBody,
  WardHeader,
  WardSection,
  fieldClass,
} from '@/features/platform/components/ward'
import { getAuditViewerRole, getClinicalAuditEvents, getWorkflowTransitions } from '../actions/audit'
import { APPOINTMENT_AGGREGATES, AUDIT_RANGES, CLINICAL_AGGREGATES, type AuditRange } from '../types'

const PAGE_SIZE = 50
const MAX_PAGE = 40
const linkClass = 'rounded-sm underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring'

type Tab = 'events' | 'transitions'

function one(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : ''
}

function humanize(value?: string | null) {
  const text = String(value || '').replace(/[_.]/g, ' ').trim()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Unknown'
}

function formatDateTime(value?: string | null, timeZone?: string | null) {
  if (!value) return 'Time not recorded'
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timeZone || 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(value))
}

function href(params: { tab: Tab; type?: string; range: AuditRange; search?: string; page?: number }) {
  const query = new URLSearchParams()
  if (params.tab !== 'events') query.set('tab', params.tab)
  if (params.type) query.set('type', params.type)
  if (params.range !== '7d') query.set('range', params.range)
  if (params.search) query.set('search', params.search)
  if (params.page && params.page > 1) query.set('page', String(params.page))
  return `/dashboard/platform/audit${query.size ? `?${query}` : ''}`
}

function Pagination({ total, page, link }: { total: number; page: number; link: (page: number) => string }) {
  const pages = Math.min(MAX_PAGE, Math.max(1, Math.ceil(total / PAGE_SIZE)))
  if (total <= PAGE_SIZE && page === 1) return null
  return (
    <nav aria-label="Audit pages" className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-2">
      <p className="font-mono text-xs tabular-nums text-muted-foreground">
        Page {page} of {pages}{Math.ceil(total / PAGE_SIZE) > pages ? ' (bounded)' : ''}
      </p>
      <Track>
        {page > 1
          ? <Pill asChild size="sm"><Link href={link(page - 1)} rel="prev"><ChevronLeft aria-hidden />Previous</Link></Pill>
          : <Pill size="sm" variant="plain" disabled><ChevronLeft aria-hidden />Previous</Pill>}
        {page < pages
          ? <Pill asChild size="sm"><Link href={link(page + 1)} rel="next">Next<ChevronRight aria-hidden /></Link></Pill>
          : <Pill size="sm" variant="plain" disabled>Next<ChevronRight aria-hidden /></Pill>}
      </Track>
    </nav>
  )
}

export async function AuditPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await props.searchParams
  const tab: Tab = one(params.tab) === 'transitions' ? 'transitions' : 'events'
  const requestedRange = one(params.range)
  const range: AuditRange = AUDIT_RANGES.some(item => item.value === requestedRange) ? requestedRange as AuditRange : '7d'
  const type = one(params.type).trim().slice(0, 80)
  const search = one(params.search).trim().slice(0, 80)
  const page = Math.min(MAX_PAGE, Math.max(1, Number.parseInt(one(params.page), 10) || 1))
  const breadcrumbs = [{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Audit' }]

  const roleResponse = await getAuditViewerRole()
  if (!roleResponse.success) return <WorkspaceLoadError title="Audit" description="Your role could not be verified." breadcrumbs={breadcrumbs} />
  const role = roleResponse.data
  const canViewReports = role?.canViewReports === true
  const transitionTypes = [
    ...(role?.canManagePatients ? CLINICAL_AGGREGATES : []),
    ...(role?.canManagePatients || role?.canManageAppointments ? APPOINTMENT_AGGREGATES : []),
  ]

  let denial: string | null = null
  if (!canViewReports) denial = 'The audit trail requires the “View reports and audit” permission.'
  else if (tab === 'transitions' && !transitionTypes.length) denial = 'Workflow transitions also require patient or appointment management access.'

  const listParams = { type, range, search, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }
  const [events, transitions] = denial
    ? [null, null]
    : await Promise.all([
        tab === 'events' ? getClinicalAuditEvents(listParams) : Promise.resolve(null),
        tab === 'transitions' ? getWorkflowTransitions({ ...listParams, type: transitionTypes.includes(type as never) ? type : '' }) : Promise.resolve(null),
      ])

  const failed = (events && !events.success) || (transitions && !transitions.success)
  const eventTypes = events?.success
    ? Array.from(new Set([...events.data.recent.map(item => item.eventType).filter((value): value is string => Boolean(value)), ...(type ? [type] : [])])).sort()
    : []
  const typeOptions = tab === 'events' ? eventTypes : [...transitionTypes]
  const link = (next: Partial<{ tab: Tab; type: string; range: AuditRange; search: string; page: number }>) =>
    href({ tab, type, range, search, page: 1, ...next })

  return (
    <PageContainer
      title="Audit"
      breadcrumbs={breadcrumbs}
      header={<WardHeader title="Audit trail" meta="Read only" tone={denial ? 'warn' : undefined} status={denial ? 'Restricted' : undefined} />}
    >
      <WardBody>
        <SegmentedLinks
          label="Audit view"
          options={[
            { href: href({ tab: 'events', range }), label: 'Clinical events', active: tab === 'events' },
            { href: href({ tab: 'transitions', range }), label: 'Workflow transitions', active: tab === 'transitions' },
          ]}
        />

        {denial ? <Notice tone="warn" role="alert">{denial}</Notice> : (
          <>
            <div className="flex min-w-0 flex-col gap-3">
              <FilterBar>
                {tab !== 'events' && <input type="hidden" name="tab" value={tab} />}
                {range !== '7d' && <input type="hidden" name="range" value={range} />}
                <label className="w-full sm:w-56">
                  <span className="sr-only">{tab === 'events' ? 'Event type' : 'Aggregate type'}</span>
                  <select name="type" defaultValue={type} className={fieldClass}>
                    <option value="">{tab === 'events' ? 'All event types' : 'All aggregate types'}</option>
                    {typeOptions.map(option => <option key={option} value={option}>{humanize(option)}</option>)}
                  </select>
                </label>
                <label className="relative w-full sm:min-w-56 sm:flex-1">
                  <span className="sr-only">Search by reference</span>
                  <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
                  <input
                    className={`${fieldClass} pl-9 text-base sm:text-sm`}
                    type="search"
                    name="search"
                    defaultValue={search}
                    placeholder={tab === 'events' ? 'Appointment or encounter number' : 'Record ID or status'}
                  />
                </label>
                <Track>
                  <Pill type="submit" variant="primary">Filter</Pill>
                  <Pill asChild variant="plain"><Link href={href({ tab, range: '7d' })}>Reset</Link></Pill>
                </Track>
              </FilterBar>
              <SegmentedLinks
                label="Time range"
                size="sm"
                options={AUDIT_RANGES.map(item => ({ href: link({ range: item.value }), label: item.label, active: range === item.value }))}
              />
            </div>

            {failed && <Notice tone="bad" role="alert">The audit trail could not be loaded. Refresh to try again.</Notice>}

            {events?.success && (
              <WardSection
                id="audit-events"
                title="Clinical events"
                actions={<span className="font-mono text-xs tabular-nums text-muted-foreground">{events.data.clinicalAuditLogsCount} events</span>}
              >
                {!events.data.clinicalAuditLogs.length ? <EmptyBoard title={type || search ? 'No matching events' : 'No events in this range'} /> : (
                  <Board>
                    {events.data.clinicalAuditLogs.map(row => (
                      <BoardRow
                        key={row.id}
                        title={<Code className="text-[13px] text-foreground">{row.eventType || 'unknown'}</Code>}
                        meta={<>
                          <span className="tabular-nums">{formatDateTime(row.occurredAt, row.facility?.timeZone)}</span>
                          <span>Actor: {humanize(row.actorType)}</span>
                          {row.facility?.name && <span>{row.facility.name}</span>}
                          {row.patient && <Link href={`/dashboard/platform/patients/${row.patient.id}`} className={linkClass}>{row.patient.displayName || 'Patient chart'}</Link>}
                          {row.appointment && (
                            <Link href={`/dashboard/platform/appointments?view=all&search=${encodeURIComponent(row.appointment.appointmentNumber || '')}`} className={linkClass}>
                              <Code>{row.appointment.appointmentNumber || 'Appointment'}</Code>
                            </Link>
                          )}
                          {row.encounter && (
                            <Link href={`/dashboard/platform/encounters?encounterId=${encodeURIComponent(row.encounter.id)}`} className={linkClass}>
                              <Code>{row.encounter.encounterNumber || 'Encounter'}</Code>
                            </Link>
                          )}
                          {row.intakeForm && <span>{row.intakeForm.title || 'Intake form'}</span>}
                        </>}
                      />
                    ))}
                  </Board>
                )}
                <Pagination total={events.data.clinicalAuditLogsCount} page={page} link={next => link({ page: next })} />
              </WardSection>
            )}

            {transitions?.success && (
              <WardSection
                id="audit-transitions"
                title="Workflow transitions"
                actions={<span className="font-mono text-xs tabular-nums text-muted-foreground">{transitions.data.workflowTransitionsCount} transitions</span>}
              >
                {!transitions.data.workflowTransitions.length ? <EmptyBoard title={type || search ? 'No matching transitions' : 'No transitions in this range'} /> : (
                  <Board>
                    {transitions.data.workflowTransitions.map(row => (
                      <BoardRow
                        key={row.id}
                        title={humanize(row.aggregateType)}
                        meta={<>
                          <span className="tabular-nums">{formatDateTime(row.occurredAt, row.facility?.timeZone)}</span>
                          <Code>{row.aggregateId || 'No record ID'}</Code>
                          <span className="tabular-nums">v{row.fromVersion ?? '?'} → v{row.toVersion ?? '?'}</span>
                          {row.facility?.name && <span>{row.facility.name}</span>}
                          {row.patient && <Link href={`/dashboard/platform/patients/${row.patient.id}`} className={linkClass}>{row.patient.displayName || 'Patient chart'}</Link>}
                          {row.auditLog?.eventType && <Code>{row.auditLog.eventType}</Code>}
                        </>}
                        aside={
                          <span className="inline-flex items-baseline gap-1.5">
                            <StatusTag status={row.fromStatus} className="font-normal text-muted-foreground" />
                            <ArrowRight className="size-3 self-center text-muted-foreground" aria-label="to" />
                            <StatusTag status={row.toStatus} />
                          </span>
                        }
                      />
                    ))}
                  </Board>
                )}
                <Pagination total={transitions.data.workflowTransitionsCount} page={page} link={next => link({ page: next })} />
              </WardSection>
            )}
          </>
        )}
      </WardBody>
    </PageContainer>
  )
}

export default AuditPage

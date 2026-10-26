import Link from 'next/link'
import { Activity, BedDouble, Boxes, Cable, CalendarClock, ClipboardCheck, MailWarning } from 'lucide-react'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import {
  Actions,
  Board,
  BoardRow,
  EmptyBoard,
  Meter,
  Notice,
  Pill,
  ReadoutStrip,
  StatusTag,
  WardBody,
  WardHeader,
  WardSection,
} from '@/features/platform/components/ward'
import { getPracticeReportData } from '../actions/practiceReports'
import { MetricCard } from '../components/MetricCard'
import { ReportList } from '../components/ReportList'

function percent(numerator: number, denominator: number) {
  if (!denominator) return '0%'
  return `${Math.round((numerator / denominator) * 100)}%`
}

function formatDateTime(value?: string | null, timeZone?: string | null) {
  if (!value) return 'Not scheduled'
  if (!timeZone) return 'Facility time unavailable'
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    timeZoneName: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

export async function ReportsPage() {
  const reportResponse = await getPracticeReportData(30)
  const report = reportResponse.success ? reportResponse.data : null

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Reports' },
  ]

  const header = (
    <WardHeader
      title="Reports"
      meta={<span className="tabular-nums text-xs ">Last 30 days</span>}
      actions={
        <Actions>
          <Pill asChild size="sm"><Link href="/dashboard/platform/appointments">Appointments</Link></Pill>
          <Pill asChild size="sm"><Link href="/dashboard/platform/intake">Intake</Link></Pill>
          <Pill asChild size="sm"><Link href="/dashboard/platform/patients">Patients</Link></Pill>
        </Actions>
      }
    />
  )

  if (!report) {
    const permissionDenied = !reportResponse.success && reportResponse.error.startsWith('REPORT_PERMISSION_DENIED:')
    return (
      <PageContainer title="Reports" header={header} breadcrumbs={breadcrumbs}>
        <WardBody>
          <Notice role="alert" tone={permissionDenied ? 'warn' : 'bad'}>
            {permissionDenied
              ? 'Reporting is unavailable for this role. Complete operational reports require report access plus the underlying appointment, patient, intake, communication, and inventory scopes. No zero metrics are being inferred.'
              : 'Failed to load practice reporting data. No zero metrics or empty queues are being inferred.'}
          </Notice>
        </WardBody>
      </PageContainer>
    )
  }

  const completed = report.appointmentCounts.completed || 0
  const noShows = report.appointmentCounts.no_show || 0
  const cancelled = report.appointmentCounts.cancelled || 0
  const activeAppointments =
    (report.appointmentCounts.requested || 0) +
    (report.appointmentCounts.confirmed || 0) +
    (report.appointmentCounts.checked_in || 0) +
    (report.appointmentCounts.in_visit || 0)
  const intakeReady =
    (report.intakeCounts.submitted || 0) +
    (report.intakeCounts.needs_review || 0) +
    (report.intakeCounts.reviewed || 0)
  const intakeCompletion = percent(intakeReady, report.intakeCounts.all || 0)
  const communicationFollowup = (report.messageCounts.manual_required || 0) + (report.messageCounts.queued || 0) + (report.messageCounts.failed || 0)

  return (
    <PageContainer title="Reports" header={header} breadcrumbs={breadcrumbs}>
      <WardBody>
        <WardSection title="Appointments and follow-up" id="reports-headline">
          <ReadoutStrip>
            <MetricCard
              title="Appointments"
              value={report.appointmentCounts.all || 0}
              description={`${activeAppointments} active · ${completed} completed`}
              icon={CalendarClock}
            />
            <MetricCard
              title="No-show / cancelled"
              value={`${noShows}/${cancelled}`}
              description={`${percent(noShows, report.appointmentCounts.all || 0)} no-show rate`}
              icon={Activity}
              tone={noShows > 0 ? 'warning' : 'good'}
            />
            <MetricCard
              title="Intake completion"
              value={intakeCompletion}
              description={`${report.intakeCounts.needs_review || 0} awaiting staff review`}
              icon={ClipboardCheck}
              tone={(report.intakeCounts.needs_review || 0) > 0 ? 'warning' : 'good'}
            />
            <MetricCard
              title="Communication follow-up"
              value={communicationFollowup}
              description={`${report.messageCounts.manual_required || 0} manual · ${report.messageCounts.queued || 0} queued · ${report.messageCounts.failed || 0} failed`}
              icon={MailWarning}
              tone={communicationFollowup > 0 ? 'warning' : 'good'}
            />
          </ReadoutStrip>
        </WardSection>

        <WardSection title="Operations" id="reports-operations">
          <ReadoutStrip>
            <MetricCard title="Active care queue" value={report.operational.activeQueue} description={`${report.operational.currentAdmissions} current admissions`} icon={Activity} tone={report.operational.activeQueue > 0 ? 'warning' : 'good'} />
            <MetricCard title="Unavailable beds" value={report.operational.unavailableBeds} description="Occupied, reserved, cleaning, or out of service" icon={BedDouble} />
            <MetricCard title="Open fulfillment" value={report.operational.openOrders} description={`${report.operational.openClaims} open claims · ${report.operational.lowStockItems} low stock`} icon={Boxes} />
            <MetricCard title="Delivery exceptions" value={report.operational.retryEvents + report.operational.deadLetterEvents} description={`${report.operational.retryEvents} retry · ${report.operational.deadLetterEvents} dead letter`} icon={Cable} tone={report.operational.deadLetterEvents > 0 ? 'warning' : 'good'} />
          </ReadoutStrip>
        </WardSection>

        <WardSection title="Provider appointment completion" count={report.providerCompletion.length} id="reports-providers">
          {report.providerCompletion.length === 0 ? (
            <EmptyBoard title="No provider appointments in this reporting range." />
          ) : (
            <Board>
              {report.providerCompletion.map((provider) => (
                <BoardRow
                  key={provider.providerId}
                  tone={provider.completionRate >= 80 ? 'ok' : provider.completionRate >= 50 ? 'warn' : 'bad'}
                  title={provider.providerName}
                  meta={<>
                    <span>{provider.specialty || 'Provider'}</span>
                    <span className="tabular-nums">{provider.appointmentCount} appointments</span>
                    <span className="tabular-nums">{provider.completedCount} completed</span>
                    <span className="tabular-nums">{provider.noShowCount} no-show</span>
                  </>}
                  aside={<span className="flex items-center gap-3">
                    <Meter value={Math.min(100, provider.completionRate) / 100} label={`${provider.providerName} completion`} />
                    <span className="w-12 text-right tabular-nums text-sm font-semibold ">{provider.completionRate}%</span>
                  </span>}
                />
              ))}
            </Board>
          )}
        </WardSection>

        <div className="grid min-w-0 gap-6 xl:grid-cols-3">
          <ReportList
            title="Upcoming appointments"
            emptyText="No active appointments queued."
            items={report.upcomingAppointments}
            renderItem={(appointment) => (
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{appointment.patient?.displayName || 'Patient'} · {appointment.appointmentType?.name || 'Visit'}</p>
                <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                  <span>{formatDateTime(appointment.startsAt, appointment.facility?.timeZone)}</span>
                  <span>{appointment.provider?.displayName || 'No provider'}</span>
                  <StatusTag status={appointment.status} />
                </p>
              </div>
            )}
          />
          <ReportList
            title="Intake needing review"
            emptyText="No submitted intake forms need review."
            items={report.intakeNeedsReview}
            renderItem={(intake) => (
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{intake.patient?.displayName || 'Patient'} · {intake.title}</p>
                <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                  <StatusTag status={intake.status} />
                  <span>{formatDateTime(intake.submittedAt || intake.appointment?.startsAt, intake.appointment?.facility?.timeZone)}</span>
                </p>
              </div>
            )}
          />
          <ReportList
            title="Communication tasks"
            emptyText="No manual, queued-integration, or failed communication tasks."
            items={report.queuedMessages}
            renderItem={(message) => (
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{message.subject || 'Patient message'}</p>
                <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                  <span>{message.patient?.displayName || 'Patient'}</span>
                  <span>{message.channel}</span>
                  <StatusTag status={message.status} />
                  <span>{formatDateTime(message.createdAt, message.appointment?.facility?.timeZone)}</span>
                </p>
              </div>
            )}
          />
        </div>
      </WardBody>
    </PageContainer>
  )
}

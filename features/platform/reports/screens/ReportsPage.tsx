import Link from 'next/link'
import { Activity, BedDouble, Boxes, Cable, CalendarClock, ClipboardCheck, MailWarning, Users } from 'lucide-react'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
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
    <div>
      <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Practice reporting</p>
      <h1 className="text-3xl font-semibold tracking-tight">Operational snapshot</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Appointment volume, no-show rate, provider appointment completion, intake readiness, and communication follow-up over the last 30 days.
      </p>
    </div>
  )

  if (!report) {
    const permissionDenied = !reportResponse.success && reportResponse.error.startsWith('REPORT_PERMISSION_DENIED:')
    return (
      <PageContainer title="Reports" header={header} breadcrumbs={breadcrumbs}>
        <div className="p-6">
          <div role="alert" className={`rounded-xl border p-4 text-sm ${permissionDenied ? 'border-amber-300/60 bg-amber-50 text-amber-950' : 'border-destructive/30 bg-destructive/10 text-destructive'}`}>
            {permissionDenied
              ? 'Reporting is unavailable for this role. Complete operational reports require report access plus the underlying appointment, patient, intake, communication, and inventory scopes. No zero metrics are being inferred.'
              : 'Failed to load practice reporting data. No zero metrics or empty queues are being inferred.'}
          </div>
        </div>
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
      <main className="space-y-6 p-4 md:p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
            description={`${report.messageCounts.manual_required || 0} manual · ${report.messageCounts.queued || 0} integration queued · ${report.messageCounts.failed || 0} failed`}
            icon={MailWarning}
            tone={communicationFollowup > 0 ? 'warning' : 'good'}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="Active care queue" value={report.operational.activeQueue} description={`${report.operational.currentAdmissions} current admissions`} icon={Activity} tone={report.operational.activeQueue > 0 ? 'warning' : 'good'} />
          <MetricCard title="Unavailable beds" value={report.operational.unavailableBeds} description="Occupied, reserved, cleaning, or out of service" icon={BedDouble} />
          <MetricCard title="Open fulfillment" value={report.operational.openOrders} description={`${report.operational.openClaims} open claim records · ${report.operational.lowStockItems} low-stock items`} icon={Boxes} />
          <MetricCard title="Delivery exceptions" value={report.operational.retryEvents + report.operational.deadLetterEvents} description={`${report.operational.retryEvents} retry · ${report.operational.deadLetterEvents} dead letter`} icon={Cable} tone={report.operational.deadLetterEvents > 0 ? 'warning' : 'good'} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-xl border bg-card shadow-sm">
            <div className="border-b px-5 py-4">
              <h2 className="text-sm font-semibold">Provider appointment completion</h2>
            </div>
            {report.providerCompletion.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">No provider appointments in this reporting range.</p>
            ) : (
              <div className="divide-y">
                {report.providerCompletion.map((provider) => (
                  <div key={provider.providerId} className="px-5 py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium">{provider.providerName}</p>
                        <p className="text-sm text-muted-foreground">{provider.specialty || 'Provider'} · {provider.appointmentCount} appointments</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold">{provider.completionRate}%</p>
                        <p className="text-xs text-muted-foreground">completion</p>
                      </div>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-blue-600"
                        style={{ width: `${Math.min(100, provider.completionRate)}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{provider.completedCount} completed · {provider.noShowCount} no-show</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
            <Link href="/dashboard/platform/appointments" className="rounded-xl border bg-card p-5 shadow-sm transition hover:border-foreground/30">
              <CalendarClock className="h-5 w-5 text-muted-foreground" />
              <h3 className="mt-3 font-medium">Manage appointments</h3>
              <p className="mt-1 text-sm text-muted-foreground">Confirm requests, check in patients, and close visits.</p>
            </Link>
            <Link href="/dashboard/platform/intake" className="rounded-xl border bg-card p-5 shadow-sm transition hover:border-foreground/30">
              <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
              <h3 className="mt-3 font-medium">Review intake</h3>
              <p className="mt-1 text-sm text-muted-foreground">Prepare appointments by reviewing submitted forms.</p>
            </Link>
            <Link href="/dashboard/platform/patients" className="rounded-xl border bg-card p-5 shadow-sm transition hover:border-foreground/30">
              <Users className="h-5 w-5 text-muted-foreground" />
              <h3 className="mt-3 font-medium">Patient records</h3>
              <p className="mt-1 text-sm text-muted-foreground">Review patient contact preferences and appointment activity.</p>
            </Link>
          </section>
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <ReportList
            title="Upcoming appointments"
            emptyText="No active appointments queued."
            items={report.upcomingAppointments}
            renderItem={(appointment) => (
              <div>
                <p className="font-medium">{appointment.patient?.displayName || 'Patient'} · {appointment.appointmentType?.name || 'Visit'}</p>
                <p className="text-sm text-muted-foreground">{formatDateTime(appointment.startsAt, appointment.facility?.timeZone)} · {appointment.provider?.displayName || 'No provider'} · {appointment.status}</p>
              </div>
            )}
          />
          <ReportList
            title="Intake needing review"
            emptyText="No submitted intake forms need review."
            items={report.intakeNeedsReview}
            renderItem={(intake) => (
              <div>
                <p className="font-medium">{intake.patient?.displayName || 'Patient'} · {intake.title}</p>
                <p className="text-sm text-muted-foreground">{intake.status} · {formatDateTime(intake.submittedAt || intake.appointment?.startsAt, intake.appointment?.facility?.timeZone)}</p>
              </div>
            )}
          />
          <ReportList
            title="Communication tasks"
            emptyText="No manual, queued-integration, or failed communication tasks."
            items={report.queuedMessages}
            renderItem={(message) => (
              <div>
                <p className="font-medium">{message.subject || 'Patient message'}</p>
                <p className="text-sm text-muted-foreground">{message.patient?.displayName || 'Patient'} · {message.channel} · {message.status.replaceAll('_', ' ')} · {formatDateTime(message.createdAt, message.appointment?.facility?.timeZone)}</p>
              </div>
            )}
          />
        </div>
      </main>
    </PageContainer>
  )
}

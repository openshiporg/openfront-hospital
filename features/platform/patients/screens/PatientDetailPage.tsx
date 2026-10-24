import Link from 'next/link'
import { ClipboardList, DoorOpen, Stethoscope, UserPlus } from 'lucide-react'

import { PageContainer } from '@/features/dashboard/components/PageContainer'
import {
  BoardRow,
  Code,
  Facts,
  Notice,
  Pill,
  Readout,
  ReadoutStrip,
  StatusTag,
  Track,
  WardBody,
  WardHeader,
  WardSection,
  Wristband,
  type WardTone,
} from '@/features/platform/components/ward'
import { getPatientBilling, getPatientChart, getPatientEncounters, getPatientViewerRole } from '../actions/patientChart'
import { ChartSection, formatDate, formatDateTime, humanize } from '../components/ChartSection'
import type { PatientChart, ViewerRole } from '../types'

const ACTIVE_APPOINTMENT = new Set(['requested', 'confirmed', 'checked_in', 'in_visit'])
const OPEN_INTAKE = new Set(['not_sent', 'sent', 'in_progress', 'submitted', 'needs_review'])

const patientTone: Record<string, WardTone> = { active: 'ok', inactive: 'idle', archived: 'idle' }

const decisionTone: Record<string, WardTone> = { granted: 'ok', declined: 'bad', withdrawn: 'warn' }

function can(role: ViewerRole | null, ...flags: Array<keyof ViewerRole>): boolean | undefined {
  if (!role) return undefined
  return flags.some(flag => role[flag] === true)
}

function phiValue(value: string | null | undefined, phiReadable: boolean | undefined) {
  if (value) return value
  if (phiReadable === false) return <span className="text-muted-foreground">Restricted</span>
  if (phiReadable === undefined) return <span className="text-muted-foreground">Not available</span>
  return <span className="text-muted-foreground">Not recorded</span>
}

function money(cents?: number | null, currency?: string | null) {
  if (typeof cents !== 'number') return null
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency || ''}`.trim()
  }
}

function search(path: string, params: Record<string, string | null | undefined>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value)
  return `${path}${query.size ? `?${query}` : ''}`
}

function sortAppointments(appointments: NonNullable<PatientChart['appointments']>) {
  const now = Date.now()
  const upcoming = appointments
    .filter(item => item.startsAt && new Date(item.startsAt).getTime() >= now && ACTIVE_APPOINTMENT.has(item.status || ''))
    .sort((a, b) => new Date(a.startsAt || 0).getTime() - new Date(b.startsAt || 0).getTime())
  const upcomingIds = new Set(upcoming.map(item => item.id))
  const rest = appointments.filter(item => !upcomingIds.has(item.id))
  return { upcoming, rest }
}

export async function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params
  const id = decodeURIComponent(rawId).slice(0, 128)
  const [chartResponse, encountersResponse, billingResponse, role] = await Promise.all([
    getPatientChart(id),
    getPatientEncounters(id),
    getPatientBilling(id),
    getPatientViewerRole(),
  ])

  const baseCrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'link' as const, label: 'Patients', href: '/dashboard/platform/patients' },
  ]

  if (!chartResponse.success || !chartResponse.data.patient) {
    const failed = !chartResponse.success
    return (
      <PageContainer
        title="Patient"
        breadcrumbs={[...baseCrumbs, { type: 'page', label: 'Patient' }]}
        header={<WardHeader title="Patient" tone={failed ? 'bad' : 'idle'} status={failed ? 'Unavailable' : 'Not found'} />}
      >
        <WardBody>
          <Notice tone={failed ? 'bad' : 'warn'} role={failed ? 'alert' : 'status'}>
            {failed ? 'This chart could not be loaded. Refresh to try again.' : 'Patient not found or not visible to this session.'}
          </Notice>
          <Track><Pill asChild><Link href="/dashboard/platform/patients">Back to patients</Link></Pill></Track>
        </WardBody>
      </PageContainer>
    )
  }

  const patient = chartResponse.data.patient
  const phi = can(role, 'canManagePatients', 'canManageAppointments', 'canManageIntake', 'canManageCommunications', 'canManageBilling', 'canManageDataPortability', 'canManageRetention')
  const canManagePatients = can(role, 'canManagePatients')
  const canReadConsents = can(role, 'canManageIntake', 'canManagePatients', 'canAccessAllClinicalData')
  const canReadBilling = can(role, 'canManageBilling')
  const known = role ? true : undefined

  const identifiers = patient.identifiers || []
  const mrn = identifiers.find(item => item.status === 'active' && item.identifierType === 'mrn') || identifiers.find(item => item.status === 'active')
  const name = patient.displayName || (phi === false ? 'Restricted patient' : 'Patient')
  const appointments = patient.appointments || []
  const { upcoming, rest } = sortAppointments(appointments)
  const intakeForms = patient.intakeForms || []
  const messages = patient.messages || []
  const consents = patient.consents || []
  const registrations = patient.registrations || []
  const facilities = patient.facilities || []
  const encounters = encountersResponse.success ? encountersResponse.data.encounters : []
  const billing = billingResponse.success ? billingResponse.data : null
  const nextAppointment = upcoming[0]
  const openIntake = intakeForms.filter(item => OPEN_INTAKE.has(item.status || '')).length
  const openEncounters = encounters.filter(item => item.status === 'open' || item.status === 'in_progress').length
  const status = patient.status || 'unknown'

  return (
    <PageContainer
      title={name}
      breadcrumbs={[...baseCrumbs, { type: 'page', label: name }]}
      header={
        <WardHeader
          eyebrow="Patient chart"
          title={name}
          tone={patientTone[status] || 'idle'}
          status={humanize(status) || 'Unknown'}
          meta={
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <Wristband
                name={name}
                identifier={mrn?.maskedValue ? `MRN ${mrn.maskedValue}` : canManagePatients === false ? 'MRN restricted' : 'No active MRN'}
                detail={formatDate(patient.dateOfBirth) ? `DOB ${formatDate(patient.dateOfBirth)}` : undefined}
              />
              <StatusTag status={status} tone={patientTone[status] || 'idle'} />
            </span>
          }
          actions={
            <Track>
              <Pill asChild size="sm"><Link href="/dashboard/platform/registration"><UserPlus aria-hidden />Register</Link></Pill>
              <Pill asChild size="sm"><Link href="/dashboard/platform/encounters"><Stethoscope aria-hidden />Open encounter</Link></Pill>
              <Pill asChild size="sm" variant="primary"><Link href="/dashboard/platform/care-queue"><DoorOpen aria-hidden />Record arrival</Link></Pill>
            </Track>
          }
        />
      }
    >
      <WardBody>
        {!role && <Notice tone="warn">Session permissions could not be verified. Restricted fields show as not available.</Notice>}

        <ReadoutStrip>
          <Readout
            label="Next visit"
            tone={nextAppointment ? 'info' : 'idle'}
            value={nextAppointment ? formatDate(nextAppointment.startsAt, nextAppointment.facility?.timeZone) : 'None'}
            sub={nextAppointment ? `${nextAppointment.appointmentNumber || 'No reference'} · ${humanize(nextAppointment.status)}` : undefined}
          />
          <Readout label="Appointments" value={patient.appointmentsCount ?? appointments.length} />
          <Readout label="Open encounters" tone={openEncounters ? 'info' : 'idle'} value={encountersResponse.success ? openEncounters : '—'} />
          <Readout label="Open intake" tone={openIntake ? 'warn' : 'idle'} value={openIntake} />
        </ReadoutStrip>

        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          <WardSection id="demographics" title="Demographics">
            <Facts
              items={[
                { label: 'Name', value: phiValue(patient.displayName, phi) },
                { label: 'Date of birth', value: phiValue(formatDate(patient.dateOfBirth), phi), mono: true },
                { label: 'Status', value: <StatusTag status={status} tone={patientTone[status] || 'idle'} /> },
                { label: 'Email', value: phiValue(patient.email, phi) },
                { label: 'Phone', value: phiValue(patient.phone, phi), mono: true },
                { label: 'Preferred contact', value: phiValue(humanize(patient.preferredContactMethod), phi) },
                { label: 'Emergency contact', value: phiValue(patient.emergencyContactName, phi) },
                { label: 'Emergency phone', value: phiValue(patient.emergencyContactPhone, phi), mono: true },
                { label: 'On record since', value: formatDate(patient.createdAt) || 'Not recorded', mono: true },
              ]}
            />
            {(patient.notes || phi !== true) && (
              <div className="mt-3 rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Notes</p>
                <p className="mt-1 whitespace-pre-wrap break-words">{phiValue(patient.notes, phi)}</p>
              </div>
            )}
          </WardSection>

          <div className="flex min-w-0 flex-col gap-6">
            <ChartSection
              id="identifiers"
              title="Identifiers"
              count={patient.identifiersCount}
              shown={identifiers.length}
              readable={canManagePatients}
              restrictedLabel="Identifiers require patient management access."
              emptyLabel="No identifiers"
            >
              {identifiers.map(item => (
                <BoardRow
                  key={item.id}
                  tone={item.status === 'active' ? 'ok' : 'idle'}
                  status={item.status || undefined}
                  title={<Code className="text-foreground">{item.maskedValue || 'Masked value unavailable'}</Code>}
                  meta={<>
                    <span>{item.identifierType === 'mrn' ? 'MRN' : humanize(item.identifierType)}</span>
                    <span>{item.facility?.name || 'Facility not visible'}</span>
                    <span className="tabular-nums">{formatDate(item.createdAt)}</span>
                  </>}
                  aside={<StatusTag status={item.status} />}
                />
              ))}
            </ChartSection>

            <ChartSection
              id="facilities"
              title="Facilities"
              shown={facilities.length}
              readable={known}
              restrictedLabel=""
              emptyLabel="No visible facilities"
            >
              {facilities.map(item => (
                <BoardRow
                  key={item.id}
                  title={item.name || 'Unnamed facility'}
                  meta={[item.city, item.region].filter(Boolean).length ? <span>{[item.city, item.region].filter(Boolean).join(', ')}</span> : undefined}
                />
              ))}
            </ChartSection>
          </div>
        </div>

        <ChartSection
          id="appointments"
          title="Appointments"
          count={patient.appointmentsCount}
          shown={appointments.length}
          readable={known}
          restrictedLabel=""
          emptyLabel="No visible appointments"
          actions={<Track><Pill asChild size="sm" variant="plain"><Link href="/dashboard/platform/appointments">All appointments</Link></Pill></Track>}
        >
          {[...upcoming, ...rest].map(item => {
            const isUpcoming = upcoming.includes(item)
            return (
              <BoardRow
                key={item.id}
                status={humanize(item.status) || undefined}
                title={
                  <Link
                    href={search('/dashboard/platform/appointments', { view: 'all', search: item.appointmentNumber })}
                    className="rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {formatDateTime(item.startsAt, item.facility?.timeZone) || 'Time not recorded'}
                  </Link>
                }
                meta={<>
                  <Code>{item.appointmentNumber || 'No reference'}</Code>
                  {isUpcoming && <span className="font-medium text-sky-700 dark:text-sky-300">Upcoming</span>}
                  <span>{item.appointmentType?.name || 'Visit type not visible'}</span>
                  <span>{item.provider?.displayName || 'Provider not visible'}</span>
                  <span>{item.facility?.name || 'Facility not visible'}</span>
                </>}
                aside={<StatusTag status={item.status} />}
              />
            )
          })}
        </ChartSection>

        <ChartSection
          id="encounters"
          title="Encounters"
          count={encountersResponse.success ? encountersResponse.data.encountersCount : undefined}
          shown={encounters.length}
          failed={!encountersResponse.success}
          readable={known}
          restrictedLabel=""
          emptyLabel="No visible encounters"
        >
          {encounters.map(item => (
            <BoardRow
              key={item.id}
              status={humanize(item.status) || undefined}
              title={
                <Link
                  href={search('/dashboard/platform/encounters', { encounterId: item.id })}
                  className="rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {item.encounterNumber || 'No reference'}
                </Link>
              }
              meta={<>
                <span className="tabular-nums">{formatDateTime(item.startedAt || item.createdAt, item.facility?.timeZone) || 'Start not recorded'}</span>
                {item.endedAt && <span className="tabular-nums">Ended {formatDateTime(item.endedAt, item.facility?.timeZone)}</span>}
                <span>{item.provider?.displayName || 'Provider not visible'}</span>
                <span>{item.facility?.name || 'Facility not visible'}</span>
              </>}
              aside={<StatusTag status={item.status} />}
            />
          ))}
        </ChartSection>

        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          <ChartSection
            id="intake"
            title="Intake forms"
            count={patient.intakeFormsCount}
            shown={intakeForms.length}
            readable={known}
            restrictedLabel=""
            emptyLabel="No visible intake forms"
            actions={<Track><Pill asChild size="sm" variant="plain"><Link href="/dashboard/platform/intake">Intake</Link></Pill></Track>}
          >
            {intakeForms.map(item => (
              <BoardRow
                key={item.id}
                title={
                  <Link
                    href={search('/dashboard/platform/intake', { view: 'all', search: item.appointment?.appointmentNumber })}
                    className="rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {item.title || 'Intake form'}
                  </Link>
                }
                meta={<>
                  {item.appointment?.appointmentNumber && <Code>{item.appointment.appointmentNumber}</Code>}
                  {item.submittedAt
                    ? <span className="tabular-nums">Submitted {formatDate(item.submittedAt, item.facility?.timeZone)}</span>
                    : <span className="tabular-nums">Issued {formatDate(item.createdAt, item.facility?.timeZone)}</span>}
                  {item.reviewedAt && <span className="tabular-nums">Reviewed {formatDate(item.reviewedAt, item.facility?.timeZone)}</span>}
                </>}
                aside={<StatusTag status={item.status} />}
              />
            ))}
          </ChartSection>

          <ChartSection
            id="messages"
            title="Messages"
            count={patient.messagesCount}
            shown={messages.length}
            readable={known}
            restrictedLabel=""
            emptyLabel="No visible messages"
            actions={<Track><Pill asChild size="sm" variant="plain"><Link href="/dashboard/platform/communications?status=all">Communications</Link></Pill></Track>}
          >
            {messages.map(item => (
              <BoardRow
                key={item.id}
                title={
                  <Link
                    href={search('/dashboard/platform/communications', { status: 'all', search: item.appointment?.appointmentNumber })}
                    className="rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {item.subject || `${humanize(item.direction) || 'Message'} ${humanize(item.channel)?.toLowerCase() || ''}`.trim()}
                  </Link>
                }
                meta={<>
                  <span>{humanize(item.channel)}</span>
                  <span>{humanize(item.purpose)}</span>
                  {item.appointment?.appointmentNumber && <Code>{item.appointment.appointmentNumber}</Code>}
                  <span className="tabular-nums">{formatDate(item.sentAt || item.createdAt, item.facility?.timeZone)}</span>
                </>}
                aside={<StatusTag status={item.status} />}
              />
            ))}
          </ChartSection>
        </div>

        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          <ChartSection
            id="consents"
            title="Consents"
            count={patient.consentsCount}
            shown={consents.length}
            readable={canReadConsents}
            restrictedLabel="Consents require intake or patient management access."
            emptyLabel="No consent decisions"
          >
            {consents.map(item => (
              <BoardRow
                key={item.id}
                tone={decisionTone[item.decision || ''] || 'idle'}
                status={humanize(item.decision) || undefined}
                title={humanize(item.consentType) || 'Consent'}
                meta={<>
                  <span>Policy <Code>{item.policyVersion || 'unknown'}</Code></span>
                  <span>{humanize(item.captureMethod)}</span>
                  <span className="tabular-nums">{formatDate(item.effectiveAt, item.facility?.timeZone)}</span>
                </>}
                aside={<StatusTag status={item.decision} tone={decisionTone[item.decision || ''] || 'idle'} />}
              />
            ))}
          </ChartSection>

          <ChartSection
            id="registrations"
            title="Registrations"
            count={patient.registrationsCount}
            shown={registrations.length}
            readable={canManagePatients}
            restrictedLabel="Registrations require patient management access."
            emptyLabel="No registrations"
            actions={<Track><Pill asChild size="sm" variant="plain"><Link href="/dashboard/platform/registration">Registration</Link></Pill></Track>}
          >
            {registrations.map(item => (
              <BoardRow
                key={item.id}
                title={item.facility?.name || 'Facility not visible'}
                meta={<>
                  {item.identifier?.maskedValue && <Code>{item.identifier.maskedValue}</Code>}
                  <span>{humanize(item.duplicateResolution) || 'Resolution not visible'}</span>
                  <span className="tabular-nums">{formatDate(item.createdAt, item.facility?.timeZone)}</span>
                </>}
                aside={<StatusTag status={item.status} />}
              />
            ))}
          </ChartSection>
        </div>

        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          <ChartSection
            id="coverage"
            title="Coverage"
            count={billing?.patientCoveragesCount}
            shown={billing?.patientCoverages.length || 0}
            failed={!billingResponse.success}
            readable={canReadBilling}
            restrictedLabel="Coverage requires billing access."
            emptyLabel="No coverage records"
          >
            {(billing?.patientCoverages || []).map(item => (
              <BoardRow
                key={item.id}
                title={item.payerName || <span className="text-muted-foreground">Payer restricted</span>}
                meta={<>
                  <Code>{item.coverageNumber || 'No reference'}</Code>
                  {item.effectiveAt && <span className="tabular-nums">From {formatDate(item.effectiveAt, item.facility?.timeZone)}</span>}
                  {item.terminatesAt && <span className="tabular-nums">Until {formatDate(item.terminatesAt, item.facility?.timeZone)}</span>}
                  <span>{item.facility?.name || 'Facility not visible'}</span>
                </>}
                aside={<StatusTag status={item.status} />}
              />
            ))}
          </ChartSection>

          <ChartSection
            id="payments"
            title="Payments"
            count={billing?.patientPaymentsCount}
            shown={billing?.patientPayments.length || 0}
            failed={!billingResponse.success}
            readable={canReadBilling}
            restrictedLabel="Payments require billing access."
            emptyLabel="No payments"
          >
            {(billing?.patientPayments || []).map(item => (
              <BoardRow
                key={item.id}
                title={money(item.amountCents, item.currency) || <span className="text-muted-foreground">Amount restricted</span>}
                meta={<>
                  <Code>{item.paymentNumber || 'No reference'}</Code>
                  <span>{humanize(item.method)}</span>
                  <span className="tabular-nums">{formatDate(item.receivedAt || item.createdAt, item.facility?.timeZone)}</span>
                </>}
                aside={<StatusTag status={item.status} />}
              />
            ))}
          </ChartSection>
        </div>

        <Track>
          <Pill asChild size="sm" variant="plain"><Link href={`/dashboard/patients/${patient.id}`}><ClipboardList aria-hidden />Admin record</Link></Pill>
        </Track>
      </WardBody>
    </PageContainer>
  )
}

export default PatientDetailPage

import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { WorkspaceLoadError } from '@/features/platform/components/WorkspaceLoadError'
import {
  Board,
  BoardRow,
  Code,
  EmptyBoard,
  Facts,
  Panel,
  Pill,
  StatusTag,
  Track,
  WardBody,
  WardHeader,
  WardSection,
  statusLabel,
  type WardTone,
} from '@/features/platform/components/ward'
import { getProviderDetail } from '../actions/queries'
import { CLINICIAN_TYPES, providerStatusLabel, providerTone } from '../actions/types'
import { ProviderSheet } from '../components/ProviderSheet'
import { ClinicianActiveToggle, ClinicianSheet } from '../components/ClinicianControls'

type Params = Promise<{ id: string }>

const blockTone: Record<string, WardTone> = { available: 'ok', unavailable: 'bad', on_call: 'info', admin_time: 'idle' }
const visitTone: Record<string, WardTone> = { bookable: 'ok', internal: 'info', paused: 'warn' }

function formatDateTime(value: string, timeZone?: string | null) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timeZone || undefined,
    timeZoneName: 'short',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

export async function ProviderDetailPage({ params }: { params: Params }) {
  const { id } = await params
  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'link' as const, label: 'Providers', href: '/dashboard/platform/providers' },
    { type: 'page' as const, label: 'Provider' },
  ]
  const response = await getProviderDetail(id)
  if (!response.success) {
    return <WorkspaceLoadError title="Provider" description="Provider details, visit types, schedule, or clinician records may be unavailable for this session." breadcrumbs={breadcrumbs} />
  }
  const { provider, facilities, appointmentTypes, departments } = response.data
  if (!provider) notFound()

  const name = provider.displayName || `${provider.firstName ?? ''} ${provider.lastName ?? ''}`.trim() || 'Unnamed provider'
  const visitTypes = provider.appointmentTypes ?? []
  const blocks = provider.scheduleBlocks ?? []
  const appointments = provider.appointments ?? []
  const clinicians = provider.clinicians ?? []
  breadcrumbs[3] = { type: 'page' as const, label: name }

  return (
    <PageContainer
      title={name}
      breadcrumbs={breadcrumbs}
      header={
        <WardHeader
          title={name}
          tone={providerTone(provider.status)}
          status={providerStatusLabel(provider.status)}
          meta={[providerStatusLabel(provider.status), provider.specialty].filter(Boolean).join(' · ')}
          actions={
            <ProviderSheet
              mode="edit"
              providerId={provider.id}
              facilities={facilities}
              appointmentTypes={appointmentTypes}
              initial={{
                firstName: provider.firstName ?? '',
                lastName: provider.lastName ?? '',
                credentials: provider.credentials ?? '',
                specialty: provider.specialty ?? '',
                bio: provider.bio ?? '',
                locationName: provider.locationName ?? '',
                status: provider.status ?? 'active',
                facilityIds: (provider.facilities ?? []).map((f) => f.id),
                appointmentTypeIds: visitTypes.map((t) => t.id),
              }}
            />
          }
        />
      }
    >
      <WardBody>
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <WardSection title="Profile">
            <Panel className="px-4">
              <Facts
                items={[
                  { label: 'First name', value: provider.firstName || '—' },
                  { label: 'Last name', value: provider.lastName || '—' },
                  { label: 'Credentials', value: provider.credentials || '—', mono: Boolean(provider.credentials) },
                  { label: 'Specialty', value: provider.specialty || '—' },
                  { label: 'Primary location', value: provider.locationName || '—' },
                  { label: 'Facilities', value: (provider.facilities ?? []).map((f) => f.name).filter(Boolean).join(', ') || 'None' },
                ]}
              />
              {provider.bio && <p className="whitespace-pre-line border-t py-3 text-sm text-foreground">{provider.bio}</p>}
            </Panel>
          </WardSection>

          <WardSection title="Visit types" count={visitTypes.length}>
            {visitTypes.length === 0 ? (
              <EmptyBoard title="No visit types offered" />
            ) : (
              <Board>
                {visitTypes.map((t) => (
                  <BoardRow
                    key={t.id}
                    tone={visitTone[t.status ?? ''] ?? 'idle'}
                    status={statusLabel(t.status)}
                    title={<Link href={`/dashboard/platform/visit-types/${t.id}`} className="hover:underline">{t.name || 'Unnamed visit type'}</Link>}
                    meta={<><span>{t.durationMinutes ?? 0} min</span><span>{t.formattedPrice}</span><span>{t.status === 'internal' ? 'Internal only' : statusLabel(t.status)}</span></>}
                  />
                ))}
              </Board>
            )}
          </WardSection>
        </div>

        <WardSection
          title="Upcoming schedule"
          count={blocks.length}
          actions={<Track><Pill asChild size="sm" variant="plain"><Link href={`/dashboard/platform/schedules?search=${encodeURIComponent(provider.lastName ?? '')}`}>All schedules</Link></Pill></Track>}
        >
          {blocks.length === 0 ? (
            <EmptyBoard title="No upcoming schedule blocks" />
          ) : (
            <Board>
              {blocks.map((b) => (
                <BoardRow
                  key={b.id}
                  tone={blockTone[b.blockType ?? ''] ?? 'idle'}
                  status={statusLabel(b.blockType)}
                  title={formatDateTime(b.startsAt, b.facility?.timeZone)}
                  meta={<><span>{statusLabel(b.blockType)}</span><span>Ends {formatDateTime(b.endsAt, b.facility?.timeZone)}</span>{b.facility?.name && <span>{b.facility.name}</span>}{b.locationName && <span>{b.locationName}</span>}</>}
                />
              ))}
            </Board>
          )}
        </WardSection>

        <WardSection
          title="Upcoming appointments"
          count={appointments.length}
          actions={<Track><Pill asChild size="sm" variant="plain"><Link href={`/dashboard/platform/appointments?view=upcoming&search=${encodeURIComponent(provider.lastName ?? '')}`}>All appointments</Link></Pill></Track>}
        >
          {appointments.length === 0 ? (
            <EmptyBoard title="No upcoming appointments" />
          ) : (
            <Board>
              {appointments.map((a) => (
                <BoardRow
                  key={a.id}
                  title={formatDateTime(a.startsAt, a.facility?.timeZone)}
                  meta={<><Code>{a.appointmentNumber}</Code>{a.appointmentType?.name && <span>{a.appointmentType.name}</span>}{a.facility?.name && <span>{a.facility.name}</span>}</>}
                  aside={<><StatusTag status={a.status} /><Track><Pill asChild size="sm"><Link href={`/dashboard/appointments/${a.id}`}>Open</Link></Pill></Track></>}
                />
              ))}
            </Board>
          )}
        </WardSection>

        <WardSection title="Clinician records" count={clinicians.length} actions={<ClinicianSheet providerId={provider.id} departments={departments} />}>
          {clinicians.length === 0 ? (
            <EmptyBoard title="No clinician records" />
          ) : (
            <Board>
              {clinicians.map((c) => (
                <BoardRow
                  key={c.id}
                  tone={c.active ? 'ok' : 'idle'}
                  status={c.active ? 'Active' : 'Inactive'}
                  title={c.displayName || 'Unnamed clinician'}
                  meta={
                    <>
                      <span>{CLINICIAN_TYPES.find((t) => t.value === c.clinicianType)?.label ?? statusLabel(c.clinicianType)}</span>
                      {c.department?.name && <span>{c.department.name}</span>}
                      {c.licenseNumber && <Code>{c.licenseNumber}</Code>}
                      {c.email && <span>{c.email}</span>}
                      {c.phone && <span>{c.phone}</span>}
                    </>
                  }
                  aside={
                    <Track>
                      <ClinicianSheet providerId={provider.id} clinician={c} departments={departments} />
                      <ClinicianActiveToggle providerId={provider.id} clinicianId={c.id} active={Boolean(c.active)} />
                    </Track>
                  }
                />
              ))}
            </Board>
          )}
        </WardSection>
      </WardBody>
    </PageContainer>
  )
}

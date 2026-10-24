import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ExternalLink } from 'lucide-react'

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
} from '@/features/platform/components/ward'
import { providerStatusLabel, providerTone } from '@/features/platform/providers/actions/types'
import { getVisitTypeDetail } from '../actions/queries'
import { INTAKE_SECTIONS, formatCents, visitStatusLabel, visitTone, type VisitAppointment } from '../actions/types'
import { VisitTypeSheet, VisitTypeStatusPills } from '../components/VisitTypeSheet'

type Params = Promise<{ id: string }>

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

function intakeSections(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const sections = (value as { sections?: unknown }).sections
  return Array.isArray(sections) ? sections.filter((s): s is string => typeof s === 'string') : []
}

function AppointmentBoard({ items, empty }: { items: VisitAppointment[]; empty: string }) {
  if (items.length === 0) return <EmptyBoard title={empty} />
  return (
    <Board>
      {items.map((a) => (
        <BoardRow
          key={a.id}
          title={formatDateTime(a.startsAt, a.facility?.timeZone)}
          meta={
            <>
              <Code>{a.appointmentNumber}</Code>
              {a.provider?.displayName && <Link href={`/dashboard/platform/providers/${a.provider.id}`} className="hover:underline">{a.provider.displayName}</Link>}
              {a.facility?.name && <span>{a.facility.name}</span>}
            </>
          }
          aside={<><StatusTag status={a.status} /><Track><Pill asChild size="sm"><Link href={`/dashboard/appointments/${a.id}`}>Open</Link></Pill></Track></>}
        />
      ))}
    </Board>
  )
}

export async function VisitTypeDetailPage({ params }: { params: Params }) {
  const { id } = await params
  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'link' as const, label: 'Visit types', href: '/dashboard/platform/visit-types' },
    { type: 'page' as const, label: 'Visit type' },
  ]
  const response = await getVisitTypeDetail(id)
  if (!response.success) {
    return <WorkspaceLoadError title="Visit type" description="Visit type details, providers, or appointments may be unavailable for this session." breadcrumbs={breadcrumbs} />
  }
  const { visitType: t, providers } = response.data
  if (!t) notFound()

  const name = t.name || 'Unnamed visit type'
  breadcrumbs[3] = { type: 'page' as const, label: name }
  const sections = intakeSections(t.intakeRequirements)
  const linkedProviders = t.providers ?? []
  const upcoming = t.upcoming ?? []
  const recent = t.recent ?? []

  return (
    <PageContainer
      title={name}
      breadcrumbs={breadcrumbs}
      header={
        <WardHeader
          title={name}
          tone={visitTone(t.status)}
          status={visitStatusLabel(t.status)}
          meta={<span className="flex flex-wrap gap-x-3"><span>{visitStatusLabel(t.status)}</span><Code>/{t.slug}</Code></span>}
          actions={
            <>
              {t.status === 'bookable' && t.slug && (
                <Track>
                  <Pill asChild variant="plain">
                    <a href={`/book/${encodeURIComponent(t.slug)}`} target="_blank" rel="noreferrer"><ExternalLink aria-hidden />Public page</a>
                  </Pill>
                </Track>
              )}
              <VisitTypeSheet
                mode="edit"
                visitTypeId={t.id}
                providers={providers}
                initial={{
                  name: t.name ?? '',
                  slug: t.slug ?? '',
                  description: t.description ?? '',
                  durationMinutes: t.durationMinutes ?? 30,
                  bufferBeforeMinutes: t.bufferBeforeMinutes ?? 0,
                  bufferAfterMinutes: t.bufferAfterMinutes ?? 0,
                  priceCents: t.priceCents ?? 0,
                  intakeSections: sections,
                  status: t.status ?? 'bookable',
                  providerIds: linkedProviders.map((p) => p.id),
                }}
              />
            </>
          }
        />
      }
    >
      <WardBody>
        <VisitTypeStatusPills visitTypeId={t.id} status={t.status} />

        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <WardSection title="Details">
            <Panel className="px-4">
              <Facts
                items={[
                  { label: 'Duration', value: `${t.durationMinutes ?? 0} min`, mono: true },
                  { label: 'Buffer before', value: `${t.bufferBeforeMinutes ?? 0} min`, mono: true },
                  { label: 'Buffer after', value: `${t.bufferAfterMinutes ?? 0} min`, mono: true },
                  { label: 'Price', value: t.formattedPrice ?? formatCents(t.priceCents), mono: true },
                  { label: 'Upcoming appointments', value: t.upcomingCount ?? 0, mono: true },
                  {
                    label: 'Intake sections',
                    value: sections.length ? sections.map((s) => INTAKE_SECTIONS.find((o) => o.value === s)?.label ?? s).join(', ') : 'None',
                  },
                ]}
              />
              {t.description && <p className="whitespace-pre-line border-t py-3 text-sm text-foreground">{t.description}</p>}
            </Panel>
          </WardSection>

          <WardSection title="Providers" count={linkedProviders.length}>
            {linkedProviders.length === 0 ? (
              <EmptyBoard title="No providers offer this visit" />
            ) : (
              <Board>
                {linkedProviders.map((p) => (
                  <BoardRow
                    key={p.id}
                    tone={providerTone(p.status)}
                    status={providerStatusLabel(p.status)}
                    title={<Link href={`/dashboard/platform/providers/${p.id}`} className="hover:underline">{p.displayName || 'Unnamed provider'}</Link>}
                    meta={<><span>{p.specialty || 'No specialty'}</span><span>{providerStatusLabel(p.status)}</span></>}
                  />
                ))}
              </Board>
            )}
          </WardSection>
        </div>

        <WardSection title="Upcoming appointments" count={upcoming.length}>
          <AppointmentBoard items={upcoming} empty="No upcoming appointments" />
        </WardSection>

        <WardSection title="Recent appointments" count={recent.length}>
          <AppointmentBoard items={recent} empty="No past appointments" />
        </WardSection>
      </WardBody>
    </PageContainer>
  )
}

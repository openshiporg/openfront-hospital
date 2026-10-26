import Link from 'next/link'
import { ChevronRight, Search } from 'lucide-react'

import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { BoundedDataNotice } from '@/features/platform/components/BoundedDataNotice'
import { WorkspaceLoadError } from '@/features/platform/components/WorkspaceLoadError'
import {
  Board,
  BoardRow,
  Code,
  EmptyBoard,
  Facts,
  FilterBar,
  Notice,
  Pill,
  Readout,
  ReadoutStrip,
  StatusTag,
  Track,
  WardBody,
  WardHeader,
  WardSection,
  fieldClass,
  toneForStatus,
} from '@/features/platform/components/ward'
import { PatientRegistrationForm } from '../components/PatientRegistrationForm'

type Registration = {
  id: string
  status: string
  duplicateResolution: string
  createdAt: string
  facility?: { id: string; name?: string | null; timeZone?: string | null } | null
  patient?: { id: string; displayName?: string | null; status?: string | null } | null
  identifier?: { id: string; maskedValue?: string | null; status?: string | null } | null
  consent?: { id: string; decision?: string | null; policyVersion?: string | null; effectiveAt?: string | null } | null
  auditLog?: { id: string; eventType?: string | null; occurredAt?: string | null } | null
  createdBy?: { id: string; name?: string | null } | null
}

type WorkspaceData = {
  facilitiesCount: number
  patientRegistrations: Registration[]
  patientRegistrationsCount: number
  all: number
  createdNew: number
  linkedExisting: number
  completed: number
}

const resolutions = new Set(['all', 'create_new', 'link_existing'])
const sorts = new Set(['newest', 'oldest'])

const query = `
  query RegistrationWorkspace($where: PatientRegistrationWhereInput!, $orderBy: [PatientRegistrationOrderByInput!]!) {
    facilitiesCount(where: { status: { equals: "active" } })
    patientRegistrations(where: $where, orderBy: $orderBy, take: 50) {
      id status duplicateResolution createdAt
      facility { id name timeZone }
      patient { id displayName status }
      identifier { id maskedValue status }
      consent { id decision policyVersion effectiveAt }
      auditLog { id eventType occurredAt }
      createdBy { id name }
    }
    patientRegistrationsCount(where: $where)
    all: patientRegistrationsCount
    createdNew: patientRegistrationsCount(where: { duplicateResolution: { equals: "create_new" } })
    linkedExisting: patientRegistrationsCount(where: { duplicateResolution: { equals: "link_existing" } })
    completed: patientRegistrationsCount(where: { status: { equals: "completed" } })
  }
`

function one(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : ''
}

function formatFacilityDateTime(value?: string | null, timeZone?: string | null) {
  if (!value || !timeZone) return 'Facility time unavailable'
  return new Intl.DateTimeFormat(undefined, { timeZone, timeZoneName: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function RegistrationEvidence({ registration }: { registration: Registration }) {
  return (
    <details className="group min-w-0">
      <summary className="w-fit cursor-pointer list-none rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <Track><Pill asChild size="sm" variant="plain"><span><ChevronRight className="transition-transform group-open:rotate-90" aria-hidden />Provenance</span></Pill></Track>
      </summary>
      <Facts
        className="mt-2 max-w-xl rounded-[4px] border bg-muted/30 px-3"
        items={[
          { label: 'Consent', value: `${registration.consent?.decision?.replaceAll('_', ' ') || 'Not visible'}${registration.consent?.policyVersion ? ` · ${registration.consent.policyVersion}` : ''}` },
          { label: 'Audit event', value: registration.auditLog?.eventType?.replaceAll('_', ' ') || 'Not visible' },
          { label: 'Registered by', value: registration.createdBy?.name || 'Restricted operator' },
          { label: 'Recorded', value: formatFacilityDateTime(registration.createdAt, registration.facility?.timeZone) },
        ]}
      />
    </details>
  )
}

function RegistrationActions({ registration }: { registration: Registration }) {
  return (
    <Track>
      {registration.patient?.id && <Pill asChild size="sm"><Link href={`/dashboard/patients/${registration.patient.id}`}>Patient</Link></Pill>}
      <Pill asChild size="sm" variant="plain"><Link href={`/dashboard/patient-registrations/${registration.id}`}>Registration</Link></Pill>
      {registration.identifier?.id && <Pill asChild size="sm" variant="plain"><Link href={`/dashboard/patient-identifiers/${registration.identifier.id}`}>Identifier</Link></Pill>}
    </Track>
  )
}

export default async function RegistrationPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = searchParams ? await searchParams : {}
  const search = one(params.search).trim().slice(0, 80)
  const requestedResolution = one(params.resolution)
  const resolution = resolutions.has(requestedResolution) ? requestedResolution : 'all'
  const requestedSort = one(params.sort)
  const sort = sorts.has(requestedSort) ? requestedSort : 'newest'
  const where: Record<string, unknown> = {}
  if (resolution !== 'all') where.duplicateResolution = { equals: resolution }
  if (search) where.OR = [
    { patient: { firstName: { contains: search, mode: 'insensitive' } } },
    { patient: { lastName: { contains: search, mode: 'insensitive' } } },
    { facility: { name: { contains: search, mode: 'insensitive' } } },
  ]

  const breadcrumbs = [{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Registration' }]
  const response = await keystoneClient<WorkspaceData>(query, { where, orderBy: [{ createdAt: sort === 'oldest' ? 'asc' : 'desc' }] })
  if (!response.success) return <WorkspaceLoadError title="Patient registration" description="Facility choices, scoped registration evidence, or protected identity fields may be unavailable for this session." breadcrumbs={breadcrumbs} />
  const data = response.data

  return <PageContainer
    title="Patient registration"
    breadcrumbs={breadcrumbs}
    header={<WardHeader
      title="Register patient"
      tone={data.facilitiesCount === 0 ? 'warn' : 'accent'}
      status={data.facilitiesCount === 0 ? 'Unavailable' : undefined}
      meta={`${data.completed} completed registration${data.completed === 1 ? '' : 's'}`}
    />}
  >
    <WardBody>
      {data.facilitiesCount === 0 && <Notice tone="warn" role="status"><p className="font-medium">Registration unavailable</p><p className="mt-0.5">No active facility is available to this session.</p></Notice>}
      <PatientRegistrationForm accessibleFacilityCount={data.facilitiesCount} />

      <WardSection title="Recent registrations" count={data.patientRegistrationsCount} id="registration-evidence">
        <div className="flex min-w-0 flex-col gap-4">
          <ReadoutStrip>
            <Readout label="All" value={data.all} />
            <Readout label="Completed" tone="ok" value={data.completed} />
            <Readout label="Created new" tone="accent" value={data.createdNew} />
            <Readout label="Linked existing" tone="info" value={data.linkedExisting} />
          </ReadoutStrip>

          <FilterBar>
            <label className="relative w-full sm:min-w-56 sm:flex-1">
              <span className="sr-only">Search patient or facility</span>
              <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
              <input className={`${fieldClass} pl-9`} name="search" defaultValue={search} placeholder="Patient or facility" />
            </label>
            <label className="w-[calc(50%-0.25rem)] sm:w-48">
              <span className="sr-only">Duplicate resolution</span>
              <select name="resolution" defaultValue={resolution} className={fieldClass}>
                <option value="all">All resolutions</option>
                <option value="create_new">Created new</option>
                <option value="link_existing">Linked existing</option>
              </select>
            </label>
            <label className="w-[calc(50%-0.25rem)] sm:w-40">
              <span className="sr-only">Sort registrations</span>
              <select name="sort" defaultValue={sort} className={fieldClass}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </label>
            <Track>
              <Pill type="submit" variant="primary">Apply</Pill>
              <Pill asChild variant="plain"><Link href="/dashboard/platform/registration">Reset</Link></Pill>
            </Track>
          </FilterBar>

          {data.patientRegistrationsCount > data.patientRegistrations.length && <BoundedDataNotice messages={[`Showing ${data.patientRegistrations.length} of ${data.patientRegistrationsCount}. Narrow the filters to see more.`]} />}

          {!data.patientRegistrations.length ? <EmptyBoard title="No matching registrations" /> : (
            <Board>
              {data.patientRegistrations.map(item => (
                <BoardRow
                  key={item.id}
                  tone={toneForStatus(item.status)}
                  status={item.status || 'unknown'}
                  title={item.patient?.displayName || 'Restricted patient'}
                  meta={<>
                    <Code className="text-foreground">{item.identifier?.maskedValue || 'Identifier restricted'}</Code>
                    <StatusTag status={item.status || 'unknown'} className="font-normal" />
                    <span>{item.duplicateResolution?.replaceAll('_', ' ') || 'resolution unavailable'}</span>
                    <span>{item.facility?.name || 'Restricted facility'}</span>
                    <span className="tabular-nums">{formatFacilityDateTime(item.createdAt, item.facility?.timeZone)}</span>
                  </>}
                  aside={<RegistrationActions registration={item} />}
                >
                  <RegistrationEvidence registration={item} />
                </BoardRow>
              ))}
            </Board>
          )}
        </div>
      </WardSection>
    </WardBody>
  </PageContainer>
}

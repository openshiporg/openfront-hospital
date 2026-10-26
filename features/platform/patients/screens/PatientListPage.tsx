import Link from 'next/link'
import { ChevronLeft, ChevronRight, Search, UserPlus } from 'lucide-react'

import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
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
  type WardTone,
} from '@/features/platform/components/ward'

type PatientRow = {
  id: string
  displayName?: string | null
  status?: string | null
  dateOfBirth?: string | null
  preferredContactMethod?: string | null
  facilities?: Array<{ id: string; name?: string | null }> | null
  identifiers?: Array<{ maskedValue?: string | null; status?: string | null }> | null
  identifiersCount?: number | null
  appointmentsCount?: number | null
  appointments?: Array<{ id: string; appointmentNumber?: string | null; status?: string | null; startsAt?: string | null; facility?: { timeZone?: string | null } | null }> | null
  registrationsCount?: number | null
  registrations?: Array<{ id: string; status?: string | null; duplicateResolution?: string | null; createdAt?: string | null; facility?: { name?: string | null; timeZone?: string | null } | null }> | null
  createdAt?: string | null
}

const PAGE_SIZE = 40
const statuses = new Set(['all', 'active', 'inactive', 'archived'])
const sorts = new Set(['name_asc', 'name_desc', 'newest', 'oldest'])

const query = `
  query PatientWorkspace($where: PatientWhereInput!, $orderBy: [PatientOrderByInput!]!, $take: Int!, $skip: Int!) {
    patients(where: $where, orderBy: $orderBy, take: $take, skip: $skip) {
      id displayName status dateOfBirth preferredContactMethod createdAt appointmentsCount identifiersCount registrationsCount
      facilities(orderBy: [{ name: asc }], take: 10) { id name }
      identifiers(where: { status: { equals: "active" } }, orderBy: [{ createdAt: desc }], take: 3) { maskedValue status }
      appointments(orderBy: [{ startsAt: desc }], take: 3) { id appointmentNumber status startsAt facility { timeZone } }
      registrations(orderBy: [{ createdAt: desc }], take: 2) { id status duplicateResolution createdAt facility { name timeZone } }
    }
    patientsCount(where: $where)
    all: patientsCount
    active: patientsCount(where: { status: { equals: "active" } })
    inactive: patientsCount(where: { status: { equals: "inactive" } })
    archived: patientsCount(where: { status: { equals: "archived" } })
  }
`

function one(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : ''
}

function patientOrder(sort: string) {
  if (sort === 'name_desc') return [{ lastName: 'desc' }, { firstName: 'desc' }]
  if (sort === 'newest') return [{ createdAt: 'desc' }]
  if (sort === 'oldest') return [{ createdAt: 'asc' }]
  return [{ lastName: 'asc' }, { firstName: 'asc' }]
}

function formatDate(value?: string | null, timeZone?: string | null) {
  if (!value) return 'Not recorded'
  return new Intl.DateTimeFormat(undefined, { timeZone: timeZone || 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

const patientTone: Record<string, WardTone> = {
  active: 'ok',
  inactive: 'idle',
  archived: 'idle',
}

function queryHref(params: { search: string; status: string; sort: string; page: number }) {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.status !== 'all') query.set('status', params.status)
  if (params.sort !== 'name_asc') query.set('sort', params.sort)
  if (params.page > 1) query.set('page', String(params.page))
  return `/dashboard/platform/patients${query.size ? `?${query}` : ''}`
}

const evidenceLabel = 'tabular-nums text-xs font-medium text-muted-foreground'

function PatientDetails({ patient }: { patient: PatientRow }) {
  const visibleAppointments = patient.appointments || []
  const visibleRegistrations = patient.registrations || []
  return (
    <details className="group min-w-0">
      <summary className="w-fit cursor-pointer list-none rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <Track><Pill asChild size="sm" variant="plain"><span><ChevronRight className="transition-transform group-open:rotate-90" aria-hidden />History</span></Pill></Track>
      </summary>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <section className="min-w-0 rounded-[4px] border bg-muted/30 p-3">
          <h3 className={evidenceLabel}>Recent appointments</h3>
          {visibleAppointments.length ? <ul className="mt-2 space-y-1.5 text-sm">{visibleAppointments.map(item => <li key={item.id} className="flex min-w-0 flex-wrap items-baseline gap-x-3"><Code>{item.appointmentNumber || 'No reference'}</Code><StatusTag status={item.status || 'unknown'} /><span className="text-muted-foreground">{formatDate(item.startsAt, item.facility?.timeZone)}</span></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No appointments.</p>}
          {Number(patient.appointmentsCount || 0) > visibleAppointments.length && <p className="mt-2 text-xs text-muted-foreground">Showing {visibleAppointments.length} of {patient.appointmentsCount} appointments.</p>}
        </section>
        <section className="min-w-0 rounded-[4px] border bg-muted/30 p-3">
          <h3 className={evidenceLabel}>Registrations</h3>
          {visibleRegistrations.length ? <ul className="mt-2 space-y-1.5 text-sm">{visibleRegistrations.map(item => <li key={item.id} className="min-w-0 break-words">{item.facility?.name || 'Restricted facility'} <span className="text-muted-foreground">· {item.duplicateResolution?.replaceAll('_', ' ') || 'resolution unavailable'} · {formatDate(item.createdAt, item.facility?.timeZone)}</span></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No registrations.</p>}
          {Number(patient.registrationsCount || 0) > visibleRegistrations.length && <p className="mt-2 text-xs text-muted-foreground">Showing {visibleRegistrations.length} of {patient.registrationsCount} registrations.</p>}
        </section>
      </div>
    </details>
  )
}

function PatientActions({ patient }: { patient: PatientRow }) {
  return (
    <Track>
      <Pill asChild size="sm"><Link href={`/dashboard/patients/${patient.id}`}>Open record</Link></Pill>
      <Pill asChild size="sm" variant="plain"><Link href="/dashboard/platform/appointments">Appointments</Link></Pill>
      <Pill asChild size="sm" variant="plain"><Link href="/dashboard/platform/intake">Intake</Link></Pill>
    </Track>
  )
}

export async function PatientListPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await props.searchParams
  const search = one(params.search).trim().slice(0, 100)
  const requestedStatus = one(params.status)
  const status = statuses.has(requestedStatus) ? requestedStatus : 'all'
  const requestedSort = one(params.sort)
  const sort = sorts.has(requestedSort) ? requestedSort : 'name_asc'
  const page = Math.min(13, Math.max(1, Number.parseInt(one(params.page), 10) || 1))
  const where: Record<string, unknown> = {}
  if (status !== 'all') where.status = { equals: status }
  if (search) where.OR = [
    { firstName: { contains: search, mode: 'insensitive' } },
    { lastName: { contains: search, mode: 'insensitive' } },
    { email: { contains: search, mode: 'insensitive' } },
    { phone: { contains: search, mode: 'insensitive' } },
  ]
  const breadcrumbs = [{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Patients' }]
  const response = await keystoneClient<{ patients: PatientRow[]; patientsCount: number; all: number; active: number; inactive: number; archived: number }>(query, { where, orderBy: patientOrder(sort), take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE })
  if (!response.success) return <WorkspaceLoadError title="Patients" description="The scoped patient directory, counts, or protected patient fields may be unavailable for this session." breadcrumbs={breadcrumbs} />
  const data = response.data
  const first = data.patientsCount ? (page - 1) * PAGE_SIZE + 1 : 0
  const last = Math.min(page * PAGE_SIZE, data.patientsCount)
  const totalPages = Math.ceil(data.patientsCount / PAGE_SIZE)
  const boundedPages = Math.min(13, totalPages)
  const canNext = page < boundedPages

  return <PageContainer
    title="Patients"
    breadcrumbs={breadcrumbs}
    header={<WardHeader
      title="Patients"
      meta={`${data.all} on record · ${data.active} active`}
      actions={<Track><Pill asChild variant="primary"><Link href="/dashboard/platform/registration"><UserPlus aria-hidden />Register patient</Link></Pill></Track>}
    />}
  >
    <WardBody>
      <div className="flex min-w-0 flex-col gap-3">
        <FilterBar>
          {status !== 'all' && <input type="hidden" name="status" value={status} />}
          <label className="relative w-full sm:min-w-64 sm:flex-1">
            <span className="sr-only">Search patient name or contact</span>
            <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden />
            <input className={`${fieldClass} h-10 pl-9 text-base sm:text-sm`} type="search" name="search" defaultValue={search} placeholder="Name, email, or phone" />
          </label>
          <label className="w-full sm:w-52">
            <span className="sr-only">Sort patients</span>
            <select name="sort" defaultValue={sort} className={`${fieldClass} h-10`}>
              <option value="name_asc">Name A–Z</option>
              <option value="name_desc">Name Z–A</option>
              <option value="newest">Newest registered</option>
              <option value="oldest">Oldest registered</option>
            </select>
          </label>
          <Track>
            <Pill type="submit" variant="primary">Search</Pill>
            <Pill asChild variant="plain"><Link href="/dashboard/platform/patients">Reset</Link></Pill>
          </Track>
        </FilterBar>
        <SegmentedLinks
          label="Patient status"
          size="sm"
          options={[
            { href: queryHref({ search, status: 'all', sort, page: 1 }), label: 'All', count: data.all, active: status === 'all' },
            { href: queryHref({ search, status: 'active', sort, page: 1 }), label: 'Active', count: data.active, active: status === 'active', tone: 'ok' },
            { href: queryHref({ search, status: 'inactive', sort, page: 1 }), label: 'Inactive', count: data.inactive, active: status === 'inactive', tone: 'idle' },
            { href: queryHref({ search, status: 'archived', sort, page: 1 }), label: 'Archived', count: data.archived, active: status === 'archived', tone: 'idle' },
          ]}
        />
      </div>

      {data.patientsCount > PAGE_SIZE * 13 && <Notice tone="warn" role="status">Showing the first {PAGE_SIZE * 13} of {data.patientsCount} matches. Narrow the search to see the rest.</Notice>}

      <WardSection
        title={search ? 'Matches' : 'Patients'}
        id="patient-results"
        actions={<span className="tabular-nums text-xs  text-muted-foreground">{data.patientsCount ? `${first}–${last} of ${data.patientsCount}` : '0 matches'}</span>}
      >
        {!data.patients.length ? <EmptyBoard title="No matching patients" /> : (
          <Board>
            {data.patients.map(patient => {
              const identifiers = patient.identifiers?.map(item => item.maskedValue).filter(Boolean).join(', ')
              return (
                <BoardRow
                  key={patient.id}
                  tone={patientTone[patient.status || ''] || 'idle'}
                  status={patient.status || 'unknown'}
                  title={<Link href={`/dashboard/platform/patients/${patient.id}`} className="rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">{patient.displayName || 'Restricted patient'}</Link>}
                  meta={<>
                    <Code className="text-foreground">{identifiers || 'No active identifier'}</Code>
                    {Number(patient.identifiersCount || 0) > (patient.identifiers?.length || 0) && <span className="text-amber-700 dark:text-amber-300">More identifiers hidden</span>}
                    <span className="tabular-nums">DOB {formatDate(patient.dateOfBirth)}</span>
                    <StatusTag status={patient.status || 'unknown'} tone={patientTone[patient.status || ''] || 'idle'} className="font-normal" />
                    <span>{patient.facilities?.map(item => item.name).filter(Boolean).join(' · ') || 'No visible facility'}</span>
                    <span>{patient.preferredContactMethod || 'No contact preference'}</span>
                    <span className="tabular-nums">{patient.appointmentsCount || 0} appts · {patient.registrationsCount || 0} reg</span>
                  </>}
                  aside={<PatientActions patient={patient} />}
                >
                  <PatientDetails patient={patient} />
                </BoardRow>
              )
            })}
          </Board>
        )}
        {data.patientsCount > PAGE_SIZE && (
          <nav aria-label="Patient result pages" className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-2">
            <p className="tabular-nums text-xs  text-muted-foreground">Page {page} of {boundedPages}{totalPages > boundedPages ? ' (bounded)' : ''}</p>
            <Track>
              {page > 1
                ? <Pill asChild size="sm"><Link href={queryHref({ search, status, sort, page: page - 1 })}><ChevronLeft aria-hidden />Previous</Link></Pill>
                : <Pill size="sm" variant="plain" disabled><ChevronLeft aria-hidden />Previous</Pill>}
              {canNext
                ? <Pill asChild size="sm"><Link href={queryHref({ search, status, sort, page: page + 1 })}>Next<ChevronRight aria-hidden /></Link></Pill>
                : <Pill size="sm" variant="plain" disabled>Next<ChevronRight aria-hidden /></Pill>}
            </Track>
          </nav>
        )}
      </WardSection>
    </WardBody>
  </PageContainer>
}

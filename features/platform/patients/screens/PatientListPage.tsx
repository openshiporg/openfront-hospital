import Link from 'next/link'
import { CalendarDays, ChevronLeft, ChevronRight, IdCard, Search, UserPlus, Users } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { WorkspaceLoadError } from '@/features/platform/components/WorkspaceLoadError'

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

function statusVariant(status?: string | null) {
  return status === 'active' ? 'default' as const : 'secondary' as const
}

function queryHref(params: { search: string; status: string; sort: string; page: number }) {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.status !== 'all') query.set('status', params.status)
  if (params.sort !== 'name_asc') query.set('sort', params.sort)
  if (params.page > 1) query.set('page', String(params.page))
  return `/dashboard/platform/patients${query.size ? `?${query}` : ''}`
}

function PatientDetails({ patient }: { patient: PatientRow }) {
  const visibleAppointments = patient.appointments || []
  const visibleRegistrations = patient.registrations || []
  return <details className="group"><summary className="cursor-pointer rounded-sm text-sm font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Expand operational details</summary><div className="mt-3 grid gap-3 lg:grid-cols-2"><section className="rounded-lg border bg-muted/20 p-3"><h3 className="text-sm font-medium">Recent appointment evidence</h3>{visibleAppointments.length ? <ul className="mt-2 space-y-2 text-sm">{visibleAppointments.map(item => <li key={item.id}><span className="font-mono text-xs">{item.appointmentNumber || 'No reference'}</span> · {item.status?.replaceAll('_', ' ') || 'unknown'} · {formatDate(item.startsAt, item.facility?.timeZone)}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No accessible appointment evidence.</p>}{Number(patient.appointmentsCount || 0) > visibleAppointments.length && <p className="mt-2 text-xs text-muted-foreground">Showing {visibleAppointments.length} of {patient.appointmentsCount} appointments.</p>}</section><section className="rounded-lg border bg-muted/20 p-3"><h3 className="text-sm font-medium">Registration provenance</h3>{visibleRegistrations.length ? <ul className="mt-2 space-y-2 text-sm">{visibleRegistrations.map(item => <li key={item.id}>{item.facility?.name || 'Restricted facility'} · {item.duplicateResolution?.replaceAll('_', ' ') || 'resolution unavailable'} · {formatDate(item.createdAt, item.facility?.timeZone)}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No accessible registration evidence.</p>}{Number(patient.registrationsCount || 0) > visibleRegistrations.length && <p className="mt-2 text-xs text-muted-foreground">Showing {visibleRegistrations.length} of {patient.registrationsCount} registrations.</p>}</section></div></details>
}

function PatientActions({ patient }: { patient: PatientRow }) {
  return <details className="relative"><summary className="cursor-pointer list-none rounded-md border px-3 py-2 text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">Actions</summary><div className="mt-2 flex min-w-44 flex-col gap-1 rounded-md border bg-popover p-1 text-sm shadow-sm md:absolute md:right-0 md:z-10"><Link className="rounded px-2 py-1.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" href={`/dashboard/patients/${patient.id}`}>Open patient record</Link><Link className="rounded px-2 py-1.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" href="/dashboard/platform/appointments">Open appointment queue</Link><Link className="rounded px-2 py-1.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" href="/dashboard/platform/intake">Open intake queue</Link></div></details>
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

  return <PageContainer title="Patients" breadcrumbs={breadcrumbs} header={<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium uppercase tracking-[.2em] text-muted-foreground">Patient operations</p><h1 className="mt-2 text-3xl font-semibold">Patient directory</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Find scoped identity, registration, appointment, and intake context. Searches of protected patient fields remain session-aware and auditable.</p></div><Button asChild><Link href="/dashboard/platform/registration"><UserPlus className="mr-2 size-4" />Register patient</Link></Button></div>}>
    <div className="space-y-5 px-4 pb-8 md:px-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
        { label: 'Accessible patients', value: data.all, icon: Users },
        { label: 'Active', value: data.active, icon: Users },
        { label: 'Inactive', value: data.inactive, icon: CalendarDays },
        { label: 'Archived', value: data.archived, icon: IdCard },
      ].map(({ label, value, icon: Icon }) => <Card key={label}><CardHeader className="pb-2"><CardDescription className="flex items-center gap-2"><Icon className="size-4" aria-hidden />{label}</CardDescription><CardTitle>{value}</CardTitle></CardHeader></Card>)}</div>

      <Card><CardHeader><CardTitle>Search accessible patients</CardTitle><CardDescription>Name and contact search is bounded to direct patient/facility scope. No empty result is treated as proof that a patient does not exist elsewhere.</CardDescription></CardHeader><CardContent><form className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_12rem_12rem_auto]"><label className="relative"><span className="sr-only">Search patient name or contact</span><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden /><Input className="pl-9" name="search" defaultValue={search} placeholder="Name, email, or phone" /></label><label><span className="sr-only">Patient status</span><select name="status" defaultValue={status} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select></label><label><span className="sr-only">Sort patients</span><select name="sort" defaultValue={sort} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="name_asc">Name A–Z</option><option value="name_desc">Name Z–A</option><option value="newest">Newest registration record</option><option value="oldest">Oldest registration record</option></select></label><div className="flex gap-2"><Button type="submit" variant="outline">Apply</Button><Button asChild type="button" variant="ghost"><Link href="/dashboard/platform/patients">Reset</Link></Button></div></form></CardContent></Card>

      {data.patientsCount > PAGE_SIZE * 13 && <div role="status" className="rounded-lg border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-950">This view exposes the first {PAGE_SIZE * 13} of {data.patientsCount} matching accessible patients. Narrow search or status filters to reach records outside the bounded result window.</div>}
      <Card><CardHeader><CardTitle>Patient records</CardTitle><CardDescription>{data.patientsCount ? `Showing ${first}–${last} of ${data.patientsCount} matching accessible patients.` : 'No accessible patients match the current filters.'}</CardDescription></CardHeader><CardContent>{!data.patients.length ? <div className="rounded-lg border border-dashed p-8 text-center"><Users className="mx-auto size-6 text-muted-foreground" aria-hidden /><p className="mt-3 font-medium">No accessible patient matches</p><p className="mt-1 text-sm text-muted-foreground">Check spelling, adjust filters, or follow the approved registration/duplicate-review workflow. Do not create a duplicate based only on this empty view.</p></div> : <><div className="hidden rounded-lg border md:block"><Table><TableHeader><TableRow><TableHead>Patient</TableHead><TableHead>Facility / identifier</TableHead><TableHead>Operational activity</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{data.patients.map(patient => <TableRow key={patient.id}><TableCell className="align-top"><p className="font-medium">{patient.displayName || 'Restricted patient'}</p><p className="text-xs text-muted-foreground">DOB {formatDate(patient.dateOfBirth)} · {patient.preferredContactMethod || 'contact preference unavailable'}</p><div className="mt-2"><PatientDetails patient={patient} /></div></TableCell><TableCell className="align-top"><p>{patient.facilities?.map(item => item.name).filter(Boolean).join(' · ') || 'No visible facility'}</p><p className="text-xs text-muted-foreground">{patient.identifiers?.map(item => item.maskedValue).filter(Boolean).join(', ') || 'No visible active identifier'}</p>{Number(patient.identifiersCount || 0) > (patient.identifiers?.length || 0) && <p className="text-xs text-amber-700">Additional identifiers are not shown.</p>}</TableCell><TableCell className="align-top text-sm">{patient.appointmentsCount || 0} appointments<br />{patient.registrationsCount || 0} registrations</TableCell><TableCell className="align-top"><Badge variant={statusVariant(patient.status)}>{patient.status || 'unknown'}</Badge></TableCell><TableCell className="align-top text-right"><PatientActions patient={patient} /></TableCell></TableRow>)}</TableBody></Table></div><div className="space-y-3 md:hidden">{data.patients.map(patient => <article key={patient.id} className="space-y-3 rounded-lg border p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-medium">{patient.displayName || 'Restricted patient'}</h2><p className="text-sm text-muted-foreground">{patient.facilities?.map(item => item.name).filter(Boolean).join(' · ') || 'No visible facility'}</p></div><Badge variant={statusVariant(patient.status)}>{patient.status || 'unknown'}</Badge></div><p className="text-xs text-muted-foreground">{patient.identifiers?.map(item => item.maskedValue).filter(Boolean).join(', ') || 'No visible active identifier'} · {patient.appointmentsCount || 0} appointments</p><PatientDetails patient={patient} /><PatientActions patient={patient} /></article>)}</div></>}
        {data.patientsCount > PAGE_SIZE && <nav aria-label="Patient result pages" className="mt-4 flex items-center justify-between gap-3"><Button asChild={page > 1} disabled={page <= 1} variant="outline">{page > 1 ? <Link href={queryHref({ search, status, sort, page: page - 1 })}><ChevronLeft className="mr-2 size-4" />Previous</Link> : <span><ChevronLeft className="mr-2 size-4" />Previous</span>}</Button><p className="text-sm text-muted-foreground">Page {page} of {boundedPages}{totalPages > boundedPages ? ' bounded' : ''}</p><Button asChild={canNext} disabled={!canNext} variant="outline">{canNext ? <Link href={queryHref({ search, status, sort, page: page + 1 })}>Next<ChevronRight className="ml-2 size-4" /></Link> : <span>Next<ChevronRight className="ml-2 size-4" /></span>}</Button></nav>}
      </CardContent></Card>
    </div>
  </PageContainer>
}

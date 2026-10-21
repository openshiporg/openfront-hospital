import Link from 'next/link'
import { GitMerge, IdCard, Search, ShieldCheck, UserPlus } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { BoundedDataNotice } from '@/features/platform/components/BoundedDataNotice'
import { WorkspaceLoadError } from '@/features/platform/components/WorkspaceLoadError'
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
  return <details><summary className="cursor-pointer rounded-sm text-sm font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Expand provenance evidence</summary><dl className="mt-3 grid gap-3 rounded-lg border bg-muted/20 p-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Consent decision</dt><dd>{registration.consent?.decision?.replaceAll('_', ' ') || 'Not visible'} {registration.consent?.policyVersion ? `· ${registration.consent.policyVersion}` : ''}</dd></div><div><dt className="text-xs text-muted-foreground">Audit event</dt><dd>{registration.auditLog?.eventType?.replaceAll('_', ' ') || 'Not visible'}</dd></div><div><dt className="text-xs text-muted-foreground">Registered by</dt><dd>{registration.createdBy?.name || 'Restricted operator'}</dd></div><div><dt className="text-xs text-muted-foreground">Recorded</dt><dd>{formatFacilityDateTime(registration.createdAt, registration.facility?.timeZone)}</dd></div></dl></details>
}

function RegistrationActions({ registration }: { registration: Registration }) {
  return <details className="relative"><summary className="cursor-pointer list-none rounded-md border px-3 py-2 text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">Actions</summary><div className="mt-2 flex min-w-48 flex-col gap-1 rounded-md border bg-popover p-1 text-sm shadow-sm md:absolute md:right-0 md:z-10">{registration.patient?.id && <Link className="rounded px-2 py-1.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" href={`/dashboard/patients/${registration.patient.id}`}>Open patient record</Link>}<Link className="rounded px-2 py-1.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" href={`/dashboard/patient-registrations/${registration.id}`}>Open registration evidence</Link>{registration.identifier?.id && <Link className="rounded px-2 py-1.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" href={`/dashboard/patient-identifiers/${registration.identifier.id}`}>Open identifier evidence</Link>}</div></details>
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

  return <PageContainer title="Patient registration" breadcrumbs={breadcrumbs} header={<div><p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Patient identity</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Registration and duplicate review</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Create or link a facility-scoped patient only through deterministic review. This workspace is not an enterprise MPI and never performs an automatic merge.</p></div>}>
    <div className="space-y-6 px-4 pb-8 md:px-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
        { label: 'Accessible registrations', value: data.all, icon: IdCard },
        { label: 'Completed', value: data.completed, icon: ShieldCheck },
        { label: 'Created separately', value: data.createdNew, icon: UserPlus },
        { label: 'Linked after review', value: data.linkedExisting, icon: GitMerge },
      ].map(({ label, value, icon: Icon }) => <Card key={label}><CardHeader className="pb-2"><CardDescription className="flex items-center gap-2"><Icon className="size-4" aria-hidden />{label}</CardDescription><CardTitle>{value}</CardTitle></CardHeader></Card>)}</div>

      {data.facilitiesCount === 0 && <div role="status" className="rounded-lg border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-medium">Registration unavailable for this session</p><p className="mt-1">No accessible active facility was returned. No patient registration can be submitted until facility scope is available.</p></div>}
      <PatientRegistrationForm accessibleFacilityCount={data.facilitiesCount} />

      <Card><CardHeader><CardTitle>Registration evidence</CardTitle><CardDescription>Search is limited to accessible patient names and facility labels. Immutable evidence is opened read-only through its scoped record.</CardDescription></CardHeader><CardContent className="space-y-4"><form className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_13rem_12rem_auto]"><label className="relative"><span className="sr-only">Search patient or facility</span><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden /><Input className="pl-9" name="search" defaultValue={search} placeholder="Patient or facility" /></label><label><span className="sr-only">Duplicate resolution</span><select name="resolution" defaultValue={resolution} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="all">All resolutions</option><option value="create_new">Created separately</option><option value="link_existing">Linked existing patient</option></select></label><label><span className="sr-only">Sort registrations</span><select name="sort" defaultValue={sort} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label><div className="flex gap-2"><Button type="submit" variant="outline">Apply</Button><Button asChild type="button" variant="ghost"><Link href="/dashboard/platform/registration">Reset</Link></Button></div></form>
        {data.patientRegistrationsCount > data.patientRegistrations.length && <BoundedDataNotice messages={[`Showing ${data.patientRegistrations.length} of ${data.patientRegistrationsCount} matching registrations. Narrow search or resolution filters to reach records outside this 50-row evidence view.`]} />}
        {!data.patientRegistrations.length ? <div className="rounded-lg border border-dashed p-8 text-center"><IdCard className="mx-auto size-6 text-muted-foreground" aria-hidden /><p className="mt-3 font-medium">No accessible registration evidence matches</p><p className="mt-1 text-sm text-muted-foreground">This does not prove that no registration exists outside your direct facility scope.</p></div> : <><div className="hidden rounded-lg border md:block"><Table><TableHeader><TableRow><TableHead>Patient / MRN</TableHead><TableHead>Facility</TableHead><TableHead>Resolution</TableHead><TableHead>Evidence</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{data.patientRegistrations.map(item => <TableRow key={item.id}><TableCell className="align-top"><p className="font-medium">{item.patient?.displayName || 'Restricted patient'}</p><p className="font-mono text-xs text-muted-foreground">{item.identifier?.maskedValue || 'Identifier restricted'}</p></TableCell><TableCell className="align-top">{item.facility?.name || 'Restricted facility'}<p className="text-xs text-muted-foreground">{formatFacilityDateTime(item.createdAt, item.facility?.timeZone)}</p></TableCell><TableCell className="align-top"><Badge variant="secondary">{item.duplicateResolution?.replaceAll('_', ' ') || 'unknown'}</Badge></TableCell><TableCell className="align-top"><Badge>{item.status || 'unknown'}</Badge><div className="mt-2"><RegistrationEvidence registration={item} /></div></TableCell><TableCell className="align-top text-right"><RegistrationActions registration={item} /></TableCell></TableRow>)}</TableBody></Table></div><div className="space-y-3 md:hidden">{data.patientRegistrations.map(item => <article key={item.id} className="space-y-3 rounded-lg border p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-medium">{item.patient?.displayName || 'Restricted patient'}</h2><p className="font-mono text-xs text-muted-foreground">{item.identifier?.maskedValue || 'Identifier restricted'}</p></div><Badge>{item.status || 'unknown'}</Badge></div><p className="text-sm">{item.facility?.name || 'Restricted facility'} · {item.duplicateResolution?.replaceAll('_', ' ') || 'resolution unavailable'}</p><RegistrationEvidence registration={item} /><RegistrationActions registration={item} /></article>)}</div></>}
      </CardContent></Card>
    </div>
  </PageContainer>
}

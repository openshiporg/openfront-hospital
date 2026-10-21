import Link from 'next/link'
import { AlertTriangle, Clock3, ListChecks, MessageSquare, Search } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { BoundedDataNotice } from '@/features/platform/components/BoundedDataNotice'
import { WorkspaceLoadError } from '@/features/platform/components/WorkspaceLoadError'
import { getCommunicationTasks, type CommunicationTask } from '../actions/messages'
import { normalizeCommunicationFilters } from '../lib/communicationFilters'
import { ManualFollowUpButton } from '../components/ManualFollowUpButton'

function formatFacilityDateTime(value?: string | null, timeZone?: string | null) {
  if (!value || !timeZone) return 'Facility time unavailable'
  return new Intl.DateTimeFormat(undefined, { timeZone, timeZoneName: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function statusVariant(status: string) {
  return status === 'failed' ? 'destructive' as const : status === 'delivered' || status === 'completed' ? 'default' as const : 'secondary' as const
}

function CommunicationDetails({ message }: { message: CommunicationTask }) {
  return <details><summary className="cursor-pointer rounded-sm text-sm font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Expand delivery evidence</summary><dl className="mt-3 grid gap-3 rounded-lg border bg-muted/20 p-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Purpose / direction</dt><dd>{message.purpose?.replaceAll('_', ' ') || 'Not recorded'} · {message.direction || 'unknown'}</dd></div><div><dt className="text-xs text-muted-foreground">Integration</dt><dd>{message.installation?.name || (message.status === 'manual_required' ? 'No external delivery attempted' : 'Not visible')} {message.installation?.status ? `· ${message.installation.status}` : ''}</dd></div><div><dt className="text-xs text-muted-foreground">Sent evidence</dt><dd>{formatFacilityDateTime(message.sentAt, message.facility?.timeZone)}</dd></div><div><dt className="text-xs text-muted-foreground">Delivered evidence</dt><dd>{formatFacilityDateTime(message.deliveredAt, message.facility?.timeZone)}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">External reference</dt><dd className="break-all font-mono text-xs">{message.externalId || 'No external reference recorded'}</dd></div></dl></details>
}

function CommunicationActions({ message }: { message: CommunicationTask }) {
  return <div className="flex flex-col items-start gap-2 md:items-end">{message.status === 'manual_required' && <ManualFollowUpButton messageId={message.id} version={message.transitionVersion} />}<details className="relative"><summary className="cursor-pointer list-none rounded-md border px-3 py-2 text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">More actions</summary><div className="mt-2 flex min-w-48 flex-col gap-1 rounded-md border bg-popover p-1 text-sm shadow-sm md:absolute md:right-0 md:z-10"><Link className="rounded px-2 py-1.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" href={`/dashboard/patient-messages/${message.id}`}>Open evidence record</Link>{message.patient?.id && <Link className="rounded px-2 py-1.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" href={`/dashboard/patients/${message.patient.id}`}>Open patient record</Link>}{message.appointment?.id && <Link className="rounded px-2 py-1.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" href={`/dashboard/appointments/${message.appointment.id}`}>Open appointment record</Link>}</div></details></div>
}

export async function CommunicationListPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = normalizeCommunicationFilters(searchParams ? await searchParams : {})
  const breadcrumbs = [{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Communications' }]
  const response = await getCommunicationTasks(filters)
  if (!response.success) return <WorkspaceLoadError title="Communications" description="Scoped communication evidence, status counts, or protected patient labels may be unavailable for this session." breadcrumbs={breadcrumbs} />
  const data = response.data
  const messages = data.patientMessages

  return <PageContainer title="Communications" breadcrumbs={breadcrumbs} header={<div><p className="text-sm font-medium uppercase tracking-[.2em] text-muted-foreground">Patient follow-up evidence</p><h1 className="mt-2 text-3xl font-semibold">Communication operations</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Resolve manual tasks and inspect integration evidence. Queued is not sent, sent is not delivered, and manual completion does not establish that an external message reached a patient.</p></div>}>
    <div className="space-y-5 px-4 pb-8 md:px-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
        { label: 'Accessible evidence', value: data.all, icon: MessageSquare },
        { label: 'Open follow-up', value: data.open, icon: ListChecks },
        { label: 'Manual required', value: data.manualRequired, icon: Clock3 },
        { label: 'Failed evidence', value: data.failed, icon: AlertTriangle },
      ].map(({ label, value, icon: Icon }) => <Card key={label}><CardHeader className="pb-2"><CardDescription className="flex items-center gap-2"><Icon className="size-4" aria-hidden />{label}</CardDescription><CardTitle>{value}</CardTitle></CardHeader></Card>)}</div>

      <Card><CardHeader><CardTitle>Filter communication evidence</CardTitle><CardDescription>Search only patient labels, appointment references, subjects, and facilities within current access. Message bodies are intentionally excluded from this queue projection.</CardDescription></CardHeader><CardContent><form className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_13rem_11rem_11rem_auto]"><label className="relative"><span className="sr-only">Search communication evidence</span><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden /><Input className="pl-9" name="search" defaultValue={filters.search} placeholder="Patient, reference, subject…" /></label><label><span className="sr-only">Communication status</span><select name="status" defaultValue={filters.status} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="open">Open follow-up</option><option value="all">All evidence</option><option value="manual_required">Manual required</option><option value="queued">Queued</option><option value="failed">Failed</option><option value="sent">Sent evidence</option><option value="delivered">Delivered evidence</option><option value="completed">Completed manual task</option></select></label><label><span className="sr-only">Channel</span><select name="channel" defaultValue={filters.channel} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="all">All channels</option><option value="phone">Phone</option><option value="sms">SMS</option><option value="email">Email</option></select></label><label><span className="sr-only">Sort communications</span><select name="sort" defaultValue={filters.sort} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="oldest">Oldest first</option><option value="newest">Newest first</option></select></label><div className="flex gap-2"><Button type="submit" variant="outline">Apply</Button><Button asChild type="button" variant="ghost"><Link href="/dashboard/platform/communications">Reset</Link></Button></div></form></CardContent></Card>

      <BoundedDataNotice messages={data.patientMessagesCount > messages.length ? [`Showing ${messages.length} of ${data.patientMessagesCount} matching records. Narrow status, channel, or search to reach evidence outside this 100-row view.`] : undefined} />

      <Card><CardHeader><CardTitle>Communication evidence queue</CardTitle><CardDescription>{data.patientMessagesCount} matching accessible record{data.patientMessagesCount === 1 ? '' : 's'} · facility-local timestamps</CardDescription></CardHeader><CardContent>{!messages.length ? <div className="rounded-lg border border-dashed p-8 text-center"><MessageSquare className="mx-auto size-6 text-muted-foreground" aria-hidden /><p className="mt-3 font-medium">No accessible communication evidence matches</p><p className="mt-1 text-sm text-muted-foreground">No empty queue is inferred outside your current scope. Adjust filters or confirm communication permissions with an administrator.</p></div> : <><div className="hidden rounded-lg border md:block"><Table><TableHeader><TableRow><TableHead>Patient / subject</TableHead><TableHead>Context</TableHead><TableHead>Recorded</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{messages.map(message => <TableRow key={message.id}><TableCell className="align-top"><p className="font-medium">{message.patient?.displayName || 'Restricted patient'}</p><p className="text-sm text-muted-foreground">{message.subject || 'Patient follow-up'} · {message.channel}</p><div className="mt-2"><CommunicationDetails message={message} /></div></TableCell><TableCell className="align-top"><p className="font-mono text-xs">{message.appointment?.appointmentNumber || 'No appointment'}</p><p className="text-xs text-muted-foreground">{message.facility?.name || 'Restricted facility'}</p></TableCell><TableCell className="align-top">{formatFacilityDateTime(message.createdAt, message.facility?.timeZone)}</TableCell><TableCell className="align-top"><Badge variant={statusVariant(message.status)}>{message.status.replaceAll('_', ' ')}</Badge></TableCell><TableCell className="align-top text-right"><CommunicationActions message={message} /></TableCell></TableRow>)}</TableBody></Table></div><div className="space-y-3 md:hidden">{messages.map(message => <article key={message.id} className="space-y-3 rounded-lg border p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-medium">{message.patient?.displayName || 'Restricted patient'}</h2><p className="text-sm text-muted-foreground">{message.subject || 'Patient follow-up'} · {message.channel}</p></div><Badge variant={statusVariant(message.status)}>{message.status.replaceAll('_', ' ')}</Badge></div><p className="text-xs text-muted-foreground">{message.appointment?.appointmentNumber || 'No appointment'} · {message.facility?.name || 'Restricted facility'} · {formatFacilityDateTime(message.createdAt, message.facility?.timeZone)}</p><CommunicationDetails message={message} /><CommunicationActions message={message} /></article>)}</div></>}
      </CardContent></Card>
    </div>
  </PageContainer>
}

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { getAppointmentQueue, getAppointmentStatusCounts, getAppointmentFacilityFilter } from '../actions/appointments'
import { WorkspaceLoadError } from '@/features/platform/components/WorkspaceLoadError'
import { keystoneContext } from '@/features/keystone/context'
import { advanceTimedStates } from '@/features/keystone/mutations/operational/maintenance'
import { AppointmentListPageClient } from './AppointmentListPageClient'

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function AppointmentListPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams
  // Requests nobody confirmed before their slot ended are cancelled by the request that reads the queue (no background timer exists).
  await advanceTimedStates(keystoneContext.prisma)
  const status = typeof resolvedSearchParams.status === 'string' ? resolvedSearchParams.status : 'all'
  const view = typeof resolvedSearchParams.view === 'string' ? resolvedSearchParams.view : 'today'
  const search = typeof resolvedSearchParams.search === 'string' ? resolvedSearchParams.search.trim().slice(0, 80) : ''
  const sort = resolvedSearchParams.sort === 'start_desc' ? 'start_desc' : 'start_asc'

  const cursor = typeof resolvedSearchParams.cursor === 'string' ? resolvedSearchParams.cursor : undefined
  let facilityId = typeof resolvedSearchParams.facilityId === 'string' ? resolvedSearchParams.facilityId : undefined
  const date = typeof resolvedSearchParams.date === 'string' ? resolvedSearchParams.date : undefined
  // The desk opens on a day sheet: with no facility chosen, use the first accessible active facility (named in the
  // header meta) instead of an empty prompt. It is resolved in place: a server redirect() here crashed the client
  // desk with React error #310 on every sidebar visit. Links without facilityId resolve to the same default.
  if (view === 'today' && !facilityId) {
    const first = await keystoneClient<{ facilities: Array<{ id: string }> | null }>(`query AppointmentDefaultFacility { facilities(where: { status: { equals: "active" } }, orderBy: [{ name: asc }], take: 1) { id } }`)
    facilityId = first.success ? first.data.facilities?.[0]?.id : undefined
  }
  const [queueResponse, countsResponse, facilityResponse] = await Promise.all([
    getAppointmentQueue(status, view, search, sort, cursor, facilityId, date),
    getAppointmentStatusCounts(),
    getAppointmentFacilityFilter(facilityId),
  ])

  if (!queueResponse.success || !countsResponse.success) {
    return <WorkspaceLoadError
      title="Appointments"
      description="The appointment queue or status counts may be incomplete."
      breadcrumbs={[{ type: 'link', label: 'Dashboard', href: '/dashboard' }, { type: 'page', label: 'Appointments' }]}
    />
  }
  const initialData = queueResponse.data
  const statusCounts = countsResponse.data

  return (
    <AppointmentListPageClient
      initialData={initialData}
      statusCounts={statusCounts}
      facilitiesCount={facilityResponse.success ? facilityResponse.data.facilitiesCount : undefined}
      selectedFacility={facilityResponse.success ? facilityResponse.data.facility : null}
      error={null}
    />
  )
}

export default AppointmentListPage

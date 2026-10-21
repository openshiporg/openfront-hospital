import { getIntakeQueue, getIntakeStatusCounts } from '../actions/intake'
import { WorkspaceLoadError } from '@/features/platform/components/WorkspaceLoadError'
import { IntakeListPageClient } from './IntakeListPageClient'

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function IntakeListPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams
  const status = typeof resolvedSearchParams.status === 'string' ? resolvedSearchParams.status : 'all'
  const view = typeof resolvedSearchParams.view === 'string' ? resolvedSearchParams.view : 'needs_review'
  const search = typeof resolvedSearchParams.search === 'string' ? resolvedSearchParams.search.trim().slice(0, 80) : ''
  const sort = resolvedSearchParams.sort === 'updated_asc' ? 'updated_asc' : 'updated_desc'

  const [queueResponse, countsResponse] = await Promise.all([
    getIntakeQueue(status, view, search, sort, typeof resolvedSearchParams.cursor === 'string' ? resolvedSearchParams.cursor : undefined),
    getIntakeStatusCounts(),
  ])

  if (!queueResponse.success || !countsResponse.success) {
    return <WorkspaceLoadError
      title="Intake"
      description="The intake queue or status counts may be incomplete."
      breadcrumbs={[{ type: 'link', label: 'Dashboard', href: '/dashboard' }, { type: 'page', label: 'Intake' }]}
    />
  }
  const initialData = queueResponse.data
  const statusCounts = countsResponse.data

  return (
    <IntakeListPageClient
      initialData={initialData}
      statusCounts={statusCounts}
      error={null}
    />
  )
}

export default IntakeListPage

import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { Notice, WardBody, WardHeader } from './ward'

export function WorkspaceLoadError({
  title,
  description,
  breadcrumbs,
}: {
  title: string
  description: string
  breadcrumbs: Array<{ type: 'link'; label: string; href: string } | { type: 'page'; label: string }>
}) {
  return (
    <PageContainer
      title={title}
      breadcrumbs={breadcrumbs}
      header={<WardHeader title={title} tone="bad" status="Unavailable" meta="Data unavailable" />}
    >
      <WardBody>
        <Notice tone="bad" role="alert">
          <p className="font-medium">This workspace could not be loaded.</p>
          <p className="mt-0.5 opacity-90">{description} Counts are not shown as zero. Refresh to try again.</p>
        </Notice>
      </WardBody>
    </PageContainer>
  )
}

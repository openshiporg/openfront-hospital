import { AlertTriangle } from 'lucide-react'

import { PageContainer } from '@/features/dashboard/components/PageContainer'

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
      header={(
        <div>
          <p className="text-sm font-medium uppercase tracking-[.2em] text-muted-foreground">Data unavailable</p>
          <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
        </div>
      )}
    >
      <div className="px-4 pb-8 md:px-6">
        <div role="alert" className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">The workspace could not be loaded.</p>
            <p className="mt-1">{description} No zero count or empty queue is being inferred. Refresh or contact an administrator.</p>
          </div>
        </div>
      </div>
    </PageContainer>
  )
}

import { Loader2 } from 'lucide-react'

import { PageContainer } from '@/features/dashboard/components/PageContainer'

export function PlatformWorkspaceLoading() {
  return (
    <PageContainer
      title="Loading workspace"
      breadcrumbs={[{ type: 'link', label: 'Dashboard', href: '/dashboard' }, { type: 'page', label: 'Platform' }]}
      header={<div><p className="text-sm font-medium uppercase tracking-[.2em] text-muted-foreground">Loading scoped data</p><h1 className="mt-2 text-3xl font-semibold">Preparing operator workspace</h1></div>}
    >
      <div className="px-4 pb-8 md:px-6">
        <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          Loading permission-scoped records. No empty queue or zero count is being inferred.
        </div>
      </div>
    </PageContainer>
  )
}

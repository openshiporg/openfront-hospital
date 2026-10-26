import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { Board, WardBody, WardHeader } from './ward'

export function PlatformWorkspaceLoading() {
  return (
    <PageContainer
      title="Loading workspace"
      breadcrumbs={[{ type: 'link', label: 'Dashboard', href: '/dashboard' }, { type: 'page', label: 'Platform' }]}
      header={<WardHeader title="Loading…" tone="idle" />}
    >
      <WardBody>
        <div role="status" aria-live="polite" className="sr-only">Loading records</div>
        <div aria-hidden="true" className="grid grid-cols-2 gap-px overflow-hidden rounded-[4px] border bg-border md:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="bg-card px-4 py-3 md:px-5 md:py-4">
              <div className="h-2.5 w-16 rounded bg-muted motion-safe:animate-pulse" />
              <div className="mt-3 h-6 w-10 rounded bg-muted motion-safe:animate-pulse" />
            </div>
          ))}
        </div>
        <Board>
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} aria-hidden="true" className="px-4 py-4 md:px-5">
              <div className="h-3 w-1/3 min-w-32 rounded bg-muted motion-safe:animate-pulse" />
              <div className="mt-2 h-2.5 w-1/2 min-w-40 rounded bg-muted/70 motion-safe:animate-pulse" />
            </div>
          ))}
        </Board>
      </WardBody>
    </PageContainer>
  )
}

import { StorefrontShell } from '@/features/storefront/components/StorefrontShell'
export default function PublicLoading() {
  return (
    <StorefrontShell>
      <p className="sf-container sf-state sf-titleline" role="status"><span aria-hidden="true" className="sf-dot sf-dot--accent" /><span>Loading…</span></p>
    </StorefrontShell>
  )
}

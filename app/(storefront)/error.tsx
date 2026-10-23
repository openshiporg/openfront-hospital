'use client'
import { StorefrontShell, EmergencyNotice } from '@/features/storefront/components/StorefrontShell'
export default function PublicError({ reset }: { reset: () => void }) {
  return (
    <StorefrontShell>
      <section className="sf-container sf-state">
        <h1 className="sf-display sf-display--page sf-titleline"><span aria-hidden="true" className="sf-dot sf-dot--bad" /><span>Page could not load</span></h1>
        <p className="sf-muted">A failed page load does not confirm or cancel a submitted request.</p>
        <div className="sf-track"><button type="button" className="sf-pill sf-pill--raised" onClick={reset}>Retry</button></div>
        <EmergencyNotice />
      </section>
    </StorefrontShell>
  )
}

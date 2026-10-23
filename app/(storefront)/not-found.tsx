import Link from 'next/link'
import { StorefrontShell, EmergencyNotice } from '@/features/storefront/components/StorefrontShell'
export default function PublicNotFound() {
  return (
    <StorefrontShell>
      <section className="sf-container sf-state">
        <p className="sf-eyebrow">404</p>
        <h1 className="sf-display sf-display--page">Page not found</h1>
        <div className="sf-track">
          <Link className="sf-pill sf-pill--primary" href="/book">Request a visit</Link>
          <Link className="sf-pill" href="/">Home</Link>
        </div>
        <EmergencyNotice />
      </section>
    </StorefrontShell>
  )
}

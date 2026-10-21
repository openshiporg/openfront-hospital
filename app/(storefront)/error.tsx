'use client'
import { StorefrontShell, EmergencyNotice } from '@/features/storefront/components/StorefrontShell'
export default function PublicError({ reset }: { reset: () => void }) {
  return <StorefrontShell><section className="sf-container sf-workbench"><h1 className="sf-display sf-display--section">Patient services could not be loaded</h1><p>Availability and practice details are temporarily unavailable. A failed page load does not confirm or cancel a submitted request. Check its original receipt before making another request.</p><button className="sf-btn sf-btn--secondary" onClick={reset}>Retry loading this page</button><EmergencyNotice /></section></StorefrontShell>
}

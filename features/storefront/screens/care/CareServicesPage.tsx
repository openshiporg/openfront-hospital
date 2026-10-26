import Link from 'next/link'

import { EmergencyNotice, Sign, StorefrontShell, zoneFor } from '@/features/storefront/components/StorefrontShell'
import { VisitZones } from '@/features/storefront/components/VisitZones'
import { careServiceLines } from '@/features/storefront/lib/careServices'
import { getBookableAppointmentTypes } from '@/features/storefront/lib/data/booking'
import { getHospitalBranding } from '@/features/storefront/lib/data/branding'

export async function CareServicesPage() {
  const [profile, appointmentTypes] = await Promise.all([
    getHospitalBranding(),
    getBookableAppointmentTypes(),
  ])
  const serviceLines = careServiceLines(appointmentTypes)

  return (
    <StorefrontShell profile={profile} current="care">
      <header className="sf-pagehead">
        <div className="sf-container sf-pagehead__inner sf-reveal">
          <div>
            <h1 className="sf-display sf-display--page">Care services</h1>
            {serviceLines.length > 0 && (
              <nav aria-label="Service zones" style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
                {serviceLines.map(line => <Link key={line.key} href={`#${line.key}`}><Sign zone={zoneFor(line.key)} label={line.title} /></Link>)}
              </nav>
            )}
          </div>
          <EmergencyNotice />
        </div>
      </header>

      <div className="sf-container">
        {serviceLines.length === 0 ? (
          <div className="sf-empty" style={{ marginTop: 'var(--space-lg)' }}>
            <h2 className="sf-empty__title">No visit types are open for online requests</h2>
            {profile.supportPhoneHref && <div className="sf-track"><a className="sf-pill sf-pill--raised" href={profile.supportPhoneHref}>Call {profile.supportPhone}</a></div>}
          </div>
        ) : <VisitZones serviceLines={serviceLines} />}
      </div>
    </StorefrontShell>
  )
}

export default CareServicesPage

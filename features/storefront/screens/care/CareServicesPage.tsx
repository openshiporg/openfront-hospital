import Link from 'next/link'

import { EmergencyNotice, StorefrontShell } from '@/features/storefront/components/StorefrontShell'
import { VisitZones } from '@/features/storefront/components/VisitZones'
import { careServiceLines } from '@/features/storefront/lib/careServices'
import { getBookableAppointmentTypes } from '@/features/storefront/lib/data/booking'
import { getHospitalBranding } from '@/features/storefront/lib/data/branding'
import { getPublicCareDirectory } from '@/features/storefront/lib/data/directory'

export async function CareServicesPage() {
  const [profile, appointmentTypes, directory] = await Promise.all([
    getHospitalBranding(),
    getBookableAppointmentTypes(),
    getPublicCareDirectory(),
  ])
  const serviceLines = careServiceLines(appointmentTypes)

  return (
    <StorefrontShell profile={profile} current="care">
      <header className="sf-pagehead">
        <div className="sf-container sf-pagehead__inner sf-reveal">
          <div>
            <h1 className="sf-display sf-display--page">Care services</h1>
            {serviceLines.length > 1 && (
              <nav aria-label="Departments" className="sf-track sf-track--wrap">
                {serviceLines.map(line => <Link key={line.key} className="sf-pill sf-pill--sm" href={`#${line.key}`}>{line.title}</Link>)}
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
        ) : <VisitZones serviceLines={serviceLines} departments={directory.departments} />}
      </div>
    </StorefrontShell>
  )
}

export default CareServicesPage

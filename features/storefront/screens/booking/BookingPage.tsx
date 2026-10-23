import { EmergencyNotice, StorefrontShell } from '@/features/storefront/components/StorefrontShell'
import { VisitZones } from '@/features/storefront/components/VisitZones'
import { careServiceLines } from '@/features/storefront/lib/careServices'
import { getBookableAppointmentTypes } from '@/features/storefront/lib/data/booking'
import { getHospitalBranding } from '@/features/storefront/lib/data/branding'

export default async function BookingPage() {
  const [profile, appointmentTypes] = await Promise.all([getHospitalBranding(), getBookableAppointmentTypes()])
  const serviceLines = careServiceLines(appointmentTypes)

  return (
    <StorefrontShell profile={profile} current="book" bookingBar={false}>
      <header className="sf-pagehead">
        <div className="sf-container sf-pagehead__inner sf-reveal">
          <div>
            <ol className="sf-stepper" aria-label="Request steps">
              <li data-state="current" aria-current="step"><span>1</span>Visit</li>
              <li><span>2</span>Time</li>
              <li><span>3</span>Details</li>
            </ol>
            <h1 className="sf-display sf-display--page">Request a visit</h1>
            <p className="sf-pagehead__count">No account needed · staff confirm every request</p>
          </div>
          <EmergencyNotice />
        </div>
      </header>
      <div className="sf-container">
        {serviceLines.length === 0 ? (
          <div className="sf-empty" style={{ marginTop: 'var(--space-lg)' }}>
            <h2 className="sf-empty__title">Online requests are not open</h2>
            {profile.supportPhoneHref && <div className="sf-track"><a className="sf-pill sf-pill--raised" href={profile.supportPhoneHref}>Call {profile.supportPhone}</a></div>}
          </div>
        ) : <VisitZones serviceLines={serviceLines} />}
      </div>
    </StorefrontShell>
  )
}

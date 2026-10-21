import Link from 'next/link'
import { EmergencyNotice, StorefrontShell } from '@/features/storefront/components/StorefrontShell'
import { getBookableAppointmentTypes } from '@/features/storefront/lib/data/booking'
import { getHospitalBranding } from '@/features/storefront/lib/data/branding'

export default async function BookingPage() {
  const [profile, appointmentTypes] = await Promise.all([getHospitalBranding(), getBookableAppointmentTypes()])

  return (
    <StorefrontShell profile={profile}>
      <header className="sf-page-hero sf-reveal">
        <div className="sf-container sf-page-hero__grid">
          <div>
            <p className="sf-eyebrow">Request an appointment</p>
            <h1 className="sf-display sf-display--hero" style={{ marginTop: '1rem', maxWidth: '9ch' }}>Find the care that fits today.</h1>
            <p className="sf-lead">Choose a visit type, then select a clinician and an available time. The practice reviews every request before confirming.</p>
          </div>
          <div className="sf-page-hero__aside"><strong>No account required.</strong><p style={{ marginTop: '.6rem' }}>After your request, a private intake link helps you prepare for the visit.</p></div>
        </div>
      </header>
      <div className="sf-page-photo"><img src={profile.media.primaryCare} alt="A clinician and patient discussing a care plan" /></div>
      <section className="sf-catalogue">
        <div className="sf-container">
          <EmergencyNotice />
          {appointmentTypes.length === 0 ? (
            <div className="sf-empty" style={{ marginTop: '2rem' }}><h2 className="sf-empty__title">Online booking is not available yet</h2><p className="sf-empty__text">The clinic needs active providers, bookable visit types, and schedule blocks before patients can request appointments online.</p></div>
          ) : (
            <div className="sf-catalogue__list" style={{ marginTop: '2.5rem' }}>
              {appointmentTypes.map((type, index) => (
                <article key={type.id} className="sf-catalogue__item">
                  <span className="sf-catalogue__index">0{index + 1}</span>
                  <div>
                    <h2 className="sf-catalogue__title">{type.name}</h2>
                    <p className="sf-catalogue__desc">{type.description || `Request this visit with an available ${profile.shortName} care team member.`}</p>
                    <div className="sf-catalogue__meta"><span>{type.durationMinutes} minutes</span><span>{type.providers.map((provider) => provider.displayName).join(' · ')}</span><span className="sf-catalogue__price">{type.formattedPrice || 'Estimate provided by clinic'}</span></div>
                  </div>
                  <Link className="sf-btn sf-btn--primary" href={`/book/${type.slug}`}>Choose a time <span className="sf-arrow">→</span></Link>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </StorefrontShell>
  )
}

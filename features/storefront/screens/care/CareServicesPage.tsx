import Link from 'next/link'

import { EmergencyNotice, StorefrontShell } from '@/features/storefront/components/StorefrontShell'
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
    <StorefrontShell profile={profile}>
      <header className="sf-page-hero sf-reveal">
        <div className="sf-container sf-page-hero__grid">
          <div>
            <p className="sf-eyebrow">Care services</p>
            <h1 className="sf-display sf-display--hero" style={{ marginTop: '1rem', maxWidth: '10ch' }}>Care available through this front door.</h1>
            <p className="sf-lead">Explore the care services currently represented here. This is not a directory of every hospital or emergency service.</p>
          </div>
          <div className="sf-page-hero__aside">
            <strong>Start with a visit type.</strong>
            <p style={{ marginTop: '.6rem' }}>Staff reviews every online appointment request before it is confirmed.</p>
          </div>
        </div>
      </header>

      <section className="sf-catalogue" aria-labelledby="care-services-heading">
        <div className="sf-container">
          <EmergencyNotice />
          <h2 id="care-services-heading" className="sf-display sf-display--section" style={{ marginTop: '2rem' }}>Available service lines</h2>
          {serviceLines.length === 0 ? (
            <div className="sf-empty" style={{ marginTop: '2rem' }}>
              <h3 className="sf-empty__title">Online care discovery is not available yet</h3>
              <p className="sf-empty__text">Contact scheduling for current services. No visit availability is implied on this page.</p>
            </div>
          ) : (
            <div className="sf-catalogue__list" style={{ marginTop: '2rem' }}>
              {serviceLines.map((line, index) => (
                <article key={line.key} className="sf-catalogue__item" id={line.key}>
                  <span className="sf-catalogue__index">0{index + 1}</span>
                  <div>
                    <h3 className="sf-catalogue__title">{line.title}</h3>
                    <p className="sf-catalogue__desc">{line.description}</p>
                    <div className="sf-chip-row" style={{ marginTop: '1rem' }}>
                      {line.appointmentTypes.map(type => (
                        <Link className="sf-chip" key={type.id} href={`/book/${type.slug}`}>
                          {type.name} · {type.durationMinutes} min
                        </Link>
                      ))}
                    </div>
                  </div>
                  <Link className="sf-btn sf-btn--primary" href="/book">See appointment options <span className="sf-arrow">→</span></Link>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </StorefrontShell>
  )
}

export default CareServicesPage

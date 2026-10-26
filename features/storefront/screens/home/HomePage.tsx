import Link from 'next/link'
import { Dot, EmergencyNotice, StorefrontShell, zoneFor } from '@/features/storefront/components/StorefrontShell'
import { getBookableAppointmentTypes } from '@/features/storefront/lib/data/booking'
import { getBookableProviders } from '@/features/storefront/lib/data/providers'
import { getHospitalBranding } from '@/features/storefront/lib/data/branding'
import { careServiceLines } from '@/features/storefront/lib/careServices'

export async function HomePage() {
  const [profile, appointmentTypes, providers] = await Promise.all([
    getHospitalBranding(),
    getBookableAppointmentTypes(),
    getBookableProviders(),
  ])
  const serviceLines = careServiceLines(appointmentTypes)
  const previewProviders = providers.slice(0, 3)
  const shortestVisit = appointmentTypes.reduce<number | null>((min, type) => (min === null || type.durationMinutes < min ? type.durationMinutes : min), null)

  return (
    <StorefrontShell profile={profile}>
      <section className="sf-front" aria-labelledby="home-heading">
        <div className="sf-container">
          <div className="sf-front__head">
            <div className="sf-reveal">
              <h1 id="home-heading" className="sf-display sf-display--hero sf-front__title">{profile.name}</h1>
              {profile.description && <p className="sf-lead" style={{ marginTop: '1rem' }}>{profile.description}</p>}
            </div>
            <div className="sf-front__side">
              <div className="sf-track">
                <Link className="sf-pill sf-pill--primary" href="/book">Request a visit <span className="sf-arrow">→</span></Link>
                <Link className="sf-pill" href="/intake">Pre-visit intake</Link>
              </div>
              <p className="sf-front__facts">
                <span>{profile.locationName}</span>
                <span>{appointmentTypes.length} visit {appointmentTypes.length === 1 ? 'type' : 'types'}</span>
                <span>{providers.length} {providers.length === 1 ? 'clinician' : 'clinicians'}</span>
                {shortestVisit !== null && <span>From {shortestVisit} min</span>}
              </p>
              <EmergencyNotice />
            </div>
          </div>
          <div className="sf-front__rack" aria-labelledby="directory-heading">
            <h2 id="directory-heading" className="sf-sr">Care services</h2>
            {serviceLines.length === 0 ? (
              <div className="sf-empty"><p className="sf-empty__title">No visit types are open for online requests.</p><p className="sf-muted">Call the practice to arrange a visit.</p></div>
            ) : (
              <ul className="sf-rack">
                {serviceLines.map(line => {
                  const zone = zoneFor(line.key)
                  const cover = line.key === 'primary-care' ? profile.media.primaryCare : line.key === 'behavioral-health' ? profile.media.behavioralHealth : profile.media.telehealth
                  return (
                    <li key={line.key} id={line.key} className={`sf-leaflet ${zone.className}`}>
                      <div className="sf-leaflet__cover">
                        {cover && <img src={cover} alt="" loading="lazy" />}
                        <h3 className="sf-leaflet__title">{line.title}</h3>
                        <p className="sf-leaflet__count">{line.appointmentTypes.length} {line.appointmentTypes.length === 1 ? 'visit' : 'visits'} open for requests</p>
                      </div>
                      <div className="sf-leaflet__inside">
                        <p className="sf-leaflet__desc">{line.description}</p>
                        <div className="sf-leaflet__visits">
                          {line.appointmentTypes.map(type => (
                            <Link key={type.id} className="sf-leaflet__visit" href={`/book/${type.slug}`}>
                              <strong>{type.name}</strong>
                              <span className="sf-leaflet__len">{type.durationMinutes} min</span>
                              {type.providers.length > 0 && <span className="sf-leaflet__who">{type.providers.map(provider => provider.displayName).join(' · ')}</span>}
                            </Link>
                          ))}
                        </div>
                        <Link className="sf-leaflet__go" href={`/care#${line.key}`}>All {line.title.toLowerCase()} details <span className="sf-arrow">→</span></Link>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="sf-section" aria-labelledby="steps-heading">
        <div className="sf-container">
          <div className="sf-section__head">
            <div>
              <h2 id="steps-heading" className="sf-display sf-display--section">Three steps</h2>
            </div>
          </div>
          <ol className="sf-steps">
            <li><h3 className="sf-steps__title">Choose a visit</h3><p className="sf-muted">Visit type, clinician and location</p></li>
            <li><h3 className="sf-steps__title">Request a time</h3><p className="sf-muted">Staff confirm every request</p></li>
            <li><h3 className="sf-steps__title">Complete intake</h3><p className="sf-muted">Private link, no account</p></li>
          </ol>
        </div>
      </section>

      {previewProviders.length > 0 && (
        <section className="sf-section" aria-labelledby="team-heading" style={{ paddingTop: 0 }}>
          <div className="sf-container">
            <div className="sf-section__head">
              <div>
                <h2 id="team-heading" className="sf-display sf-display--section">Accepting requests</h2>
              </div>
              <div className="sf-track"><Link className="sf-pill sf-pill--raised" href="/providers">All clinicians <span className="sf-arrow">→</span></Link></div>
            </div>
            <ul className="sf-people">
              {previewProviders.map(provider => (
                <li key={provider.id} className="sf-person">
                  <div className="sf-person__photo">
                    {provider.imagePath
                      ? <img src={provider.imagePath} alt={provider.imageAltText || provider.displayName} loading="lazy" />
                      : <div className="sf-person__initials" aria-hidden="true">{(provider.firstName?.[0] || '') + (provider.lastName?.[0] || '')}</div>}
                  </div>
                  <div className="sf-person__body">
                    <h3 className="sf-person__name sf-titleline"><Dot tone="ok" /><span><span className="sf-sr">Accepting requests: </span><Link href={`/providers/${provider.id}`}>{provider.displayName}</Link></span></h3>
                    <p className="sf-person__meta">
                      {provider.specialty && <span>{provider.specialty}</span>}
                      {provider.credentials && <span>{provider.credentials}</span>}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section id="visit" className="sf-container" aria-labelledby="visit-heading" style={{ scrollMarginTop: '6rem' }}>
        <h2 id="visit-heading" className="sf-sr">Visit us</h2>
        <div className="sf-place">
          <div className="sf-place__item">
            <span className="sf-eyebrow">Location</span>
            <strong>{profile.locationName}</strong>
            {profile.addressLine1 && <span>{profile.addressLine1}</span>}
            {(profile.city || profile.region || profile.postalCode) && <span>{[profile.city, profile.region, profile.postalCode].filter(Boolean).join(', ')}</span>}
          </div>
          <div className="sf-place__item">
            <span className="sf-eyebrow">Scheduling</span>
            {profile.supportPhoneHref ? <a href={profile.supportPhoneHref}>{profile.supportPhone}</a> : <span>Phone not listed</span>}
            {profile.supportEmailHref && <a href={profile.supportEmailHref}>{profile.supportEmail}</a>}
          </div>
          <div className="sf-place__item">
            <span className="sf-eyebrow">Service area</span>
            <strong>{profile.serviceArea}</strong>
          </div>
        </div>
      </section>
    </StorefrontShell>
  )
}

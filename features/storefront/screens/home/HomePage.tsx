import Link from 'next/link'
import { Dot, Sign, StorefrontShell, zoneFor } from '@/features/storefront/components/StorefrontShell'
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
      <section className="sf-hero" aria-labelledby="home-heading">
        <div className="sf-container sf-hero__grid">
          <div className="sf-hero__copy sf-reveal">
            <p className="sf-eyebrow">{profile.locationName}</p>
            <h1 id="home-heading" className="sf-display sf-display--hero sf-hero__title">{profile.name}</h1>
            {profile.description && <p className="sf-lead">{profile.description}</p>}
            <div>
              <div className="sf-track">
                <Link className="sf-pill sf-pill--primary" href="/book">Request a visit <span className="sf-arrow">→</span></Link>
                <Link className="sf-pill" href="/providers">Care team</Link>
                <Link className="sf-pill" href="/intake">Intake</Link>
              </div>
            </div>
            <div className="sf-hero__facts">
              <span><Dot tone={appointmentTypes.length ? 'ok' : undefined} />{appointmentTypes.length} visit {appointmentTypes.length === 1 ? 'type' : 'types'}</span>
              <span><Dot tone={providers.length ? 'ok' : undefined} />{providers.length} {providers.length === 1 ? 'clinician' : 'clinicians'}</span>
              {shortestVisit !== null && <span><Dot />From {shortestVisit} min</span>}
            </div>
          </div>
          <div className="sf-hero__media sf-reveal">
            <img src={profile.media.hero} alt="A family talking with a physician" />
            {serviceLines.length > 0 && (
              <div className="sf-hero__signs" aria-hidden="true">
                {serviceLines.map(line => <Sign key={line.key} zone={zoneFor(line.key)} label={line.title} />)}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="sf-container" aria-labelledby="directory-heading">
        <div className="sf-directory">
          <div className="sf-directory__head">
            <div>
              <p className="sf-eyebrow">Directory</p>
              <h2 id="directory-heading" className="sf-display sf-display--section" style={{ marginTop: '.4rem' }}>Care services</h2>
            </div>
            <div className="sf-track sf-track--lobby">
              <Link className="sf-pill sf-pill--raised" href="/care">All services <span className="sf-arrow">→</span></Link>
            </div>
          </div>
          {serviceLines.length === 0 ? (
            <p className="sf-directory__empty">No visit types are open for online requests.</p>
          ) : (
            <ul className="sf-directory__rows">
              {serviceLines.map(line => {
                const zone = zoneFor(line.key)
                return (
                  <li key={line.key} className={`sf-directory__row ${zone.className}`}>
                    <span className="sf-directory__code" aria-hidden="true">{zone.code}</span>
                    <h3 className="sf-directory__title">{line.title}</h3>
                    <div className="sf-directory__visits">
                      {line.appointmentTypes.map(type => (
                        <Link key={type.id} className="sf-directory__visit" href={`/book/${type.slug}`}>
                          {type.name}<span className="sf-mono">{type.durationMinutes} min</span>
                        </Link>
                      ))}
                    </div>
                    <Link className="sf-directory__go sf-eyebrow" style={{ color: 'var(--color-lobby-ink)' }} href={`/care#${line.key}`}>Zone {zone.code} →</Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="sf-section" aria-labelledby="steps-heading">
        <div className="sf-container">
          <div className="sf-section__head">
            <div>
              <p className="sf-eyebrow">Getting seen</p>
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
                <p className="sf-eyebrow">Care team</p>
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

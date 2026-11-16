import Link from 'next/link'
import { ArrowRight, CalendarDays, ClipboardList, CreditCard, MapPin, HeartPulse, Stethoscope, Video, UserRound, Users, BedDouble, ShieldCheck } from 'lucide-react'
import { EmergencyNotice, StorefrontShell } from '@/features/storefront/components/StorefrontShell'
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

  const lineIcon = (key: string) => key === 'primary-care' ? Stethoscope : key === 'behavioral-health' ? HeartPulse : Video
  const place = [profile.addressLine1, profile.city, profile.region, profile.postalCode].filter(Boolean).join(', ')

  return (
    <StorefrontShell profile={profile}>
      <div className="sf-dg">
        <section className="sf-dg__card sf-dg__hero" aria-labelledby="home-heading">
          <div className="sf-dg__copy sf-reveal">
            <h1 id="home-heading" className="sf-dg__title sf-dg__title--hero">{profile.name}</h1>
            {profile.description && <p className="sf-dg__text">{profile.description}</p>}
            <div className="sf-track sf-track--wrap">
              <Link className="sf-pill sf-pill--primary" href="/book">Request a visit <ArrowRight aria-hidden="true" className="sf-arrow" /></Link>
              <Link className="sf-pill sf-dg__ghost" href="/care">Our services</Link>
            </div>
            <EmergencyNotice />
          </div>
          <div className="sf-dg__media">{profile.media.hero && <img src={profile.media.hero} alt="" />}</div>
        </section>

        <section className="sf-dg__card" aria-label="Quick actions">
          <div className="sf-dg__tiles sf-dg__tiles--4">
            <Link className="sf-dg__tile" href="/book"><CalendarDays aria-hidden="true" />Request a visit</Link>
            <Link className="sf-dg__tile" href="/intake"><ClipboardList aria-hidden="true" />Pre-visit intake</Link>
            <Link className="sf-dg__tile" href="/pay"><CreditCard aria-hidden="true" />Pay a bill</Link>
            <Link className="sf-dg__tile" href="/locations"><MapPin aria-hidden="true" />Locations</Link>
          </div>
        </section>

        <section id="care" className="sf-dg__card sf-dg__card--split" aria-labelledby="care-heading">
          <div className="sf-dg__copy">
            <span className="sf-dg__eyebrow">Care &amp; services</span>
            <h2 id="care-heading" className="sf-dg__title">Care for every stage of life</h2>
            <p className="sf-dg__text">Choose a visit type, a clinician and a time. Staff confirm every request.</p>
            <Link className="sf-pill sf-dg__ghost" href="/care">Explore all services <ArrowRight aria-hidden="true" className="sf-arrow" /></Link>
          </div>
          {serviceLines.length === 0 ? (
            <div className="sf-empty"><p className="sf-empty__title">No visit types are open for online requests.</p><p className="sf-muted">Call the practice to arrange a visit.</p></div>
          ) : (
            <div className="sf-dg__tiles sf-dg__tiles--3">
              {serviceLines.map(line => {
                const Icon = lineIcon(line.key)
                return (
                  <Link key={line.key} id={line.key} className="sf-dg__tile" href={line.appointmentTypes.length === 1 ? `/book/${line.appointmentTypes[0].slug}` : `/care#${line.key}`}>
                    <Icon aria-hidden="true" />
                    <span>{line.title}<small>{line.appointmentTypes.length} {line.appointmentTypes.length === 1 ? 'visit' : 'visits'}</small></span>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        {serviceLines.length > 0 && (
          <section className="sf-dg__card" aria-labelledby="visits-heading">
            <div className="sf-dg__copy">
              <span className="sf-dg__eyebrow">Book a visit</span>
              <h2 id="visits-heading" className="sf-dg__title">Open for requests</h2>
            </div>
            <div className="sf-dg__list">
              {serviceLines.flatMap(line => line.appointmentTypes).map(type => (
                <Link key={type.id} className="sf-dg__row" href={`/book/${type.slug}`}>
                  <CalendarDays aria-hidden="true" />
                  <span>{type.name}<small>{type.durationMinutes} min{type.providers.length > 0 ? ` · ${type.providers.map(p => p.displayName).join(' · ')}` : ''}</small></span>
                  <ArrowRight aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {previewProviders.length > 0 && (
          <section className="sf-dg__card sf-dg__card--split" aria-labelledby="team-heading">
            <div className="sf-dg__copy">
              <span className="sf-dg__eyebrow">Find a doctor</span>
              <h2 id="team-heading" className="sf-dg__title">Expert care from people who care</h2>
              <Link className="sf-pill sf-pill--primary" href="/providers">Find a doctor <ArrowRight aria-hidden="true" className="sf-arrow" /></Link>
            </div>
            <ul className="sf-dg__people">
              {previewProviders.map(provider => (
                <li key={provider.id}>
                  <Link className="sf-dg__person" href={`/providers/${provider.id}`}>
                    {provider.imagePath
                      ? <img src={provider.imagePath} alt={provider.imageAltText || provider.displayName} loading="lazy" />
                      : <div className="sf-person__initials" aria-hidden="true">{(provider.firstName?.[0] || '') + (provider.lastName?.[0] || '')}</div>}
                    <span><strong>{provider.displayName}</strong><small>{[provider.specialty, provider.credentials].filter(Boolean).join(' · ')}</small></span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="sf-dg__card sf-dg__card--split" aria-labelledby="res-heading">
          <div className="sf-dg__copy">
            <span className="sf-dg__eyebrow">For patients &amp; visitors</span>
            <h2 id="res-heading" className="sf-dg__title">Helpful resources for your visit</h2>
            <p className="sf-dg__text">Plan your visit, manage your care and pay your bill.</p>
          </div>
          <div className="sf-dg__list">
            <Link className="sf-dg__row" href="/visit"><BedDouble aria-hidden="true" /><span>Your visit</span><ArrowRight aria-hidden="true" /></Link>
            <Link className="sf-dg__row" href="/intake"><Users aria-hidden="true" /><span>Pre-visit intake</span><ArrowRight aria-hidden="true" /></Link>
            <Link className="sf-dg__row" href="/account"><UserRound aria-hidden="true" /><span>Your account</span><ArrowRight aria-hidden="true" /></Link>
            <Link className="sf-dg__row" href="/pay"><ShieldCheck aria-hidden="true" /><span>Pay a bill</span><ArrowRight aria-hidden="true" /></Link>
          </div>
        </section>

        <section id="visit" className="sf-dg__card" aria-labelledby="visit-heading" style={{ scrollMarginTop: '6rem' }}>
          <h2 id="visit-heading" className="sf-sr">Visit us</h2>
          <div className="sf-place" style={{ boxShadow: 'none', padding: 0, background: 'none' }}>
            <div className="sf-place__item">
              <span className="sf-dg__eyebrow">Location</span>
              <strong>{profile.locationName}</strong>
              {place && <span>{place}</span>}
            </div>
            <div className="sf-place__item">
              <span className="sf-dg__eyebrow">Scheduling</span>
              {profile.supportPhoneHref ? <a href={profile.supportPhoneHref}>{profile.supportPhone}</a> : <span>Phone not listed</span>}
              {profile.supportEmailHref && <a href={profile.supportEmailHref}>{profile.supportEmail}</a>}
            </div>
            <div className="sf-place__item">
              <span className="sf-dg__eyebrow">Service area</span>
              <strong>{profile.serviceArea}</strong>
            </div>
          </div>
        </section>

        <section className="sf-dg__card sf-dg__cta" aria-labelledby="cta-heading">
          <div className="sf-dg__copy">
            <h2 id="cta-heading" className="sf-dg__title">Ready to take the next step?</h2>
            <p>Request a visit, find a doctor, or get the care you need today.</p>
          </div>
          <Link className="sf-pill" href="/book">Request a visit <ArrowRight aria-hidden="true" className="sf-arrow" /></Link>
        </section>
      </div>
    </StorefrontShell>
  )
}

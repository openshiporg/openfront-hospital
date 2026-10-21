import Link from 'next/link'
import { StorefrontShell } from '@/features/storefront/components/StorefrontShell'
import { getBookableAppointmentTypes } from '@/features/storefront/lib/data/booking'
import { getBookableProviders } from '@/features/storefront/lib/data/providers'
import { getHospitalBranding, type HospitalBranding } from '@/features/storefront/lib/data/branding'
import { careServiceLines } from '@/features/storefront/lib/careServices'
import type { BookableAppointmentType } from '@/features/storefront/lib/data/booking'

const pathways = (profile: HospitalBranding, appointmentTypes: BookableAppointmentType[]) =>
  careServiceLines(appointmentTypes).map(line => ({
    title: line.title,
    text: line.description,
    image: line.key === 'primary-care'
      ? profile.media.primaryCare
      : line.key === 'behavioral-health'
        ? profile.media.behavioralHealth
        : profile.media.clinic,
    alt: `${line.title} currently represented by active appointment types`,
    href: `/care#${line.key}`,
  }))

const patientPath = (profile: HospitalBranding) => [
  { title: 'Choose the care you need', text: `Review real visit types, clinicians, durations, and clinic estimates from the ${profile.shortName} schedule.` },
  { title: 'Request an available time', text: 'Select a provider and an open slot. Our staff reviews each request before it is confirmed.' },
  { title: 'Prepare before the visit', text: 'Use your private intake link to share the details the care team needs, without creating an account.' },
]

export async function HomePage() {
  const [profile, appointmentTypes, providers] = await Promise.all([
    getHospitalBranding(),
    getBookableAppointmentTypes(),
    getBookableProviders(),
  ])
  const availablePathways = pathways(profile, appointmentTypes)
  const previewProviders = providers.filter(provider => Boolean(provider.imagePath)).slice(0, 2)

  return (
    <StorefrontShell profile={profile}>
      <section className="sf-hero sf-reveal" aria-labelledby="home-heading">
        <div className="sf-hero__frame">
          <img className="sf-hero__media" src={profile.media.hero} alt="A family talking with a physician during a calm consultation" />
          <div className="sf-hero__veil" />
          <div className="sf-container sf-hero__content">
            <div className="sf-hero__copy">
              <p className="sf-eyebrow">{[profile.locationName, 'Patient services'].filter(Boolean).join(' · ')}</p>
              <h1 id="home-heading" className="sf-display sf-display--hero sf-hero__title">A clear first step into care.</h1>
              <p className="sf-lead sf-hero__lead">Review currently bookable visit types and send a non-emergency appointment request for staff review.</p>
              <div className="sf-hero__actions">
                <Link className="sf-btn sf-btn--light" href="/book">Find care <span className="sf-arrow">→</span></Link>
                <Link className="sf-btn sf-btn--secondary" href="/providers" style={{ color: 'white', borderColor: 'rgba(255,255,255,.4)' }}>Meet our care team</Link>
              </div>
              <p className="sf-hero__note">Non-emergency appointment requests are reviewed by clinic staff. No account is needed to begin.</p>
            </div>
          </div>
          <p className="sf-hero__caption">Available visits · staff-reviewed requests</p>
        </div>
      </section>

      <section className="sf-intro-strip">
        <div className="sf-container sf-intro-strip__grid">
          <p className="sf-intro-strip__aside">Public identity comes from the active organization profile; available care comes from active visit types and providers.</p>
          <p className="sf-intro-strip__statement">Start with the care options represented here, then let staff review the request before anything is confirmed.</p>
        </div>
      </section>

      <section className="sf-care" aria-labelledby="care-heading">
        <div className="sf-container">
          <div className="sf-section-head">
            <div className="sf-section-head__copy">
              <p className="sf-eyebrow">How we care</p>
              <h2 id="care-heading" className="sf-display sf-display--section" style={{ marginTop: '1rem' }}>Care currently available through this front door.</h2>
            </div>
            <Link className="sf-text-link" href="/care">Explore care services <span className="sf-arrow">→</span></Link>
          </div>
          <div className="sf-care__list">
            {availablePathways.map((pathway, index) => (
              <article className="sf-care-card" key={pathway.title}>
                <div className="sf-care-card__media"><img src={pathway.image} alt={pathway.alt} loading="lazy" /></div>
                <div className="sf-care-card__body">
                  <span className="sf-care-card__number">0{index + 1}</span>
                  <h3 className="sf-care-card__title">{pathway.title}</h3>
                  <p className="sf-care-card__text">{pathway.text}</p>
                  <Link className="sf-text-link" href={pathway.href}>Explore this care <span className="sf-arrow">→</span></Link>
                </div>
              </article>
            ))}
            {availablePathways.length === 0 ? (
              <div className="sf-empty" style={{ background: 'var(--color-paper)' }}>
                <h3 className="sf-empty__title">No online visit types are listed yet</h3>
                <p className="sf-empty__text">Contact scheduling for current services. No availability is implied by this storefront.</p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="sf-team-preview" aria-labelledby="team-heading">
        <div className="sf-container sf-team-preview__grid">
          <div>
            <p className="sf-eyebrow">Current care team</p>
            <h2 id="team-heading" className="sf-display sf-display--section" style={{ marginTop: '1rem' }}>Meet the people connected to available visits.</h2>
            <p className="sf-lead">Provider names, specialties, and visit relationships are shown from active scheduling records.</p>
            <Link className="sf-btn sf-btn--light" href="/providers">Meet the {profile.shortName} team <span className="sf-arrow">→</span></Link>
          </div>
          <div className="sf-team-preview__portraits">
            {previewProviders.map((provider) => (
              <figure key={provider.id}>
                <img
                  src={provider.imagePath || ''}
                  alt={`${provider.displayName} — ${provider.specialty || provider.credentials || `${profile.shortName} clinician`}`}
                />
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="sf-path" aria-labelledby="path-heading">
        <div className="sf-container sf-path__layout">
          <div>
            <p className="sf-eyebrow">Your next step</p>
            <h2 id="path-heading" className="sf-display sf-display--section" style={{ marginTop: '1rem' }}>From finding care to feeling ready.</h2>
          </div>
          <div>
            <ol className="sf-path__list">
              {patientPath(profile).map((step) => <li className="sf-path__item" key={step.title}><div><h3 className="sf-path__title">{step.title}</h3><p className="sf-path__text">{step.text}</p></div></li>)}
            </ol>
            {appointmentTypes.length > 0 ? (
              <div style={{ marginTop: '2rem' }}>
                <p className="sf-eyebrow">Available now</p>
                <div className="sf-chip-row" style={{ marginTop: '.8rem' }}>
                  {appointmentTypes.map((type) => <Link className="sf-chip" key={type.id} href={`/book/${type.slug}`}>{type.name} · {type.durationMinutes} min</Link>)}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </StorefrontShell>
  )
}

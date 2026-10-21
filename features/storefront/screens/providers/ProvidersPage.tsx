import Link from 'next/link'
import { EmergencyNotice, StorefrontShell } from '@/features/storefront/components/StorefrontShell'
import { getBookableProviders } from '@/features/storefront/lib/data/providers'
import { getHospitalBranding } from '@/features/storefront/lib/data/branding'

export async function ProvidersPage() {
  const [profile, providers] = await Promise.all([getHospitalBranding(), getBookableProviders()])

  return (
    <StorefrontShell profile={profile}>
      <header className="sf-page-hero sf-reveal">
        <div className="sf-container sf-page-hero__grid">
          <div>
            <p className="sf-eyebrow">The {profile.shortName} care team</p>
            <h1 className="sf-display sf-display--hero" style={{ marginTop: '1rem', maxWidth: '10ch' }}>Care feels different when people work together.</h1>
            <p className="sf-lead">Meet the clinicians currently accepting online requests for primary care, follow-up, and behavioral health visits.</p>
          </div>
          <div className="sf-page-hero__aside">
            <p><strong>{providers.length} clinicians accepting requests</strong></p>
            <p style={{ marginTop: '.6rem' }}>Every appointment request is reviewed by clinic staff. Choose a listed visit type to begin.</p>
          </div>
        </div>
      </header>

      <div className="sf-page-photo"><img src={profile.media.clinic} alt="A calm, naturally lit clinic waiting area" /></div>

      <section className="sf-container" style={{ paddingTop: '2rem' }}><EmergencyNotice /></section>

      <section className="sf-container sf-providers" aria-label="Bookable clinicians">
        {providers.length === 0 ? (
          <div className="sf-empty"><h2 className="sf-empty__title">No providers are listed yet</h2><p className="sf-empty__text">Active providers and their visit types will appear here once the clinic schedule is configured.</p></div>
        ) : providers.map((provider) => (
          <article key={provider.id} className="sf-provider">
            <div className="sf-provider__portrait-wrap">
              {provider.imagePath ? <img className="sf-provider__portrait" src={provider.imagePath} alt={provider.imageAltText || `Representative portrait for ${provider.displayName}`} /> : <div className="sf-provider__initials" aria-hidden="true">{(provider.firstName?.[0] || '') + (provider.lastName?.[0] || '')}</div>}
            </div>
            <div className="sf-provider__body">
              <p className="sf-eyebrow">{provider.credentials || `${profile.shortName} clinician`}</p>
              <h2 className="sf-display sf-provider__name" style={{ marginTop: '1rem' }}>{provider.displayName}</h2>
              {provider.specialty && <p className="sf-provider__specialty">{provider.specialty}</p>}
              {provider.locationName && <p className="sf-provider__location">{provider.locationName}</p>}
              {provider.bio && <p className="sf-provider__bio">{provider.bio}</p>}
              {provider.appointmentTypes.length > 0 ? (
                <div className="sf-provider__visits">
                  <p className="sf-eyebrow">Available visits</p>
                  <ul className="sf-provider__visit-list">
                    {provider.appointmentTypes.map((visitType) => (
                      <li key={visitType.id}><Link className="sf-provider__visit" href={`/book/${visitType.slug}?providerId=${provider.id}`}><span className="sf-provider__visit-name">{visitType.name} <span className="sf-arrow">→</span></span><span className="sf-provider__visit-meta">{visitType.durationMinutes ? `${visitType.durationMinutes} min` : ''}{visitType.formattedPrice ? ` · ${visitType.formattedPrice}` : ''}</span></Link></li>
                    ))}
                  </ul>
                </div>
              ) : <p className="sf-provider__bio">No bookable visit types are configured for this provider yet.</p>}
            </div>
          </article>
        ))}
      </section>
    </StorefrontShell>
  )
}

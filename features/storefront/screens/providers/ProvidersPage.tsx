import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Dot, EmergencyNotice, StorefrontShell } from '@/features/storefront/components/StorefrontShell'
import { getBookableProviders } from '@/features/storefront/lib/data/providers'
import { getHospitalBranding } from '@/features/storefront/lib/data/branding'

export async function ProvidersPage() {
  const [profile, providers] = await Promise.all([getHospitalBranding(), getBookableProviders()])

  return (
    <StorefrontShell profile={profile} current="providers">
      <header className="sf-pagehead">
        <div className="sf-container sf-pagehead__inner sf-reveal">
          <div>
            <h1 className="sf-display sf-display--page">Care team</h1>
            <p className="sf-pagehead__count">{providers.length} {providers.length === 1 ? 'clinician' : 'clinicians'} accepting requests</p>
          </div>
          <EmergencyNotice />
        </div>
      </header>

      <section className="sf-container" aria-label="Clinicians" style={{ paddingTop: 'var(--space-lg)' }}>
        {providers.length === 0 ? (
          <div className="sf-empty"><h2 className="sf-empty__title">No clinicians are accepting online requests</h2></div>
        ) : (
          <ul className="sf-people">
            {providers.map(provider => {
              const accepting = provider.appointmentTypes.length > 0
              return (
                <li key={provider.id} className="sf-person">
                  <div className="sf-person__photo">
                    {provider.imagePath
                      ? <img src={provider.imagePath} alt={provider.imageAltText || `Portrait of ${provider.displayName}`} loading="lazy" />
                      : <div className="sf-person__initials" aria-hidden="true">{(provider.firstName?.[0] || '') + (provider.lastName?.[0] || '')}</div>}
                  </div>
                  <div className="sf-person__body">
                    <h2 className="sf-person__name sf-titleline">
                      <Dot tone={accepting ? 'ok' : undefined} />
                      <span><span className="sf-sr">{accepting ? 'Accepting requests' : 'No online visits'}: </span><Link href={`/providers/${provider.id}`}>{provider.displayName}</Link></span>
                    </h2>
                    <p className="sf-person__meta">
                      {provider.credentials && <span>{provider.credentials}</span>}
                      {provider.specialty && <span>{provider.specialty}</span>}
                      {provider.locationName && <span>{provider.locationName}</span>}
                    </p>
                    {provider.bio && <p className="sf-person__bio">{provider.bio}</p>}
                    {accepting ? (
                      <ul className="sf-person__visits" aria-label={`Visits with ${provider.displayName}`}>
                        {provider.appointmentTypes.map(visitType => (
                          <li key={visitType.id}>
                            <Link className="sf-person__visit" href={`/book/${visitType.slug}?providerId=${provider.id}`}>
                              <span>{visitType.name} <ArrowRight aria-hidden="true" className="sf-arrow" /></span>
                              <span className="sf-mono">{[visitType.durationMinutes ? `${visitType.durationMinutes} min` : '', visitType.formattedPrice || ''].filter(Boolean).join(' · ')}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="sf-person__bio sf-muted">No online visits</p>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </StorefrontShell>
  )
}

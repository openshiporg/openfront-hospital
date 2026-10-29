import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { formatTimeZoneLabel } from '@/features/storefront/lib/facilityTime'
import { notFound } from 'next/navigation'
import { Dot, EmergencyNotice, StorefrontShell } from '@/features/storefront/components/StorefrontShell'
import { getBookableProviders } from '@/features/storefront/lib/data/providers'
import { getBookableAppointmentTypes } from '@/features/storefront/lib/data/booking'
import { getHospitalBranding } from '@/features/storefront/lib/data/branding'

export async function ProviderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, profile, providers, appointmentTypes] = await Promise.all([
    params,
    getHospitalBranding(),
    getBookableProviders(),
    getBookableAppointmentTypes(),
  ])
  const provider = providers.find(item => item.id === id)
  if (!provider) notFound()

  const accepting = provider.appointmentTypes.length > 0
  const facilities = new Map<string, { id: string; name: string; timeZone: string }>()
  for (const type of appointmentTypes) {
    for (const bookable of type.providers) {
      if (bookable.id !== provider.id) continue
      for (const facility of bookable.facilities) facilities.set(facility.id, facility)
    }
  }

  return (
    <StorefrontShell profile={profile} current="providers">
      <div className="sf-container sf-work">
        <aside className="sf-work__rail sf-reveal">
          <Link className="sf-back" href="/providers"><span aria-hidden="true">←</span> Care team</Link>
          <div className="sf-person">
            <div className="sf-person__photo">
              {provider.imagePath
                ? <img src={provider.imagePath} alt={provider.imageAltText || `Portrait of ${provider.displayName}`} />
                : <div className="sf-person__initials" aria-hidden="true">{(provider.firstName?.[0] || '') + (provider.lastName?.[0] || '')}</div>}
            </div>
            <div className="sf-person__body">
              <h1 className="sf-person__name sf-titleline">
                <Dot tone={accepting ? 'ok' : undefined} />
                <span><span className="sf-sr">{accepting ? 'Accepting requests' : 'No online visits'}: </span>{provider.displayName}</span>
              </h1>
              <dl className="sf-dl">
                {provider.credentials && <div><dt>Credentials</dt><dd>{provider.credentials}</dd></div>}
                {provider.specialty && <div><dt>Specialty</dt><dd>{provider.specialty}</dd></div>}
                {provider.locationName && <div><dt>Location</dt><dd>{provider.locationName}</dd></div>}
              </dl>
            </div>
          </div>
          <EmergencyNotice />
        </aside>

        <div className="sf-reveal">
          {provider.bio && (
            <section className="sf-panel" aria-labelledby="about-heading">
              <h2 id="about-heading" className="sf-step-title">About</h2>
              <p className="sf-person__bio" style={{ fontSize: 'var(--text-md)' }}>{provider.bio}</p>
            </section>
          )}

          <section className="sf-panel" aria-labelledby="visits-heading">
            <h2 id="visits-heading" className="sf-step-title">Visits</h2>
            {accepting ? (
              <ul className="sf-visits">
                {provider.appointmentTypes.map(visitType => (
                  <li key={visitType.id} className="sf-visit">
                    <div>
                      <p className="sf-visit__name">{visitType.name}</p>
                      <p className="sf-visit__meta">
                        {visitType.durationMinutes ? <span className="sf-mono">{visitType.durationMinutes} min</span> : null}
                        <span className="sf-mono">{visitType.formattedPrice || 'Estimate from clinic'}</span>
                      </p>
                    </div>
                    <div className="sf-track">
                      <Link className="sf-pill sf-pill--primary" href={`/book/${visitType.slug}?providerId=${provider.id}`}>Choose a time <ArrowRight aria-hidden="true" className="sf-arrow" /></Link>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="sf-muted">No online visits</p>}
          </section>

          {facilities.size > 0 && (
            <section className="sf-panel" aria-labelledby="where-heading">
              <h2 id="where-heading" className="sf-step-title">Where</h2>
              <dl className="sf-dl">
                {[...facilities.values()].map(facility => (
                  <div key={facility.id}><dt>{facility.name}</dt><dd>{formatTimeZoneLabel(facility.timeZone)}</dd></div>
                ))}
              </dl>
            </section>
          )}
        </div>
      </div>
    </StorefrontShell>
  )
}

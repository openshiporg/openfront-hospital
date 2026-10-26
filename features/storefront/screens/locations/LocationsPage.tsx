import Link from 'next/link'
import { Dot, EmergencyNotice, StorefrontShell } from '@/features/storefront/components/StorefrontShell'
import { getBookableAppointmentTypes } from '@/features/storefront/lib/data/booking'
import { getHospitalBranding } from '@/features/storefront/lib/data/branding'

type Location = {
  id: string
  name: string
  timeZone: string
  providers: Map<string, string>
  visits: Map<string, { name: string; slug: string; durationMinutes: number }>
}

export async function LocationsPage() {
  const [profile, appointmentTypes] = await Promise.all([getHospitalBranding(), getBookableAppointmentTypes()])

  const locations = new Map<string, Location>()
  for (const type of appointmentTypes) {
    for (const provider of type.providers) {
      for (const facility of provider.facilities) {
        const location = locations.get(facility.id) || { id: facility.id, name: facility.name, timeZone: facility.timeZone, providers: new Map(), visits: new Map() }
        location.providers.set(provider.id, provider.displayName)
        location.visits.set(type.id, { name: type.name, slug: type.slug, durationMinutes: type.durationMinutes })
        locations.set(facility.id, location)
      }
    }
  }
  const list = [...locations.values()].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <StorefrontShell profile={profile} current="locations">
      <header className="sf-pagehead">
        <div className="sf-container sf-pagehead__inner sf-reveal">
          <div>
            <h1 className="sf-display sf-display--page">Locations</h1>
            <p className="sf-pagehead__count">{list.length} {list.length === 1 ? 'location' : 'locations'} taking requests</p>
          </div>
          <EmergencyNotice />
        </div>
      </header>

      <div className="sf-container" style={{ paddingTop: 'var(--space-lg)', display: 'grid', gap: 'var(--space-md)' }}>
        <div className="sf-place">
          <div className="sf-place__item">
            <span className="sf-eyebrow">Main location</span>
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

        {list.length === 0 ? (
          <div className="sf-empty"><h2 className="sf-empty__title">No locations are taking online requests</h2></div>
        ) : (
          <ul className="sf-people">
            {list.map(location => (
              <li key={location.id} className="sf-ticket">
                <h2 className="sf-ticket__title sf-titleline"><Dot tone="ok" /><span><span className="sf-sr">Taking requests: </span>{location.name}</span></h2>
                <dl className="sf-dl">
                  <div><dt>Time zone</dt><dd className="sf-mono">{location.timeZone}</dd></div>
                  <div><dt>Clinicians</dt><dd>{[...location.providers.values()].join(', ')}</dd></div>
                </dl>
                <div className="sf-track">
                  {[...location.visits.values()].map(visit => (
                    <Link key={visit.slug} className="sf-pill sf-pill--sm" href={`/book/${visit.slug}`}>{visit.name} · {visit.durationMinutes} min</Link>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </StorefrontShell>
  )
}

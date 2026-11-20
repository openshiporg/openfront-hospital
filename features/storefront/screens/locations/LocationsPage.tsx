import { formatTimeZoneLabel } from '@/features/storefront/lib/facilityTime'
import Link from 'next/link'
import { EmergencyNotice, StorefrontShell } from '@/features/storefront/components/StorefrontShell'
import { Photo } from '@/features/storefront/components/Photo'
import { getBookableAppointmentTypes } from '@/features/storefront/lib/data/booking'
import { getHospitalBranding } from '@/features/storefront/lib/data/branding'
import { facilityAddress, facilityKind, getPublicCareDirectory } from '@/features/storefront/lib/data/directory'
import { publicPhoneHref } from '@/features/lib/publicPhone'

type Offered = {
  providers: Map<string, { id: string; name: string }>
  visits: Map<string, { name: string; slug: string; durationMinutes: number; providerId: string }>
}

export async function LocationsPage() {
  const [profile, appointmentTypes, directory] = await Promise.all([getHospitalBranding(), getBookableAppointmentTypes(), getPublicCareDirectory()])

  const offered = new Map<string, Offered>()
  for (const type of appointmentTypes) {
    for (const provider of type.providers) {
      for (const facility of provider.facilities) {
        const entry = offered.get(facility.id) || { providers: new Map(), visits: new Map() }
        entry.providers.set(provider.id, { id: provider.id, name: provider.displayName })
        if (!entry.visits.has(type.id)) entry.visits.set(type.id, { name: type.name, slug: type.slug, durationMinutes: type.durationMinutes, providerId: provider.id })
        offered.set(facility.id, entry)
      }
    }
  }
  const list = directory.facilities

  return (
    <StorefrontShell profile={profile} current="locations">
      <header className="sf-pagehead">
        <div className="sf-container sf-pagehead__inner sf-reveal">
          <div>
            <h1 className="sf-display sf-display--page">Locations</h1>
            <p className="sf-pagehead__count">{list.length} {list.length === 1 ? 'location' : 'locations'}{profile.serviceArea ? ` · ${profile.serviceArea}` : ''}</p>
          </div>
          <EmergencyNotice />
        </div>
      </header>

      <div className="sf-container" style={{ paddingTop: 'var(--space-lg)' }}>
        {list.length === 0 ? (
          <div className="sf-empty">
            <h2 className="sf-empty__title">No locations are listed yet</h2>
            {profile.supportPhoneHref && <div className="sf-track"><a className="sf-pill" href={profile.supportPhoneHref}>Call {profile.supportPhone}</a></div>}
          </div>
        ) : (
          <ul className="sf-sites">
            {list.map(facility => {
              const here = offered.get(facility.id)
              const lines = facilityAddress(facility)
              const phoneHref = facility.phone ? publicPhoneHref(facility.phone) : ''
              return (
                <li key={facility.id} className="sf-site">
                  <Photo src={facility.photoUrl} alt={facility.photoAltText || facility.name} />
                  <div className="sf-site__body">
                    <div>
                      <h2 className="sf-h2">{facility.name}</h2>
                      <p className="sf-site__kind">{facilityKind(facility)}{facility.departments.length > 0 ? ` · ${facility.departments.map(department => department.name).join(', ')}` : ''}</p>
                    </div>
                    {(lines.length > 0 || phoneHref) && (
                      <address>
                        {lines.map(line => <span key={line}>{line}</span>)}
                        {phoneHref && <a href={phoneHref}>{facility.phone}</a>}
                      </address>
                    )}
                    <dl className="sf-dl">
                      {facility.timeZone && <div><dt>Times shown in</dt><dd>{formatTimeZoneLabel(facility.timeZone)}</dd></div>}
                      {here && here.providers.size > 0 && (
                        <div><dt>Clinicians</dt><dd>{[...here.providers.values()].map((provider, index) => (
                          <span key={provider.id}>{index > 0 ? ', ' : ''}<Link href={`/providers/${provider.id}`} style={{ textDecoration: 'underline', textUnderlineOffset: '.2em' }}>{provider.name}</Link></span>
                        ))}</dd></div>
                      )}
                    </dl>
                    {here && here.visits.size > 0 ? (
                      <div className="sf-track sf-track--wrap" aria-label={`Request a visit at ${facility.name}`}>
                        {[...here.visits.values()].map(visit => (
                          <Link key={visit.slug} className="sf-pill" href={`/book/${visit.slug}?providerId=${visit.providerId}&facilityId=${facility.id}`}>{visit.name} · {visit.durationMinutes} min</Link>
                        ))}
                      </div>
                    ) : <p className="sf-muted">No online requests at this location. Call to arrange a visit.</p>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </StorefrontShell>
  )
}

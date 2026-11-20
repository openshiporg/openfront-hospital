import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { EmergencyNotice, StorefrontShell } from '@/features/storefront/components/StorefrontShell'
import { Photo } from '@/features/storefront/components/Photo'
import { getBookableAppointmentTypes } from '@/features/storefront/lib/data/booking'
import { getBookableProviders } from '@/features/storefront/lib/data/providers'
import { getHospitalBranding } from '@/features/storefront/lib/data/branding'
import { facilityAddress, facilityKind, getPublicCareDirectory, type PublicCareDirectory } from '@/features/storefront/lib/data/directory'
import { publicPhoneHref } from '@/features/lib/publicPhone'

export async function HomePage() {
  const [profile, appointmentTypes, providers, directory] = await Promise.all([
    getHospitalBranding(),
    getBookableAppointmentTypes(),
    getBookableProviders(),
    getPublicCareDirectory(),
  ])
  return <HomeView profile={profile} appointmentTypes={appointmentTypes} providers={providers} directory={directory} />
}

export function HomeView({ profile, appointmentTypes, providers, directory }: {
  profile: Awaited<ReturnType<typeof getHospitalBranding>>
  appointmentTypes: Awaited<ReturnType<typeof getBookableAppointmentTypes>>
  providers: Awaited<ReturnType<typeof getBookableProviders>>
  directory: PublicCareDirectory
}) {
  const lead = directory.facilities.find(facility => facility.photoUrl && facility.facilityType !== 'telehealth') || directory.facilities.find(facility => facility.photoUrl)
  const place = [profile.addressLine1, profile.city, profile.region, profile.postalCode].filter(Boolean).join(', ')

  return (
    <StorefrontShell profile={profile}>
      <div className="sf-container sf-home">
        <section className="sf-home__top" aria-labelledby="home-heading">
          <div className="sf-home__copy">
            <h1 id="home-heading" className="sf-home__title">{profile.name}</h1>
            {profile.description && <p className="sf-home__lead">{profile.description}</p>}
            <div className="sf-track sf-track--wrap">
              <Link className="sf-pill sf-pill--primary" href="/book">Request a visit <ArrowRight aria-hidden="true" className="sf-arrow" /></Link>
              {profile.supportPhoneHref && <a className="sf-pill" href={profile.supportPhoneHref}>Call {profile.supportPhone}</a>}
            </div>
            <p className="sf-home__facts">
              <span>{profile.locationName}{place ? `, ${place}` : ''}</span>
              {profile.supportEmailHref && <a href={profile.supportEmailHref}>{profile.supportEmail}</a>}
            </p>
            <EmergencyNotice />
          </div>
          {lead && <Photo src={lead.photoUrl} alt={lead.photoAltText || lead.name} eager />}
        </section>

        <section aria-labelledby="visits-heading">
          <div className="sf-sechead">
            <h2 id="visits-heading" className="sf-h2">Visits you can request online</h2>
            <Link href="/care">Care services <ArrowRight aria-hidden="true" className="sf-arrow" /></Link>
          </div>
          {appointmentTypes.length === 0 ? (
            <div className="sf-empty"><p className="sf-empty__title">No visit types are open for online requests.</p><p className="sf-muted">Call the practice to arrange a visit.</p></div>
          ) : (
            <div className="sf-rows">
              {appointmentTypes.map(type => (
                <Link key={type.id} className="sf-row" href={`/book/${type.slug}`}>
                  <span>
                    <strong>{type.name}</strong>
                    {type.description && <small>{type.description}</small>}
                    {type.providers.length > 0 && <small>{type.providers.map(provider => provider.displayName).join(' · ')}</small>}
                  </span>
                  <span className="sf-row__side">{type.durationMinutes} min <ArrowRight aria-hidden="true" className="sf-arrow" /></span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {providers.length > 0 && (
          <section aria-labelledby="team-heading">
            <div className="sf-sechead">
              <h2 id="team-heading" className="sf-h2">Care team</h2>
              <Link href="/providers">All clinicians <ArrowRight aria-hidden="true" className="sf-arrow" /></Link>
            </div>
            <ul className="sf-team">
              {providers.slice(0, 4).map(provider => (
                <li key={provider.id}>
                  <Link href={`/providers/${provider.id}`}>
                    <Photo src={provider.imagePath} alt={provider.imageAltText || `Portrait of ${provider.displayName}`} shape="portrait" />
                    <span>
                      <strong>{provider.displayName}</strong>
                      {provider.specialty && <small>{provider.specialty}</small>}
                      {provider.locationName && <small>{provider.locationName}</small>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {directory.facilities.length > 0 && (
          <section aria-labelledby="where-heading">
            <div className="sf-sechead">
              <h2 id="where-heading" className="sf-h2">Where we see patients</h2>
              <Link href="/locations">Locations <ArrowRight aria-hidden="true" className="sf-arrow" /></Link>
            </div>
            <ul className="sf-sites sf-sites--brief">
              {directory.facilities.map(facility => {
                const phoneHref = facility.phone ? publicPhoneHref(facility.phone) : ''
                const lines = facilityAddress(facility)
                return (
                  <li key={facility.id} className="sf-site">
                    <div className="sf-site__body">
                      <div>
                        <strong>{facility.name}</strong>
                        <p className="sf-site__kind">{facilityKind(facility)}</p>
                      </div>
                      {(lines.length > 0 || phoneHref) && (
                        <address>
                          {lines.map(line => <span key={line}>{line}</span>)}
                          {phoneHref && <a href={phoneHref}>{facility.phone}</a>}
                        </address>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        <section aria-labelledby="have-heading">
          <div className="sf-sechead"><h2 id="have-heading" className="sf-h2">Already have a visit or a bill</h2></div>
          <div className="sf-rows">
            <Link className="sf-row" href="/visit"><span><strong>Check or cancel a visit</strong><small>Use your request number and date of birth.</small></span><span className="sf-row__side"><ArrowRight aria-hidden="true" className="sf-arrow" /></span></Link>
            <Link className="sf-row" href="/intake"><span><strong>Fill in pre-visit intake</strong><small>Use the access code the clinic sent you.</small></span><span className="sf-row__side"><ArrowRight aria-hidden="true" className="sf-arrow" /></span></Link>
            <Link className="sf-row" href="/pay"><span><strong>Pay a bill</strong><small>Use the payment number on your statement.</small></span><span className="sf-row__side"><ArrowRight aria-hidden="true" className="sf-arrow" /></span></Link>
            <Link className="sf-row" href="/account"><span><strong>See all your visits</strong><small>Sign in or create an account with the email you request visits with.</small></span><span className="sf-row__side"><ArrowRight aria-hidden="true" className="sf-arrow" /></span></Link>
          </div>
        </section>
      </div>
    </StorefrontShell>
  )
}

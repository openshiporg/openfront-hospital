import Link from 'next/link'
import type { ReactNode } from 'react'
import { normalizeHospitalBrandTheme } from '@/features/lib/hospitalBrandTheme'
import type { HospitalBranding } from '@/features/storefront/lib/data/branding'
import type { CareServiceLine } from '@/features/storefront/lib/careServices'
import { practiceProfile } from '@/features/storefront/lib/practice'

export type Zone = { code: string; className: string }

/** Wayfinding zone for a service line: a fixed sign colour and letter. */
export function zoneFor(key: CareServiceLine['key']): Zone {
  if (key === 'primary-care') return { code: 'A', className: 'sf-zone-a' }
  if (key === 'behavioral-health') return { code: 'B', className: 'sf-zone-b' }
  return { code: 'C', className: 'sf-zone-c' }
}

export function Dot({ tone }: { tone?: 'ok' | 'warn' | 'bad' | 'accent' }) {
  return <span aria-hidden="true" className={`sf-dot${tone ? ` sf-dot--${tone}` : ''}`} />
}

export function Sign({ zone, label, arrow = true }: { zone: Zone; label: string; arrow?: boolean }) {
  return (
    <span className={`sf-sign ${zone.className}`}>
      <span className="sf-sign__code" aria-hidden="true">{zone.code}</span>
      <span className="sf-sign__label">{label}</span>
      {arrow && <span className="sf-sign__arrow" aria-hidden="true">→</span>}
    </span>
  )
}

function Wordmark({ profile }: { profile: HospitalBranding }) {
  return (
    <Link href="/" className="sf-wordmark" aria-label={`${profile.name} home`}>
      <span className="sf-wordmark__mark" aria-hidden="true">
        <span style={{ filter: `hue-rotate(${Number(profile.logoColor) || 0}deg)` }} dangerouslySetInnerHTML={{ __html: profile.logoIcon }} />
      </span>
      <span className="sf-wordmark__text">
        <span>{profile.name}</span>
        <small>{profile.locationName}</small>
      </span>
    </Link>
  )
}

export function StorefrontNav({ profile, current }: { profile: HospitalBranding; current?: 'care' | 'providers' | 'book' }) {
  const place = [profile.addressLine1, profile.city, profile.region].filter(Boolean).join(', ') || profile.serviceArea
  return (
    <>
      <div className="sf-utility">
        <div className="sf-container sf-utility__inner">
          <span className="sf-utility__place">{place}{profile.supportPhoneHref && <> · <a href={profile.supportPhoneHref}>{profile.supportPhone}</a></>}</span>
          <span className="sf-utility__emergency"><Dot />Emergency: call your local emergency number</span>
        </div>
      </div>
      <header className="sf-nav">
        <div className="sf-container sf-nav__inner">
          <Wordmark profile={profile} />
          <nav aria-label="Patient navigation" className="sf-nav__links sf-track">
            <Link className="sf-pill" aria-current={current === 'care' ? 'page' : undefined} href="/care">Care services</Link>
            <Link className="sf-pill" aria-current={current === 'providers' ? 'page' : undefined} href="/providers">Care team</Link>
            <Link className="sf-pill" href="/#visit">Visit us</Link>
          </nav>
          <div className="sf-nav__actions sf-track">
            {profile.supportPhoneHref && <a className="sf-pill" href={profile.supportPhoneHref}>Call</a>}
            <Link className="sf-pill sf-pill--primary" href="/book">Request a visit <span className="sf-arrow">→</span></Link>
          </div>
          <details className="sf-mobile-nav">
            <summary aria-label="Open patient navigation"><span className="sf-mobile-nav__lines" /></summary>
            <nav className="sf-mobile-nav__panel" aria-label="Mobile patient navigation">
              <Link href="/care">Care services <span aria-hidden="true">→</span></Link>
              <Link href="/providers">Care team <span aria-hidden="true">→</span></Link>
              <Link href="/book">Request a visit <span aria-hidden="true">→</span></Link>
              <Link href="/#visit">Visit us <span aria-hidden="true">→</span></Link>
              {profile.supportPhoneHref && <a href={profile.supportPhoneHref}>Call {profile.supportPhone} <span aria-hidden="true">→</span></a>}
            </nav>
          </details>
        </div>
      </header>
    </>
  )
}

export function StorefrontFooter({ profile }: { profile: HospitalBranding }) {
  return (
    <footer className="sf-footer">
      <div className="sf-container sf-footer__grid">
        <div>
          <p className="sf-footer__name">{profile.name}</p>
          <p className="sf-footer__meta">
            {profile.locationName}
            {profile.addressLine1 && <><br />{profile.addressLine1}</>}
            {(profile.city || profile.region || profile.postalCode) && <><br />{[profile.city, profile.region, profile.postalCode].filter(Boolean).join(', ')}</>}
            <br />{profile.serviceArea}
          </p>
        </div>
        <nav className="sf-footer__links" aria-label="Footer navigation">
          <Link href="/care">Care services</Link>
          <Link href="/providers">Care team</Link>
          <Link href="/book">Request a visit</Link>
          <Link href="/intake">Pre-visit intake</Link>
        </nav>
        <div>
          {(profile.supportPhoneHref || profile.supportEmailHref) && (
            <address>
              {profile.supportPhoneHref && <a href={profile.supportPhoneHref}>{profile.supportPhone}</a>}
              {profile.supportEmailHref && <a href={profile.supportEmailHref}>{profile.supportEmail}</a>}
            </address>
          )}
        </div>
      </div>
      <div className="sf-container sf-footer__legal">
        <span>© {new Date().getFullYear()} {profile.name}</span>
        <span>Online requests are not emergency care.</span>
      </div>
    </footer>
  )
}

function MobileBookingBar({ profile }: { profile: HospitalBranding }) {
  return (
    <div className="sf-mobile-bar">
      <div className="sf-track sf-track--block">
        {profile.supportPhoneHref && <a className="sf-pill" href={profile.supportPhoneHref}>Call</a>}
        <Link className="sf-pill sf-pill--primary" href="/book">Request a visit</Link>
      </div>
    </div>
  )
}

export function StorefrontShell({
  children,
  profile = practiceProfile,
  current,
  bookingBar = true,
}: {
  children: ReactNode
  profile?: HospitalBranding
  current?: 'care' | 'providers' | 'book'
  bookingBar?: boolean
}) {
  return (
    <div className="storefront sf-shell" data-brand-theme={normalizeHospitalBrandTheme(profile.brandTheme)}>
      <a className="sf-skip-link" href="#main-content">Skip to main content</a>
      <StorefrontNav profile={profile} current={current} />
      <main id="main-content" className="sf-main" tabIndex={-1}>
        {children}
      </main>
      <StorefrontFooter profile={profile} />
      {bookingBar && <MobileBookingBar profile={profile} />}
    </div>
  )
}

export function EmergencyNotice({ className = '' }: { className?: string }) {
  return <p className={`sf-emergency ${className}`.trim()}><Dot />Not for emergencies. For urgent help, call your local emergency number.</p>
}

import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { normalizeHospitalBrandTheme } from '@/features/lib/hospitalBrandTheme'
import type { HospitalBranding } from '@/features/storefront/lib/data/branding'
import { practiceProfile } from '@/features/storefront/lib/practice'

function Wordmark({ profile }: { profile: HospitalBranding }) {
  return (
    <Link href="/" className="sf-wordmark" aria-label={`${profile.name} home`}>
      <span className="sf-wordmark__mark" aria-hidden="true">
        <span className="sf-merchant-logo" style={{ filter: `hue-rotate(${Number(profile.logoColor) || 0}deg)` }} dangerouslySetInnerHTML={{ __html: profile.logoIcon }} />
      </span>
      <span className="sf-wordmark__text">
        <span>{profile.name}</span>
        <small>{profile.locationName}</small>
      </span>
    </Link>
  )
}

export function StorefrontNav({ profile }: { profile: HospitalBranding }) {
  return (
    <header className="sf-nav">
      <div className="sf-container sf-nav__inner">
        <Wordmark profile={profile} />
        <nav aria-label="Patient navigation" className="sf-nav__center">
          <Link className="sf-nav__link" href="/care">Care services</Link>
          <Link className="sf-nav__link" href="/providers">Care team</Link>
          <a className="sf-nav__link" href="#locations">Locations</a>
        </nav>
        <div className="sf-nav__actions">
          {profile.supportPhoneHref && <a className="sf-nav__link" href={profile.supportPhoneHref}>Call us</a>}
          <Link className="sf-btn sf-btn--primary" href="/book">Request a visit <span className="sf-arrow">→</span></Link>
        </div>
        <details className="sf-mobile-nav">
          <summary aria-label="Open patient navigation"><span className="sf-mobile-nav__lines" /></summary>
          <nav className="sf-mobile-nav__panel" aria-label="Mobile patient navigation">
            <Link href="/care">Care services</Link>
            <Link href="/providers">Care team</Link>
            <Link href="/book">Request a visit</Link>
            {profile.supportPhoneHref && <a href={profile.supportPhoneHref}>Call {profile.supportPhone}</a>}
          </nav>
        </details>
      </div>
    </header>
  )
}

export function StorefrontFooter({ profile }: { profile: HospitalBranding }) {
  return (
    <footer className="sf-footer" id="locations">
      <div className="sf-container sf-footer__mast"><p>Care, made easier to begin.</p></div>
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
          <Link href="/care">Explore care services</Link>
          <Link href="/providers">Meet the care team</Link>
          <Link href="/book">Request an appointment</Link>
          {profile.supportPhoneHref && <a href={profile.supportPhoneHref}>Scheduling help</a>}
        </nav>
        <div>
          {(profile.supportPhoneHref || profile.supportEmailHref) && (
            <address className="sf-footer__contact">
              {profile.supportPhoneHref && <a href={profile.supportPhoneHref}>{profile.supportPhone}</a>}
              {profile.supportEmailHref && <a href={profile.supportEmailHref}>{profile.supportEmail}</a>}
            </address>
          )}
          <p className="sf-footer__emergency">Online scheduling is for non-emergency care. For urgent medical help, call emergency services or go to the nearest emergency department.</p>
        </div>
      </div>
      <div className="sf-container sf-footer__legal">
        <span>© {new Date().getFullYear()} {profile.name}</span>
        <span>Private intake links should only be shared with their intended patient or caregiver.</span>
      </div>
    </footer>
  )
}

export function StorefrontShell({ children, profile = practiceProfile }: { children: ReactNode; profile?: HospitalBranding }) {
  return (
    <div className="storefront sf-shell" data-brand-theme={normalizeHospitalBrandTheme(profile.brandTheme)} style={{
      '--color-accent': `hsl(${(Number(profile.logoColor) + 220) % 360} 55% 28%)`,
      '--color-accent-2': `hsl(${(Number(profile.logoColor) + 220) % 360} 55% 22%)`,
      '--color-accent-soft': `hsl(${(Number(profile.logoColor) + 220) % 360} 35% 90%)`,
      '--color-focus': `hsl(${(Number(profile.logoColor) + 220) % 360} 60% 30%)`,
    } as CSSProperties}>
      <a className="sf-skip-link" href="#main-content">Skip to main content</a>
      <StorefrontNav profile={profile} />
      <main id="main-content" className="sf-main" tabIndex={-1}>
        <aside className="sf-container sf-notice sf-notice--info" aria-label="Practice information">
          {profile.description && <p className="whitespace-pre-line">{profile.description}</p>}
          <p>Online requests are not confirmed appointments. Directory entries and representative photographs do not verify clinician qualifications or guarantee care availability. Contact scheduling to confirm details.</p>
        </aside>
        {children}
      </main>
      <StorefrontFooter profile={profile} />
    </div>
  )
}

export function EmergencyNotice({ className = '' }: { className?: string }) {
  return <p className={`sf-notice sf-notice--warn ${className}`.trim()}>This is not for emergencies. If you need urgent medical help, call emergency services immediately.</p>
}

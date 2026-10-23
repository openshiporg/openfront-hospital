import Link from 'next/link'
import type { CSSProperties } from 'react'
import type { CareServiceLine } from '@/features/storefront/lib/careServices'
import { Sign, zoneFor } from './StorefrontShell'

/** Service lines as colour-coded wayfinding zones, each listing its bookable visit types. */
export function VisitZones({ serviceLines, headingLevel = 'h2' }: { serviceLines: CareServiceLine[]; headingLevel?: 'h2' | 'h3' }) {
  const Heading = headingLevel
  return (
    <div className="sf-zones">
      {serviceLines.map(line => {
        const zone = zoneFor(line.key)
        return (
          <section key={line.key} id={line.key} className={`sf-zone ${zone.className}`} aria-labelledby={`${line.key}-heading`}>
            <div className="sf-zone__head">
              <Heading id={`${line.key}-heading`}>
                <Sign zone={zone} label={line.title} arrow={false} />
              </Heading>
              <span className="sf-pagehead__count">{line.appointmentTypes.length} {line.appointmentTypes.length === 1 ? 'visit' : 'visits'}</span>
            </div>
            <ul className="sf-visits" style={{ '--zone': `var(--zone-${zone.code.toLowerCase()})` } as CSSProperties}>
              {line.appointmentTypes.map(type => (
                <li key={type.id} className="sf-visit">
                  <div>
                    <p className="sf-visit__name">{type.name}</p>
                    {type.description && <p className="sf-visit__desc">{type.description}</p>}
                    <p className="sf-visit__meta">
                      <span className="sf-mono">{type.durationMinutes} min</span>
                      <span className="sf-mono">{type.formattedPrice || 'Estimate from clinic'}</span>
                      {type.providers.length > 0 && <span>{type.providers.map(provider => provider.displayName).join(' · ')}</span>}
                    </p>
                  </div>
                  <div className="sf-track">
                    <Link className="sf-pill sf-pill--primary" href={`/book/${type.slug}`}>Choose a time <span className="sf-arrow">→</span></Link>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

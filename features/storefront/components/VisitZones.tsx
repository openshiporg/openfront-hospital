import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { CareServiceLine } from '@/features/storefront/lib/careServices'
import type { PublicDepartment } from '@/features/storefront/lib/data/directory'
import { publicPhoneHref } from '@/features/lib/publicPhone'
import { Photo } from './Photo'

/** The department record behind a service line, matched by name; null when the practice has none by that name. */
export function departmentFor(line: CareServiceLine, departments: PublicDepartment[]) {
  const wanted = line.title.trim().toLowerCase()
  return departments.find(department => department.name.trim().toLowerCase() === wanted) || null
}

/** Service lines, each listing its bookable visit types. */
export function VisitZones({ serviceLines, departments = [], headingLevel = 'h2' }: { serviceLines: CareServiceLine[]; departments?: PublicDepartment[]; headingLevel?: 'h2' | 'h3' }) {
  const Heading = headingLevel
  return (
    <div className="sf-zones">
      {serviceLines.map(line => {
        const department = departmentFor(line, departments)
        const phoneHref = department?.phone ? publicPhoneHref(department.phone) : ''
        return (
          <section key={line.key} id={line.key} className="sf-zone" aria-labelledby={`${line.key}-heading`}>
            <div className="sf-zone__head">
              <Heading id={`${line.key}-heading`} className="sf-zone__title">{department?.name || line.title}</Heading>
              <span className="sf-pagehead__count">{line.appointmentTypes.length} {line.appointmentTypes.length === 1 ? 'visit type' : 'visit types'}</span>
            </div>
            {department && (department.description || department.photoUrl || phoneHref) && (
              <div className={`sf-zone__about${department.photoUrl ? ' sf-zone__about--photo' : ''}`}>
                {department.photoUrl && <Photo src={department.photoUrl} alt={department.photoAltText || department.name} />}
                <div>
                  {department.description && <p>{department.description}</p>}
                  {phoneHref && <p>Department phone: <a href={phoneHref}>{department.phone}</a></p>}
                </div>
              </div>
            )}
            <ul className="sf-visits">
              {line.appointmentTypes.map(type => (
                <li key={type.id} className="sf-visit">
                  <div>
                    <p className="sf-visit__name">{type.name}</p>
                    {type.description && <p className="sf-visit__desc">{type.description}</p>}
                    <p className="sf-visit__meta">
                      <span>{type.durationMinutes} min</span>
                      {type.providers.length > 0 && <span>{type.providers.map(provider => provider.displayName).join(' · ')}</span>}
                    </p>
                  </div>
                  <div className="sf-track">
                    <Link className="sf-pill sf-pill--primary" href={`/book/${type.slug}`}>Choose a time <ArrowRight aria-hidden="true" className="sf-arrow" /></Link>
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

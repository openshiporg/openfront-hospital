import Link from 'next/link'
import type { CSSProperties } from 'react'
import { notFound } from 'next/navigation'
import { EmergencyNotice, Sign, StorefrontShell, zoneFor } from '@/features/storefront/components/StorefrontShell'
import { careServiceLines } from '@/features/storefront/lib/careServices'
import { getAvailableAppointmentSlots, getBookableAppointmentTypes } from '@/features/storefront/lib/data/booking'
import { BookingWorkspace } from './BookingWorkspace'
import { nextFacilityCalendarDate, publicBookingDateError } from '@/features/storefront/lib/facilityTime'
import { getHospitalBranding } from '@/features/storefront/lib/data/branding'

export async function AppointmentTypeBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ date?: string | string[]; providerId?: string | string[]; facilityId?: string | string[] }>
}) {
  const [{ slug }, resolvedSearchParams] = await Promise.all([params, searchParams])
  const [profile, appointmentTypes] = await Promise.all([getHospitalBranding(), getBookableAppointmentTypes()])
  const appointmentType = appointmentTypes.find((type) => type.slug === slug)

  if (!appointmentType) notFound()

  const line = careServiceLines([appointmentType])[0]
  const zone = zoneFor(line?.key || 'other-care')
  const selectedProvider = resolvedSearchParams.providerId === undefined ? appointmentType.providers[0] : appointmentType.providers.find(item => item.id === resolvedSearchParams.providerId)
  const selectedFacility = resolvedSearchParams.facilityId === undefined ? selectedProvider?.facilities[0] : selectedProvider?.facilities.find(item => item.id === resolvedSearchParams.facilityId)
  const dateValue = resolvedSearchParams.date === undefined ? nextFacilityCalendarDate(selectedFacility?.timeZone || 'UTC') : resolvedSearchParams.date
  const selectedDate = typeof dateValue === 'string' ? dateValue : ''
  let initialError = publicBookingDateError(dateValue, selectedFacility?.timeZone || 'UTC')
  if (!selectedProvider || !selectedFacility) initialError = 'Select a valid provider and location. The requested location was not substituted.'
  let slots: Awaited<ReturnType<typeof getAvailableAppointmentSlots>> = []
  if (!initialError && selectedProvider && selectedFacility) {
    try { slots = await getAvailableAppointmentSlots(appointmentType.id, selectedProvider.id, selectedFacility.id, selectedDate) }
    catch { initialError = 'Times could not be checked. Try again or contact scheduling.' }
  }

  return (
    <StorefrontShell profile={profile} current="book" bookingBar={false}>
      <div className="sf-container sf-work">
        <aside className="sf-work__rail sf-reveal">
          <Link className="sf-back" href="/book"><span aria-hidden="true">←</span> All visits</Link>
          <div className={`sf-ticket ${zone.className}`} style={{ '--zone': `var(--zone-${zone.code.toLowerCase()})` } as CSSProperties}>
            {line && <Sign zone={zone} label={line.title} arrow={false} />}
            <h1 className="sf-ticket__title">{appointmentType.name}</h1>
            {appointmentType.description && <p className="sf-ticket__desc">{appointmentType.description}</p>}
            <dl className="sf-dl">
              <div><dt>Duration</dt><dd className="sf-mono">{appointmentType.durationMinutes} min</dd></div>
              <div><dt>Estimate</dt><dd className="sf-mono">{appointmentType.formattedPrice || 'From clinic'}</dd></div>
              <div><dt>Clinicians</dt><dd>{appointmentType.providers.length}</dd></div>
            </dl>
          </div>
          <EmergencyNotice />
        </aside>

        <BookingWorkspace appointmentType={appointmentType} brandName={profile.name} initialProviderId={selectedProvider?.id || ''} initialFacilityId={selectedFacility?.id || ''} initialDate={selectedDate} initialSlots={slots} initialError={initialError} />
      </div>
    </StorefrontShell>
  )
}

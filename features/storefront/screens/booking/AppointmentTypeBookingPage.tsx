import Link from 'next/link'
import { notFound } from 'next/navigation'
import { EmergencyNotice, StorefrontShell } from '@/features/storefront/components/StorefrontShell'
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
    <StorefrontShell profile={profile}>
      <section className="sf-workbench sf-reveal">
        <div className="sf-container sf-workbench__grid">
          <aside className="sf-rail">
            <Link className="sf-back" href="/book">
              ← All visit types
            </Link>

            <div className="sf-panel sf-panel__pad">
              <p className="sf-eyebrow">Visit type</p>
              <h1 className="sf-display sf-display--section" style={{ marginTop: 'var(--space-xs)' }}>
                {appointmentType.name}
              </h1>
              <p style={{ marginTop: 'var(--space-sm)', color: 'var(--color-ink-2)', lineHeight: 1.65 }}>
                {appointmentType.description || 'Request an appointment with the care team.'}
              </p>
              <dl className="sf-dl" style={{ marginTop: 'var(--space-md)' }}>
                <div className="sf-dl__row">
                  <dt className="sf-dl__dt">Duration</dt>
                  <dd className="sf-dl__dd">{appointmentType.durationMinutes} min</dd>
                </div>
                <div className="sf-dl__row">
                  <dt className="sf-dl__dt">Estimate</dt>
                  <dd className="sf-dl__dd">{appointmentType.formattedPrice || 'Contact clinic'}</dd>
                </div>
              </dl>
            </div>

            <EmergencyNotice />
          </aside>

          <BookingWorkspace appointmentType={appointmentType} brandName={profile.name} initialProviderId={selectedProvider?.id || ''} initialFacilityId={selectedFacility?.id || ''} initialDate={selectedDate} initialSlots={slots} initialError={initialError} />
        </div>
      </section>
    </StorefrontShell>
  )
}

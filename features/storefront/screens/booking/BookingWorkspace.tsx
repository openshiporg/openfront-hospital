'use client'
import { useRef, useState } from 'react'
import { loadAppointmentAvailability } from '@/features/storefront/actions/booking'
import type { AvailableAppointmentSlot, BookableAppointmentType } from '@/features/storefront/lib/data/booking'
import { formatCalendarDate, publicBookingDateError, publicBookingDateRange } from '@/features/storefront/lib/facilityTime'
import { AppointmentRequestForm } from './AppointmentRequestForm'

export function BookingWorkspace({ appointmentType, brandName, initialProviderId, initialFacilityId, initialDate, initialSlots, initialError }: {
  appointmentType: BookableAppointmentType; brandName: string; initialProviderId: string; initialFacilityId: string;
  initialDate: string; initialSlots: AvailableAppointmentSlot[]; initialError?: string | null;
}) {
  const [providerId, setProviderId] = useState(initialProviderId)
  const [facilityId, setFacilityId] = useState(initialFacilityId)
  const [date, setDate] = useState(initialDate)
  const [slots, setSlots] = useState(initialSlots)
  const [error, setError] = useState(initialError || '')
  const [pending, setPending] = useState(false)
  const [requestPending, setRequestPending] = useState(false)
  const [revision, setRevision] = useState(0)
  const generation = useRef(0)
  const provider = appointmentType.providers.find(item => item.id === providerId)
  const facility = provider?.facilities.find(item => item.id === facilityId)
  const range = publicBookingDateRange(facility?.timeZone || 'UTC')
  const invalidate = () => { generation.current++; setSlots([]); setRevision(value => value + 1); setError('Check availability for the selected provider, location and date.') }
  return <section className="sf-form-surface">
    <h2 className="sf-display" style={{ fontSize: 'var(--text-2xl)' }}>Choose provider, location and date</h2>
    <form className="sf-grid-2" onSubmit={async event => {
      event.preventDefault()
      const invalidDate = publicBookingDateError(date, facility?.timeZone || 'UTC')
      if (!provider || !facility || invalidDate) { setError(invalidDate || 'Select a valid provider and location.'); return }
      const current = ++generation.current
      setPending(true); setError(''); setSlots([]); setRevision(value => value + 1)
      try {
        const response = await loadAppointmentAvailability({ appointmentTypeId: appointmentType.id, providerId, facilityId, date })
        if (current !== generation.current) return
        if (!response.success) setError(response.error)
        else { setSlots(response.slots); if (!response.slots.length) setError('No times on this date. Try another date or provider; your patient details stay here.') }
      } catch { if (current === generation.current) setError('Times could not be checked. Patient details remain here; contact scheduling or check availability again.') }
      finally { if (current === generation.current) setPending(false) }
    }}>
      <fieldset className="sf-fieldset sf-grid-2" disabled={pending || requestPending}>
        <legend>Availability</legend>
        <label className="sf-field"><span className="sf-label">Provider</span><select className="sf-select" required value={providerId} onChange={event => {
          const next = appointmentType.providers.find(item => item.id === event.target.value)
          setProviderId(event.target.value)
          setFacilityId(next?.facilities.some(item => item.id === facilityId) ? facilityId : '')
          invalidate()
        }}><option value="">Select provider</option>{appointmentType.providers.map(item => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>
        <label className="sf-field"><span className="sf-label">Location</span><select className="sf-select" required value={facilityId} onChange={event => { setFacilityId(event.target.value); invalidate() }}><option value="">Select location</option>{provider?.facilities.map(item => <option key={item.id} value={item.id}>{item.name} · {item.timeZone}</option>)}</select></label>
        <label className="sf-field"><span className="sf-label">Date</span><input className="sf-input" type="date" required min={range.min} max={range.max} value={date} onChange={event => { setDate(event.target.value); invalidate() }} /></label>
        <p>Times use {facility?.timeZone || 'the selected location’s time zone'}. Requests require staff confirmation.</p>
      </fieldset>
      <button type="submit" className="sf-btn sf-btn--secondary" disabled={pending || requestPending}>{pending ? 'Checking…' : 'Check availability'}</button>
    </form>
    {error && <p role="alert" className="sf-notice sf-notice--info">{error}</p>}
    {slots.length > 0 && <p className="sf-eyebrow">Times for {formatCalendarDate(date)}</p>}
    <AppointmentRequestForm appointmentType={appointmentType} providerId={providerId} facilityId={facilityId} slots={slots} brandName={brandName} availabilityRevision={revision} onPendingChange={setRequestPending} />
  </section>
}

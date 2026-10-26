'use client'

import { useDraftExitGuard } from '@/features/lib/useDraftExitGuard'
import { ArrowRight } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import type { AvailableAppointmentSlot, BookableAppointmentType } from '@/features/storefront/lib/data/booking'
import { requestAppointmentAction } from '@/features/storefront/actions/booking'
import { APPOINTMENT_REQUEST_CONSENT } from '@/features/storefront/lib/workflowConsent'
import { formatFacilitySlotTime } from '@/features/storefront/lib/facilityTime'
import {
  appointmentRequestError,
  appointmentRequestReceipt,
  appointmentRequestUnverifiedError,
  type AppointmentRequestFeedback,
} from './appointmentRequestFeedback'

export function AppointmentRequestForm({
  appointmentType,
  providerId,
  facilityId,
  slots,
  brandName,
  availabilityRevision = 0,
  onPendingChange,
}: {
  appointmentType: BookableAppointmentType
  providerId: string
  facilityId: string
  slots: AvailableAppointmentSlot[]
  brandName: string
  availabilityRevision?: number
  onPendingChange?: (pending: boolean) => void
}) {
  const slotKey = (slot: AvailableAppointmentSlot) => `${slot.facilityId}:${slot.startsAt}`
  const [selectedSlotKey, setSelectedSlotKey] = useState(slots[0] ? slotKey(slots[0]) : '')
  const [visibleSlotCount, setVisibleSlotCount] = useState(18)
  const selectedSlot = useMemo(() => slots.find(slot => slotKey(slot) === selectedSlotKey), [slots, selectedSlotKey])
  const [result, setResult] = useState<AppointmentRequestFeedback | null>(null)
  const [isPending, startTransition] = useTransition()
  const [dirty, setDirty] = useState(false)
  const [unknown, setUnknown] = useState(false)
  const exitGuard = useDraftExitGuard(dirty || unknown, unknown)
  useEffect(() => { setSelectedSlotKey(''); setVisibleSlotCount(18) }, [providerId, facilityId, availabilityRevision])
  const outcomeUnknown = useRef(false)
  const submissionInFlight = useRef(false)
  const feedbackRef = useRef<HTMLDivElement>(null)
  const provider = useMemo(
    () => appointmentType.providers.find((item) => item.id === providerId),
    [appointmentType.providers, providerId]
  )

  useEffect(() => {
    if (result) feedbackRef.current?.focus()
  }, [result])

  if (result?.type === 'success') {
    return (
      <div ref={feedbackRef} role="status" aria-live="polite" tabIndex={-1} className="sf-receipt">
        <h2 className="sf-step-title sf-titleline"><span aria-hidden="true" className="sf-dot sf-dot--warn" /><span>Received · not yet confirmed</span></h2>
        <p className="sf-receipt__ref"><span className="sf-eyebrow">Ref</span>{result.reference}</p>
        <p>{result.message}</p>
        {result.intakeHref && (
          <div><div className="sf-track"><a className="sf-pill sf-pill--primary" href={result.intakeHref}>Continue to private intake <ArrowRight aria-hidden="true" className="sf-arrow" /></a></div></div>
        )}
      </div>
    )
  }

  return (
    <form
      className="sf-form"
      onChange={() => setDirty(true)}
      onSubmit={(event) => {
        event.preventDefault()
        if (submissionInFlight.current || isPending || unknown) return
        submissionInFlight.current = true
        onPendingChange?.(true)
        const formData = new FormData(event.currentTarget)
        setResult(null)
        startTransition(async () => {
          try {
            const response = await requestAppointmentAction({
              appointmentTypeId: appointmentType.id,
              providerId,
              facilityId,
              startsAt: selectedSlot?.startsAt || '',
              patient: {
                firstName: String(formData.get('firstName') || ''),
                lastName: String(formData.get('lastName') || ''),
                email: String(formData.get('email') || ''),
                phone: String(formData.get('phone') || ''),
                dateOfBirth: String(formData.get('dateOfBirth') || ''),
              },
              reasonForVisit: String(formData.get('reasonForVisit') || ''),
              preferredContactMethod: String(formData.get('preferredContactMethod') || 'sms'),
              consent: {
                accepted: formData.get('consentToRequest') === 'on',
                policyVersion: APPOINTMENT_REQUEST_CONSENT.policyVersion,
                statementKey: APPOINTMENT_REQUEST_CONSENT.statementKey,
              },
            })

            if (!response.success) {
              setUnknown(true); outcomeUnknown.current = true
              setResult(appointmentRequestError(response.error))
              return
            }

            setDirty(false)
            const appointment = response.data.requestAppointment
            const accessCode = appointment.intakeForms?.[0]?.accessCode
            setResult(appointmentRequestReceipt({
              appointmentNumber: appointment.appointmentNumber,
              status: appointment.status,
              intakeHref: accessCode ? `/intake#accessCode=${encodeURIComponent(accessCode)}` : undefined,
            }))
          } catch {
            setUnknown(true); outcomeUnknown.current = true
            setResult(appointmentRequestUnverifiedError())
          } finally {
            submissionInFlight.current = false
            onPendingChange?.(outcomeUnknown.current)
          }
        })
      }}
    >
      {exitGuard}
      {unknown && <p role="alert" className="sf-notice sf-notice--warn"><span aria-hidden="true" className="sf-dot sf-dot--warn" /><span>The original request outcome is unknown. Contact scheduling to reconcile it before making another request. This form will not send another request automatically.</span></p>}
      <fieldset disabled={isPending || unknown} className="sf-fieldset">
        <legend className="sf-legend">Times</legend>
        {slots.length === 0 ? <p className="sf-hint">Check availability to see open times.</p> : (
          <div className="sf-slots">
            {slots.slice(0, visibleSlotCount).map((slot) => (
              <label
                key={`${slot.providerId}-${slot.facilityId}-${slot.startsAt}`}
                className={`sf-slot ${selectedSlotKey === slotKey(slot) ? 'sf-slot--active' : ''}`}
              >
                <input
                  type="radio"
                  name="startsAt"
                  value={slotKey(slot)}
                  checked={selectedSlotKey === slotKey(slot)}
                  onChange={() => setSelectedSlotKey(slotKey(slot))}
                />
                <span className="sf-slot__time">{formatFacilitySlotTime(slot.startsAt, slot.facilityTimeZone)}</span>
                <span className="sf-slot__cap">{slot.remainingCapacity} open · {slot.facilityName}</span>
              </label>
            ))}
          </div>
        )}
        {slots.length > visibleSlotCount && (
          <div><div className="sf-track">
            <button type="button" className="sf-pill sf-pill--raised" onClick={() => setVisibleSlotCount(count => Math.min(count + 18, slots.length))}>
              Show {Math.min(18, slots.length - visibleSlotCount)} more times
            </button>
          </div></div>
        )}
      </fieldset>

      {selectedSlot && (
        <dl className="sf-dl" aria-label="Selected request">
          <div><dt>Visit</dt><dd>{appointmentType.name}</dd></div>
          <div><dt>Clinician</dt><dd>{provider?.displayName || 'Care team'}</dd></div>
          <div><dt>Time</dt><dd className="sf-mono">{formatFacilitySlotTime(selectedSlot.startsAt, selectedSlot.facilityTimeZone)}</dd></div>
          <div><dt>Location</dt><dd>{selectedSlot.facilityName}</dd></div>
          <div><dt>Follow-up</dt><dd>{selectedSlot.followUpMode === 'manual' ? 'By staff' : 'Automatic'}</dd></div>
        </dl>
      )}

      <h2 className="sf-step-title"><span className="sf-mono">03</span>Patient details</h2>
      <fieldset disabled={isPending || unknown} className="sf-fieldset">
        <legend className="sf-sr">Patient details</legend>
        <div className="sf-grid-2">
          <label className="sf-field">
            <span className="sf-label">First name</span>
            <input required name="firstName" autoComplete="given-name" className="sf-input" />
          </label>
          <label className="sf-field">
            <span className="sf-label">Last name</span>
            <input required name="lastName" autoComplete="family-name" className="sf-input" />
          </label>
          <label className="sf-field">
            <span className="sf-label">Email</span>
            <input name="email" type="email" autoComplete="email" className="sf-input" />
          </label>
          <label className="sf-field">
            <span className="sf-label">Phone</span>
            <input name="phone" type="tel" autoComplete="tel" className="sf-input" />
          </label>
          <label className="sf-field">
            <span className="sf-label">Date of birth</span>
            <input name="dateOfBirth" type="date" className="sf-input" />
          </label>
          <label className="sf-field">
            <span className="sf-label">Preferred contact</span>
            <select name="preferredContactMethod" defaultValue="sms" className="sf-select">
              <option value="sms">Text me</option>
              <option value="email">Email me</option>
              <option value="phone">Call me</option>
            </select>
          </label>
          <label className="sf-field sf-span-2">
            <span className="sf-label">Reason for visit</span>
            <textarea name="reasonForVisit" rows={4} className="sf-textarea" />
          </label>
        </div>
      </fieldset>

      <label className="sf-check">
        <input disabled={isPending || unknown} required type="checkbox" name="consentToRequest" />
        <span>I confirm these details are accurate and ask {brandName} to contact me about this appointment request.</span>
      </label>

      <div className="sf-track sf-track--block">
        <button
          disabled={isPending || unknown || !selectedSlotKey || !selectedSlot}
          className="sf-pill sf-pill--primary"
          type="submit"
        >
          {isPending ? 'Requesting appointment…' : 'Request appointment'}
        </button>
      </div>

      {result?.type === 'error' && (
        <div ref={feedbackRef} role="alert" aria-live="assertive" tabIndex={-1} className="sf-notice sf-notice--error">
          <span aria-hidden="true" className="sf-dot sf-dot--bad" />
          <div className="sf-notice__body">
            <p className="sf-notice__title">Request not verified</p>
            <p>{result.message}</p>
          </div>
        </div>
      )}
    </form>
  )
}

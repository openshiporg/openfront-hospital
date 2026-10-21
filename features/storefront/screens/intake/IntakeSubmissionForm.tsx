'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import type { PatientIntakeForm } from '@/features/storefront/lib/data/intake'
import { submitPatientIntakeAction } from '@/features/storefront/actions/intake'
import { INTAKE_SUBMISSION_CONSENT } from '@/features/storefront/lib/workflowConsent'
import {
  intakeSubmissionError,
  intakeSubmissionReceipt,
  intakeSubmissionUnverifiedError,
  type IntakeSubmissionFeedback,
} from './intakeSubmissionFeedback'

export function IntakeSubmissionForm({ intakeForm }: { intakeForm: PatientIntakeForm }) {
  const [result, setResult] = useState<IntakeSubmissionFeedback | null>(null)
  const [isPending, startTransition] = useTransition()
  const submissionInFlight = useRef(false)
  const feedbackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (result) feedbackRef.current?.focus()
  }, [result])

  if (result?.type === 'success') {
    return (
      <div
        ref={feedbackRef}
        role="status"
        aria-live="polite"
        tabIndex={-1}
        className="sf-notice sf-notice--success"
      >
        <p className="sf-eyebrow">Intake receipt</p>
        <h2 style={{ marginTop: 'var(--space-xs)', fontSize: 'var(--text-xl)', fontWeight: 600 }}>Intake submitted</h2>
        <p style={{ marginTop: 'var(--space-sm)', lineHeight: 1.6 }}>{result.message}</p>
      </div>
    )
  }

  return (
    <form
      className="sf-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (submissionInFlight.current || isPending) return
        submissionInFlight.current = true
        const formData = new FormData(event.currentTarget)
        setResult(null)
        startTransition(async () => {
          try {
            const medications = String(formData.get('medications') || '')
              .split('\n')
              .map((item) => item.trim())
              .filter(Boolean)
            const allergies = String(formData.get('allergies') || '')
              .split('\n')
              .map((item) => item.trim())
              .filter(Boolean)

            const response = await submitPatientIntakeAction({
              accessCode: intakeForm.accessCode,
              consent: {
                accepted: formData.get('consentToContact') === 'on',
                policyVersion: INTAKE_SUBMISSION_CONSENT.policyVersion,
                statementKey: INTAKE_SUBMISSION_CONSENT.statementKey,
              },
              patientUpdates: {
                email: String(formData.get('email') || ''),
                phone: String(formData.get('phone') || ''),
                preferredContactMethod: String(formData.get('preferredContactMethod') || 'sms'),
                insuranceSummary: {
                  payer: String(formData.get('insurancePayer') || ''),
                  memberId: String(formData.get('insuranceMemberId') || ''),
                },
              },
              responses: {
                contactConfirmed: true,
                preferredContactMethod: String(formData.get('preferredContactMethod') || 'sms'),
                reasonForVisit: String(formData.get('reasonForVisit') || ''),
                symptoms: String(formData.get('symptoms') || ''),
                medications,
                allergies,
                insurance: {
                  payer: String(formData.get('insurancePayer') || ''),
                  memberId: String(formData.get('insuranceMemberId') || ''),
                },
                consentToContact: formData.get('consentToContact') === 'on',
                completedAt: new Date().toISOString(),
              },
            })

            if (!response.success) {
              setResult(intakeSubmissionError(response.error))
              return
            }

            setResult(intakeSubmissionReceipt(response.data.submitIntakeForm?.status))
          } catch {
            setResult(intakeSubmissionUnverifiedError())
          } finally {
            submissionInFlight.current = false
          }
        })
      }}
    >
      <div>
        <p className="sf-eyebrow">Pre-visit details</p>
        <h2 className="sf-display" style={{ marginTop: 'var(--space-xs)', fontSize: 'var(--text-xl)' }}>
          Complete intake
        </h2>
        <p style={{ marginTop: 'var(--space-xs)', fontSize: 'var(--text-sm)', color: 'var(--color-ink-2)', lineHeight: 1.6 }}>
          This is not an emergency form. If you are experiencing an emergency, call emergency services immediately.
        </p>
      </div>

      <fieldset className="sf-fieldset" style={{ marginTop: 'var(--space-lg)' }}>
        <legend className="sf-legend">Contact and insurance</legend>
        <div className="sf-grid-2">
          <label className="sf-field">
            <span className="sf-label">Email</span>
            <input
              name="email"
              type="email"
              defaultValue={intakeForm.patient?.email || ''}
              autoComplete="email"
              className="sf-input"
            />
          </label>
          <label className="sf-field">
            <span className="sf-label">Phone</span>
            <input
              name="phone"
              type="tel"
              defaultValue={intakeForm.patient?.phone || ''}
              autoComplete="tel"
              className="sf-input"
            />
          </label>
          <label className="sf-field">
            <span className="sf-label">Preferred contact</span>
            <select
              name="preferredContactMethod"
              defaultValue={intakeForm.patient?.preferredContactMethod || 'sms'}
              className="sf-select"
            >
              <option value="sms">Text me</option>
              <option value="email">Email me</option>
              <option value="phone">Call me</option>
            </select>
          </label>
          <label className="sf-field">
            <span className="sf-label">Insurance payer</span>
            <input
              name="insurancePayer"
              defaultValue={intakeForm.patient?.insuranceSummary?.payer || ''}
              className="sf-input"
            />
          </label>
          <label className="sf-field" style={{ gridColumn: '1 / -1' }}>
            <span className="sf-label">Member ID</span>
            <input
              name="insuranceMemberId"
              defaultValue={intakeForm.patient?.insuranceSummary?.memberId || ''}
              className="sf-input"
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="sf-fieldset" style={{ marginTop: 'var(--space-lg)' }}>
        <legend className="sf-legend">Visit information</legend>
        <label className="sf-field">
          <span className="sf-label">Main reason for your visit</span>
          <textarea
            required
            name="reasonForVisit"
            defaultValue={intakeForm.appointment?.reasonForVisit || ''}
            rows={4}
            className="sf-textarea"
          />
        </label>
        <label className="sf-field" style={{ marginTop: 'var(--space-md)' }}>
          <span className="sf-label">Current symptoms or updates</span>
          <textarea name="symptoms" rows={4} className="sf-textarea" />
        </label>
        <div className="sf-grid-2" style={{ marginTop: 'var(--space-md)' }}>
          <label className="sf-field">
            <span className="sf-label">Current medications</span>
            <textarea name="medications" rows={5} className="sf-textarea" />
            <span style={{ marginTop: 'var(--space-2xs)', display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-ink-3)' }}>
              One per line.
            </span>
          </label>
          <label className="sf-field">
            <span className="sf-label">Allergies</span>
            <textarea name="allergies" rows={5} className="sf-textarea" />
            <span style={{ marginTop: 'var(--space-2xs)', display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-ink-3)' }}>
              One per line.
            </span>
          </label>
        </div>
      </fieldset>

      <label
        className="sf-notice sf-notice--info"
        style={{ marginTop: 'var(--space-lg)', display: 'flex', gap: 'var(--space-sm)', alignItems: 'flex-start', cursor: 'pointer' }}
      >
        <input required type="checkbox" name="consentToContact" style={{ marginTop: '0.2rem' }} />
        <span>I confirm this information is accurate and consent to the clinic contacting me about this appointment.</span>
      </label>

      <button
        disabled={isPending}
        className="sf-btn sf-btn--primary sf-btn--block"
        style={{ marginTop: 'var(--space-lg)' }}
        type="submit"
      >
        {isPending ? 'Submitting intake…' : 'Submit intake'}
      </button>

      {result?.type === 'error' && (
        <div
          ref={feedbackRef}
          role="alert"
          aria-live="assertive"
          tabIndex={-1}
          className="sf-notice sf-notice--error"
          style={{ marginTop: 'var(--space-md)' }}
        >
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>
            {result.outcome === 'correctable' ? 'Review the intake form' : 'Submission not verified'}
          </h2>
          <p style={{ marginTop: 'var(--space-xs)' }}>{result.message}</p>
        </div>
      )}
    </form>
  )
}

import Link from 'next/link'

import { EmergencyNotice, StorefrontShell } from '@/features/storefront/components/StorefrontShell'
import type { PatientIntakeForm } from '@/features/storefront/lib/data/intake'
import type { HospitalBranding } from '@/features/storefront/lib/data/branding'
import { IntakeSubmissionForm } from './IntakeSubmissionForm'

export function IntakePageContent({ intakeForm, profile }: { intakeForm: PatientIntakeForm; profile: HospitalBranding }) {
  const appointmentDate = intakeForm.appointment?.startsAt
    ? new Intl.DateTimeFormat(undefined, {
        timeZone: intakeForm.appointment.facilityTimeZone,
        timeZoneName: 'short',
        weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
      }).format(new Date(intakeForm.appointment.startsAt))
    : 'Upcoming appointment'

  return (
    <StorefrontShell profile={profile}>
      <section className="sf-workbench sf-reveal">
        <div className="sf-container sf-workbench__grid">
          <aside className="sf-rail">
            <Link className="sf-back" href="/book">← Appointments</Link>
            <div className="sf-panel sf-panel__pad">
              <p className="sf-eyebrow">Patient intake</p>
              <h1 className="sf-display sf-display--section" style={{ marginTop: 'var(--space-xs)' }}>{intakeForm.title}</h1>
              <p style={{ marginTop: 'var(--space-sm)', color: 'var(--color-ink-2)', lineHeight: 1.65 }}>
                Complete this pre-visit form so the clinic can prepare for your appointment and verify contact and insurance details.
              </p>
              <dl className="sf-dl" style={{ marginTop: 'var(--space-md)' }}>
                <div className="sf-dl__row"><dt className="sf-dl__dt">Patient</dt><dd className="sf-dl__dd">{intakeForm.patient?.displayName || 'Patient'}</dd></div>
                <div className="sf-dl__row"><dt className="sf-dl__dt">Visit</dt><dd className="sf-dl__dd">{intakeForm.appointment?.appointmentType?.name || 'Visit'}</dd></div>
                <div className="sf-dl__row"><dt className="sf-dl__dt">When</dt><dd className="sf-dl__dd">{appointmentDate}</dd></div>
                <div className="sf-dl__row"><dt className="sf-dl__dt">Status</dt><dd className="sf-dl__dd" style={{ textTransform: 'capitalize' }}>{intakeForm.status.split('_').join(' ')}</dd></div>
              </dl>
            </div>
            <div className="sf-notice sf-notice--info">This page uses a one-time intake link. Only share it with the patient or caregiver it belongs to.</div>
            <EmergencyNotice />
          </aside>
          <section className="sf-form-surface">
            {intakeForm.status === 'submitted' || intakeForm.status === 'reviewed' ? (
              <div className="sf-notice sf-notice--success">
                <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>Intake received</h2>
                <p style={{ marginTop: 'var(--space-xs)', lineHeight: 1.6 }}>This intake form has already been submitted. If anything changed, contact the clinic before your visit.</p>
              </div>
            ) : <IntakeSubmissionForm intakeForm={intakeForm} />}
          </section>
        </div>
      </section>
    </StorefrontShell>
  )
}

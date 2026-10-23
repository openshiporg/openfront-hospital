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
  const submitted = intakeForm.status === 'submitted' || intakeForm.status === 'reviewed'

  return (
    <StorefrontShell profile={profile}>
      <div className="sf-container sf-work">
        <aside className="sf-work__rail sf-reveal">
          <Link className="sf-back" href="/book"><span aria-hidden="true">←</span> Appointments</Link>
          <div className="sf-ticket">
            <p className="sf-eyebrow">Pre-visit intake</p>
            <h1 className="sf-ticket__title sf-titleline">
              <span aria-hidden="true" className={`sf-dot ${submitted ? 'sf-dot--ok' : 'sf-dot--warn'}`} />
              <span>{intakeForm.title}</span>
            </h1>
            <dl className="sf-dl">
              <div><dt>Patient</dt><dd>{intakeForm.patient?.displayName || 'Patient'}</dd></div>
              <div><dt>Visit</dt><dd>{intakeForm.appointment?.appointmentType?.name || 'Visit'}</dd></div>
              <div><dt>When</dt><dd>{appointmentDate}</dd></div>
              <div><dt>Status</dt><dd style={{ textTransform: 'capitalize' }}>{intakeForm.status.split('_').join(' ')}</dd></div>
            </dl>
          </div>
          <p className="sf-hint">One-time private link. Share only with the patient or caregiver.</p>
          <EmergencyNotice />
        </aside>
        <section className="sf-panel sf-reveal">
          {submitted ? (
            <div className="sf-receipt">
              <h2 className="sf-step-title sf-titleline"><span aria-hidden="true" className="sf-dot sf-dot--ok" /><span>Intake received</span></h2>
              <p>This form is already submitted. Contact the clinic if anything has changed.</p>
            </div>
          ) : <IntakeSubmissionForm intakeForm={intakeForm} />}
        </section>
      </div>
    </StorefrontShell>
  )
}

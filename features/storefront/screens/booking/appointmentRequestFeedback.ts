export type AppointmentRequestFeedback =
  | { type: 'success'; message: string; reference: string; intakeHref?: string }
  | { type: 'error'; message: string }

const REFERENCE_PATTERN = /^[A-Za-z0-9-]{4,80}$/

export function appointmentRequestReceipt(input: {
  appointmentNumber: unknown
  status: unknown
  intakeHref?: string
}): AppointmentRequestFeedback {
  const reference = String(input.appointmentNumber || '').trim()
  if (!REFERENCE_PATTERN.test(reference) || input.status !== 'requested') {
    return appointmentRequestUnverifiedError()
  }
  return {
    type: 'success',
    reference,
    intakeHref: input.intakeHref,
    message: `Request ${reference} was received. It is not confirmed. Staff will review the requested time and contact you with the next step.`,
  }
}

export function appointmentRequestError(message: unknown): AppointmentRequestFeedback {
  const detail = String(message || '')
  if (/slot.*(?:no longer|taken)|time.*no longer available/i.test(detail)) {
    return { type: 'error', message: 'That appointment time is no longer available. Choose another time before submitting a new request.' }
  }
  if (/too many appointment requests|temporarily unavailable/i.test(detail)) {
    return { type: 'error', message: 'Online appointment requests are temporarily unavailable. Wait before trying again or contact scheduling.' }
  }
  if (/phone is required/i.test(detail)) {
    return { type: 'error', message: 'Enter a phone number for phone or text follow-up, then submit again.' }
  }
  if (/email is required/i.test(detail)) {
    return { type: 'error', message: 'Enter an email address for email follow-up, then submit again.' }
  }
  if (/consent|confirm these details/i.test(detail)) {
    return { type: 'error', message: 'Confirm the appointment-request statement before submitting.' }
  }
  return appointmentRequestUnverifiedError()
}

export function appointmentRequestUnverifiedError(): AppointmentRequestFeedback {
  return {
    type: 'error',
    message: 'We could not verify whether the request was received. This is not a confirmation. Do not submit it again immediately; contact scheduling first.',
  }
}

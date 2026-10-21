export type IntakeSubmissionFeedback =
  | { type: 'success'; message: string }
  | { type: 'error'; message: string; outcome: 'correctable' | 'unverified' }

export function intakeSubmissionReceipt(status: unknown): IntakeSubmissionFeedback {
  if (status !== 'submitted') return intakeSubmissionUnverifiedError()
  return {
    type: 'success',
    message: 'Your intake was submitted for staff review. This receipt does not confirm an appointment or a clinical decision.',
  }
}

export function intakeSubmissionError(message: unknown): IntakeSubmissionFeedback {
  const detail = String(message || '')
  if (/consent|confirm this information/i.test(detail)) {
    return {
      type: 'error',
      outcome: 'correctable',
      message: 'Confirm the intake statement before submitting.',
    }
  }
  if (/email must be valid/i.test(detail)) {
    return {
      type: 'error',
      outcome: 'correctable',
      message: 'Enter a valid email address or leave the email field blank.',
    }
  }
  if (/preferred contact method is invalid/i.test(detail)) {
    return {
      type: 'error',
      outcome: 'correctable',
      message: 'Choose one of the available contact methods, then submit again.',
    }
  }
  if (/exceeds the .*limit|responses exceed the size limit/i.test(detail)) {
    return {
      type: 'error',
      outcome: 'correctable',
      message: 'One or more responses are too long. Shorten them before submitting again.',
    }
  }
  return intakeSubmissionUnverifiedError()
}

export function intakeSubmissionUnverifiedError(): IntakeSubmissionFeedback {
  return {
    type: 'error',
    outcome: 'unverified',
    message: 'We could not verify whether the intake was submitted. The private link may now be single-use. Do not submit again; contact scheduling first.',
  }
}

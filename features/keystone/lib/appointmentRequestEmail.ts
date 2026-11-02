// Appointment-request receipt email. Sent AFTER the request transaction commits; a mail failure
// never fails the request. Exactly-once: an internal ClinicalOutboxEvent row with a unique
// eventKey is claimed first (replay/concurrent retry fails the create and exits) and its
// status moves recorded -> sent | failed | skipped_not_configured. The outbox worker only
// reads deliveryMode 'external', so this row is never picked up by it.
// Content is deliberately minimal: patient first name, facility, appointment number, time and
// the existing intake link. No provider, appointment type, reason or any clinical detail.
export type AppointmentReceipt = {
  appointmentId: string
  appointmentNumber: string
  facilityId: string
  facilityName: string
  timeZone: string
  startsAt: string
  patientId: string
  to: string
  firstName: string
  intakeToken: string | null
}

export function formatAppointmentTime(iso: string, timeZone: string) {
  const zone = timeZone || 'UTC'
  const text = new Intl.DateTimeFormat('en-US', { timeZone: zone, dateStyle: 'full', timeStyle: 'short' }).format(new Date(iso))
  const label = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' }).formatToParts(new Date(iso)).find(part => part.type === 'timeZoneName')?.value || zone
  return `${text} ${label}`
}

export async function deliverAppointmentRequestEmail(prisma: any, receipt: AppointmentReceipt) {
  if (!receipt.to) return
  const eventKey = `appointment_receipt_email:${receipt.appointmentId}`
  let rowId: string
  try {
    const row = await prisma.clinicalOutboxEvent.create({
      data: {
        eventKey,
        eventType: 'appointment.receipt_email',
        aggregateType: 'appointment',
        aggregateId: receipt.appointmentId,
        deliveryMode: 'internal',
        status: 'sending',
        attempts: 0,
        facilityId: receipt.facilityId,
        patientId: receipt.patientId,
        appointmentId: receipt.appointmentId,
        payload: { source: 'public_booking' },
      },
      select: { id: true },
    })
    rowId = row.id
  } catch {
    return // already claimed
  }
  const mark = async (status: string, lastError = '', messageId = '') => {
    try {
      await prisma.clinicalOutboxEvent.update({ where: { id: rowId }, data: { status, lastError, ...(status === 'sent' ? { deliveredAt: new Date(), payload: { source: 'public_booking', messageId } } : {}) } })
    } catch {
      // The request is committed; bookkeeping must never surface.
    }
  }
  try {
    if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) {
      await mark('skipped_not_configured')
      return
    }
    const { sendAppointmentRequestEmail, getBaseUrlForEmails } = await import('./mail')
    let base = ''
    try { base = getBaseUrlForEmails() } catch { base = '' }
    const result = await sendAppointmentRequestEmail(receipt.to, {
      facilityName: receipt.facilityName,
      firstName: receipt.firstName,
      appointmentNumber: receipt.appointmentNumber,
      whenLabel: formatAppointmentTime(receipt.startsAt, receipt.timeZone),
      intakeUrl: base && receipt.intakeToken ? `${base}/intake#accessCode=${encodeURIComponent(receipt.intakeToken)}` : '',
    })
    if (result.sent) await mark('sent', '', result.messageId || '')
    else await mark('failed', result.error || 'send_failed')
  } catch (error) {
    console.error('Appointment request email failed:', error instanceof Error ? error.message : 'Unknown error')
    await mark('failed', error instanceof Error ? error.message.slice(0, 200) : 'send_failed')
  }
}

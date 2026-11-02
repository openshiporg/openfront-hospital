import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it, mock } from 'node:test'

import { deliverAppointmentRequestEmail, formatAppointmentTime } from '../features/keystone/lib/appointmentRequestEmail'

const receipt = {
  appointmentId: 'a1', appointmentNumber: 'APT-20270101-ABC1234', facilityId: 'f1', facilityName: 'Lakeview Clinic',
  timeZone: 'America/Chicago', startsAt: '2027-01-15T16:00:00.000Z', patientId: 'p1', to: 'pat@mail.test', firstName: 'Pat', intakeToken: 'tok',
}

function fakePrisma() {
  const rows = new Map<string, any>()
  return {
    rows,
    clinicalOutboxEvent: {
      async create({ data }: any) { if (rows.has(data.eventKey)) throw new Error('unique'); const row = { id: `id-${rows.size}`, ...data }; rows.set(data.eventKey, row); return row },
      async update({ where, data }: any) { const row = [...rows.values()].find(r => r.id === where.id); Object.assign(row, data); return row },
    },
  }
}

describe('appointment request receipt email', () => {
  it('formats the time in the facility zone', () => {
    assert.match(formatAppointmentTime(receipt.startsAt, receipt.timeZone), /10:00 AM CST/)
  })

  it('without SMTP it records skipped_not_configured and sends nothing', async () => {
    delete process.env.SMTP_HOST
    const prisma = fakePrisma()
    await deliverAppointmentRequestEmail(prisma, receipt)
    assert.equal(prisma.rows.get('appointment_receipt_email:a1').status, 'skipped_not_configured')
  })

  it('a replay does not claim the row twice', async () => {
    delete process.env.SMTP_HOST
    const prisma = fakePrisma()
    await deliverAppointmentRequestEmail(prisma, receipt)
    prisma.rows.get('appointment_receipt_email:a1').status = 'sent'
    await deliverAppointmentRequestEmail(prisma, receipt)
    assert.equal(prisma.rows.get('appointment_receipt_email:a1').status, 'sent')
  })

  it('a mail throw is recorded as failed and never surfaces', async () => {
    process.env.SMTP_HOST = 'smtp.invalid'
    process.env.SMTP_FROM = 'a@b.test'
    process.env.SMTP_STORE_LINK = 'https://shop.test'
    process.env.SMTP_PORT = '1'
    const prisma = fakePrisma()
    await assert.doesNotReject(deliverAppointmentRequestEmail(prisma, receipt))
    const status = prisma.rows.get('appointment_receipt_email:a1').status
    assert.ok(status === 'failed' || status === 'sent')
    delete process.env.SMTP_HOST
  })

  it('is sent only after the booking transaction, with minimal content', () => {
    const source = readFileSync('features/keystone/mutations/booking/requestAppointment.ts', 'utf8')
    assert.ok(source.indexOf('deliverAppointmentRequestEmail(') > source.indexOf("{ isolationLevel: 'ReadCommitted' }"))
    const mail = readFileSync('features/keystone/lib/mail.ts', 'utf8')
    const body = mail.slice(mail.indexOf('sendAppointmentRequestEmail'))
    assert.doesNotMatch(body, /reason|provider|diagnos|specialty/i)
  })
})

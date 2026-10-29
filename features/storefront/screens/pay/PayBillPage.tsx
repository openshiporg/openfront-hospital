'use client'

import { useState } from 'react'
import { beginBillPaymentAction, lookupBillAction } from '../../actions/payBill'

export function PayBillPage() {
  const [number, setNumber] = useState('')
  const [dob, setDob] = useState('')
  const [bill, setBill] = useState<Awaited<ReturnType<typeof lookupBillAction>>>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function lookup(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('')
    try { const result = await lookupBillAction(number, dob); setBill(result); if (!result) setMessage('We could not verify that balance. Check your details or contact the facility.') }
    finally { setBusy(false) }
  }
  async function pay() {
    if (!bill) return
    setBusy(true)
    try { const result = await beginBillPaymentAction(bill.paymentToken); if (result?.clientSecret?.startsWith('https://')) window.location.assign(result.clientSecret); else setMessage('Online payment is not available for this balance right now.') }
    finally { setBusy(false) }
  }

  return <main className="sf-container" style={{ paddingBlock: '4rem', maxWidth: '42rem' }}>
    <h1 className="sf-display sf-display--page">Pay a bill</h1>
    <p>Enter the payment number on your statement and your date of birth to view the balance.</p>
    <form onSubmit={lookup} style={{ display: 'grid', gap: '1rem', marginTop: '2rem' }}>
      <label>Payment number<input required autoComplete="off" value={number} onChange={event => setNumber(event.target.value)} /></label>
      <label>Date of birth<input required type="date" value={dob} onChange={event => setDob(event.target.value)} /></label>
      <button disabled={busy} type="submit">{busy ? 'Checking…' : 'Find balance'}</button>
    </form>
    {bill && <section style={{ marginTop: '2rem' }}><h2>{bill.facilityName}</h2><p>Balance due: {(bill.amountCents / 100).toLocaleString(undefined, { style: 'currency', currency: bill.currency })}</p><button disabled={busy} onClick={pay}>Pay now</button></section>}
    {message && <p role="status">{message}</p>}
  </main>
}

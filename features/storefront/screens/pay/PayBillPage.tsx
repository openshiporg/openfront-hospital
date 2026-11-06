'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { beginBillPaymentAction, confirmBillPaymentAction, lookupBillAction } from '../../actions/payBill'

type Receipt = Awaited<ReturnType<typeof confirmBillPaymentAction>>

export function PayBillPage() {
  const [number, setNumber] = useState('')
  const [dob, setDob] = useState('')
  const [bill, setBill] = useState<Awaited<ReturnType<typeof lookupBillAction>>>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const params = useSearchParams()
  const returnStatus = params?.get('status')
  const sessionId = params?.get('session_id') || ''
  const [receipt, setReceipt] = useState<Receipt>(null)
  const [confirming, setConfirming] = useState(returnStatus === 'success' && Boolean(sessionId))

  useEffect(() => {
    if (returnStatus !== 'success' || !sessionId) return
    let live = true
    confirmBillPaymentAction(sessionId).then(result => { if (live) { setReceipt(result); setConfirming(false) } }).catch(() => { if (live) setConfirming(false) })
    return () => { live = false }
  }, [returnStatus, sessionId])

  if (returnStatus === 'success' && sessionId) {
    const paid = receipt?.status === 'succeeded'
    return <div className="sf-container" style={{ paddingBlock: '4rem', maxWidth: '42rem' }}>
      <h1 className="sf-display sf-display--page">{confirming ? 'Confirming your payment…' : paid ? 'Payment received' : 'Payment is processing'}</h1>
      {paid && receipt && <section style={{ marginTop: '1.5rem', display: 'grid', gap: '0.5rem' }}>
        <p>Thank you. {receipt.facilityName} has received your payment.</p>
        {receipt.amountCents != null && receipt.currency && <p>Amount paid: {(receipt.amountCents / 100).toLocaleString(undefined, { style: 'currency', currency: receipt.currency })}</p>}
        {receipt.reference && <p>Reference: {receipt.reference}</p>}
      </section>}
      {!confirming && !paid && <p style={{ marginTop: '1.5rem' }}>Your card payment has not settled yet. You do not need to pay again; the facility will see it as soon as it clears.</p>}
    </div>
  }

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

  return <div className="sf-container" style={{ paddingBlock: '4rem', maxWidth: '42rem' }}>
    <h1 className="sf-display sf-display--page">Pay a bill</h1>
    <p style={{ marginTop: '.75rem' }}>Enter the payment number on your statement and your date of birth to view the balance.</p>
    {returnStatus === 'cancelled' && <p role="status" className="sf-notice sf-notice--warn" style={{ marginTop: '1rem' }}>Payment was cancelled. Nothing was charged.</p>}
    <form onSubmit={lookup} className="sf-form" style={{ marginTop: '2rem' }}>
      <label className="sf-field"><span className="sf-label">Payment number</span><input className="sf-input" required autoComplete="off" value={number} onChange={event => setNumber(event.target.value)} /></label>
      <label className="sf-field"><span className="sf-label">Date of birth</span><input className="sf-input" required type="date" value={dob} onChange={event => setDob(event.target.value)} /></label>
      <div className="sf-form-actions"><button className="sf-pill sf-pill--primary" disabled={busy} type="submit">{busy ? 'Checking…' : 'Find balance'}</button></div>
    </form>
    {bill && <section style={{ marginTop: '2rem' }}><h2>{bill.facilityName}</h2><p>Balance due: {(bill.amountCents / 100).toLocaleString(undefined, { style: 'currency', currency: bill.currency })}</p><div className="sf-form-actions" style={{ marginTop: '1rem' }}><button className="sf-pill sf-pill--primary" disabled={busy} onClick={pay}>Pay now</button></div></section>}
    {message && <p role="status" className="sf-notice sf-notice--warn" style={{ marginTop: '1rem' }}>{message}</p>}
  </div>
}

'use server'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'

export async function lookupBillAction(paymentNumber: string, dateOfBirth: string) {
  const response = await keystoneClient<{ lookupPatientBill: { paymentToken: string; amountCents: number; currency: string; facilityName: string } }>(
    `query LookupPatientBill($paymentNumber:String!,$dateOfBirth:String!){lookupPatientBill(paymentNumber:$paymentNumber,dateOfBirth:$dateOfBirth){paymentToken amountCents currency facilityName}}`,
    { paymentNumber, dateOfBirth },
  )
  return response.success ? response.data.lookupPatientBill : null
}

export async function beginBillPaymentAction(paymentToken: string) {
  const response = await keystoneClient<{ initiatePatientBillPayment: { clientSecret: string | null; amountCents: number; currency: string } }>(
    `mutation BeginBillPayment($paymentToken:String!){initiatePatientBillPayment(paymentToken:$paymentToken)}`,
    { paymentToken },
  )
  return response.success ? response.data.initiatePatientBillPayment : null
}

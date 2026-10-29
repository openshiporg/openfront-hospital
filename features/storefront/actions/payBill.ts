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

export async function recordPatientPaymentAction(data: Record<string, unknown>) {
  const response = await keystoneClient<{ recordPatientPayment: { id: string; status: string } }>(
    `mutation RecordOnlinePayment($data:PatientPaymentWorkflowInput!){recordPatientPayment(data:$data){id status}}`,
    { data },
  )
  return response.success ? response.data.recordPatientPayment : null
}

export async function issuePatientPaymentLinkAction(paymentId: string) {
  const response = await keystoneClient<{ initiatePatientBillPayment: { clientSecret: string | null; amountCents: number; currency: string } }>(
    `mutation IssuePaymentLink($paymentToken:String!){initiatePatientBillPayment(paymentToken:$paymentToken)}`,
    { paymentToken: paymentId },
  )
  return response.success ? response.data.initiatePatientBillPayment : null
}

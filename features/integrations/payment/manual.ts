export async function createPaymentFunction({ amount, currency }: { amount: number; currency: string }) { return { status: 'pending', amount, currency: currency.toUpperCase() } }
export async function capturePaymentFunction({ paymentId, amount }: { paymentId: string; amount: number }) { return { id: paymentId, status: 'succeeded', amount } }
export async function refundPaymentFunction({ paymentId, amount }: { paymentId: string; amount: number }) { return { id: paymentId, status: 'succeeded', amount } }
export async function getPaymentStatusFunction({ paymentId }: { paymentId: string }) { return { id: paymentId, status: 'pending' } }
export async function generatePaymentLinkFunction() { return null }
export async function handleWebhookFunction() { return { isValid: false } }

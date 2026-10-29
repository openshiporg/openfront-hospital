export async function createPaymentFunction() { throw new Error('PayPal requires provider approval and is not configured') }
export async function capturePaymentFunction() { throw new Error('PayPal is not configured') }
export async function refundPaymentFunction() { throw new Error('PayPal is not configured') }
export async function getPaymentStatusFunction() { throw new Error('PayPal is not configured') }
export async function generatePaymentLinkFunction() { return null }
export async function handleWebhookFunction() { throw new Error('PayPal is not configured') }

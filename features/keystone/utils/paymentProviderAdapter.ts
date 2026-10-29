import { paymentProviderAdapters } from '../../integrations/payment'

const operations = new Set(['createPaymentFunction', 'capturePaymentFunction', 'refundPaymentFunction', 'getPaymentStatusFunction', 'generatePaymentLinkFunction', 'handleWebhookFunction'])
const adapters = new Set(Object.keys(paymentProviderAdapters))

export async function executeAdapterFunction({ provider, functionName, args }: { provider: any; functionName: string; args: Record<string, any> }) {
  if (!operations.has(functionName)) throw new Error('Unknown payment adapter operation')
  const selector = provider?.[functionName]
  if (typeof selector !== 'string' || !adapters.has(selector)) throw new Error('Payment adapter is not configured')
  const adapter = await paymentProviderAdapters[selector as keyof typeof paymentProviderAdapters]()
  const fn = (adapter as any)[functionName]
  if (typeof fn !== 'function') throw new Error('Payment adapter operation unavailable')
  try { return await fn({ ...args, provider: { id: provider.id, code: provider.code, credentials: provider.credentials || {} } }) }
  catch { throw new Error('Payment provider operation failed; reconcile before retrying') }
}

export const createPayment = (input: any) => executeAdapterFunction({ ...input, functionName: 'createPaymentFunction', args: input })
export const capturePayment = (input: any) => executeAdapterFunction({ ...input, functionName: 'capturePaymentFunction', args: input })
export const refundPayment = (input: any) => executeAdapterFunction({ ...input, functionName: 'refundPaymentFunction', args: input })
export const getPaymentStatus = (input: any) => executeAdapterFunction({ ...input, functionName: 'getPaymentStatusFunction', args: input })
export const generatePaymentLink = (input: any) => executeAdapterFunction({ ...input, functionName: 'generatePaymentLinkFunction', args: input })
export const handleWebhook = (input: any) => executeAdapterFunction({ ...input, functionName: 'handleWebhookFunction', args: input })

export function isPaymentProviderConfigured(code: string): boolean {
  if (code.startsWith('pp_stripe')) return Boolean(/^(sk|rk)_(test|live)_/.test(process.env.STRIPE_SECRET_KEY || '') && process.env.NEXT_PUBLIC_STRIPE_KEY)
  if (code.startsWith('pp_paypal')) return false
  return false
}

export function getPublicPaymentProviderConfig(code: string) {
  return isPaymentProviderConfigured(code) && code.startsWith('pp_stripe') ? { provider: 'stripe' as const, publishableKey: process.env.NEXT_PUBLIC_STRIPE_KEY! } : null
}

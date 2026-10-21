export function normalizeRefundPaymentSearch(rawSearch: unknown): string {
  return String(rawSearch || '').trim().slice(0, 100).trim()
}

export function succeededPaymentCandidateWhere(rawSearch: unknown): Record<string, unknown> | null {
  const search = normalizeRefundPaymentSearch(rawSearch)
  if (search.length < 2) return null

  return {
    status: { equals: 'succeeded' },
    paymentNumber: { contains: search, mode: 'insensitive' },
  }
}

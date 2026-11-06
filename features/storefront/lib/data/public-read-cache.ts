// Public storefront reads (branding, bookable providers, visit types) are identical for every visitor. Each render and
// each <Link> prefetch used to re-run them over GraphQL, so one visitor clicking through a few pages spent the 120
// requests/minute anonymous GraphQL budget and saw "Page could not load". Successful results are shared for a short
// window; failures are never cached so the next render retries.
const DEFAULT_TTL_MS = 30_000

type Entry = { expiresAt: number; value: Promise<unknown> }
const entries = new Map<string, Entry>()

export function cachedPublicRead<T>(key: string, load: () => Promise<T>, ttlMs = DEFAULT_TTL_MS, now = Date.now): Promise<T> {
  const current = entries.get(key)
  if (current && current.expiresAt > now()) return current.value as Promise<T>
  const value = load()
  entries.set(key, { expiresAt: now() + ttlMs, value })
  value.catch(() => { if (entries.get(key)?.value === value) entries.delete(key) })
  return value
}

export function clearPublicReadCache() {
  entries.clear()
}

/** Turns an unsuccessful keystoneClient response into a rejection so it is not cached. */
export function publicReadOrThrow<T extends { success: boolean }>(response: T): T {
  if (!response.success) throw Object.assign(new Error('Public storefront read failed'), { response })
  return response
}

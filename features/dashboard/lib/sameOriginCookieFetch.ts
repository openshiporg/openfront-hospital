export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>

type SameOriginCookieFetchOptions = {
  endpoint: URL
  cookie: string
  fetchImpl?: FetchLike
}

/**
 * Creates a request-local fetch for one MCP transport. The incoming dashboard
 * cookie is attached only when the destination has the endpoint's exact origin.
 */
export function createSameOriginCookieFetch({
  endpoint,
  cookie,
  fetchImpl = fetch,
}: SameOriginCookieFetchOptions): FetchLike {
  const allowedOrigin = endpoint.origin

  return async (input, init) => {
    const destination = new URL(String(input), endpoint)
    const headers = new Headers(init?.headers)

    if (destination.origin === allowedOrigin && cookie) {
      headers.set('cookie', cookie)
    } else {
      headers.delete('cookie')
    }

    return fetchImpl(input, { ...init, headers })
  }
}

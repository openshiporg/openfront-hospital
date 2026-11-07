import { headers } from "next/headers";

/**
 * Get the base URL for the application dynamically
 * Works both server-side and client-side without requiring environment variables
 */

export async function getBaseUrl(): Promise<string> {
  // Client-side: use window.location
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  // Server-side: the origin is owned by the process environment, never taken from request
  // Host / X-Forwarded-* headers (a spoofed Host would otherwise steer server GraphQL calls).
  try {
    return resolveServerBaseUrl(process.env);
  } catch {
    // Misconfigured production: fall back to relative URLs rather than a request-chosen host.
    return '';
  }
}

/**
 * Server origin from the process environment only, in order: OPENFRONT_INTERNAL_URL, the loopback
 * port (PORT), the Railway public domain, then http://127.0.0.1:3000 in development.
 */
export function resolveServerBaseUrl(env: Record<string, string | undefined>): string {
  const internal = String(env.OPENFRONT_INTERNAL_URL || '').trim();
  if (internal) {
    let url: URL;
    try { url = new URL(internal); } catch { throw new Error('OPENFRONT_INTERNAL_URL is invalid'); }
    if (url.username || url.password) throw new Error('OPENFRONT_INTERNAL_URL must be credential-free');
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('OPENFRONT_INTERNAL_URL is invalid');
    return url.origin;
  }
  const port = String(env.PORT || '').trim();
  if (port) {
    if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('PORT is invalid');
    return `http://127.0.0.1:${port}`;
  }
  const domain = String(env.RAILWAY_PUBLIC_DOMAIN || '').trim();
  if (domain) {
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d{1,5})?$/i.test(domain)) throw new Error('RAILWAY_PUBLIC_DOMAIN is invalid');
    return `https://${domain}`;
  }
  if (env.NODE_ENV === 'production') throw new Error('Production requires OPENFRONT_INTERNAL_URL, PORT or RAILWAY_PUBLIC_DOMAIN');
  return 'http://127.0.0.1:3000';
}

/**
 * Get the GraphQL endpoint URL
 */
export async function getGraphQLEndpoint(): Promise<string> {
  const baseUrl = await getBaseUrl();
  return `${baseUrl}/api/graphql`;
}

/**
 * Server-side GraphQL target. On the server this is the loopback origin with a signed per-end-user
 * identity (so server renders don't share the public egress IP bucket). In the browser, or when the
 * process port is unknown, it is the public endpoint exactly as before.
 */
export async function getServerGraphQLTarget(
  sourceHeaders?: { get(name: string): string | null } | null,
): Promise<{ endpoint: string; fetch?: typeof fetch }> {
  if (typeof window === 'undefined') {
    const { internalGraphqlEndpoint, createInternalGraphqlFetch, clientSourceFromHeaders } = await import('@/features/keystone/lib/internal-origin');
    const endpoint = internalGraphqlEndpoint();
    if (endpoint) {
      let headersList = sourceHeaders ?? null;
      if (!headersList) {
        try { headersList = await headers(); } catch { headersList = null; }
      }
      return { endpoint, fetch: createInternalGraphqlFetch(clientSourceFromHeaders(headersList), endpoint) };
    }
  }
  return { endpoint: await getGraphQLEndpoint() };
}

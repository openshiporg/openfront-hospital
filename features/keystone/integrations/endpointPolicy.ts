import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'

const nonGlobalIpv4 = new BlockList()
const nonGlobalIpv6 = new BlockList()
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
] as Array<[string, number]>) nonGlobalIpv4.addSubnet(network, prefix, 'ipv4')
for (const [network, prefix] of [
  ['::', 96], ['::1', 128], ['::ffff:0:0', 96], ['64:ff9b::', 96], ['100::', 64],
  ['2001::', 32], ['2001:db8::', 32], ['2002::', 16],
  ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
] as Array<[string, number]>) nonGlobalIpv6.addSubnet(network, prefix, 'ipv6')

function canonicalAddress(address: string) {
  return address.trim().toLowerCase().replace(/^\[|\]$/g, '').split('%')[0]
}

export function privateAddress(address: string) {
  const normalized = canonicalAddress(address)
  const family = isIP(normalized)
  if (family === 4) return nonGlobalIpv4.check(normalized, 'ipv4')
  if (family === 6) return nonGlobalIpv6.check(normalized, 'ipv6')
  return false
}

export async function validateIntegrationEndpoint(raw: unknown) {
  let endpoint: URL
  try {
    endpoint = new URL(String(raw || '').trim())
  } catch {
    throw new Error('Integration endpoint URL is invalid')
  }
  if (endpoint.username || endpoint.password || endpoint.hash || endpoint.search) {
    throw new Error('Integration endpoint cannot contain credentials, query parameters, or fragments')
  }
  const hostname = endpoint.hostname.toLowerCase()
  const addressHost = canonicalAddress(hostname)
  const allowlist = new Set(
    String(process.env.INTEGRATION_HOST_ALLOWLIST || '')
      .split(',')
      .map(value => value.trim().toLowerCase())
      .filter(Boolean),
  )
  const localAllowed = process.env.NODE_ENV !== 'production' && process.env.ALLOW_LOCAL_INTEGRATION_ENDPOINTS === '1'
  const localHost = hostname === 'localhost' || hostname.endsWith('.local') || privateAddress(hostname)
  if (endpoint.protocol !== 'https:' && !(localAllowed && endpoint.protocol === 'http:' && localHost)) {
    throw new Error('Integration endpoint must use HTTPS')
  }
  if (!allowlist.has(hostname) && !(localAllowed && localHost)) {
    throw new Error('Integration endpoint host is not allowlisted')
  }
  if (!localAllowed) {
    let addresses: Array<{ address: string }>
    try {
      addresses = await lookup(addressHost, { all: true })
    } catch {
      throw new Error('Integration endpoint host could not be resolved')
    }
    if (!addresses.length || addresses.some(item => privateAddress(item.address))) {
      throw new Error('Integration endpoint resolves to a private or reserved address')
    }
  }
  endpoint.pathname = endpoint.pathname.replace(/\/+$/, '') || '/'
  return endpoint.toString()
}

/** Resolve and revalidate the exact address that the transport must use. */
export async function resolveIntegrationEndpoint(raw: unknown) {
  const normalized = await validateIntegrationEndpoint(raw)
  const endpoint = new URL(normalized)
  const hostname = endpoint.hostname.toLowerCase()
  const addressHost = canonicalAddress(hostname)
  const localAllowed = process.env.NODE_ENV !== 'production' && process.env.ALLOW_LOCAL_INTEGRATION_ENDPOINTS === '1'
  if (isIP(addressHost)) {
    if (!localAllowed && privateAddress(addressHost)) throw new Error('Integration endpoint resolves to a private or reserved address')
    return { url: normalized, address: addressHost }
  }

  let addresses: Array<{ address: string }>
  try {
    addresses = await lookup(addressHost, { all: true })
  } catch {
    throw new Error('Integration endpoint host could not be resolved')
  }
  if (!addresses.length || (!localAllowed && addresses.some(item => privateAddress(item.address)))) {
    throw new Error('Integration endpoint resolves to a private or reserved address')
  }
  // Sort for deterministic retries and pin this checked address in the socket
  // lookup callback. The transport must not perform another DNS resolution.
  return { url: normalized, address: addresses.map(item => item.address).sort()[0] }
}

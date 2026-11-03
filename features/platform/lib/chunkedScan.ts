import 'server-only'

import type { KeystoneResponse } from '@/features/dashboard/lib/keystoneClient'

import { SCAN_CHUNK, SCAN_MAX_CHUNKS } from './scanLimits'

/**
 * Collect a list that is larger than one safe `take` by running one small
 * operation per chunk (literal skip each), stopping at the first short chunk.
 */
export async function scanChunks<T>(run: (skip: number) => Promise<KeystoneResponse<T[]>>): Promise<KeystoneResponse<T[]>> {
  const rows: T[] = []
  for (let chunk = 0; chunk < SCAN_MAX_CHUNKS; chunk += 1) {
    const response = await run(chunk * SCAN_CHUNK)
    if (!response.success) return response
    rows.push(...response.data)
    if (response.data.length < SCAN_CHUNK) break
  }
  return { success: true, data: rows }
}

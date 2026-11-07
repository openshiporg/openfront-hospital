/**
 * Get List Counts - dashboard server action to fetch item counts for all lists
 * Matches Dashboard1 implementation but uses dashboard's keystoneClient
 */

'use server'

import { keystonePartialQuery } from '../lib/keystoneClient'

export async function getListCounts(
  lists: Array<{
    key: string;
    isSingleton?: boolean;
    graphql?: {
      names: {
        listQueryCountName: string;
      };
    };
  }>
) {
  try {
    // Skip counting for singleton lists
    const listsToCount = lists.filter((list) => !list.isSingleton)

    if (listsToCount.length === 0) return { success: true, data: {} }

    // Build a query to get counts for all non-singleton lists at once
    const countQueries = listsToCount.map((list) => {
      const countName = list.graphql?.names?.listQueryCountName
      return `${list.key}: ${countName}`
    })

    // The GraphQL guard rejects documents with more than 50 aliases and Hospital has more lists than that, so
    // counts go out in batches. Each count is independent: a list this role cannot read, or a transient failure
    // on one list or one batch, leaves those cards without a count and keeps every other count.
    const BATCH = 40
    const batches: string[][] = []
    for (let i = 0; i < countQueries.length; i += BATCH) batches.push(countQueries.slice(i, i + BATCH))
    const responses = await Promise.all(
      batches.map((batch) => keystonePartialQuery<Record<string, any>>(`query GetListCounts { ${batch.join('\n')} }`)),
    )
    const data: Record<string, any> = {}
    for (const response of responses) {
      if (!response.success) continue
      for (const [key, value] of Object.entries(response.data)) if (value !== null && value !== undefined) data[key] = value
    }
    if (!responses.some((response) => response.success)) return responses[0]
    return { success: true as const, data }
  } catch (error: unknown) {
    console.error("Dashboard operation failed (details redacted).")
    const errorMessage =
      "Could not load list counts"
    return { success: false, error: errorMessage }
  }
}
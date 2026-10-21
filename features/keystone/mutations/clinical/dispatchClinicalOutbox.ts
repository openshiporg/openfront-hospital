import type { Context } from '.keystone/types'

/**
 * Internal outbox rows are an atomic event ledger, not transport work. They are
 * created directly in `recorded` state and must never be relabelled delivered
 * without a real consumer acknowledgement.
 */
export async function dispatchInternalOutbox(_prisma: any, _requestedLimit = 10) {
  return { claimed: 0, delivered: 0 }
}

export default async function dispatchClinicalOutbox(
  _root: unknown,
  args: { limit?: number },
  context: Context,
) {
  if (!context.session?.data.role?.canAccessAllClinicalData) {
    throw new Error('Only the global maintenance administrator can inspect internal event processing')
  }
  return dispatchInternalOutbox(context.sudo().prisma, args.limit)
}

import type { Context } from '.keystone/types'

// The initialization page is reachable only while the deployment has no users.
// Creating that first operator still requires BOOTSTRAP_ADMIN_SECRET in the
// controlled bootstrap mutation; once a user exists this query fails closed.
export default async function redirectToInit(_root: unknown, _args: unknown, context: Context) {
  const users = await context.sudo().prisma.user.count()
  return users === 0
}

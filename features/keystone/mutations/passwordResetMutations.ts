// The family reset screen calls Keystone's sendUserPasswordResetLink and
// redeemUserPasswordResetToken. Hospital keeps its own peppered, rate-limited,
// single-use reset behind those names instead of createAuth's passwordResetLink.
// security/passwordReset imports the Keystone context, which imports this
// schema, so it is loaded on first use rather than at config load.
type ResetContext = { openfrontNetworkIdentity?: string }

export async function sendUserPasswordResetLink(_root: unknown, { email }: { email: string }, context: ResetContext) {
  const { requestPasswordReset } = await import('../security/passwordReset')
  await requestPasswordReset(email, context.openfrontNetworkIdentity || 'unknown-graphql-client')
  // Always true, as Keystone does, so the response never reveals whether an account exists.
  return true
}

export async function redeemUserPasswordResetToken(
  _root: unknown,
  { email, token, password }: { email: string; token: string; password: string },
  context: ResetContext,
) {
  const { redeemPasswordReset } = await import('../security/passwordReset')
  const redeemed = await redeemPasswordReset({ email, token, password }, context.openfrontNetworkIdentity || 'unknown-graphql-client')
  return redeemed
    ? null
    : { code: 'FAILURE', message: 'This reset link is invalid or has expired, or the new password is shorter than 16 characters.' }
}

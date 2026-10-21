export type PasswordResetLinkState =
  | { mode: 'request'; token: null }
  | { mode: 'reset'; token: string }
  | { mode: 'invalid'; token: null }

const RESET_TOKEN_PATTERN = /^reset_[A-Za-z0-9_-]{43}$/

export function passwordResetLinkState(hash: string): PasswordResetLinkState {
  const fragment = String(hash || '').replace(/^#/, '')
  if (!fragment) return { mode: 'request', token: null }

  const token = new URLSearchParams(fragment).get('token')
  if (!token || !RESET_TOKEN_PATTERN.test(token)) return { mode: 'invalid', token: null }
  return { mode: 'reset', token }
}

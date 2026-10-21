export const INVALID_AUTHENTICATION_MESSAGE = 'Authentication failed'
export const AUTHENTICATION_UNAVAILABLE_MESSAGE = 'Authentication is temporarily unavailable. Try again or contact your administrator.'
export const PASSWORD_RECOVERY_UNAVAILABLE_MESSAGE = 'Password recovery is temporarily unavailable. Try again later or contact your administrator.'

export type AuthenticationResponseKind = 'authenticated' | 'credentials' | 'service'

export function authenticationResponseKind(response: unknown): AuthenticationResponseKind {
  const candidate = response as {
    success?: unknown
    data?: { authenticate?: { message?: unknown; sessionToken?: unknown } | null }
  } | null
  if (!candidate || candidate.success !== true) return 'service'
  const authenticate = candidate.data?.authenticate
  if (authenticate?.message) return 'credentials'
  return typeof authenticate?.sessionToken === 'string' && authenticate.sessionToken
    ? 'authenticated'
    : 'service'
}

export function authenticationFailureMessage(kind: Exclude<AuthenticationResponseKind, 'authenticated'>) {
  return kind === 'credentials' ? INVALID_AUTHENTICATION_MESSAGE : AUTHENTICATION_UNAVAILABLE_MESSAGE
}

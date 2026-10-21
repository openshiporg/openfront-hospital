import { isPublicIntakeAccessCode } from '@/features/storefront/lib/intakeAccessCode'

export const INTAKE_LOAD_TIMEOUT_MS = 15_000

export type IntakeLinkFragment =
  | { kind: 'missing'; accessCode: null }
  | { kind: 'invalid'; accessCode: null }
  | { kind: 'load'; accessCode: string }

export function intakeLinkFragment(hash: string): IntakeLinkFragment {
  const fragment = String(hash || '').replace(/^#/, '')
  if (!fragment) return { kind: 'missing', accessCode: null }

  const accessCode = new URLSearchParams(fragment).get('accessCode')
  if (!isPublicIntakeAccessCode(accessCode)) return { kind: 'invalid', accessCode: null }
  return { kind: 'load', accessCode }
}

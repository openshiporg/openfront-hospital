'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import type { PatientVisitView } from './visit'

// Patient account actions (sign up, sign in, sign out, confirm email, my visits), the same Keystone session cookie
// the E-commerce and Restaurant storefront accounts use. A patient account has no staff role.

export type PatientAppointments = { name: string; email: string; emailConfirmed: boolean; upcoming: PatientVisitView[]; past: PatientVisitView[] }
export type AccountFormState = { message: string | null; email: string }

const VISIT = 'appointmentNumber status startsAt endsAt facilityName facilityTimeZone facilityPhone facilityAddress providerName visitTypeName canCancel accessToken'
const SIGN_IN_ERROR = 'That email and password did not match. Try again, or reset your password.'

async function startSession(email: string, password: string) {
  const response = await keystoneClient<{ authenticate: { sessionToken?: string; message?: string } }>(
    `mutation($email:String!,$password:String!){authenticate:authenticateUserWithPassword(email:$email,password:$password){... on UserAuthenticationWithPasswordSuccess{sessionToken} ... on UserAuthenticationWithPasswordFailure{message}}}`,
    { email, password },
  )
  const token = response.success ? response.data.authenticate?.sessionToken : undefined
  if (!token) return false
  const store = await cookies()
  store.set('keystonejs-session', token, { secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', httpOnly: true, maxAge: 60 * 60 * 24 * 30 })
  return true
}

function nextPath(value: FormDataEntryValue | null) {
  const path = String(value || '')
  return /^\/(account|book|visit)(\/|$|\?)/.test(path) ? path : '/account'
}

export async function patientSignIn(_state: AccountFormState, form: FormData): Promise<AccountFormState> {
  const email = String(form.get('email') || '').trim().toLowerCase()
  const password = String(form.get('password') || '')
  if (!await startSession(email, password).catch(() => false)) return { message: SIGN_IN_ERROR, email }
  redirect(nextPath(form.get('next')))
}

export async function patientSignUp(_state: AccountFormState, form: FormData): Promise<AccountFormState> {
  const name = String(form.get('name') || '').trim()
  const email = String(form.get('email') || '').trim().toLowerCase()
  const password = String(form.get('password') || '')
  const response = await keystoneClient<{ registerPatientAccount: { ok: boolean } }>(
    'mutation($name:String!,$email:String!,$password:String!){registerPatientAccount(name:$name,email:$email,password:$password){ok}}',
    { name, email, password },
  )
  if (!response.success) return { message: response.error || 'We could not create your account. Try again.', email }
  // An existing email answers the same way; signing in then fails with the usual message rather than revealing it.
  if (!await startSession(email, password).catch(() => false)) return { message: 'Check your email to finish setting up your account, or sign in if you already have one.', email }
  redirect(nextPath(form.get('next')))
}

export async function patientSignOut() {
  await keystoneClient('mutation { endSession }').catch(() => null)
  const store = await cookies()
  store.delete('keystonejs-session')
  redirect('/account')
}

export async function myAppointmentsAction(): Promise<PatientAppointments | null> {
  const store = await cookies()
  if (!store.get('keystonejs-session')?.value) return null
  const response = await keystoneClient<{ myPatientAppointments: PatientAppointments }>(
    `query MyAppointments{myPatientAppointments{name email emailConfirmed upcoming{${VISIT}} past{${VISIT}}}}`,
  )
  return response.success ? response.data.myPatientAppointments : null
}

export async function confirmEmailAction(token: string) {
  const response = await keystoneClient<{ confirmPatientAccountEmail: { ok: boolean } }>('mutation($token:String!){confirmPatientAccountEmail(token:$token){ok}}', { token })
  return response.success && response.data.confirmPatientAccountEmail.ok
}

export async function resendConfirmationAction() {
  const response = await keystoneClient<{ resendPatientAccountConfirmation: { ok: boolean } }>('mutation{resendPatientAccountConfirmation{ok}}')
  return response.success ? { ok: true as const } : { ok: false as const, error: response.error || 'We could not send the email. Try again later.' }
}

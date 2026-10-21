'use server'

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'

export type BootstrapState = { status: 'idle' | 'created' | 'already_initialized' | 'error'; message: string }

export async function bootstrapInitialHospital(
  _previous: BootstrapState,
  formData: FormData,
): Promise<BootstrapState> {
  const response = await keystoneClient<{ bootstrapHospital: { status: string } }>(`
    mutation BootstrapHospital($secret: String!, $data: HospitalBootstrapInput!) {
      bootstrapHospital(secret: $secret, data: $data) { status }
    }
  `, {
    secret: String(formData.get('bootstrapSecret') || ''),
    data: {
      name: String(formData.get('name') || ''),
      email: String(formData.get('email') || ''),
      password: String(formData.get('password') || ''),
    },
  })
  if (!response.success) return { status: 'error', message: 'Hospital initialization could not be completed.' }
  if (response.data.bootstrapHospital.status === 'created') {
    return { status: 'created', message: 'Administrator created. Sign in to complete hospital setup.' }
  }
  return { status: 'already_initialized', message: 'This installation is already initialized.' }
}

import type { Context } from '.keystone/types'

type Args = {
  data: {
    email?: string | null
    name?: string | null
    password?: string | null
    onboardingStatus?: string | null
  }
}

export default async function updateActiveUser(root: unknown, { data }: Args, context: Context) {
  if (!context.session?.itemId) {
    throw new Error('You must be signed in to update your profile')
  }

  const updateData: Record<string, unknown> = {}

  if (typeof data.email === 'string' && data.email.trim()) updateData.email = data.email.trim()
  if (typeof data.name === 'string' && data.name.trim()) updateData.name = data.name.trim()
  if (typeof data.password === 'string' && data.password) updateData.password = data.password
  if (typeof data.onboardingStatus === 'string') {
    if (!context.session.data.role?.canManageOnboarding) {
      throw new Error('Not authorized to update onboarding status')
    }
    if (!['not_started', 'in_progress', 'completed', 'dismissed'].includes(data.onboardingStatus)) {
      throw new Error('Invalid onboarding status')
    }
    updateData.onboardingStatus = data.onboardingStatus
  }

  return context.db.User.updateOne({
    where: { id: context.session.itemId },
    data: updateData,
  })
}

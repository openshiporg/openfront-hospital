import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { WorkspaceLoadError } from '@/features/platform/components/WorkspaceLoadError'
import { Notice, WardBody, WardHeader } from '@/features/platform/components/ward'
import { getHospitalStorefrontSettings } from '@/features/platform/store-settings/actions/storefrontSettings'
import { emptyHospitalStorefrontSettings } from '@/features/platform/store-settings/lib/storefrontSettings'
import { HospitalStorefrontSettingsForm } from './HospitalStorefrontSettingsForm'

const breadcrumbs = [
  { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
  { type: 'page' as const, label: 'Storefront settings' },
]

export async function HospitalStorefrontSettingsPage() {
  const response = await getHospitalStorefrontSettings()
  if (!response.success) {
    return <WorkspaceLoadError title="Storefront settings" description="The persisted public identity or settings authority may be unavailable for this session." breadcrumbs={breadcrumbs} />
  }

  const mayManage = response.data.authenticatedItem?.role?.canManageOnboarding === true
  if (!mayManage) {
    return (
      <PageContainer
        title="Storefront settings"
        breadcrumbs={breadcrumbs}
        header={<WardHeader title="Storefront settings" tone="warn" status="Permission required" meta="Permission required" />}
      >
        <WardBody>
          <Notice role="alert" tone="warn">
            Storefront identity and theme changes require healthcare setup authority. No settings were changed.
          </Notice>
        </WardBody>
      </PageContainer>
    )
  }

  const profile = response.data.hospitalProfiles[0]
  const initialSettings = profile
    ? {
        ...emptyHospitalStorefrontSettings(),
        ...profile,
      }
    : emptyHospitalStorefrontSettings()

  return (
    <PageContainer
      title="Storefront settings"
      breadcrumbs={breadcrumbs}
      header={(
        <WardHeader
          title="Storefront settings"
          tone={!profile ? 'warn' : profile.status === 'active' ? 'ok' : 'idle'}
          status={!profile ? 'No profile' : profile.status === 'active' ? 'Live' : 'Inactive'}
          meta={!profile ? 'No public profile' : profile.status === 'active' ? 'Live' : 'Inactive profile'}
        />
      )}
    >
      <WardBody>
        {!profile ? (
          <Notice role="status" tone="warn">
            No primary public profile exists. Saving will create it; the storefront uses generic copy until then.
          </Notice>
        ) : profile.status !== 'active' ? (
          <Notice role="status">
            The primary profile is inactive. Saving keeps it inactive, so the storefront continues using its generic fallback.
          </Notice>
        ) : null}
        <HospitalStorefrontSettingsForm initialSettings={initialSettings} />
      </WardBody>
    </PageContainer>
  )
}

export default HospitalStorefrontSettingsPage

import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { WorkspaceLoadError } from '@/features/platform/components/WorkspaceLoadError'
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
        header={<div><p className="text-sm font-medium uppercase tracking-[.2em] text-muted-foreground">Permission required</p><h1 className="mt-2 text-3xl font-semibold">Storefront settings</h1></div>}
      >
        <div className="px-4 pb-8 md:px-6">
          <div role="alert" className="rounded-lg border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-950">
            Storefront identity and theme changes require healthcare setup authority. No settings were changed.
          </div>
        </div>
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
        <div>
          <p className="text-sm font-medium uppercase tracking-[.2em] text-muted-foreground">Patient front door</p>
          <h1 className="mt-2 text-3xl font-semibold">Storefront settings</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Manage verified public identity, scheduling contact details, and an approved visual theme. Available services remain derived from active visit types and providers; emergency, booking-confirmation, intake, and privacy language is not editable here.
          </p>
        </div>
      )}
    >
      <div className="px-4 pb-8 md:px-6">
        {!profile ? (
          <div role="status" className="mb-4 rounded-lg border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-950">
            No primary public profile exists. Saving verified identity will create the active primary profile; generic unconfigured storefront copy remains in use until then.
          </div>
        ) : profile.status !== 'active' ? (
          <div role="status" className="mb-4 rounded-lg border p-4 text-sm text-muted-foreground">
            The primary profile is inactive. Saving will preserve that state, so the public storefront will continue using its generic fallback.
          </div>
        ) : null}
        <HospitalStorefrontSettingsForm initialSettings={initialSettings} />
      </div>
    </PageContainer>
  )
}

export default HospitalStorefrontSettingsPage

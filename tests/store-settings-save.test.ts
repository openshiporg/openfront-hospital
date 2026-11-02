import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { sanitizeStoreLogoSvg } from '../features/keystone/utils/storeLogo'
import { normalizeStoreLogoColor } from '../features/platform/store-settings/lib/store-logo'
import { emptyHospitalStorefrontSettings, parseHospitalStorefrontSettingsInput } from '../features/platform/store-settings/lib/storefrontSettings'
import { HUE_PRESETS, LOGO_ICONS } from '../features/platform/store-settings/lib/icon-registry'

const root = path.resolve(__dirname, '..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')
const custom = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="#16a34a"/></svg>'

test('a custom SVG and every library logo survive the sanitizer; unsafe markup does not', () => {
  assert.equal(sanitizeStoreLogoSvg(custom), custom)
  for (const icon of LOGO_ICONS) assert.equal(sanitizeStoreLogoSvg(icon.lightSvg), icon.lightSvg, icon.id)
  assert.equal(sanitizeStoreLogoSvg('<svg onload="alert(1)"></svg>'), '')
  assert.deepEqual(HUE_PRESETS.map(preset => preset.value), [0, 30, 60, 120, 180, 270, 330])
})

test('the form payload keeps a custom SVG and normalizes the hue', () => {
  const base = { ...emptyHospitalStorefrontSettings(), name: 'Clinic', shortName: 'Clinic' }
  const parsed = parseHospitalStorefrontSettingsInput({ ...base, logoIcon: custom, logoColor: '390' })
  assert.equal(parsed.success, true)
  if (!parsed.success) return
  assert.equal(parsed.data.logoIcon, custom)
  assert.equal(parsed.data.logoColor, '30')
  assert.equal(normalizeStoreLogoColor('-30'), '330')
})

test('the page renders the E-commerce block and the action saves sanitize → mutation → revalidate', () => {
  const page = read('features/platform/store-settings/screens/HospitalStorefrontSettingsForm.tsx')
  assert.match(page, /\{\/\* Logo Icon Selector \*\/\}/)
  assert.match(page, /\{\/\* Logo Color Selector \*\/\}/)
  assert.match(page, /Edit SVG Code/)
  assert.match(page, /grid grid-cols-4 gap-2 p-2/)
  assert.doesNotMatch(page, /merchant-hue|merchant-logo-choice/)
  const action = read('features/platform/store-settings/actions/storefrontSettings.ts')
  assert.match(action, /const safeLogo = sanitizeStoreLogoSvg\(parsed\.data\.logoIcon\)/)
  assert.match(action, /updateHospitalProfile\(where: \{ id: \$id \}, data: \$data\)/)
  assert.match(action, /revalidatePath\('\/', 'layout'\)/)
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { DEFAULT_STORE_LOGO_ICON } from '../features/platform/store-settings/lib/store-logo'
import { storeOwnMark } from '../features/storefront/lib/store-mark'
import { sanitizeStoreLogoSvg } from '../features/keystone/utils/storeLogo'

describe('storeOwnMark', () => {
  it('always returns an icon: the default when nothing is saved', () => {
    const dflt = sanitizeStoreLogoSvg(DEFAULT_STORE_LOGO_ICON)
    assert.ok(dflt)
    assert.equal(storeOwnMark(null), dflt)
    assert.equal(storeOwnMark(undefined), dflt)
    assert.equal(storeOwnMark('   '), dflt)
    assert.equal(storeOwnMark(DEFAULT_STORE_LOGO_ICON), dflt)
  })
  it('keeps a mark chosen in Store Settings and falls back from unsafe SVG', () => {
    const cup = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#92400e" d="M4 8h12v6z"/></svg>'
    assert.match(storeOwnMark(cup), /M4 8h12v6/)
    assert.equal(storeOwnMark('<svg><script>alert(1)</script></svg>'), sanitizeStoreLogoSvg(DEFAULT_STORE_LOGO_ICON))
  })
})

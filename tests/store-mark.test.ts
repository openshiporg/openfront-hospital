import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { DEFAULT_STORE_LOGO_ICON } from '../features/platform/store-settings/lib/store-logo'
import { storeOwnMark } from '../features/storefront/lib/store-mark'

describe('storeOwnMark', () => {
  it('shows nothing without a saved mark', () => {
    assert.equal(storeOwnMark(null), '')
    assert.equal(storeOwnMark(undefined), '')
    assert.equal(storeOwnMark('   '), '')
  })
  it('hides the platform placeholder', () => {
    assert.equal(storeOwnMark(DEFAULT_STORE_LOGO_ICON), '')
    assert.equal(storeOwnMark(`  ${DEFAULT_STORE_LOGO_ICON}\n`), '')
  })
  it('keeps a mark chosen in Store Settings and drops unsafe SVG', () => {
    const cup = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 48"><path fill="#155eef" d="M4 8h12v6z"/></svg>'
    assert.match(storeOwnMark(cup), /M4 8h12v6/)
    assert.equal(storeOwnMark('<svg><script>alert(1)</script></svg>'), '')
  })
})

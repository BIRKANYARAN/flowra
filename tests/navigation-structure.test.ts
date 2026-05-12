/**
 * FAZ 21 — UX Mimarisi: navigation unit tests
 *
 * Tests the pure functions in lib/nav-config.ts:
 *   1. hasMinRole()           — role hierarchy comparison
 *   2. getNavForRole()        — role-filtered nav items (without settings fallback)
 *   3. getFullNavForRole()    — nav + settings fallback for non-admin
 *   4. getNavCount()          — item count per role
 *   5. isMobileNavItem()      — membership in the 5-item mobile nav
 *   6. findNavItem()          — href → NavItem lookup
 *   7. isPrimaryNavItem()     — membership in the 9 primary nav items
 *   8. MOBILE_NAV             — exactly 5 items, all have required fields
 *   9. NAV_ITEMS              — structural invariants (9 items, unique hrefs)
 *
 * All functions are pure (no DB, no React, no side effects).
 * Run with: npx vitest run tests/navigation-structure.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  ROLE_LEVEL,
  NAV_ITEMS,
  MOBILE_NAV,
  MOBILE_NAV_HREFS,
  SETTINGS_FALLBACK,
  hasMinRole,
  getNavForRole,
  getFullNavForRole,
  getNavCount,
  isMobileNavItem,
  findNavItem,
  isPrimaryNavItem,
} from '../lib/nav-config'

// ─────────────────────────────────────────────────────────────────────────────
// 1. hasMinRole
// ─────────────────────────────────────────────────────────────────────────────

describe('hasMinRole()', () => {
  it('viewer satisfies viewer', () => {
    expect(hasMinRole('viewer', 'viewer')).toBe(true)
  })

  it('viewer does NOT satisfy manager', () => {
    expect(hasMinRole('viewer', 'manager')).toBe(false)
  })

  it('viewer does NOT satisfy admin', () => {
    expect(hasMinRole('viewer', 'admin')).toBe(false)
  })

  it('manager satisfies viewer', () => {
    expect(hasMinRole('manager', 'viewer')).toBe(true)
  })

  it('manager satisfies manager', () => {
    expect(hasMinRole('manager', 'manager')).toBe(true)
  })

  it('manager does NOT satisfy admin', () => {
    expect(hasMinRole('manager', 'admin')).toBe(false)
  })

  it('admin satisfies viewer', () => {
    expect(hasMinRole('admin', 'viewer')).toBe(true)
  })

  it('admin satisfies manager', () => {
    expect(hasMinRole('admin', 'manager')).toBe(true)
  })

  it('admin satisfies admin', () => {
    expect(hasMinRole('admin', 'admin')).toBe(true)
  })

  it('null role is treated as viewer — satisfies viewer', () => {
    expect(hasMinRole(null, 'viewer')).toBe(true)
  })

  it('null role does NOT satisfy manager', () => {
    expect(hasMinRole(null, 'manager')).toBe(false)
  })

  it('null role does NOT satisfy admin', () => {
    expect(hasMinRole(null, 'admin')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. ROLE_LEVEL invariants
// ─────────────────────────────────────────────────────────────────────────────

describe('ROLE_LEVEL', () => {
  it('viewer < manager < admin', () => {
    expect(ROLE_LEVEL.viewer).toBeLessThan(ROLE_LEVEL.manager)
    expect(ROLE_LEVEL.manager).toBeLessThan(ROLE_LEVEL.admin)
  })

  it('all three roles are defined', () => {
    expect(typeof ROLE_LEVEL.viewer).toBe('number')
    expect(typeof ROLE_LEVEL.manager).toBe('number')
    expect(typeof ROLE_LEVEL.admin).toBe('number')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. NAV_ITEMS structural invariants
// ─────────────────────────────────────────────────────────────────────────────

describe('NAV_ITEMS', () => {
  it('has exactly 9 items', () => {
    expect(NAV_ITEMS).toHaveLength(9)
  })

  it('all hrefs are unique', () => {
    const hrefs = NAV_ITEMS.map(i => i.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('all items have href, label, icon', () => {
    for (const item of NAV_ITEMS) {
      expect(typeof item.href).toBe('string')
      expect(item.href.length).toBeGreaterThan(0)
      expect(typeof item.label).toBe('string')
      expect(item.label.length).toBeGreaterThan(0)
      expect(typeof item.icon).toBe('string')
      expect(item.icon.length).toBeGreaterThan(0)
    }
  })

  it('first item is Komuta Merkezi at /dashboard (exact match)', () => {
    const first = NAV_ITEMS[0]
    expect(first.href).toBe('/dashboard')
    expect(first.exact).toBe(true)
  })

  it('last item is Yönetim (admin only)', () => {
    const last = NAV_ITEMS[NAV_ITEMS.length - 1]
    expect(last.href).toBe('/dashboard/settings')
    expect(last.minRole).toBe('admin')
  })

  it('Simülasyon requires manager role', () => {
    const sim = NAV_ITEMS.find(i => i.href === '/dashboard/simulation')
    expect(sim).toBeDefined()
    expect(sim!.minRole).toBe('manager')
  })

  it('Raporlar requires manager role', () => {
    const rep = NAV_ITEMS.find(i => i.href === '/dashboard/reports')
    expect(rep).toBeDefined()
    expect(rep!.minRole).toBe('manager')
  })

  it('Yönetim requires admin role', () => {
    const ynt = NAV_ITEMS.find(i => i.href === '/dashboard/settings')
    expect(ynt).toBeDefined()
    expect(ynt!.minRole).toBe('admin')
  })

  it('items without minRole are visible to all', () => {
    const openItems = NAV_ITEMS.filter(i => !i.minRole)
    expect(openItems.length).toBeGreaterThanOrEqual(6)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. getNavForRole
// ─────────────────────────────────────────────────────────────────────────────

describe('getNavForRole()', () => {
  it('admin sees all 9 items', () => {
    expect(getNavForRole('admin')).toHaveLength(9)
  })

  it('manager sees 8 items (no Yönetim)', () => {
    const items = getNavForRole('manager')
    expect(items).toHaveLength(8)
    expect(items.find(i => i.minRole === 'admin')).toBeUndefined()
  })

  it('viewer sees 6 items (no Yönetim, no Simülasyon, no Raporlar)', () => {
    const items = getNavForRole('viewer')
    expect(items).toHaveLength(6)
    expect(items.find(i => i.href === '/dashboard/simulation')).toBeUndefined()
    expect(items.find(i => i.href === '/dashboard/reports')).toBeUndefined()
    expect(items.find(i => i.href === '/dashboard/settings')).toBeUndefined()
  })

  it('null role sees same as viewer (6 items)', () => {
    expect(getNavForRole(null)).toHaveLength(6)
  })

  it('all roles see Komuta Merkezi', () => {
    for (const role of ['admin', 'manager', 'viewer', null] as const) {
      const items = getNavForRole(role)
      expect(items.find(i => i.href === '/dashboard')).toBeDefined()
    }
  })

  it('all roles see Finansal Analiz', () => {
    for (const role of ['admin', 'manager', 'viewer', null] as const) {
      const items = getNavForRole(role)
      expect(items.find(i => i.href === '/dashboard/analytics')).toBeDefined()
    }
  })

  it('all roles see Satış & Tahsilat', () => {
    for (const role of ['admin', 'manager', 'viewer', null] as const) {
      const items = getNavForRole(role)
      expect(items.find(i => i.href === '/dashboard/sales-flow')).toBeDefined()
    }
  })

  it('only admin sees Yönetim in getNavForRole', () => {
    expect(getNavForRole('admin').find(i => i.href === '/dashboard/settings')).toBeDefined()
    expect(getNavForRole('manager').find(i => i.href === '/dashboard/settings')).toBeUndefined()
    expect(getNavForRole('viewer').find(i => i.href === '/dashboard/settings')).toBeUndefined()
  })

  it('manager sees Simülasyon', () => {
    expect(getNavForRole('manager').find(i => i.href === '/dashboard/simulation')).toBeDefined()
  })

  it('viewer does not see Simülasyon', () => {
    expect(getNavForRole('viewer').find(i => i.href === '/dashboard/simulation')).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. getFullNavForRole
// ─────────────────────────────────────────────────────────────────────────────

describe('getFullNavForRole()', () => {
  it('admin gets exactly 9 items (no extra fallback)', () => {
    expect(getFullNavForRole('admin')).toHaveLength(9)
  })

  it('manager gets 9 items (8 + Ayarlar fallback)', () => {
    expect(getFullNavForRole('manager')).toHaveLength(9)
  })

  it('viewer gets 7 items (6 + Ayarlar fallback)', () => {
    expect(getFullNavForRole('viewer')).toHaveLength(7)
  })

  it('null gets 7 items (6 + Ayarlar fallback)', () => {
    expect(getFullNavForRole(null)).toHaveLength(7)
  })

  it('manager last item is Ayarlar fallback', () => {
    const items = getFullNavForRole('manager')
    const last  = items[items.length - 1]
    expect(last.href).toBe(SETTINGS_FALLBACK.href)
    expect(last.label).toBe(SETTINGS_FALLBACK.label)
  })

  it('admin does NOT get duplicate settings entry', () => {
    const items  = getFullNavForRole('admin')
    const settingsItems = items.filter(i => i.href === '/dashboard/settings')
    expect(settingsItems).toHaveLength(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. getNavCount
// ─────────────────────────────────────────────────────────────────────────────

describe('getNavCount()', () => {
  it('admin: 9', () => expect(getNavCount('admin')).toBe(9))
  it('manager: 8', () => expect(getNavCount('manager')).toBe(8))
  it('viewer: 6', () => expect(getNavCount('viewer')).toBe(6))
  it('null: 6', () => expect(getNavCount(null)).toBe(6))
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. MOBILE_NAV invariants
// ─────────────────────────────────────────────────────────────────────────────

describe('MOBILE_NAV', () => {
  it('has exactly 5 items', () => {
    expect(MOBILE_NAV).toHaveLength(5)
  })

  it('all items have href, label, emoji', () => {
    for (const item of MOBILE_NAV) {
      expect(typeof item.href).toBe('string')
      expect(item.href.length).toBeGreaterThan(0)
      expect(typeof item.label).toBe('string')
      expect(item.label.length).toBeGreaterThan(0)
      expect(typeof item.emoji).toBe('string')
      expect(item.emoji.length).toBeGreaterThan(0)
    }
  })

  it('first item is /dashboard (home)', () => {
    expect(MOBILE_NAV[0].href).toBe('/dashboard')
  })

  it('all hrefs are unique', () => {
    const hrefs = MOBILE_NAV.map(i => i.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('MOBILE_NAV_HREFS has same length as MOBILE_NAV', () => {
    expect(MOBILE_NAV_HREFS).toHaveLength(MOBILE_NAV.length)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. isMobileNavItem
// ─────────────────────────────────────────────────────────────────────────────

describe('isMobileNavItem()', () => {
  it('returns true for /dashboard', () => {
    expect(isMobileNavItem('/dashboard')).toBe(true)
  })

  it('returns true for /dashboard/sales-flow', () => {
    expect(isMobileNavItem('/dashboard/sales-flow')).toBe(true)
  })

  it('returns true for /dashboard/expenses', () => {
    expect(isMobileNavItem('/dashboard/expenses')).toBe(true)
  })

  it('returns true for /dashboard/analytics', () => {
    expect(isMobileNavItem('/dashboard/analytics')).toBe(true)
  })

  it('returns true for /dashboard/catalog', () => {
    expect(isMobileNavItem('/dashboard/catalog')).toBe(true)
  })

  it('returns false for /dashboard/partners', () => {
    expect(isMobileNavItem('/dashboard/partners')).toBe(false)
  })

  it('returns false for /dashboard/settings', () => {
    expect(isMobileNavItem('/dashboard/settings')).toBe(false)
  })

  it('returns false for unknown href', () => {
    expect(isMobileNavItem('/dashboard/unknown')).toBe(false)
    expect(isMobileNavItem('')).toBe(false)
    expect(isMobileNavItem('/')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 9. findNavItem
// ─────────────────────────────────────────────────────────────────────────────

describe('findNavItem()', () => {
  it('finds the dashboard item', () => {
    const item = findNavItem('/dashboard')
    expect(item).toBeDefined()
    expect(item!.label).toBe('Komuta Merkezi')
    expect(item!.exact).toBe(true)
  })

  it('finds analytics item', () => {
    const item = findNavItem('/dashboard/analytics')
    expect(item).toBeDefined()
    expect(item!.label).toBe('Finansal Analiz')
  })

  it('returns undefined for unknown href', () => {
    expect(findNavItem('/dashboard/nonexistent')).toBeUndefined()
    expect(findNavItem('')).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 10. isPrimaryNavItem
// ─────────────────────────────────────────────────────────────────────────────

describe('isPrimaryNavItem()', () => {
  it('returns true for all 9 primary nav hrefs', () => {
    for (const item of NAV_ITEMS) {
      expect(isPrimaryNavItem(item.href)).toBe(true)
    }
  })

  it('returns false for sub-pages', () => {
    expect(isPrimaryNavItem('/dashboard/sales')).toBe(false)
    expect(isPrimaryNavItem('/dashboard/proformas')).toBe(false)
    expect(isPrimaryNavItem('/dashboard/collections')).toBe(false)
    expect(isPrimaryNavItem('/dashboard/stocks')).toBe(false)
  })

  it('returns false for unknown href', () => {
    expect(isPrimaryNavItem('')).toBe(false)
    expect(isPrimaryNavItem('/auth')).toBe(false)
  })
})

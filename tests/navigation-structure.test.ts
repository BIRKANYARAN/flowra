/**
 * FAZ 21 rev-2 — Navigation structure unit tests
 *
 * Tests the pure functions in lib/nav-config.ts:
 *   1.  hasMinRole()           — role hierarchy comparison
 *   2.  getGroupsForRole()     — role-filtered group list
 *   3.  getAllItemsForRole()   — flat item list per role
 *   4.  getNavCount()          — item count per role
 *   5.  isNavItemActive()      — safe prefix matching (no /sales → /sales-flow bug)
 *   6.  isMobileNavItem()      — 5-item mobile nav membership
 *   7.  findNavItem()          — href → NavItem lookup
 *   8.  isKnownNavHref()       — membership in full nav
 *   9.  MOBILE_NAV             — structural invariants
 *   10. NAV_GROUPS             — structural invariants (all groups, all items)
 *   11. Route coverage         — every real page.tsx route is in nav
 *   12. Icon registry safety   — no nav item uses an unregistered icon name
 *
 * All functions are pure (no React, no DB, no side effects).
 * Run with: npx vitest run tests/navigation-structure.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  ROLE_LEVEL,
  NAV_GROUPS,
  MOBILE_NAV,
  MOBILE_NAV_HREFS,
  SETTINGS_FALLBACK,
  hasMinRole,
  getGroupsForRole,
  getAllItemsForRole,
  getNavCount,
  isNavItemActive,
  isMobileNavItem,
  findNavItem,
  isKnownNavHref,
} from '../lib/nav-config'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const ALL_ITEMS_FLAT = NAV_GROUPS.flatMap(g => g.items)

// Icons that exist in Icon.tsx REGISTRY (verified from source)
const VALID_ICONS = new Set([
  'dashboard', 'stocks', 'proformas', 'sales', 'collections', 'expenses',
  'partners', 'simulation', 'analytics', 'settings', 'customers', 'products',
  'users', 'shield', 'tasks', 'backup', 'cashflow', 'tax', 'orders',
  'activity', 'roles', 'ceo', 'alerts', 'arrow-right', 'arrow-up',
  'arrow-down', 'chevron-right', 'chevron-down', 'chevron-up', 'more',
  'plus', 'search', 'refresh', 'download', 'upload', 'logout', 'check',
  'x', 'mail', 'phone', 'trash', 'edit', 'bell', 'flame', 'coins',
  'trending-up', 'alert', 'info', 'filter', 'eye', 'eye-off',
])

// ─────────────────────────────────────────────────────────────────────────────
// 1. ROLE_LEVEL invariants
// ─────────────────────────────────────────────────────────────────────────────

describe('ROLE_LEVEL', () => {
  it('viewer < manager < admin', () => {
    expect(ROLE_LEVEL.viewer).toBeLessThan(ROLE_LEVEL.manager)
    expect(ROLE_LEVEL.manager).toBeLessThan(ROLE_LEVEL.admin)
  })

  it('all three roles are numeric', () => {
    expect(typeof ROLE_LEVEL.viewer).toBe('number')
    expect(typeof ROLE_LEVEL.manager).toBe('number')
    expect(typeof ROLE_LEVEL.admin).toBe('number')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. hasMinRole
// ─────────────────────────────────────────────────────────────────────────────

describe('hasMinRole()', () => {
  it('viewer satisfies viewer', ()   => expect(hasMinRole('viewer', 'viewer')).toBe(true))
  it('viewer fails manager', ()      => expect(hasMinRole('viewer', 'manager')).toBe(false))
  it('viewer fails admin', ()        => expect(hasMinRole('viewer', 'admin')).toBe(false))
  it('manager satisfies viewer', ()  => expect(hasMinRole('manager', 'viewer')).toBe(true))
  it('manager satisfies manager', () => expect(hasMinRole('manager', 'manager')).toBe(true))
  it('manager fails admin', ()       => expect(hasMinRole('manager', 'admin')).toBe(false))
  it('admin satisfies viewer', ()    => expect(hasMinRole('admin', 'viewer')).toBe(true))
  it('admin satisfies manager', ()   => expect(hasMinRole('admin', 'manager')).toBe(true))
  it('admin satisfies admin', ()     => expect(hasMinRole('admin', 'admin')).toBe(true))
  it('null → viewer level: satisfies viewer', () => expect(hasMinRole(null, 'viewer')).toBe(true))
  it('null → viewer level: fails manager', ()    => expect(hasMinRole(null, 'manager')).toBe(false))
  it('null → viewer level: fails admin', ()      => expect(hasMinRole(null, 'admin')).toBe(false))
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. NAV_GROUPS structural invariants
// ─────────────────────────────────────────────────────────────────────────────

describe('NAV_GROUPS', () => {
  it('has exactly 5 groups', () => {
    expect(NAV_GROUPS).toHaveLength(5)
  })

  it('group ids are unique', () => {
    const ids = NAV_GROUPS.map(g => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('first group is unlabeled (Genel)', () => {
    expect(NAV_GROUPS[0].id).toBe('genel')
    expect(NAV_GROUPS[0].label).toBeUndefined()
  })

  it('last group is Yönetim (admin only)', () => {
    const last = NAV_GROUPS[NAV_GROUPS.length - 1]
    expect(last.id).toBe('yonetim')
    expect(last.minRole).toBe('admin')
  })

  it('all items have href, label, icon', () => {
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        expect(typeof item.href).toBe('string')
        expect(item.href.startsWith('/dashboard')).toBe(true)
        expect(typeof item.label).toBe('string')
        expect(item.label.length).toBeGreaterThan(0)
        expect(typeof item.icon).toBe('string')
        expect(item.icon.length).toBeGreaterThan(0)
      }
    }
  })

  it('all hrefs across all groups are unique', () => {
    const hrefs = ALL_ITEMS_FLAT.map(i => i.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('Komuta Merkezi is first item with exact:true', () => {
    const first = NAV_GROUPS[0].items[0]
    expect(first.href).toBe('/dashboard')
    expect(first.exact).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Icon registry safety
// ─────────────────────────────────────────────────────────────────────────────

describe('Icon registry — no broken icons', () => {
  it('every nav item icon exists in Icon.tsx REGISTRY', () => {
    const broken: string[] = []
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        if (!VALID_ICONS.has(item.icon)) {
          broken.push(`${item.label} (${item.href}) → icon: "${item.icon}"`)
        }
      }
    }
    expect(broken).toEqual([]) // fail with list of broken icons
  })

  it('SETTINGS_FALLBACK icon is valid', () => {
    expect(VALID_ICONS.has(SETTINGS_FALLBACK.icon)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Route coverage — all real routes are in nav
// ─────────────────────────────────────────────────────────────────────────────

describe('Route coverage', () => {
  // Every page.tsx that exists under app/dashboard/
  const REAL_ROUTES = [
    '/dashboard',
    '/dashboard/analytics',
    '/dashboard/cashflow',
    '/dashboard/tax',
    '/dashboard/collections',
    '/dashboard/expenses',
    '/dashboard/simulation',
    '/dashboard/partners',
    '/dashboard/sales-flow',
    '/dashboard/sales',
    '/dashboard/proformas',
    '/dashboard/customers',
    '/dashboard/catalog',
    '/dashboard/stocks',
    '/dashboard/products',
    '/dashboard/tasks',
    '/dashboard/admin/users',
    '/dashboard/admin/audit',
    '/dashboard/backups',
    '/dashboard/settings',
  ]

  it('every real route is reachable from the admin nav', () => {
    const missing = REAL_ROUTES.filter(route => !isKnownNavHref(route))
    expect(missing).toEqual([]) // fail with list of missing routes
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. getGroupsForRole
// ─────────────────────────────────────────────────────────────────────────────

describe('getGroupsForRole()', () => {
  it('admin sees all 5 groups (including Yönetim)', () => {
    expect(getGroupsForRole('admin')).toHaveLength(5)
  })

  it('manager sees 4 groups (no Yönetim)', () => {
    const groups = getGroupsForRole('manager')
    expect(groups).toHaveLength(4)
    expect(groups.find(g => g.id === 'yonetim')).toBeUndefined()
  })

  it('viewer sees 4 groups (no Yönetim)', () => {
    const groups = getGroupsForRole('viewer')
    expect(groups).toHaveLength(4)
    expect(groups.find(g => g.id === 'yonetim')).toBeUndefined()
  })

  it('null sees 4 groups (same as viewer)', () => {
    expect(getGroupsForRole(null)).toHaveLength(4)
  })

  it('all roles see genel group', () => {
    for (const role of ['admin', 'manager', 'viewer', null] as const) {
      expect(getGroupsForRole(role).find(g => g.id === 'genel')).toBeDefined()
    }
  })

  it('all roles see finans group', () => {
    for (const role of ['admin', 'manager', 'viewer', null] as const) {
      expect(getGroupsForRole(role).find(g => g.id === 'finans')).toBeDefined()
    }
  })

  it('all roles see satis group', () => {
    for (const role of ['admin', 'manager', 'viewer', null] as const) {
      expect(getGroupsForRole(role).find(g => g.id === 'satis')).toBeDefined()
    }
  })

  it('all roles see operasyon group', () => {
    for (const role of ['admin', 'manager', 'viewer', null] as const) {
      expect(getGroupsForRole(role).find(g => g.id === 'operasyon')).toBeDefined()
    }
  })

  it('only admin sees yonetim group', () => {
    expect(getGroupsForRole('admin').find(g => g.id === 'yonetim')).toBeDefined()
    expect(getGroupsForRole('manager').find(g => g.id === 'yonetim')).toBeUndefined()
    expect(getGroupsForRole('viewer').find(g => g.id === 'yonetim')).toBeUndefined()
    expect(getGroupsForRole(null).find(g => g.id === 'yonetim')).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. getAllItemsForRole & getNavCount
// ─────────────────────────────────────────────────────────────────────────────

describe('getAllItemsForRole()', () => {
  it('admin gets all items (genel + finans + satis + operasyon + yonetim)', () => {
    const total = NAV_GROUPS.reduce((sum, g) => sum + g.items.length, 0)
    expect(getAllItemsForRole('admin')).toHaveLength(total)
  })

  it('manager and viewer get admin count minus yonetim items', () => {
    const adminCount   = getAllItemsForRole('admin').length
    const yonetimCount = NAV_GROUPS.find(g => g.id === 'yonetim')!.items.length
    expect(getAllItemsForRole('manager')).toHaveLength(adminCount - yonetimCount)
    expect(getAllItemsForRole('viewer')).toHaveLength(adminCount - yonetimCount)
  })

  it('null gets same as viewer', () => {
    expect(getAllItemsForRole(null).length).toBe(getAllItemsForRole('viewer').length)
  })

  it('all roles can reach Komuta Merkezi', () => {
    for (const role of ['admin', 'manager', 'viewer', null] as const) {
      expect(getAllItemsForRole(role).find(i => i.href === '/dashboard')).toBeDefined()
    }
  })

  it('all roles can reach Tahsilatlar', () => {
    for (const role of ['admin', 'manager', 'viewer', null] as const) {
      expect(getAllItemsForRole(role).find(i => i.href === '/dashboard/collections')).toBeDefined()
    }
  })

  it('all roles can reach Satış Akışı (FAZ 18)', () => {
    for (const role of ['admin', 'manager', 'viewer', null] as const) {
      expect(getAllItemsForRole(role).find(i => i.href === '/dashboard/sales-flow')).toBeDefined()
    }
  })

  it('all roles can reach Katalog (FAZ 20)', () => {
    for (const role of ['admin', 'manager', 'viewer', null] as const) {
      expect(getAllItemsForRole(role).find(i => i.href === '/dashboard/catalog')).toBeDefined()
    }
  })

  it('only admin sees Ekip (/dashboard/admin/users)', () => {
    expect(getAllItemsForRole('admin').find(i => i.href === '/dashboard/admin/users')).toBeDefined()
    expect(getAllItemsForRole('manager').find(i => i.href === '/dashboard/admin/users')).toBeUndefined()
    expect(getAllItemsForRole('viewer').find(i => i.href === '/dashboard/admin/users')).toBeUndefined()
  })
})

describe('getNavCount()', () => {
  it('admin > manager = viewer', () => {
    expect(getNavCount('admin')).toBeGreaterThan(getNavCount('manager'))
    expect(getNavCount('manager')).toBe(getNavCount('viewer'))
  })

  it('admin has all items', () => {
    const total = NAV_GROUPS.reduce((sum, g) => sum + g.items.length, 0)
    expect(getNavCount('admin')).toBe(total)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. isNavItemActive — safe prefix matching
// ─────────────────────────────────────────────────────────────────────────────

describe('isNavItemActive()', () => {
  const salesItem     = { href: '/dashboard/sales', label: 'S', icon: 'sales', exact: true as const }
  const salesFlowItem = { href: '/dashboard/sales-flow', label: 'SF', icon: 'activity' }
  const dashItem      = { href: '/dashboard', label: 'D', icon: 'dashboard', exact: true as const }
  const analyticsItem = { href: '/dashboard/analytics', label: 'A', icon: 'analytics' }

  it('/dashboard with exact:true → active only at /', () => {
    expect(isNavItemActive(dashItem, '/dashboard')).toBe(true)
    expect(isNavItemActive(dashItem, '/dashboard/analytics')).toBe(false)
  })

  it('/dashboard/sales with exact:true → active only at /sales', () => {
    expect(isNavItemActive(salesItem, '/dashboard/sales')).toBe(true)
    expect(isNavItemActive(salesItem, '/dashboard/sales/123')).toBe(false)
  })

  // Critical bug fix: /sales must NOT match /sales-flow
  it('/dashboard/sales does NOT match /dashboard/sales-flow', () => {
    const salesNoExact = { href: '/dashboard/sales', label: 'S', icon: 'sales' }
    expect(isNavItemActive(salesNoExact, '/dashboard/sales-flow')).toBe(false)
  })

  it('/dashboard/sales-flow matches /dashboard/sales-flow', () => {
    expect(isNavItemActive(salesFlowItem, '/dashboard/sales-flow')).toBe(true)
  })

  it('/dashboard/analytics matches child paths like /dashboard/analytics/report', () => {
    expect(isNavItemActive(analyticsItem, '/dashboard/analytics/report')).toBe(true)
  })

  it('/dashboard/analytics does not match /dashboard/analytics-extra', () => {
    const extraItem = { href: '/dashboard/analytics-extra', label: 'X', icon: 'analytics' }
    expect(isNavItemActive(analyticsItem, '/dashboard/analytics-extra')).toBe(false)
    expect(isNavItemActive(extraItem, '/dashboard/analytics')).toBe(false)
  })

  it('inactive for completely different path', () => {
    expect(isNavItemActive(analyticsItem, '/dashboard/expenses')).toBe(false)
    expect(isNavItemActive(salesFlowItem, '/dashboard/analytics')).toBe(false)
  })

  it('handles admin sub-routes', () => {
    const adminItem = { href: '/dashboard/admin/users', label: 'Ekip', icon: 'users' }
    expect(isNavItemActive(adminItem, '/dashboard/admin/users')).toBe(true)
    expect(isNavItemActive(adminItem, '/dashboard/admin/users/invite')).toBe(true)
    // Must NOT match /dashboard/admin/audit
    expect(isNavItemActive(adminItem, '/dashboard/admin/audit')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 9. findNavItem & isKnownNavHref
// ─────────────────────────────────────────────────────────────────────────────

describe('findNavItem()', () => {
  it('finds Komuta Merkezi', () => {
    const item = findNavItem('/dashboard')
    expect(item).toBeDefined()
    expect(item!.label).toBe('Komuta Merkezi')
    expect(item!.exact).toBe(true)
  })

  it('finds Tahsilatlar', () => {
    const item = findNavItem('/dashboard/collections')
    expect(item).toBeDefined()
    expect(item!.icon).toBe('collections')
  })

  it('finds Satış Akışı (FAZ 18)', () => {
    const item = findNavItem('/dashboard/sales-flow')
    expect(item).toBeDefined()
  })

  it('finds Katalog (FAZ 20)', () => {
    const item = findNavItem('/dashboard/catalog')
    expect(item).toBeDefined()
  })

  it('finds admin/users', () => {
    const item = findNavItem('/dashboard/admin/users')
    expect(item).toBeDefined()
    expect(item!.label).toBe('Ekip')
  })

  it('returns undefined for unknown href', () => {
    expect(findNavItem('/dashboard/nonexistent')).toBeUndefined()
    expect(findNavItem('')).toBeUndefined()
    expect(findNavItem('/auth')).toBeUndefined()
  })
})

describe('isKnownNavHref()', () => {
  it('returns true for all nav items', () => {
    for (const item of ALL_ITEMS_FLAT) {
      expect(isKnownNavHref(item.href)).toBe(true)
    }
  })

  it('returns false for non-nav hrefs', () => {
    expect(isKnownNavHref('/dashboard/reports')).toBe(false) // no page.tsx
    expect(isKnownNavHref('/auth')).toBe(false)
    expect(isKnownNavHref('')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 10. MOBILE_NAV invariants
// ─────────────────────────────────────────────────────────────────────────────

describe('MOBILE_NAV', () => {
  it('has exactly 5 items', () => {
    expect(MOBILE_NAV).toHaveLength(5)
  })

  it('all items have href, label, emoji', () => {
    for (const item of MOBILE_NAV) {
      expect(typeof item.href).toBe('string')
      expect(item.href.startsWith('/dashboard')).toBe(true)
      expect(typeof item.label).toBe('string')
      expect(item.label.length).toBeGreaterThan(0)
      expect(typeof item.emoji).toBe('string')
      expect(item.emoji.length).toBeGreaterThan(0)
    }
  })

  it('first item is /dashboard (home)', () => {
    expect(MOBILE_NAV[0].href).toBe('/dashboard')
  })

  it('includes /dashboard/collections (critical daily action)', () => {
    expect(MOBILE_NAV.find(i => i.href === '/dashboard/collections')).toBeDefined()
  })

  it('includes /dashboard/sales-flow (sales pipeline)', () => {
    expect(MOBILE_NAV.find(i => i.href === '/dashboard/sales-flow')).toBeDefined()
  })

  it('all hrefs are unique', () => {
    const hrefs = MOBILE_NAV.map(i => i.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('MOBILE_NAV_HREFS matches MOBILE_NAV', () => {
    expect(MOBILE_NAV_HREFS).toHaveLength(MOBILE_NAV.length)
    for (const item of MOBILE_NAV) {
      expect(MOBILE_NAV_HREFS).toContain(item.href)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 11. isMobileNavItem
// ─────────────────────────────────────────────────────────────────────────────

describe('isMobileNavItem()', () => {
  it('returns true for all 5 mobile nav hrefs', () => {
    for (const item of MOBILE_NAV) {
      expect(isMobileNavItem(item.href)).toBe(true)
    }
  })

  it('returns false for non-mobile nav items', () => {
    expect(isMobileNavItem('/dashboard/partners')).toBe(false)
    expect(isMobileNavItem('/dashboard/settings')).toBe(false)
    expect(isMobileNavItem('/dashboard/tasks')).toBe(false)
    expect(isMobileNavItem('')).toBe(false)
    expect(isMobileNavItem('/')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 12. SETTINGS_FALLBACK
// ─────────────────────────────────────────────────────────────────────────────

describe('SETTINGS_FALLBACK', () => {
  it('points to /dashboard/settings', () => {
    expect(SETTINGS_FALLBACK.href).toBe('/dashboard/settings')
  })

  it('has a valid icon', () => {
    expect(VALID_ICONS.has(SETTINGS_FALLBACK.icon)).toBe(true)
  })

  it('has no minRole (shown to all non-admin users)', () => {
    expect(SETTINGS_FALLBACK.minRole).toBeUndefined()
  })
})

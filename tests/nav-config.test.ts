// ── nav-config.test.ts ────────────────────────────────────────────────────────
// Tests for lib/nav-config.ts — navigation item counts, role filtering,
// active-state logic, and tab contract counts.

import { describe, it, expect } from 'vitest'
import {
  getAllItemsForRole,
  getGroupsForRole,
  getNavCount,
  isNavItemActive,
  findNavItem,
  isKnownNavHref,
  hasMinRole,
  FINANCE_TABS,
  COMMERCIAL_TABS,
  OPERATIONS_TABS,
  PLANNING_TABS,
  ROUTE_REDIRECTS,
  MOBILE_NAV,
  SETTINGS_FALLBACK,
  type NavItem,
} from '@/lib/nav-config'

// ── Role hierarchy ────────────────────────────────────────────────────────────

describe('hasMinRole', () => {
  it('admin satisfies all roles', () => {
    expect(hasMinRole('admin',   'viewer')).toBe(true)
    expect(hasMinRole('admin',   'manager')).toBe(true)
    expect(hasMinRole('admin',   'admin')).toBe(true)
  })

  it('manager satisfies viewer and manager but not admin', () => {
    expect(hasMinRole('manager', 'viewer')).toBe(true)
    expect(hasMinRole('manager', 'manager')).toBe(true)
    expect(hasMinRole('manager', 'admin')).toBe(false)
  })

  it('viewer satisfies only viewer', () => {
    expect(hasMinRole('viewer', 'viewer')).toBe(true)
    expect(hasMinRole('viewer', 'manager')).toBe(false)
    expect(hasMinRole('viewer', 'admin')).toBe(false)
  })

  it('null role treated as viewer (most restrictive)', () => {
    expect(hasMinRole(null, 'viewer')).toBe(true)
    expect(hasMinRole(null, 'manager')).toBe(false)
    expect(hasMinRole(null, 'admin')).toBe(false)
  })
})

// ── Group filtering ───────────────────────────────────────────────────────────

describe('getGroupsForRole', () => {
  it('admin sees all 3 groups (genel + merkezler + yonetim)', () => {
    const groups = getGroupsForRole('admin')
    expect(groups.length).toBe(3)
    expect(groups.map(g => g.id)).toEqual(['genel', 'merkezler', 'yonetim'])
  })

  it('manager sees 2 groups (no yonetim)', () => {
    const groups = getGroupsForRole('manager')
    expect(groups.length).toBe(2)
    expect(groups.find(g => g.id === 'yonetim')).toBeUndefined()
  })

  it('viewer sees 2 groups (no yonetim)', () => {
    const groups = getGroupsForRole('viewer')
    expect(groups.length).toBe(2)
    expect(groups.find(g => g.id === 'yonetim')).toBeUndefined()
  })

  it('null role sees 2 groups', () => {
    const groups = getGroupsForRole(null)
    expect(groups.length).toBe(2)
  })
})

// ── Item counts ───────────────────────────────────────────────────────────────

describe('getAllItemsForRole item counts', () => {
  // Groups: genel (1) + merkezler (7: finance, commercial, operations, partners, planning, insights + governance[admin-only]) + yonetim (3 — admin only)
  it('admin sees 11 nav items (1 genel + 7 merkezler + 3 yonetim)', () => {
    expect(getAllItemsForRole('admin').length).toBe(11)
  })

  it('manager sees 7 nav items (1 genel + 6 merkezler)', () => {
    expect(getAllItemsForRole('manager').length).toBe(7)
  })

  it('viewer sees 7 nav items (1 genel + 6 merkezler)', () => {
    expect(getAllItemsForRole('viewer').length).toBe(7)
  })

  it('null role sees 7 nav items', () => {
    expect(getAllItemsForRole(null).length).toBe(7)
  })

  it('getNavCount matches getAllItemsForRole length', () => {
    expect(getNavCount('admin')).toBe(getAllItemsForRole('admin').length)
    expect(getNavCount('viewer')).toBe(getAllItemsForRole('viewer').length)
  })
})

// ── merkezler group contains expected hubs ────────────────────────────────────

describe('merkezler group contents', () => {
  it('contains all 6 center hubs (ops merged into operations)', () => {
    const items = getAllItemsForRole('viewer')
    const hrefs = items.map(i => i.href)
    expect(hrefs).toContain('/dashboard/finance')
    expect(hrefs).toContain('/dashboard/commercial')
    expect(hrefs).toContain('/dashboard/operations')
    expect(hrefs).toContain('/dashboard/partners')
    expect(hrefs).toContain('/dashboard/planning')
    expect(hrefs).toContain('/dashboard/insights')
    // /dashboard/ops is now a redirect, not a sidebar item
    expect(hrefs).not.toContain('/dashboard/ops')
  })

  it('komuta merkezi uses exact matching', () => {
    const items = getAllItemsForRole('viewer')
    const komuta = items.find(i => i.href === '/dashboard')
    expect(komuta?.exact).toBe(true)
  })

  it('yonetim items visible to admin only', () => {
    const adminItems  = getAllItemsForRole('admin').map(i => i.href)
    const viewerItems = getAllItemsForRole('viewer').map(i => i.href)
    expect(adminItems).toContain('/dashboard/admin')
    expect(adminItems).toContain('/dashboard/admin/workflows')
    expect(adminItems).toContain('/dashboard/settings')
    expect(viewerItems).not.toContain('/dashboard/admin')
  })
})

// ── isNavItemActive ───────────────────────────────────────────────────────────

describe('isNavItemActive', () => {
  const exact: NavItem = { href: '/dashboard', label: 'Komuta', icon: 'dashboard', exact: true }
  const finance: NavItem = { href: '/dashboard/finance', label: 'Finans', icon: 'analytics' }
  const operations: NavItem = { href: '/dashboard/operations', label: 'Operasyon', icon: 'products' }

  it('exact item: active only on exact match', () => {
    expect(isNavItemActive(exact, '/dashboard')).toBe(true)
    expect(isNavItemActive(exact, '/dashboard/finance')).toBe(false)
    expect(isNavItemActive(exact, '/dashboard/operations')).toBe(false)
  })

  it('prefix item: active on exact match', () => {
    expect(isNavItemActive(finance, '/dashboard/finance')).toBe(true)
  })

  it('prefix item: active on child path', () => {
    expect(isNavItemActive(finance, '/dashboard/finance/something')).toBe(true)
  })

  it('prefix item: NOT active on path with hyphen extension', () => {
    // /dashboard/finance-extra should NOT match /dashboard/finance
    // (the startsWith check uses '/dashboard/finance/' which doesn't match '/dashboard/finance-extra')
    expect(isNavItemActive(finance, '/dashboard/finance-extra')).toBe(false)
  })

  it('operations item: active on /dashboard/operations and komuta tab', () => {
    expect(isNavItemActive(operations, '/dashboard/operations')).toBe(true)
    // ?tab= query params not part of pathname, so this tests the base path
    expect(isNavItemActive(operations, '/dashboard/operations')).toBe(true)
    expect(isNavItemActive(operations, '/dashboard/finance')).toBe(false)
  })

  it('finance active on ?tab=cfo URL (pathname only)', () => {
    // pathname won't include ?tab=cfo, so isNavItemActive just checks pathname
    expect(isNavItemActive(finance, '/dashboard/finance')).toBe(true)
  })
})

// ── findNavItem / isKnownNavHref ──────────────────────────────────────────────

describe('findNavItem + isKnownNavHref', () => {
  it('finds komuta merkezi by href', () => {
    const item = findNavItem('/dashboard')
    expect(item).toBeDefined()
    expect(item?.label).toBe('Komuta Merkezi')
  })

  it('ops is no longer a sidebar item (merged into operations/komuta tab)', () => {
    // /dashboard/ops redirects to /dashboard/operations?tab=komuta
    const item = findNavItem('/dashboard/ops')
    expect(item).toBeUndefined()
  })

  it('returns undefined for unknown href', () => {
    expect(findNavItem('/dashboard/unknown-page')).toBeUndefined()
  })

  it('isKnownNavHref: true for known routes', () => {
    expect(isKnownNavHref('/dashboard')).toBe(true)
    expect(isKnownNavHref('/dashboard/finance')).toBe(true)
    expect(isKnownNavHref('/dashboard/operations')).toBe(true)
    expect(isKnownNavHref('/dashboard/admin')).toBe(true)
    // /dashboard/ops is now a redirect page, not a sidebar item
    expect(isKnownNavHref('/dashboard/ops')).toBe(false)
  })

  it('isKnownNavHref: false for tab routes (not sidebar items)', () => {
    expect(isKnownNavHref('/dashboard/finance?tab=pnl')).toBe(false)
    expect(isKnownNavHref('/dashboard/operations?tab=expenses')).toBe(false)
  })
})

// ── Tab contracts ─────────────────────────────────────────────────────────────

describe('Tab contracts — canonical key sets', () => {
  it('FINANCE_TABS has 9 tabs', () => {
    expect(FINANCE_TABS.length).toBe(9)
    const keys = FINANCE_TABS.map(t => t.key)
    expect(keys).toContain('overview')
    expect(keys).toContain('cfo')
    expect(keys).toContain('quarterly')
  })

  it('COMMERCIAL_TABS has 5 tabs', () => {
    expect(COMMERCIAL_TABS.length).toBe(5)
    const keys = COMMERCIAL_TABS.map(t => t.key)
    expect(keys).toContain('pipeline')
    expect(keys).toContain('collections')
    expect(keys).toContain('customers')
  })

  it('OPERATIONS_TABS has 5 tabs (komuta added as first tab)', () => {
    expect(OPERATIONS_TABS.length).toBe(5)
    const keys = OPERATIONS_TABS.map(t => t.key)
    expect(keys[0]).toBe('komuta')
    expect(keys).toContain('expenses')
    expect(keys).toContain('catalog')
    expect(keys).toContain('stock')
    expect(keys).toContain('orders')
  })

  it('PLANNING_TABS has 7 tabs', () => {
    expect(PLANNING_TABS.length).toBe(7)
    const keys = PLANNING_TABS.map(t => t.key)
    expect(keys).toContain('unit-profit')
    expect(keys).toContain('variance')
    expect(keys).toContain('debt-pressure')
    expect(keys).toContain('tasks')
  })
})

// ── Route redirects map ───────────────────────────────────────────────────────

describe('ROUTE_REDIRECTS', () => {
  it('maps all canonical old flat routes', () => {
    expect(ROUTE_REDIRECTS['/dashboard/cashflow']).toBe('/dashboard/finance?tab=cashflow')
    expect(ROUTE_REDIRECTS['/dashboard/simulation']).toBe('/dashboard/planning?tab=unit-profit')
    expect(ROUTE_REDIRECTS['/dashboard/stocks']).toBe('/dashboard/operations?tab=stock')
    expect(ROUTE_REDIRECTS['/dashboard/orders']).toBe('/dashboard/operations?tab=orders')
    expect(ROUTE_REDIRECTS['/dashboard/activity']).toBe('/dashboard/admin/audit')
  })

  it('has 18 redirect entries (added /dashboard/ops)', () => {
    expect(Object.keys(ROUTE_REDIRECTS).length).toBe(18)
  })

  it('ops redirects to operations komuta tab', () => {
    expect(ROUTE_REDIRECTS['/dashboard/ops']).toBe('/dashboard/operations?tab=komuta')
  })

  it('all destinations start with /dashboard/', () => {
    const destinations = Object.values(ROUTE_REDIRECTS)
    destinations.forEach(dest => {
      expect(dest.startsWith('/dashboard/')).toBe(true)
    })
  })

  it('no redirect sources are known sidebar nav items', () => {
    // Redirect sources should be OLD flat routes, not current hub routes
    const sources = Object.keys(ROUTE_REDIRECTS)
    sources.forEach(src => {
      expect(isKnownNavHref(src)).toBe(false)
    })
  })
})

// ── Mobile nav ────────────────────────────────────────────────────────────────

describe('MOBILE_NAV', () => {
  it('has 5 items', () => {
    expect(MOBILE_NAV.length).toBe(5)
  })

  it('always starts with /dashboard (home)', () => {
    expect(MOBILE_NAV[0].href).toBe('/dashboard')
  })

  it('includes Operasyon (/dashboard/operations) — ops merged into hub', () => {
    const hrefs = MOBILE_NAV.map(i => i.href)
    expect(hrefs).toContain('/dashboard/operations')
    expect(hrefs).not.toContain('/dashboard/ops')
  })

  it('all items have emoji', () => {
    MOBILE_NAV.forEach(item => {
      expect(item.emoji.length).toBeGreaterThan(0)
    })
  })
})

// ── Settings fallback ─────────────────────────────────────────────────────────

describe('SETTINGS_FALLBACK', () => {
  it('points to /dashboard/settings', () => {
    expect(SETTINGS_FALLBACK.href).toBe('/dashboard/settings')
    expect(SETTINGS_FALLBACK.icon).toBe('settings')
  })
})

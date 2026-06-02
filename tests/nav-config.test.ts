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
  COMMERCIAL_TABS,
  OPERATIONS_TABS,
  PLANNING_TABS,
  SETTINGS_FALLBACK,
  NAV_GROUPS,
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
  // Groups: genel (1) + merkezler (8: finance, commercial, operations, partners, planning, insights + governance[admin-only] + documents) + yonetim (3 — admin only)
  it('admin sees 12 nav items (1 genel + 8 merkezler + 3 yonetim)', () => {
    expect(getAllItemsForRole('admin').length).toBe(12)
  })

  it('manager sees 8 nav items (1 genel + 7 merkezler visible)', () => {
    expect(getAllItemsForRole('manager').length).toBe(8)
  })

  it('viewer sees 8 nav items (1 genel + 7 merkezler visible)', () => {
    expect(getAllItemsForRole('viewer').length).toBe(8)
  })

  it('null role sees 8 nav items', () => {
    expect(getAllItemsForRole(null).length).toBe(8)
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
  it('COMMERCIAL_TABS has 4 tabs (proformas co-located into pipeline)', () => {
    expect(COMMERCIAL_TABS.length).toBe(4)
    const keys = COMMERCIAL_TABS.map(t => t.key)
    expect(keys).toContain('pipeline')
    expect(keys).toContain('collections')
    expect(keys).toContain('customers')
    expect(keys).not.toContain('proformas')
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

  it('PLANNING_TABS has 9 tabs (scenario-compare removed; breakeven co-located into unit-profit/Karlılık)', () => {
    expect(PLANNING_TABS.length).toBe(9)
    const keys = PLANNING_TABS.map(t => t.key)
    expect(keys).toContain('unit-profit')
    expect(keys).toContain('variance')
    expect(keys).toContain('debt-pressure')
    expect(keys).toContain('tasks')
    expect(keys).toContain('budget')
    expect(keys).not.toContain('scenario-compare')
    expect(keys).not.toContain('breakeven')
  })
})

// ── Route redirects map ───────────────────────────────────────────────────────

// ── Mobile nav ────────────────────────────────────────────────────────────────

// ── Settings fallback ─────────────────────────────────────────────────────────

describe('SETTINGS_FALLBACK', () => {
  it('points to /dashboard/settings', () => {
    expect(SETTINGS_FALLBACK.href).toBe('/dashboard/settings')
    expect(SETTINGS_FALLBACK.icon).toBe('settings')
  })
})


// ── hasMinRole — boundary edge cases ─────────────────────────────────────────

describe('hasMinRole — additional boundary cases', () => {
  it('viewer role level is 0', () => {
    // viewer satisfies viewer (same level)
    expect(hasMinRole('viewer', 'viewer')).toBe(true)
  })

  it('admin level is highest — cannot be exceeded', () => {
    // admin satisfies admin (same level, highest)
    expect(hasMinRole('admin', 'admin')).toBe(true)
  })

  it('null is equivalent to viewer in all checks', () => {
    // null and viewer should produce same results
    expect(hasMinRole(null, 'viewer')).toBe(hasMinRole('viewer', 'viewer'))
    expect(hasMinRole(null, 'manager')).toBe(hasMinRole('viewer', 'manager'))
    expect(hasMinRole(null, 'admin')).toBe(hasMinRole('viewer', 'admin'))
  })

  it('manager cannot satisfy admin', () => {
    expect(hasMinRole('manager', 'admin')).toBe(false)
  })

  it('admin satisfies all three levels', () => {
    const levels: Array<'viewer' | 'manager' | 'admin'> = ['viewer', 'manager', 'admin']
    levels.forEach(lvl => expect(hasMinRole('admin', lvl)).toBe(true))
  })
})

// ── getNavCount ───────────────────────────────────────────────────────────────

describe('getNavCount', () => {
  it('returns a positive number for all roles', () => {
    expect(getNavCount('admin')).toBeGreaterThan(0)
    expect(getNavCount('manager')).toBeGreaterThan(0)
    expect(getNavCount('viewer')).toBeGreaterThan(0)
    expect(getNavCount(null)).toBeGreaterThan(0)
  })

  it('admin count > viewer count (admin sees yonetim group)', () => {
    expect(getNavCount('admin')).toBeGreaterThan(getNavCount('viewer'))
  })

  it('manager count equals viewer count (same visibility)', () => {
    expect(getNavCount('manager')).toBe(getNavCount('viewer'))
  })

  it('null count equals viewer count', () => {
    expect(getNavCount(null)).toBe(getNavCount('viewer'))
  })
})

// ── getAllItemsForRole — item-level minRole filtering ─────────────────────────

describe('getAllItemsForRole — item-level minRole', () => {
  it('governance item (admin-only) not visible to viewer', () => {
    const viewerItems = getAllItemsForRole('viewer').map(i => i.href)
    expect(viewerItems).not.toContain('/dashboard/governance')
  })

  it('governance item (admin-only) visible to admin', () => {
    const adminItems = getAllItemsForRole('admin').map(i => i.href)
    expect(adminItems).toContain('/dashboard/governance')
  })

  it('governance item not visible to manager', () => {
    const managerItems = getAllItemsForRole('manager').map(i => i.href)
    expect(managerItems).not.toContain('/dashboard/governance')
  })

  it('all returned items have required fields (href, label, icon)', () => {
    getAllItemsForRole('admin').forEach(item => {
      expect(typeof item.href).toBe('string')
      expect(item.href.length).toBeGreaterThan(0)
      expect(typeof item.label).toBe('string')
      expect(item.label.length).toBeGreaterThan(0)
      expect(typeof item.icon).toBe('string')
      expect(item.icon.length).toBeGreaterThan(0)
    })
  })

  it('documents item visible to all roles', () => {
    ['admin', 'manager', 'viewer', null].forEach(role => {
      const items = getAllItemsForRole(role as any).map(i => i.href)
      expect(items).toContain('/dashboard/documents')
    })
  })

  it('insights item visible to all roles', () => {
    ['admin', 'manager', 'viewer', null].forEach(role => {
      const items = getAllItemsForRole(role as any).map(i => i.href)
      expect(items).toContain('/dashboard/insights')
    })
  })
})

// ── isNavItemActive — query string stripping ──────────────────────────────────

describe('isNavItemActive — query string edge cases', () => {
  const finance: NavItem = { href: '/dashboard/finance', label: 'Finans', icon: 'analytics' }

  it('strips query params before matching (tab=pnl)', () => {
    expect(isNavItemActive(finance, '/dashboard/finance?tab=pnl')).toBe(true)
  })

  it('strips query params for child path', () => {
    expect(isNavItemActive(finance, '/dashboard/finance/reports?view=quarterly')).toBe(true)
  })

  it('false for completely different route with query param', () => {
    expect(isNavItemActive(finance, '/dashboard/commercial?tab=pipeline')).toBe(false)
  })

  it('exact item: query-stripped path must match exactly', () => {
    const exact: NavItem = { href: '/dashboard', label: 'Komuta', icon: 'dashboard', exact: true }
    expect(isNavItemActive(exact, '/dashboard?ref=mobile')).toBe(true)
    expect(isNavItemActive(exact, '/dashboard/finance?tab=pnl')).toBe(false)
  })

  it('safe prefix: /dashboard/partners is not active on /dashboard/planning', () => {
    const partners: NavItem = { href: '/dashboard/partners', label: 'Ortaklar', icon: 'partners' }
    expect(isNavItemActive(partners, '/dashboard/planning')).toBe(false)
  })

  it('safe prefix: /dashboard/planning matches /dashboard/planning/sub', () => {
    const planning: NavItem = { href: '/dashboard/planning', label: 'Planlama', icon: 'simulation' }
    expect(isNavItemActive(planning, '/dashboard/planning/sub')).toBe(true)
  })
})

// ── findNavItem — coverage for all known items ────────────────────────────────

describe('findNavItem — known hrefs', () => {
  it('finds /dashboard/finance', () => {
    const item = findNavItem('/dashboard/finance')
    expect(item).toBeDefined()
    expect(item?.label).toBe('Finans Merkezi')
  })

  it('finds /dashboard/commercial', () => {
    expect(findNavItem('/dashboard/commercial')).toBeDefined()
  })

  it('finds /dashboard/operations', () => {
    expect(findNavItem('/dashboard/operations')).toBeDefined()
  })

  it('finds /dashboard/partners', () => {
    expect(findNavItem('/dashboard/partners')).toBeDefined()
  })

  it('finds /dashboard/planning', () => {
    expect(findNavItem('/dashboard/planning')).toBeDefined()
  })

  it('finds /dashboard/insights', () => {
    expect(findNavItem('/dashboard/insights')).toBeDefined()
  })

  it('finds /dashboard/admin (admin-only)', () => {
    const item = findNavItem('/dashboard/admin')
    expect(item).toBeDefined()
  })

  it('finds /dashboard/settings in yonetim group', () => {
    const item = findNavItem('/dashboard/settings')
    expect(item).toBeDefined()
  })

  it('returns undefined for /dashboard/cfo (old flat route)', () => {
    expect(findNavItem('/dashboard/cfo')).toBeUndefined()
  })

  it('returns undefined for /dashboard/simulation (old flat route)', () => {
    expect(findNavItem('/dashboard/simulation')).toBeUndefined()
  })
})

// ── isKnownNavHref — comprehensive ───────────────────────────────────────────

describe('isKnownNavHref — comprehensive', () => {
  it('true for all items visible to admin', () => {
    const adminItems = getAllItemsForRole('admin')
    adminItems.forEach(item => {
      expect(isKnownNavHref(item.href)).toBe(true)
    })
  })

  it('false for redirect sources that are not nav items', () => {
    const redirectSources = [
      '/dashboard/cashflow',
      '/dashboard/tax',
      '/dashboard/analytics',
      '/dashboard/sales-flow',
      '/dashboard/proformas',
      '/dashboard/sales',
      '/dashboard/collections',
      '/dashboard/customers',
      '/dashboard/expenses',
      '/dashboard/catalog',
      '/dashboard/products',
      '/dashboard/stocks',
      '/dashboard/orders',
      '/dashboard/simulation',
      '/dashboard/tasks',
      '/dashboard/activity',
      '/dashboard/ops',
    ]
    redirectSources.forEach(src => {
      expect(isKnownNavHref(src)).toBe(false)
    })
  })

  it('false for empty string', () => {
    expect(isKnownNavHref('')).toBe(false)
  })

  it('false for partial path prefix', () => {
    expect(isKnownNavHref('/dashboar')).toBe(false)
  })
})

// ── Tab keys uniqueness ───────────────────────────────────────────────────────

describe('Tab key uniqueness within each center', () => {
  it('COMMERCIAL_TABS keys are all unique', () => {
    const keys = COMMERCIAL_TABS.map(t => t.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('OPERATIONS_TABS keys are all unique', () => {
    const keys = OPERATIONS_TABS.map(t => t.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('PLANNING_TABS keys are all unique', () => {
    const keys = PLANNING_TABS.map(t => t.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('all tab keys are non-empty strings', () => {
    const allTabs = [...COMMERCIAL_TABS, ...OPERATIONS_TABS, ...PLANNING_TABS]
    allTabs.forEach(tab => {
      expect(typeof tab.key).toBe('string')
      expect(tab.key.length).toBeGreaterThan(0)
    })
  })

  it('all tab labels are non-empty strings', () => {
    const allTabs = [...COMMERCIAL_TABS, ...OPERATIONS_TABS, ...PLANNING_TABS]
    allTabs.forEach(tab => {
      expect(typeof tab.label).toBe('string')
      expect(tab.label.length).toBeGreaterThan(0)
    })
  })
})


// ── NAV_GROUPS structural integrity ──────────────────────────────────────────

describe('NAV_GROUPS structural integrity', () => {
  it('has exactly 3 groups', () => {
    expect(NAV_GROUPS.length).toBe(3)
  })

  it('first group id is genel', () => {
    expect(NAV_GROUPS[0].id).toBe('genel')
  })

  it('second group id is merkezler', () => {
    expect(NAV_GROUPS[1].id).toBe('merkezler')
  })

  it('third group id is yonetim', () => {
    expect(NAV_GROUPS[2].id).toBe('yonetim')
  })

  it('all groups have an id field', () => {
    NAV_GROUPS.forEach(g => {
      expect(typeof g.id).toBe('string')
      expect(g.id.length).toBeGreaterThan(0)
    })
  })

  it('all groups have non-empty items arrays', () => {
    NAV_GROUPS.forEach(g => {
      expect(Array.isArray(g.items)).toBe(true)
      expect(g.items.length).toBeGreaterThan(0)
    })
  })
})

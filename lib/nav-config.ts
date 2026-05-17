/**
 * nav-config.ts — Flowra navigation configuration
 *
 * Single source of truth for:
 *   • Sidebar navigation  — 8 center-based items + Ayarlar
 *   • Mobile bottom nav   — 5 strategic items
 *   • Route redirect map  — old routes → new center URLs
 *   • Tab contract        — canonical tab keys per center
 *
 * Pure functions only — no React, no DB, no side effects.
 * Fully importable in Vitest without DOM / Next.js setup.
 *
 * Architecture: 7 main centers, each accessed by a single sidebar item.
 * Inner tabs use ?tab= URL param via UnifiedTabNav.
 *
 *   Komuta Merkezi  /dashboard          (CEO cockpit)
 *   Finans Merkezi  /dashboard/finance  (finance hub — 9 tabs)
 *   Ticari Akış     /dashboard/commercial (5 tabs)
 *   OPS Komuta      /dashboard/ops      (daily command center)
 *   Operasyon       /dashboard/operations (4 tabs)
 *   Ortak Fin.      /dashboard/partners
 *   Planlama        /dashboard/planning   (6 tabs)
 *   Yönetim         /dashboard/admin      (admin only)
 *   Ayarlar         /dashboard/settings
 */

import type { MemberRole } from '@/types'

// ── Role hierarchy ────────────────────────────────────────────────────────────

export const ROLE_LEVEL: Record<MemberRole, number> = {
  viewer:  0,
  manager: 1,
  admin:   2,
}

/**
 * Returns true if `role` satisfies `required`.
 * null role → treated as viewer (most restrictive).
 */
export function hasMinRole(role: MemberRole | null, required: MemberRole): boolean {
  const level = role ? ROLE_LEVEL[role] : 0
  return level >= ROLE_LEVEL[required]
}

// ── Nav item & group types ────────────────────────────────────────────────────

export interface NavItem {
  href:    string
  label:   string
  /**
   * Must be a valid key in Icon.tsx REGISTRY.
   * Verified icons: dashboard, analytics, activity, products, partners,
   * simulation, shield, settings, users, backup, cashflow, tax, collections,
   * expenses, sales, proformas, customers, stocks, tasks, catalog.
   */
  icon:    string
  /** true = pathname must match exactly (prevents /dashboard matching /dashboard/x) */
  exact?:  boolean
  /** Minimum role required to see this item. undefined = all roles. */
  minRole?: MemberRole
  /** Optional numeric badge (e.g. alert count) */
  badge?: number
}

export interface NavGroup {
  id:      string
  /** Visual group header label. undefined = unlabeled group. */
  label?:  string
  items:   NavItem[]
  /** If set, entire group is hidden below this role. */
  minRole?: MemberRole
}

// ── Navigation groups — 3-group center architecture ───────────────────────────

export const NAV_GROUPS: NavGroup[] = [

  // ── KOMUTA MERKEZİ (unlabeled, top) ──────────────────────────────────────
  {
    id: 'genel',
    items: [
      {
        href:  '/dashboard',
        label: 'Komuta Merkezi',
        icon:  'dashboard',
        exact: true,
      },
    ],
  },

  // ── ANA MERKEZLER (unlabeled) ─────────────────────────────────────────────
  {
    id: 'merkezler',
    items: [
      { href: '/dashboard/finance',    label: 'Finans Merkezi',   icon: 'analytics'  },
      { href: '/dashboard/commercial', label: 'Ticari Akış',      icon: 'activity'   },
      { href: '/dashboard/ops',        label: 'OPS Komuta',       icon: 'tasks'      },
      { href: '/dashboard/operations', label: 'Operasyon',        icon: 'products'   },
      { href: '/dashboard/partners',   label: 'Ortak Finansmanı', icon: 'partners'   },
      { href: '/dashboard/planning',   label: 'Planlama',         icon: 'simulation' },
    ],
  },

  // ── YÖNETİM (admin only) ──────────────────────────────────────────────────
  {
    id:      'yonetim',
    label:   'Yönetim',
    minRole: 'admin',
    items: [
      { href: '/dashboard/admin',              label: 'Yönetim',  icon: 'shield'   },
      { href: '/dashboard/admin/workflows',    label: 'Onaylar',  icon: 'activity' },
      { href: '/dashboard/settings',           label: 'Ayarlar',  icon: 'settings' },
    ],
  },
]

// ── Settings fallback for non-admin users ─────────────────────────────────────

export const SETTINGS_FALLBACK: NavItem = {
  href:  '/dashboard/settings',
  label: 'Ayarlar',
  icon:  'settings',
}

// ── Role-based filtering ──────────────────────────────────────────────────────

/**
 * Returns the NavGroups visible to the given role.
 * Groups with minRole are excluded when role doesn't meet the requirement.
 * null role → viewer level (most restrictive).
 */
export function getGroupsForRole(role: MemberRole | null): NavGroup[] {
  return NAV_GROUPS.filter(group => {
    if (!group.minRole) return true
    return hasMinRole(role, group.minRole)
  })
}

/**
 * Returns a flat list of all NavItems visible to the given role.
 * Item-level minRole is also respected.
 */
export function getAllItemsForRole(role: MemberRole | null): NavItem[] {
  return getGroupsForRole(role).flatMap(group =>
    group.items.filter(item => !item.minRole || hasMinRole(role, item.minRole)),
  )
}

/**
 * Total number of nav items visible to a role (excluding settings fallback).
 */
export function getNavCount(role: MemberRole | null): number {
  return getAllItemsForRole(role).length
}

// ── isActive helper ───────────────────────────────────────────────────────────

/**
 * Determines whether a NavItem should appear active for a given pathname.
 *
 * Uses safe prefix matching: `/dashboard/commercial` is active on
 * `/dashboard/commercial` and `/dashboard/commercial/something`
 * but NOT on `/dashboard/commercial-extra` (hyphen check).
 */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href
  return pathname === item.href || pathname.startsWith(item.href + '/')
}

// ── Nav item lookup ───────────────────────────────────────────────────────────

/**
 * Returns the NavItem for a given href, searching all groups.
 * Returns undefined if not found.
 */
export function findNavItem(href: string): NavItem | undefined {
  for (const group of NAV_GROUPS) {
    const found = group.items.find(item => item.href === href)
    if (found) return found
  }
  return undefined
}

/**
 * Returns true if the given href belongs to any nav item in any group.
 */
export function isKnownNavHref(href: string): boolean {
  return findNavItem(href) !== undefined
}

// ── Tab contracts — canonical tab keys per center ─────────────────────────────

/** Finance center — /dashboard/finance?tab= */
export const FINANCE_TABS = [
  { key: 'overview',  label: 'Genel'      },
  { key: 'pnl',       label: 'Kâr/Zarar'  },
  { key: 'balance',   label: 'Bilanço'    },
  { key: 'cashflow',  label: 'Nakit'      },
  { key: 'tax',       label: 'Vergi'      },
  { key: 'risks',     label: 'Riskler'    },
  { key: 'forecast',  label: 'Tahmin'     },
  { key: 'quarterly', label: 'Çeyreklik'  },
  { key: 'cfo',       label: 'CFO'        },
] as const

/** Commercial center — /dashboard/commercial?tab= */
export const COMMERCIAL_TABS = [
  { key: 'pipeline',    label: 'Pipeline'    },
  { key: 'proformas',   label: 'Proformalar' },
  { key: 'sales',       label: 'Satışlar'    },
  { key: 'collections', label: 'Tahsilatlar' },
  { key: 'customers',   label: 'Müşteriler'  },
] as const

/** Operations center — /dashboard/operations?tab= */
export const OPERATIONS_TABS = [
  { key: 'expenses', label: 'Giderler'  },
  { key: 'catalog',  label: 'Katalog'   },
  { key: 'stock',    label: 'Stok'      },
  { key: 'orders',   label: 'Siparişler' },
] as const

/** Planning center — /dashboard/planning?tab= */
export const PLANNING_TABS = [
  { key: 'unit-profit',     label: 'Birim Kâr'          },
  { key: 'cash-projection', label: 'Nakit Projeksiyonu'  },
  { key: 'scenarios',       label: 'Senaryolar'          },
  { key: 'debt-pressure',   label: 'Borç Baskısı'       },
  { key: 'partner-impact',  label: 'Ortak Etkisi'       },
  { key: 'tasks',           label: 'Görevler'            },
] as const

// ── Redirect map — old routes → new center URLs ───────────────────────────────

export const ROUTE_REDIRECTS: Record<string, string> = {
  '/dashboard/cashflow':    '/dashboard/finance?tab=cashflow',
  '/dashboard/tax':         '/dashboard/finance?tab=tax',
  '/dashboard/analytics':   '/dashboard/finance?tab=risks',
  '/dashboard/cfo':         '/dashboard/finance?tab=cfo',
  '/dashboard/sales-flow':  '/dashboard/commercial?tab=pipeline',
  '/dashboard/proformas':   '/dashboard/commercial?tab=proformas',
  '/dashboard/sales':       '/dashboard/commercial?tab=sales',
  '/dashboard/collections': '/dashboard/commercial?tab=collections',
  '/dashboard/customers':   '/dashboard/commercial?tab=customers',
  '/dashboard/expenses':    '/dashboard/operations?tab=expenses',
  '/dashboard/catalog':     '/dashboard/operations?tab=catalog',
  '/dashboard/products':    '/dashboard/operations?tab=catalog',
  '/dashboard/stocks':      '/dashboard/operations?tab=stock',
  '/dashboard/orders':      '/dashboard/operations?tab=orders',
  '/dashboard/simulation':  '/dashboard/planning?tab=unit-profit',
  '/dashboard/tasks':       '/dashboard/planning?tab=tasks',
}

// ── Mobile bottom nav (5 items) ───────────────────────────────────────────────

export interface MobileNavItem {
  href:  string
  label: string
  emoji: string
}

export const MOBILE_NAV: MobileNavItem[] = [
  { href: '/dashboard',             label: 'Ana Sayfa', emoji: '🏠' },
  { href: '/dashboard/commercial',  label: 'Ticari',    emoji: '💰' },
  { href: '/dashboard/ops',         label: 'OPS',       emoji: '⚡' },
  { href: '/dashboard/finance',     label: 'Finans',    emoji: '📊' },
  { href: '/dashboard/planning',    label: 'Planlama',  emoji: '📈' },
]

export const MOBILE_NAV_HREFS: readonly string[] = MOBILE_NAV.map(i => i.href)

export function isMobileNavItem(href: string): boolean {
  return (MOBILE_NAV_HREFS as string[]).includes(href)
}

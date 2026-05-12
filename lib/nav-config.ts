/**
 * nav-config.ts — Flowra navigation configuration (FAZ 21 rev-2)
 *
 * Single source of truth for:
 *   • Sidebar navigation  — group-based, role-filtered, every real route included
 *   • Mobile bottom nav   — 5 most-used items
 *   • Role-level hierarchy
 *
 * Pure functions only — no React, no DB, no side effects.
 * Fully importable in Vitest without DOM / Next.js setup.
 *
 * Design principles:
 *   1. Every page.tsx that exists is reachable via the sidebar.
 *   2. Groups provide visual hierarchy; role filtering hides unauthorized groups.
 *   3. isActive uses exact-prefix matching (no /sales matching /sales-flow).
 *   4. Icons are validated against Icon.tsx registry before use.
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
   * Verified icons: dashboard, analytics, cashflow, tax, collections, expenses,
   * simulation, partners, activity, sales, proformas, customers, products,
   * stocks, tasks, users, shield, backup, settings.
   */
  icon:    string
  /** true = pathname must match exactly (prevents /dashboard matching /dashboard/x) */
  exact?:  boolean
  /** Minimum role required to see this item. undefined = all roles. */
  minRole?: MemberRole
}

export interface NavGroup {
  id:      string
  /** Visual group header label. undefined = unlabeled (top group). */
  label?:  string
  items:   NavItem[]
  /** If set, entire group is hidden below this role. */
  minRole?: MemberRole
}

// ── All navigation groups ─────────────────────────────────────────────────────
//
// Every real route under /app/dashboard is reachable from here.
// Routes verified to have page.tsx as of FAZ T2:
//   dashboard, finance (hub: analytics/cashflow/tax/ceo merged), collections,
//   expenses, simulation, partners, sales-flow, sales, proformas, customers,
//   catalog, stocks, products, tasks, admin/users, admin/audit, backups, settings
//   NOTE: analytics/cashflow/tax/ceo now redirect → /dashboard/finance?tab=*

export const NAV_GROUPS: NavGroup[] = [

  // ── GENEL ─────────────────────────────────────────────────────────────────
  // Unlabeled top group — single entry point for the CEO cockpit
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

  // ── FİNANS ────────────────────────────────────────────────────────────────
  {
    id:    'finans',
    label: 'Finans',
    items: [
      // Financial Intelligence Hub (FAZ T2) — 8-tab unified workspace
      // replaces /analytics + /cashflow + /tax + /ceo
      { href: '/dashboard/finance',     label: 'Finansal Analiz', icon: 'analytics'   },
      { href: '/dashboard/collections', label: 'Tahsilatlar',     icon: 'collections' },
      { href: '/dashboard/expenses',    label: 'Giderler',        icon: 'expenses'    },
      { href: '/dashboard/simulation',  label: 'Simülasyon',      icon: 'simulation'  },
      { href: '/dashboard/partners',    label: 'Ortaklar',        icon: 'partners'    },
    ],
  },

  // ── SATIŞ ─────────────────────────────────────────────────────────────────
  {
    id:    'satis',
    label: 'Satış',
    items: [
      // Satış Akışı (FAZ 18) — Kanban pipeline: tekliften tahsilata
      { href: '/dashboard/sales-flow', label: 'Satış Akışı',  icon: 'activity'  },
      // Satışlar — tamamlanmış/devam eden satış listesi ve kayıt formu
      // exact: true prevents /dashboard/sales matching /dashboard/sales-flow
      { href: '/dashboard/sales',      label: 'Satışlar',     icon: 'sales',    exact: true },
      { href: '/dashboard/proformas',  label: 'Proformalar',  icon: 'proformas' },
      { href: '/dashboard/customers',  label: 'Müşteriler',   icon: 'customers' },
    ],
  },

  // ── OPERASYON ─────────────────────────────────────────────────────────────
  {
    id:    'operasyon',
    label: 'Operasyon',
    items: [
      // Katalog (FAZ 20) — ürün fiyat + maliyet merkezi
      { href: '/dashboard/catalog',   label: 'Katalog',   icon: 'products' },
      { href: '/dashboard/stocks',    label: 'Stok',      icon: 'stocks'   },
      { href: '/dashboard/products',  label: 'Ürünler',   icon: 'products' },
      { href: '/dashboard/tasks',     label: 'Görevler',  icon: 'tasks'    },
    ],
  },

  // ── YÖNETİM (admin only) ──────────────────────────────────────────────────
  {
    id:      'yonetim',
    label:   'Yönetim',
    minRole: 'admin',
    items: [
      { href: '/dashboard/admin/users', label: 'Ekip',      icon: 'users'   },
      { href: '/dashboard/admin/audit', label: 'Denetim',   icon: 'shield'  },
      { href: '/dashboard/backups',     label: 'Yedekleme', icon: 'backup'  },
      { href: '/dashboard/settings',    label: 'Ayarlar',   icon: 'settings' },
    ],
  },
]

// ── Settings fallback for non-admin users ─────────────────────────────────────
// Non-admin users don't see the Yönetim group but still need personal settings.

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
 * Item-level minRole is also respected (for future per-item restrictions).
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
 * Uses safe prefix matching: `/dashboard/sales` is active on `/dashboard/sales`
 * and `/dashboard/sales/123` but NOT on `/dashboard/sales-flow` (hyphen check).
 *
 * @param item     The nav item to test.
 * @param pathname The current Next.js pathname.
 */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href
  // Match exact path OR any child path (href + '/')
  // This prevents /sales from matching /sales-flow
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

// ── Mobile bottom nav (5 items) ───────────────────────────────────────────────
//
// Strategic subset shown in the bottom tab bar on small screens.
// Ordered by most-frequent CEO/CFO daily action:
//   1. Dashboard overview
//   2. Sales pipeline (most common data entry)
//   3. Collections (most common follow-up)
//   4. Expenses (daily approval flow)
//   5. Financial summary (CFO check)

export interface MobileNavItem {
  href:  string
  label: string
  emoji: string
}

export const MOBILE_NAV: MobileNavItem[] = [
  { href: '/dashboard',             label: 'Genel',    emoji: '🏠' },
  { href: '/dashboard/sales-flow',  label: 'Satış',    emoji: '💰' },
  { href: '/dashboard/collections', label: 'Tahsilat', emoji: '📥' },
  { href: '/dashboard/expenses',    label: 'Gider',    emoji: '📤' },
  { href: '/dashboard/finance',     label: 'Finans',   emoji: '📊' },
]

/** Hrefs of the 5 mobile nav items (for quick membership check). */
export const MOBILE_NAV_HREFS: readonly string[] = MOBILE_NAV.map(i => i.href)

/** Returns true if the given href is in the mobile bottom nav. */
export function isMobileNavItem(href: string): boolean {
  return (MOBILE_NAV_HREFS as string[]).includes(href)
}

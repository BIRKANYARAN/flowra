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
  /** Nested sub-items rendered indented below this item. */
  children?: NavItem[]
}

export interface NavGroup {
  id:      string
  /** Visual group header label. undefined = unlabeled group. */
  label?:  string
  items:   NavItem[]
  /** If set, entire group is hidden below this role. */
  minRole?: MemberRole
}

// ── Navigation groups — Flowra v3 "Sade Komuta" (task-first IA) ────────────────
//
// Replaces the old 8-center sprawl with role/task-oriented areas. Sales work is
// split into its own clear entries (Satış · Teklifler · Tahsilat · Müşteriler) so
// a field-sales user lands exactly where they need; the deep analytics + planning
// + governance move under a collapsed "Gelişmiş" group so the day-to-day surface
// stays simple. Commercial sub-areas use ?tab= URLs (isNavItemActive is tab-aware).

export const NAV_GROUPS: NavGroup[] = [

  // ── KOKPİT (unlabeled, top) ──────────────────────────────────────────────
  {
    id: 'genel',
    items: [
      { href: '/dashboard', label: 'Kokpit', icon: 'dashboard', exact: true },
    ],
  },

  // ── ÇALIŞMA ALANLARI ──────────────────────────────────────────────────────
  // ONE entry per hub. A hub's sub-sections live ONLY in that hub's single tab
  // row (no sub-sections duplicated into the sidebar) so the model is always:
  //   left = which area · top = which view of that area.
  {
    id: 'calisma',
    label: 'Çalışma Alanları',
    items: [
      { href: '/dashboard/commercial', label: 'Satış',     icon: 'sales'     },
      { href: '/dashboard/operations', label: 'Operasyon', icon: 'products'  },
      { href: '/dashboard/finance',    label: 'Finans',    icon: 'analytics' },
      { href: '/dashboard/partners',   label: 'Ortaklar',  icon: 'partners'  },
    ],
  },

  // ── ANALİZ & PLAN ─────────────────────────────────────────────────────────
  {
    id: 'gelismis',
    label: 'Analiz & Plan',
    items: [
      { href: '/dashboard/planning',   label: 'Planlama',  icon: 'simulation' },
      { href: '/dashboard/insights',   label: 'AI Analiz', icon: 'analytics'  },
      { href: '/dashboard/documents',  label: 'Belgeler',  icon: 'backup'     },
      { href: '/dashboard/governance', label: 'Yönetişim', icon: 'shield', minRole: 'admin' as const },
    ],
  },

  // ── YÖNETİM (admin only) ──────────────────────────────────────────────────
  {
    id:      'yonetim',
    label:   'Yönetim',
    minRole: 'admin',
    items: [
      { href: '/dashboard/admin',           label: 'Yönetim',     icon: 'shield', exact: true },
      { href: '/dashboard/admin/workflows', label: 'İş Akışları', icon: 'workflow' },
      { href: '/dashboard/settings',        label: 'Ayarlar',     icon: 'settings' },
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
 * Strips query params from pathname before comparing so that
 * `/dashboard/finance?tab=pnl` correctly matches the nav item with
 * href `/dashboard/finance`.
 *
 * Uses safe prefix matching: `/dashboard/commercial` is active on
 * `/dashboard/commercial` and `/dashboard/commercial/something`
 * but NOT on `/dashboard/commercial-extra` (hyphen check).
 */
export function isNavItemActive(item: NavItem, pathname: string, search?: string): boolean {
  // Strip query string from pathname (client usePathname() never includes it).
  const cleanPath = pathname.split('?')[0]
  const [itemPath, itemQuery] = item.href.split('?')

  if (item.exact) return cleanPath === itemPath

  const pathMatches = cleanPath === itemPath || cleanPath.startsWith(itemPath + '/')
  if (!pathMatches) return false

  // Tab-aware: when several nav items share a path but differ by ?tab= (e.g. the
  // Satış / Teklifler / Tahsilat / Müşteriler entries on /dashboard/commercial),
  // only the one whose tab matches the current URL is active.
  if (itemQuery && search !== undefined) {
    const itemTab = new URLSearchParams(itemQuery).get('tab')
    if (itemTab) {
      const curTab = new URLSearchParams(search.replace(/^\?/, '')).get('tab')
      return curTab === itemTab
    }
  }
  return true
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

// FINANCE_TABS removed — the finance hub owns its own FINANCE_NAV_TABS list;
// this stale export had 0 consumers and drifted from the rendered tabs.

/** Commercial center — /dashboard/commercial?tab= */
export const COMMERCIAL_TABS = [
  { key: 'pipeline',    label: 'Pipeline'    },
  { key: 'sales',       label: 'Satışlar'    },
  { key: 'collections', label: 'Tahsilatlar' },
  { key: 'customers',   label: 'Müşteriler'  },
] as const

/** Operations center — /dashboard/operations?tab= */
export const OPERATIONS_TABS = [
  { key: 'komuta',   label: 'Komuta'    },
  { key: 'expenses', label: 'Giderler'  },
  { key: 'catalog',  label: 'Katalog'   },
  { key: 'stock',    label: 'Stok'      },
  { key: 'orders',   label: 'Siparişler' },
] as const

/** Planning center — /dashboard/planning?tab= */
export const PLANNING_TABS = [
  { key: 'unit-profit',     label: 'Karlılık'           },
  { key: 'cash-projection', label: 'Nakit Projeksiyonu'  },
  { key: 'scenarios',       label: 'Senaryolar'          },
  { key: 'variance',        label: 'Gerçek vs Plan'      },
  { key: 'debt-pressure',   label: 'Borç Baskısı'       },
  { key: 'partner-impact',  label: 'Ortak Etkisi'       },
  { key: 'tasks',           label: 'Görevler'            },
  { key: 'budget',              label: 'Bütçe'                   },
  { key: 'calendar',            label: 'Takvim'                  },
] as const

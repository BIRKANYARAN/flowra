/**
 * nav-config.ts — Flowra navigation configuration (FAZ 21)
 *
 * Single source of truth for:
 *   • Sidebar navigation  — 9 primary items, role-filtered
 *   • Mobile bottom nav   — 5 strategic items
 *   • Role-level hierarchy
 *
 * Pure functions only — no React, no DB, no side effects.
 * Fully importable in Vitest without DOM / Next.js setup.
 */

import type { MemberRole } from '@/types'

// ── Role hierarchy ────────────────────────────────────────────────────────────

/**
 * Numeric level for each role.
 * Higher number = more access.
 */
export const ROLE_LEVEL: Record<MemberRole, number> = {
  viewer:  0,
  manager: 1,
  admin:   2,
}

/**
 * Returns true if `role` satisfies `required`.
 * null role is treated as viewer (most restrictive).
 */
export function hasMinRole(role: MemberRole | null, required: MemberRole): boolean {
  const level = role ? ROLE_LEVEL[role] : 0
  return level >= ROLE_LEVEL[required]
}

// ── Nav item type ─────────────────────────────────────────────────────────────

export interface NavItem {
  href:     string
  label:    string
  icon:     string
  exact?:   boolean
  /**
   * Minimum role required to see this item.
   * Undefined = visible to every role (including null/unauthenticated).
   */
  minRole?: MemberRole
}

// ── 9 primary sidebar items ───────────────────────────────────────────────────
//
// Each item maps to a hub page.  Sub-pages live in URL ?tab= inner tabs.
//
//  1  Komuta Merkezi   → /dashboard           (all roles)
//  2  Finansal Analiz  → /dashboard/analytics (all roles, inner tabs: ceo/bilanço/cashflow/vergi)
//  3  Ortaklar         → /dashboard/partners  (all roles, inner tabs: ozet/sermaye/borclanma/dagitim)
//  4  Satış & Tahsilat → /dashboard/sales-flow (all roles, covers pipeline + satışlar + proformalar + müşteriler + tahsilatlar)
//  5  Stok & Maliyet   → /dashboard/catalog   (all roles, inner tabs: katalog/stok/ürünler)
//  6  Giderler         → /dashboard/expenses  (all roles)
//  7  Simülasyon       → /dashboard/simulation (manager+)
//  8  Raporlar         → /dashboard/reports   (manager+, FAZ 28 placeholder)
//  9  Yönetim          → /dashboard/settings  (admin only)

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard',            label: 'Komuta Merkezi',   icon: 'dashboard',  exact: true              },
  { href: '/dashboard/analytics',  label: 'Finansal Analiz',  icon: 'analytics'                            },
  { href: '/dashboard/partners',   label: 'Ortaklar',         icon: 'partners'                             },
  { href: '/dashboard/sales-flow', label: 'Satış & Tahsilat', icon: 'sales'                                },
  { href: '/dashboard/catalog',    label: 'Stok & Maliyet',   icon: 'stocks'                               },
  { href: '/dashboard/expenses',   label: 'Giderler',         icon: 'expenses'                             },
  { href: '/dashboard/simulation', label: 'Simülasyon',       icon: 'simulation', minRole: 'manager'       },
  { href: '/dashboard/reports',    label: 'Raporlar',         icon: 'reports',    minRole: 'manager'       },
  { href: '/dashboard/settings',   label: 'Yönetim',          icon: 'settings',   minRole: 'admin'         },
]

// ── Fallback item for non-admin users ─────────────────────────────────────────
//
// Non-admin users don't see "Yönetim" (admin group) but still need access
// to personal settings. This item is appended at the bottom for them.

export const SETTINGS_FALLBACK: NavItem = {
  href:  '/dashboard/settings',
  label: 'Ayarlar',
  icon:  'settings',
}

// ── Role-based filtering ──────────────────────────────────────────────────────

/**
 * Returns the subset of NAV_ITEMS the given role can see.
 * null role → viewer level (most restrictive).
 */
export function getNavForRole(role: MemberRole | null): NavItem[] {
  return NAV_ITEMS.filter(item => {
    if (!item.minRole) return true
    return hasMinRole(role, item.minRole)
  })
}

/**
 * Returns the full nav list for a role, including the settings fallback for
 * non-admin users who don't see the Yönetim item.
 */
export function getFullNavForRole(role: MemberRole | null): NavItem[] {
  const items = getNavForRole(role)
  if (!hasMinRole(role, 'admin')) {
    return [...items, SETTINGS_FALLBACK]
  }
  return items
}

// ── Item counts per role ──────────────────────────────────────────────────────

/**
 * Number of nav items visible to a given role (excluding settings fallback).
 */
export function getNavCount(role: MemberRole | null): number {
  return getNavForRole(role).length
}

// ── Nav item lookup ───────────────────────────────────────────────────────────

/** Returns the NavItem for a given href, or undefined. */
export function findNavItem(href: string): NavItem | undefined {
  return NAV_ITEMS.find(item => item.href === href)
}

/** Returns true if the given href is one of the 9 primary nav items. */
export function isPrimaryNavItem(href: string): boolean {
  return NAV_ITEMS.some(item => item.href === href)
}

// ── Mobile bottom nav (5 items) ───────────────────────────────────────────────
//
// Strategic subset shown in the bottom tab bar on small screens.
// Ordered by most frequent CEO/CFO daily action.

export interface MobileNavItem {
  href:  string
  label: string
  emoji: string
}

export const MOBILE_NAV: MobileNavItem[] = [
  { href: '/dashboard',            label: 'Genel',  emoji: '🏠' },
  { href: '/dashboard/sales-flow', label: 'Satış',  emoji: '💰' },
  { href: '/dashboard/expenses',   label: 'Gider',  emoji: '📤' },
  { href: '/dashboard/analytics',  label: 'Finans', emoji: '📊' },
  { href: '/dashboard/catalog',    label: 'Stok',   emoji: '📦' },
]

/** Hrefs of the 5 mobile nav items (for quick membership check). */
export const MOBILE_NAV_HREFS: readonly string[] = MOBILE_NAV.map(i => i.href)

/** Returns true if the given href appears in the mobile bottom nav. */
export function isMobileNavItem(href: string): boolean {
  return (MOBILE_NAV_HREFS as string[]).includes(href)
}

'use client'
// HeaderLeft — reads pathname and returns the matching hub title.
//
// SINGLE SOURCE OF TRUTH: the title is derived from NAV_GROUPS (the same labels
// the sidebar renders), so the top bar can never drift from the sidebar again.
// (It used to keep its own PATH_TITLES list with different names — "Finans
// Merkezi" vs sidebar "Finans" — which read as three names for one place.)
// The page's own H1 still names the specific view (e.g. "Kâr / Zarar").

import { usePathname } from 'next/navigation'
import { NAV_GROUPS, SETTINGS_FALLBACK } from '@/lib/nav-config'

// Flatten every nav item (incl. children + settings fallback) once.
const NAV_ITEMS = [
  ...NAV_GROUPS.flatMap(g => g.items.flatMap(i => [i, ...(i.children ?? [])])),
  SETTINGS_FALLBACK,
]

function titleForPath(pathname: string): string | null {
  // Longest matching href wins (so /dashboard/admin/workflows beats /dashboard
  // /admin, and the exact "/dashboard" home only matches itself).
  let best: { label: string; len: number } | null = null
  for (const item of NAV_ITEMS) {
    // Home only matches itself; every other hub matches its whole subtree
    // (so /dashboard/admin/users resolves to "Yönetim", /admin/workflows to
    // the longer "İş Akışları"). The exact flag is for sidebar highlighting,
    // not titling.
    const isMatch = item.href === '/dashboard'
      ? pathname === '/dashboard'
      : pathname === item.href || pathname.startsWith(item.href + '/')
    if (isMatch && (!best || item.href.length > best.len)) {
      best = { label: item.label, len: item.href.length }
    }
  }
  return best?.label ?? null
}

export function HeaderLeft({ companyName }: { companyName: string | null }) {
  const pathname = usePathname()
  const title = titleForPath(pathname)

  return (
    <div className="hidden md:flex items-center gap-2 min-w-0">
      {title ? (
        <span className="text-sm font-bold text-[#0f172a] tracking-tight truncate">{title}</span>
      ) : companyName ? (
        <span className="text-[10px] font-semibold text-[#94a3b8] tracking-wide truncate">{companyName}</span>
      ) : null}
    </div>
  )
}

'use client'
// HeaderLeft — pathname + ?tab aware breadcrumb for the top bar.
//
// SINGLE SOURCE OF TRUTH: both the hub name and the active-view label come from
// NAV_GROUPS / HUB_TABS (the same data the sidebar + tab bars render), so the
// top bar can never drift from them. Renders "Hub › View" when the active tab
// is known, else just the hub name. (It used to keep its own PATH_TITLES list
// with different names — "Finans Merkezi" vs sidebar "Finans".)

import { usePathname, useSearchParams } from 'next/navigation'
import { NAV_GROUPS, SETTINGS_FALLBACK, hubTabLabel } from '@/lib/nav-config'

// Flatten every nav item (incl. children + settings fallback) once.
const NAV_ITEMS = [
  ...NAV_GROUPS.flatMap(g => g.items.flatMap(i => [i, ...(i.children ?? [])])),
  SETTINGS_FALLBACK,
]

function hubForPath(pathname: string): { label: string; href: string } | null {
  // Home only matches itself; every other hub matches its whole subtree. An item's
  // own href AND its `match` prefixes both count (so the Muhasebe item, href
  // /dashboard/accounting + match ['/dashboard/cfo'], also owns the GL tool pages).
  // The longest matching prefix wins (so /admin/workflows beats /admin).
  let best: { label: string; href: string; len: number } | null = null
  for (const item of NAV_ITEMS) {
    const prefixes = item.href === '/dashboard' ? ['/dashboard'] : [item.href, ...(item.match ?? [])]
    for (const p of prefixes) {
      const isMatch = p === '/dashboard' ? pathname === '/dashboard' : (pathname === p || pathname.startsWith(p + '/'))
      if (isMatch && (!best || p.length > best.len)) {
        best = { label: item.label, href: item.href, len: p.length }
      }
    }
  }
  return best ? { label: best.label, href: best.href } : null
}

export function HeaderLeft({ companyName }: { companyName: string | null }) {
  const pathname = usePathname()
  const search   = useSearchParams()
  const hub      = hubForPath(pathname)
  const view     = hub ? hubTabLabel(hub.href, search.get('tab')) : null

  if (!hub) {
    return (
      <div className="hidden md:flex items-center gap-2 min-w-0">
        {companyName && (
          <span className="text-[10px] font-semibold text-[#94a3b8] tracking-wide truncate">{companyName}</span>
        )}
      </div>
    )
  }

  return (
    <div className="hidden md:flex items-center gap-1.5 min-w-0">
      <span className={`text-sm tracking-tight truncate ${view ? 'font-semibold text-[#64748b]' : 'font-bold text-[#0f172a]'}`}>
        {hub.label}
      </span>
      {view && (
        <>
          <span aria-hidden className="text-[#cbd5e1] text-xs">›</span>
          <span className="text-sm font-bold text-[#0f172a] tracking-tight truncate">{view}</span>
        </>
      )}
    </div>
  )
}

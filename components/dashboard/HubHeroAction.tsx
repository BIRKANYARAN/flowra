// ── HubHeroAction — prominent per-tab primary action ─────────────────────────
//
// Renders the active tab's primary create/work action as a prominent button in
// the hub hero (top-right), so the action that matters for the current view is
// visible at the top instead of buried in the work-surface card below the fold.
// Server-compatible (plain Link). Pass null/undefined for read-only tabs.

import Link from 'next/link'

export interface HeroAction {
  label: string
  href:  string
}

export function HubHeroAction({ action }: { action?: HeroAction | null }) {
  if (!action) return null
  return (
    <Link
      href={action.href}
      prefetch={false}
      className="inline-flex items-center gap-1.5 shrink-0 self-start px-4 py-2 rounded-lg bg-brand text-white text-xs font-bold hover:bg-brand-light transition-colors shadow-sm whitespace-nowrap"
    >
      {action.label}
    </Link>
  )
}

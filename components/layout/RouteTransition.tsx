'use client'

/**
 * RouteTransition — gives the routed content a subtle, professional entrance
 * on every navigation (path OR ?tab= change), without animating the persistent
 * sidebar/header (those live outside this wrapper in the layout).
 *
 * Keyed by the full URL so React remounts the inner node on each navigation,
 * replaying the `.flowra-tab-panel` rise-in (opacity + 7px). Honors
 * prefers-reduced-motion via the CSS rule on that class.
 */

import { usePathname, useSearchParams } from 'next/navigation'

export function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const search   = useSearchParams().toString()
  return (
    <div key={`${pathname}?${search}`} className="flowra-tab-panel">
      {children}
    </div>
  )
}

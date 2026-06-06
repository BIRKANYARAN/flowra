'use client'
// ── MobileBottomNav — fixed bottom navigation for mobile (< md) ──────────────
//
// Shows 4 primary hubs + a "Daha" drawer for secondary items.
// Hidden on md+ where the sidebar takes over.

import { useState }       from 'react'
import Link               from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useWorkspace }   from '@/lib/workspace-context'
import { isNavItemActive, hasMinRole } from '@/lib/nav-config'

interface Tab {
  href:      string
  label:     string
  emoji:     string
  exact?:    boolean
  minRole?:  'admin' | 'manager'
  badge?:    number
}

const PRIMARY: Tab[] = [
  { href: '/dashboard',                          label: 'Kokpit',   emoji: '⌂',  exact: true },
  { href: '/dashboard/commercial?tab=sales',     label: 'Satış',    emoji: '₺'               },
  { href: '/dashboard/commercial?tab=collections', label: 'Tahsilat', emoji: '📥'            },
  { href: '/dashboard/finance',                  label: 'Finans',   emoji: '📊'               },
]

const SECONDARY: Tab[] = [
  { href: '/dashboard/commercial?tab=pipeline',  label: 'Teklifler',   emoji: '📝'              },
  { href: '/dashboard/commercial?tab=customers', label: 'Müşteriler',  emoji: '👥'              },
  { href: '/dashboard/operations',               label: 'Gider & Stok',emoji: '⚙'               },
  { href: '/dashboard/partners',                 label: 'Ortaklar',    emoji: '🤝', minRole: 'admin' },
  { href: '/dashboard/planning',                 label: 'Planlama',    emoji: '📈'              },
  { href: '/dashboard/insights',                 label: 'AI Analiz',   emoji: '🔍'              },
  { href: '/dashboard/admin',                    label: 'Yönetim',     emoji: '🔐', minRole: 'admin' },
  { href: '/dashboard/settings',                 label: 'Ayarlar',     emoji: '⚙'               },
]

interface Props {
  navBadges?: Record<string, number>
}

export function MobileBottomNav({ navBadges = {} }: Props) {
  const pathname    = usePathname()
  const search      = useSearchParams().toString()
  const [open, setOpen] = useState(false)
  const ws = useWorkspace()
  const role = ws.userRole ?? null

  const visible = SECONDARY.filter(t => !t.minRole || hasMinRole(role, t.minRole))

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Secondary drawer — slides up from bottom */}
      <div className={`fixed bottom-14 left-0 right-0 z-50 md:hidden transition-transform duration-200 ease-out ${
        open ? 'translate-y-0' : 'translate-y-full'
      }`}>
        <div className="mx-2 mb-1 bg-white rounded border border-[#e2e8f0] shadow-sm overflow-hidden">
          <div className="grid grid-cols-4 p-2 gap-1">
            {visible.map(tab => {
              const active = isNavItemActive({ href: tab.href, label: tab.label, icon: '' }, pathname, search)
              const badge  = navBadges[tab.href] ?? 0
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  aria-label={badge > 0 ? `${tab.label} (${badge} bildirim)` : tab.label}
                  className={`flex flex-col items-center gap-1 py-2 px-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-inset ${
                    active ? 'bg-brand-subtle text-brand' : 'text-[#64748b] hover:bg-[#f8fafc]'
                  }`}
                >
                  <span className="text-lg leading-none relative">
                    {tab.emoji}
                    {badge > 0 && (
                      <span className="absolute -top-1 -right-1 bg-neg-light text-white text-[8px] font-black rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">
                        {badge > 9 ? '9+' : badge}
                      </span>
                    )}
                  </span>
                  <span className={`text-[9px] font-semibold leading-none ${active ? 'text-brand' : 'text-[#64748b]'}`}>
                    {tab.label}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      {/* Primary bottom bar */}
      <nav aria-label="Ana navigasyon" className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white border-t border-[#e2e8f0] safe-area-pb">
        <div className="flex items-stretch">
          {PRIMARY.map(tab => {
            const active = isNavItemActive(
              { href: tab.href, label: tab.label, icon: '', exact: tab.exact },
              pathname,
              search,
            )
            const badge = navBadges[tab.href] ?? 0
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                aria-label={badge > 0 ? `${tab.label} (${badge} bildirim)` : tab.label}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 px-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-inset ${
                  active ? 'text-brand' : 'text-[#64748b] hover:text-[#334155]'
                }`}
              >
                <span className="text-lg leading-none relative">
                  {tab.emoji}
                  {badge > 0 && (
                    <span className="absolute -top-1 -right-1 bg-neg-light text-white text-[8px] font-black rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </span>
                <span className={`text-[9px] font-bold leading-none ${active ? 'text-brand' : 'text-[#94a3b8]'}`}>
                  {tab.label}
                </span>
                {active && <div className="w-4 h-0.5 rounded-full bg-brand-light mt-0.5" />}
              </Link>
            )
          })}
          {/* Daha */}
          <button
            onClick={() => setOpen(v => !v)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 px-1 transition-colors ${
              open ? 'text-brand' : 'text-[#64748b]'
            }`}
          >
            <span className="text-lg leading-none">☰</span>
            <span className={`text-[9px] font-bold leading-none ${open ? 'text-brand' : 'text-[#94a3b8]'}`}>Daha</span>
          </button>
        </div>
      </nav>
    </>
  )
}

'use client'
// ── MobileBottomNav — fixed bottom navigation for mobile (< md) ──────────────
//
// Shows 4 primary hubs + a "Daha" drawer for secondary items.
// Hidden on md+ where the sidebar takes over.

import { useState }       from 'react'
import Link               from 'next/link'
import { usePathname }    from 'next/navigation'
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
  { href: '/dashboard',           label: 'Komuta',   emoji: '⌂',  exact: true },
  { href: '/dashboard/finance',   label: 'Finans',   emoji: '₺'               },
  { href: '/dashboard/commercial',label: 'Ticari',   emoji: '📋'               },
  { href: '/dashboard/operations',label: 'Operasyon',emoji: '⚙'               },
]

const SECONDARY: Tab[] = [
  { href: '/dashboard/partners',  label: 'Ortaklar', emoji: '🤝', minRole: 'admin' },
  { href: '/dashboard/planning',  label: 'Planlama', emoji: '📊'                  },
  { href: '/dashboard/admin',     label: 'Yönetim',  emoji: '🔐', minRole: 'admin' },
  { href: '/dashboard/settings',  label: 'Ayarlar',  emoji: '⚙'                   },
  { href: '/dashboard/reports',   label: 'Raporlar', emoji: '📄'                  },
]

interface Props {
  navBadges?: Record<string, number>
}

export function MobileBottomNav({ navBadges = {} }: Props) {
  const pathname    = usePathname()
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
        <div className="mx-2 mb-1 bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden">
          <div className="grid grid-cols-4 p-2 gap-1">
            {visible.map(tab => {
              const active = isNavItemActive({ href: tab.href, label: tab.label, icon: '' }, pathname)
              const badge  = navBadges[tab.href] ?? 0
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  onClick={() => setOpen(false)}
                  className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl transition-colors ${
                    active ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-lg leading-none relative">
                    {tab.emoji}
                    {badge > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">
                        {badge > 9 ? '9+' : badge}
                      </span>
                    )}
                  </span>
                  <span className={`text-[9px] font-semibold leading-none ${active ? 'text-primary-700' : 'text-gray-500'}`}>
                    {tab.label}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      {/* Primary bottom bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white border-t border-gray-100 safe-area-pb">
        <div className="flex items-stretch">
          {PRIMARY.map(tab => {
            const active = isNavItemActive(
              { href: tab.href, label: tab.label, icon: '', exact: tab.exact },
              pathname
            )
            const badge = navBadges[tab.href] ?? 0
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 px-1 transition-colors ${
                  active ? 'text-primary-700' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <span className="text-lg leading-none relative">
                  {tab.emoji}
                  {badge > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </span>
                <span className={`text-[9px] font-bold leading-none ${active ? 'text-primary-700' : 'text-gray-400'}`}>
                  {tab.label}
                </span>
                {active && <div className="w-4 h-0.5 rounded-full bg-primary-600 mt-0.5" />}
              </Link>
            )
          })}
          {/* Daha */}
          <button
            onClick={() => setOpen(v => !v)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 px-1 transition-colors ${
              open ? 'text-primary-700' : 'text-gray-500'
            }`}
          >
            <span className="text-lg leading-none">☰</span>
            <span className={`text-[9px] font-bold leading-none ${open ? 'text-primary-700' : 'text-gray-400'}`}>Daha</span>
          </button>
        </div>
      </nav>
    </>
  )
}

'use client'
// ─────────────────────────────────────────────────────────────────────────────
// Sidebar.tsx — Role-based workspace navigation (CEO / CFO / OPS)
//
// Navigation adapts to:
//   CEO mode  → strategic view (cockpit, partners, simulation, reports)
//   CFO mode  → financial accuracy view (accounting, tax, periods, audit)
//   OPS mode  → operational view (sales, purchasing, inventory, tasks)
//
// Mode switching available to admin users via the mode switcher at the top.
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { FlowraLogo } from '@/components/ui/FlowraLogo'
import { Icon } from '@/components/ui/Icon'
import { useWorkspace } from '@/lib/workspace-context'
import type { NavEntry, NavItem, NavGroup, NavMode } from '@/types/dto'

// ── Navigation definitions ────────────────────────────────────────────────────

function isGroup(e: NavEntry): e is NavGroup { return 'group' in e }

/** CEO Mode — strategic decision navigation */
const CEO_NAV: NavEntry[] = [
  {
    group: 'Yönetim',
    modes: ['CEO'],
    items: [
      { href: '/dashboard',          label: 'Executive Cockpit', icon: 'dashboard', exact: true },
      { href: '/dashboard/ceo',      label: 'CEO Özeti',         icon: 'ceo'                    },
    ],
  },
  {
    group: 'Strateji',
    modes: ['CEO'],
    items: [
      { href: '/dashboard/simulation', label: 'Simülasyon',        icon: 'simulation' },
      { href: '/dashboard/analytics',  label: 'Analitik',          icon: 'analytics'  },
      { href: '/dashboard/insights',   label: 'AI İçgörüler',      icon: 'analytics'  },
    ],
  },
  {
    group: 'Finans',
    modes: ['CEO'],
    items: [
      { href: '/dashboard/partners',    label: 'Ortaklar',    icon: 'partners'    },
      { href: '/dashboard/cashflow',    label: 'Nakit Akışı', icon: 'cashflow'    },
      { href: '/dashboard/collections', label: 'Tahsilatlar', icon: 'collections' },
    ],
  },
  {
    group: 'Yönetim',
    adminOnly: true,
    items: [
      { href: '/dashboard/admin/users', label: 'Ekip',      icon: 'users'    },
      { href: '/dashboard/admin/audit', label: 'Denetim',   icon: 'shield'   },
      { href: '/dashboard/backups',     label: 'Yedekleme', icon: 'backup'   },
      { href: '/dashboard/settings',    label: 'Ayarlar',   icon: 'settings' },
    ],
  },
]

/** CFO Mode — financial accuracy + period management navigation */
const CFO_NAV: NavEntry[] = [
  {
    group: 'CFO Paneli',
    modes: ['CFO'],
    items: [
      { href: '/dashboard/cfo',       label: 'CFO Paneli',        icon: 'ceo',      exact: true },
      { href: '/dashboard/analytics', label: 'Finansal Analitik', icon: 'analytics'             },
    ],
  },
  {
    group: 'Finansal Tablolar',
    modes: ['CFO'],
    items: [
      { href: '/dashboard/cashflow', label: 'Nakit Akışı',   icon: 'cashflow' },
      { href: '/dashboard/tax',      label: 'Vergi Merkezi', icon: 'tax'      },
    ],
  },
  {
    group: 'Operasyon İzleme',
    modes: ['CFO'],
    items: [
      { href: '/dashboard/expenses',    label: 'Giderler',    icon: 'expenses'    },
      { href: '/dashboard/collections', label: 'Tahsilatlar', icon: 'collections' },
      { href: '/dashboard/partners',    label: 'Ortaklar',    icon: 'partners'    },
    ],
  },
  {
    group: 'Yönetim',
    adminOnly: true,
    items: [
      { href: '/dashboard/admin/audit', label: 'Denetim',   icon: 'shield'   },
      { href: '/dashboard/backups',     label: 'Yedekleme', icon: 'backup'   },
      { href: '/dashboard/settings',    label: 'Ayarlar',   icon: 'settings' },
    ],
  },
]

/** OPS Mode — sales & operations navigation */
const OPS_NAV: NavEntry[] = [
  {
    group: 'Genel',
    modes: ['OPS'],
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: 'dashboard', exact: true },
    ],
  },
  {
    group: 'Satış Hattı',
    modes: ['OPS'],
    items: [
      { href: '/dashboard/proformas', label: 'Proformalar', icon: 'proformas' },
      { href: '/dashboard/sales',     label: 'Satışlar',    icon: 'sales'     },
      { href: '/dashboard/customers', label: 'Müşteriler',  icon: 'customers' },
      { href: '/dashboard/collections',label: 'Tahsilatlar', icon: 'collections' },
    ],
  },
  {
    group: 'Satın Alma & Stok',
    modes: ['OPS'],
    items: [
      { href: '/dashboard/stocks',   label: 'Stok',    icon: 'stocks'   },
      { href: '/dashboard/products', label: 'Ürünler', icon: 'products' },
    ],
  },
  {
    group: 'İşler',
    modes: ['OPS'],
    items: [
      { href: '/dashboard/expenses', label: 'Giderler', icon: 'expenses' },
      { href: '/dashboard/tasks',    label: 'Görevler', icon: 'tasks'    },
    ],
  },
  {
    group: 'Ayarlar',
    items: [
      { href: '/dashboard/settings', label: 'Ayarlar', icon: 'settings' },
    ],
  },
]

const NAV_BY_MODE: Record<NavMode, NavEntry[]> = {
  CEO: CEO_NAV,
  CFO: CFO_NAV,
  OPS: OPS_NAV,
}

const MODE_LABELS: Record<NavMode, string> = {
  CEO: 'CEO',
  CFO: 'CFO',
  OPS: 'OPS',
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname  = usePathname()
  const router    = useRouter()
  const supabase  = createClient()
  const ws        = useWorkspace()

  const { companyName, logoUrl, userInitials, userName, userEmail, userRole, navMode, setNavMode, permissions } = ws

  const isAdmin = userRole === 'admin'

  // Build nav for current mode, filter adminOnly groups if not admin
  const rawNav = NAV_BY_MODE[navMode] ?? OPS_NAV
  const NAV: NavEntry[] = rawNav.filter(e =>
    isGroup(e) ? (!e.adminOnly || isAdmin) : true
  )

  function isActive(item: NavItem) {
    return item.exact ? pathname === item.href : pathname.startsWith(item.href)
  }

  async function logout() {
    await supabase.auth.signOut()
    router.push('/auth')
  }

  const displayName = companyName || 'Flowra'

  return (
    <aside className="w-52 bg-white border-r border-gray-100 h-screen sticky top-0 flex flex-col py-3 px-2 flex-shrink-0 overflow-y-auto">

      {/* Brand */}
      <div className="px-2.5 mb-2">
        {companyName || logoUrl ? (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="logo" className="w-full h-full object-contain p-0.5" />
              ) : (
                <span className="text-white font-black text-xs">
                  {displayName.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <div className="font-black text-sm leading-tight truncate">{displayName}</div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wide">Financial OS</div>
            </div>
          </div>
        ) : (
          <FlowraLogo size="md" />
        )}
      </div>

      {/* Mode switcher — admin only */}
      {isAdmin && (
        <div className="px-2.5 mb-2">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {(['CEO', 'CFO', 'OPS'] as NavMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setNavMode(mode)}
                className={`flex-1 text-[10px] font-bold py-1 rounded-md transition-all ${
                  navMode === mode
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {MODE_LABELS[mode]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto space-y-0">
        {NAV.map((entry, i) => {
          if (isGroup(entry)) {
            return (
              <div key={`${entry.group}-${i}`} className={i > 0 ? 'pt-1.5' : ''}>
                <div className="px-2.5 pt-0.5 pb-0.5">
                  <span className="text-[9px] font-black uppercase tracking-[0.1em] text-gray-300">
                    {entry.group}
                  </span>
                </div>
                {entry.items.map(item => (
                  <NavLink key={item.href} item={item} active={isActive(item)} />
                ))}
              </div>
            )
          }
          return (
            <div key={(entry as NavItem).href} className={i > 0 ? 'pt-0.5' : ''}>
              <NavLink item={entry as NavItem} active={isActive(entry as NavItem)} />
            </div>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="pt-3 border-t border-gray-100 mt-3 space-y-0.5">
        <div className="flex items-center gap-2.5 px-3 py-2">
          <div className="w-7 h-7 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
            <span className="text-primary-700 font-bold text-xs">{userInitials}</span>
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-gray-800 truncate">{userName}</div>
            <div className="flex items-center gap-1.5">
              <div className="text-xs text-gray-400 truncate">{userEmail}</div>
              {userRole && (
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                  userRole === 'admin'   ? 'bg-primary-100 text-primary-700' :
                  userRole === 'manager' ? 'bg-blue-100 text-blue-700'       :
                                           'bg-gray-100 text-gray-500'
                }`}>
                  {userRole === 'admin' ? 'YNT' : userRole === 'manager' ? 'SAT' : 'İZL'}
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-gray-400 hover:bg-gray-50 hover:text-gray-700 transition-colors"
        >
          <Icon name="logout" size={14} className="flex-shrink-0" />
          Çıkış Yap
        </button>
      </div>
    </aside>
  )
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-2 px-2.5 py-1 rounded-md text-[12px] transition-colors ${
        active
          ? 'bg-primary-600 text-white font-semibold'
          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
      }`}
    >
      <Icon name={item.icon} size={13} className={`flex-shrink-0 ${active ? 'text-white' : 'text-gray-400'}`} />
      <span className="truncate">{item.label}</span>
      {item.badge !== undefined && (
        <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
          active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
        }`}>
          {item.badge}
        </span>
      )}
    </Link>
  )
}

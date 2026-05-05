'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { FlowraLogo } from '@/components/ui/FlowraLogo'
import { Icon } from '@/components/ui/Icon'
import type { MemberRole } from '@/types'

// ── Nav structure — icons are Lucide keys (emoji fallback still works) ─────
type NavItem  = { href: string; label: string; icon: string; exact?: boolean }
type NavGroup = { group: string; items: NavItem[] }
type NavEntry = NavItem | NavGroup

function isGroup(e: NavEntry): e is NavGroup { return 'group' in e }

// ── CEO/CFO-oriented nav — Phase 7 ──────────────────────────────────────────
//   Genel Durum (flat, always first)
//   Finans group   — financial visibility & planning
//   Operasyon group — day-to-day operational records
//   Araçlar group  — supporting tools (tasks, customers, products, flows)
//   Ayarlar (flat, always last before admin)
const BASE_NAV: NavEntry[] = [
  { href: '/dashboard', label: 'Genel Durum', icon: 'dashboard', exact: true },
  {
    group: 'Finans',
    items: [
      { href: '/dashboard/analytics',  label: 'Analitik',   icon: 'analytics'  },
      { href: '/dashboard/partners',   label: 'Ortaklar',   icon: 'partners'   },
      { href: '/dashboard/simulation', label: 'Simülasyon', icon: 'simulation' },
    ],
  },
  {
    group: 'Operasyon',
    items: [
      { href: '/dashboard/sales',       label: 'Satışlar',    icon: 'sales'       },
      { href: '/dashboard/collections', label: 'Tahsilatlar', icon: 'collections' },
      { href: '/dashboard/expenses',    label: 'Giderler',    icon: 'expenses'    },
      { href: '/dashboard/proformas',   label: 'Proformalar', icon: 'proformas'   },
      { href: '/dashboard/stocks',      label: 'Stok',        icon: 'stocks'      },
    ],
  },
  {
    group: 'Araçlar',
    items: [
      { href: '/dashboard/tasks',      label: 'Görevler',   icon: 'tasks'       },
      { href: '/dashboard/customers',  label: 'Müşteriler', icon: 'customers'   },
      { href: '/dashboard/products',   label: 'Ürünler',    icon: 'products'    },
      { href: '/dashboard/sales-flow', label: 'Satış Akışı',icon: 'arrow-right' },
    ],
  },
  { href: '/dashboard/settings', label: 'Ayarlar', icon: 'settings' },
]

// Admin-only nav group — only added when userRole === 'admin'
// Phase 7: added Yedekleme so backup/restore is in the management area, not the main dashboard.
const ADMIN_NAV_GROUP: NavGroup = {
  group: 'Yönetim',
  items: [
    { href: '/dashboard/admin/users', label: 'Ekip',          icon: 'users'   },
    { href: '/dashboard/admin/audit', label: 'Denetim Kaydı', icon: 'shield'  },
    { href: '/dashboard/backups',     label: 'Yedekleme',     icon: 'backup'  },
  ],
}

interface Props {
  companyName:  string | null
  logoUrl:      string | null
  userInitials: string
  userName:     string
  userEmail:    string
  /** Role of the current user in their primary company. null = no active membership. */
  userRole?:    MemberRole | null
}

export function Sidebar({ companyName, logoUrl, userInitials, userName, userEmail, userRole }: Props) {
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = createClient()

  // Build nav: append admin group only for admins
  const NAV: NavEntry[] = userRole === 'admin'
    ? [...BASE_NAV, ADMIN_NAV_GROUP]
    : BASE_NAV

  function isActive(item: NavItem) {
    return item.exact ? pathname === item.href : pathname.startsWith(item.href)
  }

  async function logout() {
    await supabase.auth.signOut()
    router.push('/auth')
  }

  const displayName = companyName || 'Flowra'

  return (
    <aside className="w-56 bg-white border-r border-gray-100 min-h-screen flex flex-col py-4 px-3 flex-shrink-0">

      {/* Brand */}
      <div className="px-3 mb-6">
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
              <div className="text-xs text-gray-400">ERP</div>
            </div>
          </div>
        ) : (
          <FlowraLogo size="md" />
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5">
        {NAV.map((entry, i) => {
          if (isGroup(entry)) {
            return (
              <div key={entry.group} className={i > 0 ? 'pt-3' : ''}>
                <div className="px-3 pb-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-300">
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
            <div key={entry.href} className={i > 0 ? 'pt-0.5' : ''}>
              <NavLink item={entry} active={isActive(entry)} />
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
      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors ${
        active
          ? 'bg-primary-600 text-white font-semibold'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
      }`}
    >
      <Icon name={item.icon} size={16} className="flex-shrink-0" />
      {item.label}
    </Link>
  )
}

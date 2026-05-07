'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { FlowraLogo } from '@/components/ui/FlowraLogo'
import { Icon } from '@/components/ui/Icon'
import type { MemberRole } from '@/types'

// ── Nav structure — icons are Lucide keys (emoji fallback still works) ─────
type NavItem  = { href: string; label: string; icon: string; exact?: boolean }
type NavGroup = { group: string; items: NavItem[]; adminOnly?: boolean }
type NavEntry = NavItem | NavGroup

function isGroup(e: NavEntry): e is NavGroup { return 'group' in e }

// ── Enterprise navigation — 6 sections, 3-click rule ────────────────────────
const BASE_NAV: NavEntry[] = [
  // ── GENEL DURUM ────────────────────────────────────────────────────────────
  {
    group: 'Genel Durum',
    items: [
      { href: '/dashboard',        label: 'Dashboard',       icon: 'dashboard', exact: true },
      { href: '/dashboard/ceo',    label: 'CEO Özeti',       icon: 'ceo'        },
      { href: '/dashboard/alerts', label: 'Kritik Uyarılar', icon: 'alerts'     },
    ],
  },
  // ── FİNANS ─────────────────────────────────────────────────────────────────
  {
    group: 'Finans',
    items: [
      { href: '/dashboard/analytics',   label: 'Finansal Analitik', icon: 'analytics'   },
      { href: '/dashboard/cashflow',    label: 'Nakit Akışı',       icon: 'cashflow'    },
      { href: '/dashboard/collections', label: 'Tahsilatlar',       icon: 'collections' },
      { href: '/dashboard/expenses',    label: 'Gider Yönetimi',    icon: 'expenses'    },
      { href: '/dashboard/partners',    label: 'Ortaklar',          icon: 'partners'    },
      { href: '/dashboard/simulation',  label: 'Simülasyon',        icon: 'simulation'  },
      { href: '/dashboard/tax',         label: 'Vergi Merkezi',     icon: 'tax'         },
    ],
  },
  // ── SATIŞ & GELİR ──────────────────────────────────────────────────────────
  {
    group: 'Satış & Gelir',
    items: [
      { href: '/dashboard/sales',       label: 'Satışlar',    icon: 'sales'        },
      { href: '/dashboard/proformas',   label: 'Proformalar', icon: 'proformas'    },
      { href: '/dashboard/customers',   label: 'Müşteriler',  icon: 'customers'    },
      { href: '/dashboard/sales-flow',  label: 'Satış Akışı', icon: 'arrow-right'  },
    ],
  },
  // ── OPERASYON ──────────────────────────────────────────────────────────────
  {
    group: 'Operasyon',
    items: [
      { href: '/dashboard/stocks',   label: 'Stok',                 icon: 'stocks'  },
      { href: '/dashboard/products', label: 'Ürünler',              icon: 'products'},
      { href: '/dashboard/orders',   label: 'Sipariş Operasyonları',icon: 'orders'  },
    ],
  },
  // ── ARAÇLAR ────────────────────────────────────────────────────────────────
  {
    group: 'Araçlar',
    items: [
      { href: '/dashboard/tasks',        label: 'Görevler',         icon: 'tasks'    },
      { href: '/dashboard/backups',      label: 'Yedekleme',        icon: 'backup'   },
      { href: '/dashboard/admin/audit',  label: 'Denetim Kaydı',   icon: 'shield'   },
      { href: '/dashboard/activity',     label: 'Aktivite Geçmişi', icon: 'activity' },
    ],
  },
  // ── YÖNETİM — admin only ───────────────────────────────────────────────────
  {
    group: 'Yönetim',
    adminOnly: true,
    items: [
      { href: '/dashboard/admin/users',  label: 'Ekip',          icon: 'users'    },
      { href: '/dashboard/admin/roles',  label: 'Yetkilendirme', icon: 'roles'    },
      { href: '/dashboard/settings',     label: 'Ayarlar',       icon: 'settings' },
    ],
  },
]

// Non-admin users still get Ayarlar, just not in the Yönetim group
const SETTINGS_ITEM: NavItem = { href: '/dashboard/settings', label: 'Ayarlar', icon: 'settings' }

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

  // Build nav: filter adminOnly groups for non-admins; non-admins get Ayarlar standalone
  const NAV: NavEntry[] = userRole === 'admin'
    ? BASE_NAV
    : [
        ...BASE_NAV.filter(e => !isGroup(e) || !e.adminOnly),
        SETTINGS_ITEM,
      ]

  function isActive(item: NavItem) {
    return item.exact ? pathname === item.href : pathname.startsWith(item.href)
  }

  async function logout() {
    await supabase.auth.signOut()
    router.push('/auth')
  }

  const displayName = companyName || 'Flowra'

  return (
    <aside className="w-56 bg-white border-r border-gray-100 min-h-screen flex flex-col py-3 px-2 flex-shrink-0">

      {/* Brand */}
      <div className="px-3 mb-4">
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
              <div className="text-[10px] text-gray-400 uppercase tracking-wide">ERP</div>
            </div>
          </div>
        ) : (
          <FlowraLogo size="md" />
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto space-y-0">
        {NAV.map((entry, i) => {
          if (isGroup(entry)) {
            return (
              <div key={entry.group} className={i > 0 ? 'pt-2' : ''}>
                <div className="px-3 pt-1 pb-0.5">
                  <span className="text-[9px] font-black uppercase tracking-[0.12em] text-gray-400">
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
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] transition-colors ${
        active
          ? 'bg-primary-600 text-white font-semibold'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
      }`}
    >
      <Icon name={item.icon} size={14} className="flex-shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

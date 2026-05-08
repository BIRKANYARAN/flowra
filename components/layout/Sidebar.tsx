'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useSupabase } from '@/lib/hooks/useSupabase'
import { FlowraLogo } from '@/components/ui/FlowraLogo'
import { Icon } from '@/components/ui/Icon'
import type { MemberRole } from '@/types'

// ── Nav structure — icons are Lucide keys (emoji fallback still works) ─────
type NavItem  = { href: string; label: string; icon: string; exact?: boolean }
type NavGroup = { group: string; items: NavItem[]; adminOnly?: boolean }
type NavEntry = NavItem | NavGroup

function isGroup(e: NavEntry): e is NavGroup { return 'group' in e }

// ── Enterprise navigation — 5 sections, minimal depth ───────────────────────
const BASE_NAV: NavEntry[] = [
  // ── GENEL DURUM ────────────────────────────────────────────────────────────
  {
    group: 'Genel Durum',
    items: [
      { href: '/dashboard',     label: 'Dashboard', icon: 'dashboard', exact: true },
      { href: '/dashboard/ceo', label: 'CEO Özeti', icon: 'ceo'                    },
    ],
  },
  // ── FİNANS ─────────────────────────────────────────────────────────────────
  {
    group: 'Finans',
    items: [
      { href: '/dashboard/analytics',   label: 'Finansal Analitik', icon: 'analytics'   },
      { href: '/dashboard/collections', label: 'Tahsilatlar',       icon: 'collections' },
      { href: '/dashboard/expenses',    label: 'Giderler',          icon: 'expenses'    },
      { href: '/dashboard/partners',    label: 'Ortaklar',          icon: 'partners'    },
      { href: '/dashboard/simulation',  label: 'Simülasyon',        icon: 'simulation'  },
      { href: '/dashboard/tax',         label: 'Vergi',             icon: 'tax'         },
    ],
  },
  // ── SATIŞ ──────────────────────────────────────────────────────────────────
  {
    group: 'Satış',
    items: [
      { href: '/dashboard/sales',     label: 'Satışlar',    icon: 'sales'     },
      { href: '/dashboard/proformas', label: 'Proformalar', icon: 'proformas' },
      { href: '/dashboard/customers', label: 'Müşteriler',  icon: 'customers' },
    ],
  },
  // ── OPERASYON ──────────────────────────────────────────────────────────────
  {
    group: 'Operasyon',
    items: [
      { href: '/dashboard/stocks',   label: 'Stok',    icon: 'stocks'   },
      { href: '/dashboard/products', label: 'Ürünler', icon: 'products' },
      { href: '/dashboard/tasks',    label: 'Görevler', icon: 'tasks'   },
    ],
  },
  // ── YÖNETİM — admin only ───────────────────────────────────────────────────
  {
    group: 'Yönetim',
    adminOnly: true,
    items: [
      { href: '/dashboard/admin/users',  label: 'Ekip',          icon: 'users'   },
      { href: '/dashboard/admin/audit',  label: 'Denetim',       icon: 'shield'  },
      { href: '/dashboard/backups',      label: 'Yedekleme',     icon: 'backup'  },
      { href: '/dashboard/settings',     label: 'Ayarlar',       icon: 'settings'},
    ],
  },
]

// Non-admin users still get Ayarlar
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
  const supabase = useSupabase()

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
    <aside className="w-52 bg-white border-r border-gray-100 h-screen sticky top-0 flex flex-col py-3 px-2 flex-shrink-0 overflow-y-auto">

      {/* Brand */}
      <div className="px-2.5 mb-3">
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
              <div key={entry.group} className={i > 0 ? 'pt-1.5' : ''}>
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
      className={`flex items-center gap-2 px-2.5 py-1 rounded-md text-[12px] transition-colors ${
        active
          ? 'bg-primary-600 text-white font-semibold'
          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
      }`}
    >
      <Icon name={item.icon} size={13} className={`flex-shrink-0 ${active ? 'text-white' : 'text-gray-400'}`} />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

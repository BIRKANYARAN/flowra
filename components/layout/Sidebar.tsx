'use client'

/**
 * Sidebar — FAZ 21 redesign
 *
 * Navigation is now driven entirely by lib/nav-config.ts:
 *   • 9 primary items (role-filtered via getFullNavForRole)
 *   • Visual blocks separated by thin dividers (no verbose group labels)
 *   • Viewer block:  Komuta Merkezi | Finansal Analiz | Ortaklar | Satış | Stok | Giderler
 *   • Manager adds: Simülasyon | Raporlar
 *   • Admin adds:   Yönetim (replaces Ayarlar fallback)
 */

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useSupabase } from '@/lib/hooks/useSupabase'
import { FlowraLogo } from '@/components/ui/FlowraLogo'
import { Icon }       from '@/components/ui/Icon'
import type { MemberRole } from '@/types'
import {
  getFullNavForRole,
  SETTINGS_FALLBACK,
  type NavItem,
} from '@/lib/nav-config'

// ── Visual dividers: insert a thin line before these hrefs ────────────────────
//   Block 1: Komuta Merkezi (index 0)
//   Block 2: Finansal → Giderler  (indices 1–5)
//   Block 3: Simülasyon, Raporlar (manager+)
//   Block 4: Yönetim / Ayarlar

const DIVIDER_BEFORE = new Set([
  '/dashboard/analytics',   // start of financial block
  '/dashboard/simulation',  // start of advanced block
  '/dashboard/settings',    // start of admin block (Yönetim)
])

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companyName:  string | null
  logoUrl:      string | null
  userInitials: string
  userName:     string
  userEmail:    string
  userRole?:    MemberRole | null
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Sidebar({
  companyName,
  logoUrl,
  userInitials,
  userName,
  userEmail,
  userRole,
}: Props) {
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = useSupabase()

  const navItems: NavItem[] = getFullNavForRole(userRole ?? null)

  function isActive(item: NavItem): boolean {
    return item.exact ? pathname === item.href : pathname.startsWith(item.href)
  }

  async function logout() {
    await supabase.auth.signOut()
    router.push('/auth')
  }

  const displayName = companyName || 'Flowra'

  return (
    <aside className="hidden md:flex w-52 bg-white border-r border-gray-100 h-screen sticky top-0 flex-col py-3 px-2 flex-shrink-0 overflow-y-auto">

      {/* ── Brand ──────────────────────────────────────────────────────────── */}
      <div className="px-2.5 mb-4">
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
              <div className="text-[10px] text-gray-400 uppercase tracking-wide">FOS</div>
            </div>
          </div>
        ) : (
          <FlowraLogo size="md" />
        )}
      </div>

      {/* ── Navigation ─────────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto space-y-0">
        {navItems.map(item => {
          const active     = isActive(item)
          const addDivider = DIVIDER_BEFORE.has(item.href)
            /* Ayarlar fallback also gets a divider */
            || item.href === SETTINGS_FALLBACK.href && item.label === SETTINGS_FALLBACK.label

          return (
            <div key={item.href}>
              {addDivider && (
                <div className="my-1.5 mx-2.5 border-t border-gray-100" />
              )}
              <NavLink item={item} active={active} />
            </div>
          )
        })}
      </nav>

      {/* ── User footer ────────────────────────────────────────────────────── */}
      <div className="pt-3 border-t border-gray-100 mt-3 space-y-0.5">
        <div className="flex items-center gap-2.5 px-3 py-2">
          <div className="w-7 h-7 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
            <span className="text-primary-700 font-bold text-xs">{userInitials}</span>
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-gray-800 truncate">{userName}</div>
            <div className="flex items-center gap-1.5">
              <div className="text-[10px] text-gray-400 truncate">{userEmail}</div>
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

// ── NavLink ───────────────────────────────────────────────────────────────────

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12px] transition-colors ${
        active
          ? 'bg-primary-600 text-white font-semibold'
          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
      }`}
    >
      <Icon
        name={item.icon}
        size={13}
        className={`flex-shrink-0 ${active ? 'text-white' : 'text-gray-400'}`}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

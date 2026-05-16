'use client'

/**
 * Sidebar — 7-hub center navigation
 *
 * Driven entirely by lib/nav-config.ts:
 *   • Group-based layout — every real route is reachable
 *   • Role-filtered via getGroupsForRole()
 *   • isNavItemActive() — safe prefix match (no /sales matching /sales-flow)
 *   • Non-admin users get standalone Ayarlar at bottom (SETTINGS_FALLBACK)
 *   • Width: w-56 (224 px)
 */

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useSupabase }   from '@/lib/hooks/useSupabase'
import { FlowraLogo }   from '@/components/ui/FlowraLogo'
import { Icon }         from '@/components/ui/Icon'
import { useWorkspace } from '@/lib/workspace-context'
import {
  getGroupsForRole,
  isNavItemActive,
  hasMinRole,
  SETTINGS_FALLBACK,
  type NavItem,
  type NavGroup,
} from '@/lib/nav-config'

// ── Component ─────────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = useSupabase()
  const ws       = useWorkspace()

  const { companyName, logoUrl, userInitials, userName, userEmail, userRole } = ws

  const groups      = getGroupsForRole(userRole ?? null)
  const isAdmin     = hasMinRole(userRole ?? null, 'admin')
  const displayName = companyName || 'Flowra'

  async function logout() {
    await supabase.auth.signOut()
    router.push('/auth')
  }

  return (
    <aside className="hidden md:flex w-56 bg-white border-r border-gray-100 h-screen sticky top-0 flex-col py-3 px-2 flex-shrink-0 overflow-y-auto">

      {/* ── Brand ──────────────────────────────────────────────────────────── */}
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
              <div className="text-[10px] text-gray-400 uppercase tracking-wide">FOS</div>
            </div>
          </div>
        ) : (
          <FlowraLogo size="md" />
        )}
      </div>

      {/* ── Navigation ─────────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto">
        {groups.map((group, gi) => (
          <NavGroupBlock
            key={group.id}
            group={group}
            pathname={pathname}
            isFirst={gi === 0}
          />
        ))}

        {/* Ayarlar fallback — only for non-admin users */}
        {!isAdmin && (
          <>
            <div className="my-1.5 mx-1 border-t border-gray-100" />
            <NavLink
              item={SETTINGS_FALLBACK}
              active={isNavItemActive(SETTINGS_FALLBACK, pathname)}
            />
          </>
        )}
      </nav>

      {/* ── User footer ────────────────────────────────────────────────────── */}
      <div className="pt-3 border-t border-gray-100 mt-3">
        <div className="flex items-center gap-2.5 px-3 py-1.5 mb-0.5">
          <div className="w-7 h-7 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
            <span className="text-primary-700 font-bold text-xs">{userInitials}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-gray-800 truncate">{userName}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="text-[10px] text-gray-400 truncate">{userEmail}</div>
              {userRole && <RoleBadge role={userRole} />}
            </div>
          </div>
        </div>

        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
        >
          <Icon name="logout" size={13} className="flex-shrink-0" />
          Çıkış Yap
        </button>
      </div>
    </aside>
  )
}

// ── NavGroupBlock ─────────────────────────────────────────────────────────────

function NavGroupBlock({
  group,
  pathname,
  isFirst,
}: {
  group:    NavGroup
  pathname: string
  isFirst:  boolean
}) {
  return (
    <div className={isFirst ? '' : 'mt-2'}>
      {group.label && (
        <div className="px-3 pt-1.5 pb-0.5">
          <span className="text-[9px] font-black uppercase tracking-[0.12em] text-gray-300">
            {group.label}
          </span>
        </div>
      )}
      <div className="space-y-0.5">
        {group.items.map(item => (
          <NavLink
            key={item.href}
            item={item}
            active={isNavItemActive(item, pathname)}
          />
        ))}
      </div>
    </div>
  )
}

// ── NavLink ───────────────────────────────────────────────────────────────────

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={`
        flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12px] transition-colors
        ${active
          ? 'bg-primary-600 text-white font-semibold'
          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
        }
      `}
    >
      <Icon
        name={item.icon}
        size={13}
        strokeWidth={active ? 2 : 1.5}
        className={`flex-shrink-0 ${active ? 'text-white' : 'text-gray-400'}`}
      />
      <span className="truncate">{item.label}</span>
      {item.badge !== undefined && item.badge > 0 && (
        <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
          active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
        }`}>
          {item.badge}
        </span>
      )}
    </Link>
  )
}

// ── RoleBadge ─────────────────────────────────────────────────────────────────

type MemberRole = 'admin' | 'manager' | 'viewer'

function RoleBadge({ role }: { role: MemberRole }) {
  const cfg = {
    admin:   { cls: 'bg-primary-100 text-primary-700', label: 'YNT' },
    manager: { cls: 'bg-blue-100 text-blue-700',       label: 'SAT' },
    viewer:  { cls: 'bg-gray-100 text-gray-500',       label: 'İZL' },
  }[role]

  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

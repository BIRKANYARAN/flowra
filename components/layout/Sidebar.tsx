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
 *   • Multi-company: shows switcher when user belongs to >1 company
 */

import Link from 'next/link'
import { useState } from 'react'
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

export interface SidebarProps {
  /** Server-computed live badge counts keyed by nav item href.
   *  Merges with any static badge values defined in nav-config.ts. */
  navBadges?: Record<string, number>
}

export function Sidebar({ navBadges = {} }: SidebarProps) {
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = useSupabase()
  const ws       = useWorkspace()

  const { companyId, companyName, logoUrl, userInitials, userName, userEmail, userRole, companies, switchCompany } = ws
  const [showSwitcher, setShowSwitcher] = useState(false)

  const groups         = getGroupsForRole(userRole ?? null)
  const isAdmin        = hasMinRole(userRole ?? null, 'admin')
  const displayName    = companyName || 'Flowra'
  const hasMultiCompany = companies.length > 1

  async function logout() {
    await supabase.auth.signOut()
    router.push('/auth')
  }

  return (
    <aside className="hidden md:flex w-60 bg-white border-r border-[#e2e8f0] h-screen sticky top-0 flex-col py-3 px-2 flex-shrink-0 overflow-y-auto">

      {/* ── Brand ──────────────────────────────────────────────────────────── */}
      <div className="px-2.5 mb-3">
        {companyName || logoUrl ? (
          <div
            className={`flex items-center gap-2.5 ${hasMultiCompany ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
            onClick={hasMultiCompany ? () => setShowSwitcher(s => !s) : undefined}
            title={hasMultiCompany ? 'Şirket değiştir' : undefined}
          >
            <div className="w-8 h-8 rounded bg-primary-600 flex items-center justify-center flex-shrink-0 overflow-hidden relative">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="logo" className="w-full h-full object-contain p-0.5" />
              ) : (
                <span className="text-white font-black text-xs">
                  {displayName.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-black text-sm leading-tight truncate">{displayName}</div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wide">
                {hasMultiCompany ? `${companies.length} şirket ▾` : 'FOS'}
              </div>
            </div>
          </div>
        ) : (
          <FlowraLogo size="md" />
        )}

        {/* ── Company switcher dropdown ──────────────────────────────────── */}
        {hasMultiCompany && showSwitcher && (
          <div className="mt-2 rounded border border-[#e2e8f0] bg-white shadow-sm overflow-hidden">
            <div className="px-3 py-1.5 bg-[#f8fafc] border-b border-[#e2e8f0]">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#94a3b8]">
                Şirket Seç
              </span>
            </div>
            {companies.map(c => {
              const isActive = c.companyId === companyId
              return (
                <button
                  key={c.companyId}
                  onClick={() => { setShowSwitcher(false); if (!isActive) switchCompany(c.companyId) }}
                  className={`w-full text-left flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
                    isActive
                      ? 'bg-primary-50 text-primary-700 font-semibold'
                      : 'text-gray-600 hover:bg-[#f8fafc]'
                  }`}
                >
                  <div className="w-5 h-5 rounded bg-primary-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-[9px] font-black text-primary-600">
                      {(c.companyName ?? 'Ş').slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <span className="truncate flex-1">{c.companyName ?? c.companyId.slice(0, 8)}</span>
                  {isActive && (
                    <span className="text-[9px] font-bold text-primary-500 flex-shrink-0">✓</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Command trigger ────────────────────────────────────────────────── */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('flowra:cmd'))}
        className="mx-1 mb-3 w-[calc(100%-0.5rem)] flex items-center gap-2 px-3 py-2 rounded border border-[#e2e8f0] bg-[#f8fafc]/60 hover:bg-gray-100 hover:border-[#e2e8f0] transition-colors text-left group"
      >
        <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 group-hover:text-gray-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="text-[11px] text-gray-400 flex-1 group-hover:text-gray-600 transition-colors">
          Ara veya komut gir...
        </span>
        <kbd className="text-[9px] text-gray-300 bg-white border border-[#e2e8f0] px-1.5 py-0.5 rounded font-mono leading-tight flex-shrink-0">
          ⌘K
        </kbd>
      </button>

      {/* ── Navigation ─────────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto">
        {groups.map((group, gi) => (
          <NavGroupBlock
            key={group.id}
            group={group}
            pathname={pathname}
            isFirst={gi === 0}
            navBadges={navBadges}
          />
        ))}

        {/* Ayarlar fallback — only for non-admin users */}
        {!isAdmin && (
          <>
            <div className="my-1.5 mx-1 border-t border-[#e2e8f0]" />
            <NavLink
              item={SETTINGS_FALLBACK}
              active={isNavItemActive(SETTINGS_FALLBACK, pathname)}
              liveBadge={navBadges[SETTINGS_FALLBACK.href]}
            />
          </>
        )}
      </nav>

      {/* ── User footer ────────────────────────────────────────────────────── */}
      <div className="pt-3 border-t border-[#e2e8f0] mt-3">
        <div className="flex items-center gap-2.5 px-3 py-1.5 mb-0.5">
          <div className="w-7 h-7 rounded bg-primary-100 flex items-center justify-center flex-shrink-0">
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
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-gray-400 hover:bg-[#f8fafc] hover:text-gray-600 transition-colors"
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
  navBadges = {},
}: {
  group:     NavGroup
  pathname:  string
  isFirst:   boolean
  navBadges?: Record<string, number>
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
            liveBadge={navBadges[item.href]}
          />
        ))}
      </div>
    </div>
  )
}

// ── NavLink ───────────────────────────────────────────────────────────────────

function NavLink({ item, active, liveBadge }: { item: NavItem; active: boolean; liveBadge?: number }) {
  // liveBadge overrides item.badge — live server count takes precedence over static config
  const badge = liveBadge ?? item.badge
  return (
    <Link
      href={item.href}
      className={`
        flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12px] transition-colors
        ${active
          ? 'bg-primary-600 text-white font-semibold shadow-sm'
          : 'text-gray-500 hover:bg-[#f8fafc] hover:text-gray-800'
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
      {badge !== undefined && badge > 0 && (
        <span className={`ml-auto min-w-[18px] text-center text-[10px] font-bold px-1.5 py-0.5 rounded ${
          active ? 'bg-white/20 text-white' : 'bg-neg-light text-white'
        }`}>
          {badge > 99 ? '99+' : badge}
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
    manager: { cls: 'bg-info-light text-info-text',       label: 'SAT' },
    viewer:  { cls: 'bg-gray-100 text-gray-500',       label: 'İZL' },
  }[role]

  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

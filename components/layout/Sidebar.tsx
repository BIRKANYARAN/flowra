'use client'

/**
 * Sidebar — 7-hub center navigation
 *
 * Driven entirely by lib/nav-config.ts:
 *   • Group-based layout — every real route is reachable
 *   • Role-filtered via getGroupsForRole()
 *   • isNavItemActive() — safe prefix match (no /sales matching /sales-flow)
 *   • Non-admin users get standalone Ayarlar at bottom (SETTINGS_FALLBACK)
 *   • Width: w-60 (240 px)
 *   • Multi-company: shows switcher when user belongs to >1 company
 */

import Link from 'next/link'
import { useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
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
  const search   = useSearchParams().toString()
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
    <aside className="hidden md:flex w-60 bg-white border-r border-[#e8eaef] h-screen sticky top-0 flex-col py-3 px-2 flex-shrink-0 overflow-y-auto">

      {/* ── Brand ──────────────────────────────────────────────────────────── */}
      <div className="px-2.5 mb-3">
        {companyName || logoUrl ? (
          <div
            className={`flex items-center gap-2.5 ${hasMultiCompany ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
            onClick={hasMultiCompany ? () => setShowSwitcher(s => !s) : undefined}
            title={hasMultiCompany ? 'Şirket değiştir' : undefined}
          >
            <div className="w-8 h-8 rounded bg-brand-light flex items-center justify-center flex-shrink-0 overflow-hidden relative">
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
              <div className="text-[10px] text-[#94a3b8] uppercase tracking-wide">
                {hasMultiCompany ? `${companies.length} şirket ▾` : 'FOS'}
              </div>
            </div>
          </div>
        ) : (
          <FlowraLogo size="md" />
        )}

        {/* ── Company switcher dropdown ──────────────────────────────────── */}
        {hasMultiCompany && showSwitcher && (
          <div className="mt-2 rounded border border-[#e8eaef] bg-white shadow-sm overflow-hidden">
            <div className="px-3 py-1.5 bg-[#f8fafc] border-b border-[#e8eaef]">
              <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
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
                      ? 'bg-brand-subtle text-brand font-semibold'
                      : 'text-[#64748b] hover:bg-[#f8fafc]'
                  }`}
                >
                  <div className="w-5 h-5 rounded bg-brand-subtle flex items-center justify-center flex-shrink-0">
                    <span className="text-[9px] font-black text-brand-light">
                      {(c.companyName ?? 'Ş').slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <span className="truncate flex-1">{c.companyName ?? c.companyId.slice(0, 8)}</span>
                  {isActive && (
                    <span className="text-[9px] font-bold text-brand-light flex-shrink-0">✓</span>
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
        className="mx-1 mb-3 w-[calc(100%-0.5rem)] flex items-center gap-2 px-3 py-2 rounded border border-[#e8eaef] bg-[#f8fafc]/60 hover:bg-[#f1f5f9] hover:border-[#e8eaef] transition-colors text-left group"
      >
        <svg className="w-3.5 h-3.5 text-[#94a3b8] flex-shrink-0 group-hover:text-[#64748b] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="text-[11px] text-[#94a3b8] flex-1 group-hover:text-[#64748b] transition-colors">
          Ara veya komut gir...
        </span>
        <kbd className="text-[9px] text-[#cbd5e1] bg-white border border-[#e8eaef] px-1.5 py-0.5 rounded font-mono leading-tight flex-shrink-0">
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
            search={search}
            isFirst={gi === 0}
            navBadges={navBadges}
          />
        ))}

        {/* Ayarlar fallback — only for non-admin users */}
        {!isAdmin && (
          <>
            <div className="my-1.5 mx-1 border-t border-[#e8eaef]" />
            <NavLink
              item={SETTINGS_FALLBACK}
              active={isNavItemActive(SETTINGS_FALLBACK, pathname, search)}
              liveBadge={navBadges[SETTINGS_FALLBACK.href]}
              pathname={pathname}
            />
          </>
        )}
      </nav>

      {/* ── User footer ────────────────────────────────────────────────────── */}
      <div className="pt-3 border-t border-[#e8eaef] mt-3">
        <div className="flex items-center gap-2.5 px-3 py-1.5 mb-0.5">
          <div className="w-7 h-7 rounded bg-brand-subtle flex items-center justify-center flex-shrink-0">
            <span className="text-brand font-bold text-xs">{userInitials}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-[#1e293b] truncate">{userName}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="text-[10px] text-[#94a3b8] truncate">{userEmail}</div>
              {userRole && <RoleBadge role={userRole} />}
            </div>
          </div>
        </div>

        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-[#94a3b8] hover:bg-[#f8fafc] hover:text-[#64748b] transition-colors"
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
  search,
  isFirst,
  navBadges = {},
}: {
  group:     NavGroup
  pathname:  string
  search:    string
  isFirst:   boolean
  navBadges?: Record<string, number>
}) {
  return (
    <div className={isFirst ? '' : 'mt-2'}>
      {group.label && (
        <div className="px-3 pt-1.5 pb-0.5">
          <span className="text-[9px] font-black uppercase tracking-[0.12em] text-[#94a3b8]">
            {group.label}
          </span>
        </div>
      )}
      <div className="space-y-0.5">
        {group.items.map(item => (
          <NavLink
            key={item.href}
            item={item}
            active={isNavItemActive(item, pathname, search)}
            liveBadge={navBadges[item.href]}
            pathname={pathname}
          />
        ))}
      </div>
    </div>
  )
}

// ── NavLink ───────────────────────────────────────────────────────────────────

function NavLink({
  item, active, liveBadge, pathname,
}: {
  item: NavItem
  active: boolean
  liveBadge?: number
  pathname: string
}) {
  const badge = liveBadge ?? item.badge
  // A child route is active → parent gets a subtle "open" indicator
  const childActive = item.children?.some(c => isNavItemActive(c, pathname)) ?? false

  return (
    <div>
      <Link
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={`
          group/nav relative flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12px]
          transition-all duration-150 ease-out
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-inset
          ${active
            ? 'bg-brand-subtle text-brand font-semibold'
            : childActive
              ? 'text-[#1e293b] font-medium hover:bg-[#f1f5f9]'
              : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#1e293b] hover:translate-x-px'
          }
        `}
      >
        {active && (
          <span
            aria-hidden
            className="flowra-nav-rail absolute left-0.5 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-full bg-brand-light"
          />
        )}
        <Icon
          name={item.icon}
          size={13}
          strokeWidth={active || childActive ? 2 : 1.5}
          className={`flex-shrink-0 transition-colors ${active ? 'text-brand' : 'text-[#94a3b8] group-hover/nav:text-[#64748b]'}`}
        />
        <span className="truncate">{item.label}</span>
        {badge !== undefined && badge > 0 && (
          <span className={`ml-auto min-w-[18px] text-center text-[10px] font-bold px-1.5 py-0.5 rounded ${
            active ? 'bg-brand/15 text-brand' : 'bg-neg-light text-white'
          }`}>
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </Link>

      {/* Sub-items — always visible when parent has children */}
      {item.children && item.children.length > 0 && (
        <div className={`ml-3 mt-0.5 pl-3 border-l space-y-0.5 transition-colors ${childActive ? 'border-brand-light/40' : 'border-[#e8eaef]'}`}>
          {item.children.map(child => {
            const childIsActive = isNavItemActive(child, pathname)
            return (
              <Link
                key={child.href}
                href={child.href}
                aria-current={childIsActive ? 'page' : undefined}
                className={`
                  group/sub relative flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px]
                  transition-all duration-150 ease-out
                  ${childIsActive
                    ? 'bg-brand-subtle text-brand font-semibold'
                    : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#1e293b] hover:translate-x-px'
                  }
                `}
              >
                {childIsActive && (
                  <span
                    aria-hidden
                    className="flowra-nav-rail absolute -left-[13px] top-1/2 -translate-y-1/2 h-3.5 w-[3px] rounded-full bg-brand-light"
                  />
                )}
                <Icon
                  name={child.icon}
                  size={11}
                  strokeWidth={childIsActive ? 2 : 1.5}
                  className={`flex-shrink-0 transition-colors ${childIsActive ? 'text-brand' : 'text-[#94a3b8] group-hover/sub:text-[#64748b]'}`}
                />
                <span className="truncate">{child.label}</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── RoleBadge ─────────────────────────────────────────────────────────────────

type MemberRole = 'admin' | 'manager' | 'viewer'

function RoleBadge({ role }: { role: MemberRole }) {
  const cfg = {
    admin:   { cls: 'bg-brand-subtle text-brand', label: 'YNT' },
    manager: { cls: 'bg-info-light text-info-text',       label: 'SAT' },
    viewer:  { cls: 'bg-[#f1f5f9] text-[#64748b]',       label: 'İZL' },
  }[role]

  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

'use client'

/**
 * Sidebar — zoned navigation (Kokpit · Çalışma Alanları · Muhasebe · Gelişmiş · Sistem)
 *
 * Driven entirely by lib/nav-config.ts (mirrors FLOWRA_FINAL_FORM.md zones):
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
    <aside className="hidden md:flex w-60 bg-[#0f172a] text-slate-300 border-r border-white/[0.06] h-screen sticky top-0 flex-col py-3 px-2 flex-shrink-0 overflow-y-auto">

      {/* ── Brand ──────────────────────────────────────────────────────────── */}
      <div className="px-2.5 mb-3">
        {companyName || logoUrl ? (
          <div
            className={`flex items-center gap-2.5 ${hasMultiCompany ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
            onClick={hasMultiCompany ? () => setShowSwitcher(s => !s) : undefined}
            title={hasMultiCompany ? 'Şirket değiştir' : undefined}
            {...(hasMultiCompany ? {
              role: 'button' as const,
              tabIndex: 0,
              'aria-haspopup': true as const,
              'aria-expanded': showSwitcher,
              'aria-label': 'Şirket değiştir',
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowSwitcher(s => !s) }
              },
            } : {})}
          >
            <div className="w-8 h-8 rounded bg-brand-light flex items-center justify-center flex-shrink-0 overflow-hidden relative">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="logo" className="w-full h-full object-contain p-0.5" />
              ) : (
                <span className="text-white font-bold text-xs">
                  {displayName.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-sm leading-tight truncate text-white">{displayName}</div>
              <div className="text-[10px] text-white/40 uppercase tracking-wide">
                {hasMultiCompany ? `${companies.length} şirket ▾` : 'Finansal OS'}
              </div>
            </div>
          </div>
        ) : (
          <FlowraLogo size="md" />
        )}

        {/* ── Company switcher dropdown ──────────────────────────────────── */}
        {hasMultiCompany && showSwitcher && (
          <div className="mt-2 rounded-lg border border-white/10 bg-[#1e293b] shadow-soft-lg overflow-hidden">
            <div className="px-3 py-1.5 bg-white/5 border-b border-white/10">
              <span className="text-[0.65rem] font-bold uppercase tracking-wider text-white/50">
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
                      ? 'bg-brand/20 text-white font-semibold'
                      : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  <div className="w-5 h-5 rounded bg-brand/25 flex items-center justify-center flex-shrink-0">
                    <span className="text-[9px] font-bold text-brand-light">
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
        className="mx-1 mb-3 w-[calc(100%-0.5rem)] flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-left group"
      >
        <svg className="w-3.5 h-3.5 text-white/40 flex-shrink-0 group-hover:text-white/70 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="text-[11px] text-white/50 flex-1 group-hover:text-white/70 transition-colors">
          Ara veya komut gir...
        </span>
        <kbd className="text-[9px] text-white/40 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded font-mono leading-tight flex-shrink-0">
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
            <div className="my-1.5 mx-1 border-t border-white/10" />
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
      <div className="pt-3 border-t border-white/10 mt-3">
        <div className="flex items-center gap-2.5 px-3 py-1.5 mb-0.5">
          <div className="w-7 h-7 rounded bg-brand/25 flex items-center justify-center flex-shrink-0">
            <span className="text-brand-light font-bold text-xs">{userInitials}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-white truncate">{userName}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="text-[10px] text-white/40 truncate">{userEmail}</div>
              {userRole && <RoleBadge role={userRole} />}
            </div>
          </div>
        </div>

        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-white/50 hover:bg-white/5 hover:text-white transition-colors"
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
        <div className="px-3 pt-2 pb-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-white/40">
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
            ? 'bg-brand/20 text-white font-semibold'
            : childActive
              ? 'text-white font-medium hover:bg-white/[0.06]'
              : 'text-slate-300 hover:bg-white/[0.06] hover:text-white hover:translate-x-px'
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
          className={`flex-shrink-0 transition-colors ${active ? 'text-brand-light' : 'text-slate-400 group-hover/nav:text-white'}`}
        />
        <span className="truncate">{item.label}</span>
        {badge !== undefined && badge > 0 && (
          <span className={`ml-auto min-w-[18px] text-center text-[10px] font-bold px-1.5 py-0.5 rounded ${
            active ? 'bg-brand/30 text-white' : 'bg-neg-light text-white'
          }`}>
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </Link>

      {/* Sub-items — always visible when parent has children */}
      {item.children && item.children.length > 0 && (
        <div className={`ml-3 mt-0.5 pl-3 border-l space-y-0.5 transition-colors ${childActive ? 'border-brand-light/40' : 'border-white/10'}`}>
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
                    ? 'bg-brand/20 text-white font-semibold'
                    : 'text-slate-400 hover:bg-white/[0.06] hover:text-white hover:translate-x-px'
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
                  className={`flex-shrink-0 transition-colors ${childIsActive ? 'text-brand-light' : 'text-slate-500 group-hover/sub:text-white'}`}
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

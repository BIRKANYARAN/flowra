// ── UnifiedTabNav — single tab navigation component for all hub centers ────────
//
// Used by: Finance, Commercial, Operations, Planning, Partners hubs.
// Server component — no 'use client'. Uses <Link> for navigation.
//
// Props:
//   tabs      — array of { key, label, badge? }   (flat mode)
//   groups    — optional [{ label, tabs[] }]       (2-level mode; reduces sprawl)
//   activeTab — currently selected tab key (from server searchParams)
//   basePath  — e.g. "/dashboard/finance" — href = basePath?tab=key
//
// When `groups` is supplied the bar renders two levels: a row of section labels
// (each links to that section's first tab) plus the active section's sub-tabs.
// Every tab remains reachable by deep link (?tab=key). Flat mode is unchanged.

import Link from 'next/link'

export interface UnifiedTab {
  key:    string
  label:  string
  badge?: number   // optional count badge (0 = hidden)
}

export interface UnifiedTabGroup {
  label: string
  tabs:  UnifiedTab[]
}

interface Props {
  tabs:      UnifiedTab[]
  activeTab: string
  basePath:  string
  groups?:   UnifiedTabGroup[]
}

function TabLink({ tab, activeTab, basePath }: { tab: UnifiedTab; activeTab: string; basePath: string }) {
  const isActive  = tab.key === activeTab
  const showBadge = tab.badge !== undefined && tab.badge > 0
  return (
    <Link
      href={`${basePath}?tab=${tab.key}`}
      aria-current={isActive ? 'page' : undefined}
      className={`
        relative flex items-center gap-1.5 px-3 py-2.5 text-[13px]
        transition-colors duration-150 whitespace-nowrap flex-shrink-0 rounded-t-md
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-inset
        ${isActive
          ? 'text-[#0f172a] font-semibold'
          : 'text-[#64748b] hover:text-[#0f172a] hover:bg-[#f8fafc] font-medium'
        }
      `}
    >
      {tab.label}
      {showBadge && (
        <span
          aria-label={`${tab.badge} bildirim`}
          className={`
          inline-flex items-center justify-center min-w-[16px] h-4 px-1
          text-[9px] font-black rounded-full leading-none transition-colors
          ${isActive
            ? 'bg-[#e2e8f0] text-[#334155]'
            : 'bg-[#f1f5f9] text-[#64748b]'
          }
        `}>
          {tab.badge}
        </span>
      )}
      {isActive && (
        <span
          aria-hidden
          className="flowra-tab-underline absolute left-1.5 right-1.5 -bottom-px h-[2px] rounded-full bg-[#0f172a]"
        />
      )}
    </Link>
  )
}

export function UnifiedTabNav({ tabs, activeTab, basePath, groups }: Props) {
  // ── 2-level grouped mode ──────────────────────────────────────────────────
  if (groups && groups.length > 0) {
    const activeIdx = Math.max(0, groups.findIndex(g => g.tabs.some(t => t.key === activeTab)))
    const activeGroup = groups[activeIdx]
    return (
      <div>
        {/* Level 1 — section groups */}
        <nav aria-label="Bölümler" className="flex items-center gap-1 overflow-x-auto scrollbar-none pt-0.5">
          {groups.map((g, i) => (
            <Link
              key={g.label}
              href={`${basePath}?tab=${g.tabs[0].key}`}
              aria-current={i === activeIdx ? 'true' : undefined}
              className={`px-3 py-1.5 text-xs rounded-md transition-all duration-150 whitespace-nowrap flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-inset ${
                i === activeIdx
                  ? 'text-[#0f172a] font-black bg-[#f1f5f9]'
                  : 'text-[#64748b] hover:text-[#0f172a] hover:bg-[#f8fafc] font-semibold'
              }`}
            >
              {g.label}
            </Link>
          ))}
        </nav>
        {/* Level 2 — sub-tabs of the active group */}
        <nav aria-label="Sekmeler" className="flex items-center gap-0.5 border-b border-[#e2e8f0] overflow-x-auto scrollbar-none pb-0">
          {activeGroup.tabs.map(tab => (
            <TabLink key={tab.key} tab={tab} activeTab={activeTab} basePath={basePath} />
          ))}
        </nav>
      </div>
    )
  }

  // ── Flat mode (unchanged) ─────────────────────────────────────────────────
  return (
    <nav aria-label="Sekmeler" className="flex items-center gap-0.5 border-b border-[#e2e8f0] overflow-x-auto scrollbar-none pb-0">
      {tabs.map(tab => (
        <TabLink key={tab.key} tab={tab} activeTab={activeTab} basePath={basePath} />
      ))}
    </nav>
  )
}

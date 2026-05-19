// ── UnifiedTabNav — single tab navigation component for all hub centers ────────
//
// Used by: Finance, Commercial, Operations, Planning, Partners hubs.
// Server component — no 'use client'. Uses <Link> for navigation.
//
// Props:
//   tabs      — array of { key, label, badge? }
//   activeTab — currently selected tab key (from server searchParams)
//   basePath  — e.g. "/dashboard/finance" — href = basePath?tab=key

import Link from 'next/link'

export interface UnifiedTab {
  key:    string
  label:  string
  badge?: number   // optional count badge (0 = hidden)
}

interface Props {
  tabs:      UnifiedTab[]
  activeTab: string
  basePath:  string
}

export function UnifiedTabNav({ tabs, activeTab, basePath }: Props) {
  return (
    <div className="flex items-center gap-0.5 border-b border-[#e2e8f0] overflow-x-auto scrollbar-none pb-0">
      {tabs.map(tab => {
        const isActive  = tab.key === activeTab
        const showBadge = tab.badge !== undefined && tab.badge > 0
        return (
          <Link
            key={tab.key}
            href={`${basePath}?tab=${tab.key}`}
            className={`
              relative flex items-center gap-1.5 px-3 py-2.5 text-[13px]
              transition-colors whitespace-nowrap flex-shrink-0 rounded-none
              ${isActive
                ? 'text-[#0f172a] font-semibold border-b-2 border-[#0f172a] -mb-px'
                : 'text-[#94a3b8] hover:text-[#334155] font-medium'
              }
            `}
          >
            {tab.label}
            {showBadge && (
              <span className={`
                inline-flex items-center justify-center min-w-[16px] h-4 px-1
                text-[9px] font-black rounded-full leading-none
                ${isActive
                  ? 'bg-gray-200 text-gray-700'
                  : 'bg-gray-100 text-gray-500'
                }
              `}>
                {tab.badge}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}

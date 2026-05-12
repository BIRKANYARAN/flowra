'use client'

/**
 * DashboardTabs — URL-driven inner tab navigation (FAZ 21)
 *
 * Reads the active tab from ?tab= URL search param.
 * Switching tabs updates the URL without a full page reload (shallow push).
 *
 * Usage example:
 *
 *   const [activeTab, setTab] = useDashboardTab('ceo')
 *
 *   <DashboardTabBar
 *     tabs={[
 *       { key: 'ceo',      label: 'CEO Özeti'   },
 *       { key: 'cashflow', label: 'Nakit Akışı' },
 *       { key: 'vergi',    label: 'Vergi',  badge: 1 },
 *     ]}
 *     activeTab={activeTab}
 *     onTabChange={setTab}
 *   />
 *
 *   {activeTab === 'ceo'      && <CeoPanel />}
 *   {activeTab === 'cashflow' && <CashflowPanel />}
 *   {activeTab === 'vergi'    && <VergiPanel />}
 */

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Returns [activeTab, setTab].
 *
 * - activeTab: current ?tab= value, falls back to `defaultTab` when absent.
 * - setTab: pushes ?tab=<key> into the URL (scroll: false — no jump).
 */
export function useDashboardTab(defaultTab: string): [string, (tab: string) => void] {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const pathname     = usePathname()

  const activeTab = searchParams.get('tab') ?? defaultTab

  const setTab = useCallback(
    (tab: string) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('tab', tab)
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [searchParams, router, pathname],
  )

  return [activeTab, setTab]
}

// ── Tab definition type ───────────────────────────────────────────────────────

export interface TabDef {
  key:    string
  label:  string
  /** Optional count badge (shown when > 0). */
  badge?: number | null
}

// ── DashboardTabBar ───────────────────────────────────────────────────────────

interface DashboardTabBarProps {
  tabs:        TabDef[]
  activeTab:   string
  onTabChange: (key: string) => void
  /** Extra Tailwind classes for the wrapper div. */
  className?:  string
}

export function DashboardTabBar({
  tabs,
  activeTab,
  onTabChange,
  className = '',
}: DashboardTabBarProps) {
  return (
    <div className={`flex items-center gap-0.5 border-b border-gray-200 ${className}`}>
      {tabs.map(tab => {
        const isActive = tab.key === activeTab
        return (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={`
              relative flex items-center gap-1.5 px-3 py-2 text-xs font-semibold
              transition-colors whitespace-nowrap
              ${isActive
                ? 'text-primary-700 border-b-2 border-primary-600 -mb-px bg-transparent'
                : 'text-gray-500 hover:text-gray-800 rounded-t-md hover:bg-gray-50'
              }
            `}
          >
            {tab.label}
            {tab.badge != null && tab.badge > 0 && (
              <span
                className={`text-[9px] font-black px-1.5 py-0.5 rounded-full leading-none ${
                  isActive
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

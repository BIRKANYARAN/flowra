'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FinanceNavTabs — unified tab navigation for the Finansal Analitik hub
//
// Appears at the top of: /dashboard/analytics, /dashboard/ceo,
// /dashboard/cashflow, /dashboard/tax
//
// Usage:
//   import { FinanceNavTabs } from '@/components/dashboard/FinanceNavTabs'
//   <FinanceNavTabs active="analytics" />
// ─────────────────────────────────────────────────────────────────────────────

import Link from 'next/link'

export type FinanceTab =
  | 'analytics'
  | 'ceo'
  | 'cashflow'
  | 'tax'
  | 'collections'
  | 'partners'

const TABS: { key: FinanceTab; label: string; href: string }[] = [
  { key: 'analytics',   label: 'Genel Finans',      href: '/dashboard/analytics'   },
  { key: 'ceo',         label: 'CEO Özeti',          href: '/dashboard/ceo'         },
  { key: 'cashflow',    label: 'Nakit Akışı',        href: '/dashboard/cashflow'    },
  { key: 'tax',         label: 'Vergi Projeksiyonu', href: '/dashboard/tax'         },
  { key: 'collections', label: 'Tahsilat Analizi',   href: '/dashboard/collections' },
  { key: 'partners',    label: 'Ortak Finansmanı',   href: '/dashboard/partners'    },
]

interface Props {
  active: FinanceTab
}

export function FinanceNavTabs({ active }: Props) {
  return (
    <div className="mb-5">
      {/* Hub header */}
      <div className="mb-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
          Finansal Analitik
        </p>
      </div>

      {/* Tab strip */}
      <div className="flex items-center gap-0.5 overflow-x-auto pb-0.5 scrollbar-hide">
        {TABS.map(tab => {
          const isActive = tab.key === active
          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={`
                shrink-0 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap
                ${isActive
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                }
              `}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>

      {/* Thin separator */}
      <div className="mt-2 border-b border-gray-100" />
    </div>
  )
}

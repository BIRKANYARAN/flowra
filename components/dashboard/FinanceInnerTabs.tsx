// components/dashboard/FinanceInnerTabs.tsx
// ──────────────────────────────────────────────────────────────────────────────
// 8-tab navigation strip for the Financial Intelligence Hub
// (/dashboard/finance?tab=X)
//
// Tabs (left → right, decision-tree order):
//   overview  → Genel Finans   (CEO cockpit)
//   pnl       → Kâr / Zarar   (accrual P&L)
//   balance   → Bilanço        (balance sheet)
//   cashflow  → Nakit Akışı   (cashflow timeline)
//   tax       → Vergi          (KDV + KV calendar)
//   risks     → Riskler        (AR aging + concentration)
//   forecast  → Tahmin         (runway projection)
//   quarterly → Çeyreklik      (YTD + quarter grid)

import Link from 'next/link'

// ── Tab config ────────────────────────────────────────────────────────────────

export type FinanceTab =
  | 'overview'
  | 'pnl'
  | 'balance'
  | 'cashflow'
  | 'tax'
  | 'risks'
  | 'forecast'
  | 'quarterly'

const TABS: { id: FinanceTab; label: string; emoji: string }[] = [
  { id: 'overview',  label: 'Genel',      emoji: '🏢' },
  { id: 'pnl',       label: 'Kâr/Zarar',  emoji: '📊' },
  { id: 'balance',   label: 'Bilanço',    emoji: '⚖️'  },
  { id: 'cashflow',  label: 'Nakit',      emoji: '💧' },
  { id: 'tax',       label: 'Vergi',      emoji: '🧾' },
  { id: 'risks',     label: 'Riskler',    emoji: '⚠️'  },
  { id: 'forecast',  label: 'Tahmin',     emoji: '🔭' },
  { id: 'quarterly', label: 'Çeyreklik',  emoji: '📈' },
]

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  active: FinanceTab
}

export function FinanceInnerTabs({ active }: Props) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none -mx-0.5 px-0.5">
      {TABS.map(tab => {
        const isActive = tab.id === active
        return (
          <Link
            key={tab.id}
            href={`/dashboard/finance?tab=${tab.id}`}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold
              whitespace-nowrap transition-all flex-shrink-0
              ${isActive
                ? 'bg-gray-900 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
              }
            `}
          >
            <span className="text-[10px] leading-none">{tab.emoji}</span>
            <span>{tab.label}</span>
          </Link>
        )
      })}
    </div>
  )
}

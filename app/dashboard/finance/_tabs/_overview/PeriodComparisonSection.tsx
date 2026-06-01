// ── PeriodComparisonSection — extracted verbatim from OverviewTab.tsx ─────────
// Pure presentational (props → JSX). No behavior change.

import { fmtTRY as fmt } from '@/lib/format'
import type { PeriodComparison } from '@/lib/services/finance/period-comparison.service'

// ── Period Comparison section ─────────────────────────────────────────────────

// direction helper derived from change_pct (new interface has no direction field)
function directionFrom(changePct: number): 'up' | 'down' | 'flat' {
  if (changePct > 1)  return 'up'
  if (changePct < -1) return 'down'
  return 'flat'
}

function DirectionArrow({ changePct, isFavorable }: { changePct: number; isFavorable: boolean }) {
  const direction = directionFrom(changePct)
  if (direction === 'flat') {
    return <span className="text-[#94a3b8] font-bold">—</span>
  }
  const isGood = (direction === 'up' && isFavorable) || (direction === 'down' && !isFavorable)
  const color   = isGood ? 'text-pos-text' : 'text-neg'
  const arrow   = direction === 'up' ? '▲' : '▼'
  return <span className={`font-bold ${color}`}>{arrow}</span>
}

function ChangeBadge({ changePct, isFavorable }: {
  changePct: number
  isFavorable: boolean
}) {
  const direction = directionFrom(changePct)
  const isGood = (direction === 'up' && isFavorable) || (direction === 'down' && !isFavorable)
  const colors  = isGood
    ? 'bg-pos-light text-pos-text'
    : direction === 'flat'
    ? 'bg-[#f1f5f9] text-[#64748b]'
    : 'bg-neg-light text-neg-text'
  const sign = changePct >= 0 ? '+' : ''
  return (
    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded tabular-nums ${colors}`}>
      {sign}{changePct.toFixed(1)}%
    </span>
  )
}

function ComparisonTable({ comparison }: { comparison: PeriodComparison }) {
  // Show revenue, expenses, gross_profit, net_income only (skip margins for compact view)
  const mainMetrics = new Set(['revenue_try', 'expenses_try', 'gross_profit_try', 'net_income_try'])
  const rows = comparison.comparisons.filter(c => mainMetrics.has(c.metric_name))

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] bg-[#f8fafc] border-b border-[#e2e8f0]">
            <th className="text-left px-4 py-2">Metrik</th>
            <th className="text-right px-4 py-2">{comparison.current_period.period}</th>
            <th className="text-right px-4 py-2">{comparison.prior_period.period}</th>
            <th className="text-center px-4 py-2">Değişim</th>
            <th className="text-center px-4 py-2">%</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f1f5f9]">
          {rows.map((c) => (
            <tr key={c.metric_name} className="hover:bg-[#f8fafc]/60">
              <td className="px-4 py-2 font-semibold text-[#334155]">{c.label}</td>
              <td className="px-4 py-2 text-right tabular-nums font-semibold text-[#0f172a]">
                {fmt(c.current_value)}
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-[#64748b]">
                {fmt(c.prior_value)}
              </td>
              <td className="px-4 py-2 text-center">
                <DirectionArrow changePct={c.change_pct} isFavorable={c.is_favorable} />
              </td>
              <td className="px-4 py-2 text-center">
                <ChangeBadge
                  changePct={c.change_pct}
                  isFavorable={c.is_favorable}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function PeriodComparisonSection({
  yoy,
  mom,
  currentYear,
  currentMonth,
}: {
  yoy: PeriodComparison | null
  mom: PeriodComparison | null
  currentYear: number
  currentMonth: number
}) {
  if (!yoy && !mom) return null

  const monthName = new Date(currentYear, currentMonth - 1, 1).toLocaleDateString('tr-TR', { month: 'long' })

  return (
    <div>
      <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">Dönem Karşılaştırma</div>
      <div className="space-y-3">

        {/* Year-over-Year comparison */}
        {yoy && (
          <div className="bg-white border border-[#e2e8f0] rounded shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#f1f5f9] bg-[#f8fafc]">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-[#64748b]">
                  Yıllık Karşılaştırma — {yoy.current_period.period} / {yoy.prior_period.period}
                </span>
              </div>
              <span className="text-[9px] font-semibold text-[#94a3b8] bg-[#f1f5f9] px-2 py-0.5 rounded-full">YoY</span>
            </div>
            {/* Headline */}
            <div className="px-4 py-2.5 border-b border-[#f1f5f9] bg-blue-50/40">
              <p className="text-[11px] text-[#334155] leading-snug">
                <span className="text-[#94a3b8] mr-1.5">—</span>{yoy.headline}
              </p>
            </div>
            <ComparisonTable comparison={yoy} />
          </div>
        )}

        {/* Month-over-Year (YoY for current month) comparison */}
        {mom && (
          <div className="bg-white border border-[#e2e8f0] rounded shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#f1f5f9] bg-[#f8fafc]">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-[#64748b]">
                  Aylık Karşılaştırma — {monthName} {currentYear} / {monthName} {currentYear - 1}
                </span>
              </div>
              <span className="text-[9px] font-semibold text-[#94a3b8] bg-[#f1f5f9] px-2 py-0.5 rounded-full">MoY</span>
            </div>
            {/* Headline */}
            <div className="px-4 py-2.5 border-b border-[#f1f5f9] bg-blue-50/40">
              <p className="text-[11px] text-[#334155] leading-snug">
                <span className="text-[#94a3b8] mr-1.5">—</span>{mom.headline}
              </p>
            </div>
            <ComparisonTable comparison={mom} />
          </div>
        )}
      </div>
    </div>
  )
}

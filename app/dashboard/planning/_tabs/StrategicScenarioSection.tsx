// ── StrategicScenarioSection — P&L waterfall for 3 scenarios ──────────────────
// Server component. Queries trailing 6-month revenue + expense categories + loan
// tranches from DB, then calls computeMultiScenario (pure) and renders:
//   1. 3-card summary (pessimistic / base / optimistic) — net, DSR, recommendation
//   2. Recommendation banner
//   3. 12-month EBITDA / Net income table for base scenario
//
// Augments CashProjectionTab with a full P&L waterfall view (revenue → EBITDA →
// interest → tax → net) that the forecast.engine does not provide.

import { createClient }         from '@/lib/supabase-server'
import {
  computeMultiScenario,
  type StrategicScenarioInput,
  type BaseExpenseLine,
  type DebtTranche,
} from '@/lib/services/simulation-strategic.service'

const FMT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })
function fmtK(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
  return FMT.format(Math.round(n))
}
function pct(v: number): string { return `%${(v * 100).toFixed(0)}` }

interface Props { companyId: string }

export async function StrategicScenarioSection({ companyId }: Props) {
  const supabase = createClient()
  const now      = new Date()
  const nextM    = now.getMonth() === 11 ? 1 : now.getMonth() + 2  // next month (1-12)
  const nextY    = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear()
  const startMonth = `${nextY}-${String(nextM).padStart(2, '0')}`

  // Trailing 6 months date range
  const trailing6Start = new Date(now.getFullYear(), now.getMonth() - 6, 1)
  const trFrom = trailing6Start.toISOString().slice(0, 10)
  const trTo   = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10)

  try {
    const [salesRes, expensesRes, tranchesRes] = await Promise.all([
      supabase.from('sales')
        .select('total_try:total')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', trFrom)
        .lte('sale_date', trTo),
      supabase.from('expenses')
        .select('amount_try, expense_type')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', trFrom)
        .lte('expense_date', trTo),
      supabase.from('partner_loan_tranches')
        .select('outstanding_try, annual_interest_rate')
        .eq('company_id', companyId)
        .eq('status', 'active'),
    ])

    // Annualise trailing revenue (6 months × 2)
    const trailing6Revenue = (salesRes.data ?? []).reduce((s, r) => s + Number(r.total_try ?? 0), 0)
    const annualRevenue    = trailing6Revenue * 2

    if (annualRevenue < 1_000) return null  // insufficient data — skip silently

    // Monthly expense baseline by category (trailing 6-month average)
    const catMap: Record<string, number> = {}
    for (const e of (expensesRes.data ?? [])) {
      const cat = (e.expense_type as string) ?? 'general'
      catMap[cat] = (catMap[cat] ?? 0) + Number(e.amount_try ?? 0)
    }
    const base_monthly_expenses: BaseExpenseLine[] = Object.entries(catMap).map(([category, total]) => ({
      category,
      amount_try: Math.round(total / 6),  // monthly average
    }))

    // Active loan tranches → DebtTranche[]
    const debt_tranches: DebtTranche[] = (tranchesRes.data ?? []).map(t => {
      const principal = Number(t.outstanding_try ?? 0)
      const rate      = Number(t.annual_interest_rate ?? 0)
      const monthlyInterest = rate > 0 ? principal * rate / 12 : principal * 0.015
      return {
        label:            'Ortak Borç',
        monthly_interest:  Math.round(monthlyInterest),
        monthly_repayment: 0,   // no scheduled repayment — interest-only modelling
        remaining_months:  0,   // 0 = infinite (active, no end date)
      }
    })

    const input: StrategicScenarioInput = {
      scenario_name:         'Baz',
      revenue_model:         'uniform',
      target_annual_revenue: annualRevenue,
      base_monthly_expenses,
      debt_tranches,
      period_months:         12,
      start_month:           startMonth,
    }

    const result = computeMultiScenario(input)

    const SCENARIO_CFG = [
      {
        key:     'pessimistic' as const,
        label:   'Kötümser (−20%)',
        data:    result.pessimistic,
        accent:  'border-red-200 bg-red-50',
        text:    'text-red-700',
        sub:     'text-red-500',
      },
      {
        key:     'base' as const,
        label:   'Baz',
        data:    result.base,
        accent:  'border-gray-200 bg-white',
        text:    'text-gray-900',
        sub:     'text-gray-400',
      },
      {
        key:     'optimistic' as const,
        label:   'İyimser (+15%)',
        data:    result.optimistic,
        accent:  'border-emerald-200 bg-emerald-50',
        text:    'text-emerald-800',
        sub:     'text-emerald-600',
      },
    ] as const

    return (
      <div className="space-y-4 pt-4 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
            Stratejik P&amp;L Projeksiyonu (12 Ay)
          </span>
          <span className="text-[9px] text-gray-300">6 aylık ortalama gider + yıllık gelir bazında</span>
        </div>

        {/* 3-scenario summary cards */}
        <div className="grid grid-cols-3 gap-3">
          {SCENARIO_CFG.map(s => (
            <div key={s.key} className={`rounded border px-4 py-3.5 ${s.accent} ${s.key === result.recommended ? 'ring-2 ring-primary-400 ring-offset-1' : ''}`}>
              <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1">{s.label}</div>
              {result.recommended === s.key && (
                <div className="text-[8px] font-bold text-primary-600 mb-1.5 uppercase tracking-wide">★ Önerilen</div>
              )}
              <div className={`text-xl font-black tabular-nums leading-none ${s.text}`}>
                <span className="text-gray-300 text-sm font-normal mr-0.5">₺</span>
                {fmtK(Math.abs(s.data.total_net))}
                {s.data.total_net < 0 && <span className="text-sm ml-1 font-normal">(−)</span>}
              </div>
              <div className={`text-[10px] mt-1 ${s.sub}`}>12 ay net kâr</div>
              <div className="text-[10px] mt-1.5 text-gray-400">
                EBITDA: ₺{fmtK(s.data.total_ebitda)}
              </div>
              <div className="text-[10px] text-gray-400">
                Faiz: ₺{fmtK(s.data.total_interest)} · Vergi: ₺{fmtK(s.data.total_tax)}
              </div>
              {s.data.avg_dsr > 0 && (
                <div className={`text-[10px] font-semibold mt-1.5 ${s.data.avg_dsr > 0.5 ? 'text-red-600' : s.data.avg_dsr > 0.3 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  Ort. DSR: {pct(s.data.avg_dsr)}
                </div>
              )}
              {s.data.runway_end_month && (
                <div className="text-[10px] font-bold text-red-600 mt-1">
                  ⚠ {s.data.runway_end_month} tükeniyor
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Recommendation */}
        <div className="px-4 py-3 bg-primary-50 border border-primary-200 rounded text-xs text-primary-800">
          <span className="font-black uppercase tracking-wide text-[9px] text-primary-600 mr-2">Öneri</span>
          {result.recommendation_reason}
        </div>

        {/* Base scenario monthly P&L table (compact) */}
        <div className="bg-white border border-gray-100 rounded overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-50 text-[9px] font-black uppercase tracking-widest text-gray-400">
            Baz Senaryo — Aylık P&amp;L
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="bg-gray-50/60">
                  <th className="text-left px-4 py-2 font-black text-gray-400 whitespace-nowrap">Ay</th>
                  <th className="text-right px-3 py-2 font-black text-gray-400 whitespace-nowrap">Gelir</th>
                  <th className="text-right px-3 py-2 font-black text-gray-400 whitespace-nowrap">EBITDA</th>
                  <th className="text-right px-3 py-2 font-black text-gray-400 whitespace-nowrap">Faiz</th>
                  <th className="text-right px-3 py-2 font-black text-gray-400 whitespace-nowrap">Vergi</th>
                  <th className="text-right px-4 py-2 font-black text-gray-400 whitespace-nowrap">Net</th>
                  <th className="text-right px-4 py-2 font-black text-gray-400 whitespace-nowrap">DSR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {result.base.months.map((m, i) => (
                  <tr key={i} className="hover:bg-gray-50/40">
                    <td className="px-4 py-1.5 font-semibold text-gray-700 whitespace-nowrap">{m.label}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">₺{fmtK(m.revenue)}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${m.ebitda >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {m.ebitda >= 0 ? '' : '−'}₺{fmtK(Math.abs(m.ebitda))}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                      {m.interest > 0 ? `₺${fmtK(m.interest)}` : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                      {m.tax > 0 ? `₺${fmtK(m.tax)}` : '—'}
                    </td>
                    <td className={`px-4 py-1.5 text-right tabular-nums font-black ${m.net_income >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                      {m.net_income < 0 ? '−' : ''}₺{fmtK(Math.abs(m.net_income))}
                    </td>
                    <td className={`px-4 py-1.5 text-right tabular-nums text-[9px] font-semibold ${
                      m.dsr === 0 ? 'text-gray-300'
                      : m.dsr > 0.5 ? 'text-red-600'
                      : m.dsr > 0.3 ? 'text-amber-600'
                      : 'text-emerald-600'
                    }`}>
                      {m.dsr > 0 ? pct(m.dsr) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="text-[9px] text-gray-300 px-1">
          Son 6 ay ortalaması baz alındı · DSR = borç servisi / aylık gelir · İyimser +%15 / Kötümser −%20 gelir
        </div>
      </div>
    )
  } catch {
    return null  // non-fatal: silently skip if DB unavailable
  }
}

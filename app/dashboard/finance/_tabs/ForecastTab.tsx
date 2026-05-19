// ── ForecastTab — Runway Tahmin ve Senaryo ───────────────────────────────────
//
// Zones:
//   1. Runway summary (4 KPIs: months, burn, cash, exhaustion date)
//   2. 12-month bar chart
//   3. Monthly projection table
//   4. Scenario panel (client island)

import Link                                 from 'next/link'
import { NarrativeFooter }                 from '@/components/ds'
import { createClient }                    from '@/lib/supabase-server'
import { getCfoMetrics, getRunwayForecast } from '@/lib/finance/financial-core'
import { computeForecast, buildForecastInputs } from '@/lib/engines/forecast.engine'
import { ScenarioPanel }                    from '@/components/dashboard/ScenarioPanel'
import type { CfoMetrics }                  from '@/lib/finance/cfo-metrics'
import type { RunwayForecastResponse }      from '@/lib/finance/financial-core'
import type { ForecastResult }             from '@/lib/engines/forecast.engine'
import { fmtTRY as fmt }                   from '@/lib/format'
import { fmtCompact }                      from '@/lib/format'

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { userId: string; companyId: string }

export async function ForecastTab({ userId: _userId, companyId }: Props) {
  const now   = new Date()
  const today = now.toISOString().slice(0, 10)
  const year  = now.getFullYear()
  const month = now.getMonth() + 1  // 1-12
  const mon   = String(month).padStart(2, '0')
  const from  = `${year}-${mon}-01`
  const supabase = createClient()

  function sq<T>(fn: () => Promise<T>, fb: T): Promise<T> { return fn().catch(() => fb) }

  const ZERO_METRICS: CfoMetrics = {
    cash:        { true_cash_position: 0, operational_cash: 0, restricted_cash: 0, distributable_cash: 0 },
    burn:        { monthly_burn_rate: 0, runway_months: null, runway_days: null, cash_exhaustion_date: null },
    receivables: { total_outstanding: 0, overdue_30d: 0, overdue_60d: 0, overdue_90d: 0, collection_rate_pct: 100 },
    tax:         { kdv_net: 0, corporate_tax_estimate: 0, total_fiscal_obligation: 0 },
    partner:     { total_equity: 0, total_loans: 0, total_dividends: 0, company_owes: 0 },
    stock:       { fifo_value: 0, coverage_months: null },
  }
  const ZERO_RUNWAY: RunwayForecastResponse = {
    months: [], exhaustion_month: null, exhaustion_date: null, safe_months: 0,
    inputs: { starting_cash: 0, monthly_burn: 0, outstanding_total: 0, horizon_months: 12 },
  }

  // Trailing 6 months for 3-scenario forecast
  const trailingStart = new Date(year, month - 1 - 6, 1)
  const trailingFrom  = trailingStart.toISOString().slice(0, 10)
  const trailingEnd   = new Date(year, month - 1, 0)
  const trailingTo    = trailingEnd.toISOString().slice(0, 10)

  // Sequential: runway forecast needs the tax obligation from cfoMetrics to correctly
  // model the first-month cash outflow (corporate tax + KDV payable).
  const [metrics, salesTrailingRes, expTrailingRes] = await Promise.all([
    sq(() => getCfoMetrics(companyId, { from, to: today }), ZERO_METRICS),
    sq(async () => {
      const { data } = await supabase.from('sales').select('total_try:total, sale_date').eq('company_id', companyId).is('deleted_at', null).gte('sale_date', trailingFrom).lte('sale_date', trailingTo)
      return (data ?? []) as Array<{ total_try: number; sale_date: string | null }>
    }, [] as Array<{ total_try: number; sale_date: string | null }>),
    sq(async () => {
      const { data } = await supabase.from('expenses').select('amount_try, expense_date').eq('company_id', companyId).is('deleted_at', null).gte('expense_date', trailingFrom).lte('expense_date', trailingTo)
      return (data ?? []) as Array<{ amount_try: number; expense_date: string | null }>
    }, [] as Array<{ amount_try: number; expense_date: string | null }>),
  ])

  const runway  = await sq(
    () => getRunwayForecast(companyId, {
      from, to: today, months: 12,
      taxObligation: metrics.tax.total_fiscal_obligation,
    }),
    ZERO_RUNWAY,
  )

  // ── 3-scenario forecast ──────────────────────────────────────────────────────
  const revenueByMonth = new Map<string, number>()
  const expenseByMonth = new Map<string, number>()
  for (const r of salesTrailingRes) {
    const ym = (r.sale_date ?? '').slice(0, 7)
    if (ym) revenueByMonth.set(ym, (revenueByMonth.get(ym) ?? 0) + Number(r.total_try ?? 0))
  }
  for (const e of expTrailingRes) {
    const ym = (e.expense_date ?? '').slice(0, 7)
    if (ym) expenseByMonth.set(ym, (expenseByMonth.get(ym) ?? 0) + Number(e.amount_try ?? 0))
  }
  const trailing6: Array<{ revenue: number; expenses: number }> = []
  for (let i = 6; i >= 1; i--) {
    const d  = new Date(year, month - 1 - i, 1)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    trailing6.push({ revenue: revenueByMonth.get(ym) ?? 0, expenses: expenseByMonth.get(ym) ?? 0 })
  }
  // Monthly debt service from burn rate proxy (conservative: burn ≈ opex + debt service)
  const monthlyDebtService = 0  // no separate tranche query here; included in burn
  const nextMon = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  let forecast: ForecastResult | null = null
  try {
    const inputs = buildForecastInputs(trailing6, metrics.cash.true_cash_position, monthlyDebtService, nextYear, nextMon)
    forecast = computeForecast(inputs)
  } catch { /* graceful degradation */ }

  const m           = metrics
  const r           = runway
  const chartMonths = r.months.slice(0, 12)
  const maxCash     = Math.max(1, ...chartMonths.map(mo => Math.max(0, mo.end_cash)))
  const runwayMonths = m.burn.runway_months
  const runwayTone  = runwayMonths === null ? 'neutral'
    : runwayMonths <= 2 ? 'critical' : runwayMonths <= 6 ? 'warning' : 'positive'

  return (
    <div className="space-y-4">

      {/* Zone 1 — KPI strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          {
            label: 'Runway',
            value: runwayMonths !== null ? `${runwayMonths.toFixed(1)} ay` : '∞',
            tone:  runwayMonths === null ? 'text-[#94a3b8]' :
                   runwayMonths <= 2 ? 'text-neg' : runwayMonths <= 6 ? 'text-warn-text' : 'text-pos-text',
            sub:   runwayMonths !== null && runwayMonths <= 6 ? '⚠ Kritik eşik yakın' : 'Mevcut burn rate ile',
          },
          {
            label: 'Aylık Burn',
            value: m.burn.monthly_burn_rate > 0 ? fmt(m.burn.monthly_burn_rate) : '—',
            tone:  'text-[#0f172a]',
            sub:   '3 aylık ortalama gider',
          },
          {
            label: 'Mevcut Nakit',
            value: fmt(m.cash.true_cash_position),
            tone:  m.cash.true_cash_position > 0 ? 'text-pos-text' : 'text-neg',
            sub:   m.cash.distributable_cash > 0 ? `${fmt(m.cash.distributable_cash)} dağıtılabilir` : 'Yükümlülükler düşüldü',
          },
          {
            label: r.exhaustion_date ? 'Nakit Tükenme' : 'Projeksiyon',
            value: r.exhaustion_date
              ? new Date(r.exhaustion_date + 'T00:00:00Z').toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' })
              : '12 ay sağlıklı',
            tone:  r.exhaustion_date ? 'text-neg' : 'text-pos-text',
            sub:   r.exhaustion_month !== null ? `Ay ${r.exhaustion_month}'de tükenebilir` : 'Tehlike sinyali yok',
          },
        ].map(c => (
          <div key={c.label} className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm">
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{c.label}</div>
            <div className={`text-xl font-black tabular-nums leading-none ${c.tone}`}>{c.value}</div>
            <div className="text-[10px] text-[#94a3b8] mt-1">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Zone 2 — Bar chart */}
      {chartMonths.length > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded px-4 py-4 shadow-sm">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">12 Aylık Nakit Projeksiyonu</div>
          <div className="flex items-end gap-1.5 h-32">
            {chartMonths.map((mo) => {
              const barH     = maxCash > 0 ? Math.max(2, Math.round((Math.max(0, mo.end_cash) / maxCash) * 100)) : 0
              const isNeg    = mo.end_cash <= 0
              const isLow    = !isNeg && mo.end_cash < maxCash * 0.2
              const barColor = isNeg ? 'bg-neg' : isLow ? 'bg-warn' : 'bg-pos'
              return (
                <div key={mo.month} className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
                  <div className="w-full flex items-end justify-center" style={{ height: '120px' }}>
                    <div className={`w-full rounded-sm ${barColor} opacity-90`}
                      style={{ height: `${isNeg ? 4 : barH}%` }}
                      title={`${mo.month_label}: ${fmt(mo.end_cash)}`} />
                  </div>
                  <span className="text-[8px] text-[#94a3b8] font-medium truncate w-full text-center leading-none">
                    {mo.month_label.split(' ')[0]}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="flex items-center justify-between mt-2 text-[10px] text-[#94a3b8]">
            <span>Başlangıç: {fmt(r.inputs.starting_cash)}</span>
            <span>Burn: {fmt(r.inputs.monthly_burn)}/ay</span>
          </div>
        </div>
      )}

      {/* Zone 3 — Monthly table */}
      {chartMonths.length > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-[#e2e8f0]">
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Aylık Projeksiyon Detayı</div>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#f8fafc] border-b border-[#e2e8f0]">
                <th className="text-left px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Ay</th>
                <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-pos">Gelen</th>
                <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-neg">Giden</th>
                <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Net</th>
                <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-brand-light">Nakit Sonu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {chartMonths.map(mo => {
                const isNeg = mo.end_cash <= 0
                const net   = mo.cash_in - mo.cash_out
                return (
                  <tr key={mo.month} className={`hover:bg-[#f8fafc]/60 ${isNeg ? 'bg-neg-light/30' : ''}`}>
                    <td className="px-4 py-2.5 font-semibold text-[#334155]">{mo.month_label}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-pos-text tabular-nums">
                      {mo.cash_in > 0 ? fmt(mo.cash_in) : <span className="text-[#cbd5e1]">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-neg tabular-nums">
                      {mo.cash_out > 0 ? fmt(mo.cash_out) : <span className="text-[#cbd5e1]">—</span>}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono font-bold tabular-nums ${net >= 0 ? 'text-[#334155]' : 'text-neg'}`}>
                      {fmt(net)}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-black tabular-nums ${isNeg ? 'text-neg-text' : 'text-[#0f172a]'}`}>
                      {fmt(mo.end_cash)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Zone 3.5 — 3-Scenario Strategic Summary */}
      {forecast && (
        <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">12 Aylık Senaryo Analizi</div>
          <div className="grid grid-cols-3 gap-3">
            {([
              { key: 'pessimistic' as const, label: 'Muhafazakâr',  bg: 'bg-neg-light',     border: 'border-neg-light',    netColor: 'text-neg',    cashColor: 'text-neg-text'    },
              { key: 'base'        as const, label: 'Baz Senaryo',  bg: 'bg-[#f8fafc]',    border: 'border-[#e2e8f0]',   netColor: 'text-[#1e293b]',   cashColor: 'text-[#0f172a]'   },
              { key: 'optimistic'  as const, label: 'İyimser',       bg: 'bg-pos-light', border: 'border-pos-light',netColor: 'text-pos-text',cashColor: 'text-pos-text'},
            ] as const).map(sc => {
              const s = forecast!.summary[sc.key]
              return (
                <div key={sc.key} className={`rounded p-3 border ${sc.bg} ${sc.border}`}>
                  <div className="text-[10px] font-bold text-[#64748b] mb-2">{sc.label}</div>
                  <div className="space-y-1.5">
                    <div>
                      <div className="text-[9px] text-[#94a3b8] uppercase tracking-wide">12A Toplam Gelir</div>
                      <div className="text-sm font-black tabular-nums text-[#0f172a]">{fmtCompact(s.totalRevenue)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-[#94a3b8] uppercase tracking-wide">Net Kâr</div>
                      <div className={`text-sm font-black tabular-nums ${sc.netColor}`}>{fmtCompact(Math.abs(s.totalNet))}{s.totalNet < 0 ? ' (zarar)' : ''}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-[#94a3b8] uppercase tracking-wide">Dönem Sonu Nakit</div>
                      <div className={`text-sm font-black tabular-nums ${sc.cashColor}`}>{fmtCompact(Math.abs(s.endCash))}{s.endCash < 0 ? ' (—)' : ''}</div>
                    </div>
                    {s.runwayEndMonth && (
                      <div className="text-[9px] text-neg font-semibold mt-1">⚠ {s.runwayEndMonth}&apos;de nakit tükeniyor</div>
                    )}
                    {!s.runwayEndMonth && (
                      <div className="text-[9px] text-pos-text font-semibold mt-1">✓ 12 ay boyunca nakit pozitif</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-2 text-[10px] text-[#94a3b8]">
            Baz senaryo: son 6 ay ortalaması · İyimser: +%15 gelir büyümesi · Muhafazakâr: -%20 gelir baskısı
          </div>
        </div>
      )}

      {/* Zone 4 — Scenario panel */}
      <ScenarioPanel
        inputs={r.inputs}
        baseRunwayMonths={r.safe_months > 0 ? r.safe_months : null}
      />

      {/* Runway tone indicator */}
      {runwayTone === 'critical' && (
        <div className="bg-neg-light border border-neg-light rounded px-4 py-3 text-xs text-neg-text font-semibold">
          Kritik Runway — 2 aydan az nakit kaldı. Hemen aksiyon alın: yeni gelir getirin veya giderleri kısın.
        </div>
      )}

      {/* Cross-navigation */}
      <NarrativeFooter
        className="pt-1"
        narrative="Runway tahmin değil, mevcut burn rate'in doğal sonucudur — gelir artmadan veya gider düşmeden projeksiyon değişmez."
        links={[
          { label: 'Stratejik Tahmin', href: '/dashboard/planning?tab=cash-projection' },
          { label: 'Nakit Akışı',      href: '/dashboard/finance?tab=cashflow' },
          { label: 'Geçici Vergi',     href: '/dashboard/finance?tab=quarterly' },
        ]}
      />
    </div>
  )
}

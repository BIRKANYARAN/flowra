// ── SimulationContext — Canlı Finansal Bağlam Şeridi ─────────────────────────
//
// Server component — shows current financial state BEFORE the simulation.
// "Before you simulate, here's where you actually stand today."
//
// Fetched live from getCfoMetrics + FinanceService.
// Zero client JS — pure RSC.
//
// Zones:
//   Row 1 — 5 KPIs: Nakit · Burn · Runway · Alacak · KDV
//   Row 2 — Break-even analysis: how much revenue needed to cover burn

import { getCfoMetrics, getRunwayForecast } from '@/lib/finance/financial-core'
import type { CfoMetrics }             from '@/lib/finance/cfo-metrics'
import type { RunwayForecastResponse } from '@/lib/finance/financial-core'
import { fmtTRY as fmt } from '@/lib/format'

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

export async function SimulationContext({ companyId }: Props) {
  const now   = new Date()
  const today = now.toISOString().slice(0, 10)
  const year  = now.getFullYear()
  const mon   = String(now.getMonth() + 1).padStart(2, '0')
  const from  = `${year}-${mon}-01`

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

  const [metrics, runway] = await Promise.all([
    sq(() => getCfoMetrics(companyId, { from, to: today }), ZERO_METRICS),
    sq(() => getRunwayForecast(companyId, { months: 12 }), ZERO_RUNWAY),
  ])

  const m            = metrics
  const r            = runway
  const runwayMonths = m.burn.runway_months
  const burn         = m.burn.monthly_burn_rate

  // Break-even: monthly revenue needed to cover burn (assuming ~40% gross margin)
  // Break-even Revenue = Burn / Gross Margin Rate
  // We use a conservative 40% gross margin assumption if no data
  const assumedGrossMargin = 0.40
  const breakEvenRevenue   = burn > 0 ? burn / assumedGrossMargin : 0

  return (
    <div className="space-y-2">

      {/* ── Context header ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">
          Mevcut Finansal Durum
        </span>
        <span className="text-[9px] text-gray-300">·</span>
        <span className="text-[9px] text-gray-400">
          {new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
      </div>

      {/* ── KPI strip ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-2">
        {[
          {
            label: 'Nakit Pozisyon',
            value: fmt(m.cash.true_cash_position),
            sub:   m.cash.true_cash_position > 0 ? `${fmt(m.cash.distributable_cash)} dağıtılabilir` : 'Negatif bakiye ⚠',
            tone:  m.cash.true_cash_position > 0 ? 'emerald' : 'red',
          },
          {
            label: 'Aylık Burn',
            value: burn > 0 ? fmt(burn) : '—',
            sub:   burn > 0 ? '3 aylık ort. gider' : 'Henüz burn yok',
            tone:  'gray',
          },
          {
            label: 'Runway',
            value: runwayMonths !== null ? `${runwayMonths.toFixed(1)} ay` : '∞',
            sub:   runwayMonths === null ? 'Zarar yok' :
                   runwayMonths <= 2 ? '🔥 Kritik' :
                   runwayMonths <= 6 ? '⚠ Yakın takip' : 'Sağlıklı',
            tone:  runwayMonths === null ? 'emerald' :
                   runwayMonths <= 2 ? 'red' :
                   runwayMonths <= 6 ? 'amber' : 'emerald',
          },
          {
            label: 'Açık Alacak',
            value: fmt(m.receivables.total_outstanding),
            sub:   m.receivables.overdue_30d > 0
              ? `${fmt(m.receivables.overdue_30d)} gecikmiş`
              : 'Gecikme yok',
            tone:  m.receivables.overdue_30d > 0 ? 'amber' : 'gray',
          },
          {
            label: 'KDV Net',
            value: fmt(Math.abs(m.tax.kdv_net)),
            sub:   m.tax.kdv_net > 0 ? '⬆ Ödenecek' : m.tax.kdv_net < 0 ? '⬇ Devir' : 'Sıfır',
            tone:  m.tax.kdv_net > 0 ? 'orange' : 'gray',
          },
        ].map(kpi => {
          const colors: Record<string, string> = {
            emerald: 'text-emerald-700',
            red:     'text-red-600',
            amber:   'text-amber-700',
            orange:  'text-orange-700',
            gray:    'text-gray-900',
          }
          return (
            <div key={kpi.label}
              className="bg-white border border-gray-100 rounded-xl px-3 py-2.5 hover:border-gray-300 transition-colors">
              <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1">{kpi.label}</div>
              <div className={`text-base font-black tabular-nums leading-none ${colors[kpi.tone] ?? 'text-gray-900'}`}>
                {kpi.value}
              </div>
              <div className="text-[9px] text-gray-400 mt-0.5 leading-tight">{kpi.sub}</div>
            </div>
          )
        })}
      </div>

      {/* ── Break-even signal ─────────────────────────────────────────────── */}
      {burn > 0 && (
        <div className={`flex items-center justify-between gap-4 px-4 py-2.5 rounded-xl border text-xs ${
          m.cash.true_cash_position <= 0
            ? 'bg-red-50 border-red-200'
            : runwayMonths !== null && runwayMonths <= 6
            ? 'bg-amber-50 border-amber-200'
            : 'bg-gray-50 border-gray-100'
        }`}>
          <div className="flex items-center gap-3">
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">
              Başabaş Noktası
            </span>
            <span className="text-sm font-black text-gray-900 tabular-nums">
              {fmt(breakEvenRevenue)}/ay
            </span>
            <span className="text-[10px] text-gray-400">
              ({fmt(burn)} burn ÷ %{Math.round(assumedGrossMargin * 100)} brüt marj)
            </span>
          </div>
          <div className="flex items-center gap-2">
            {r.inputs.starting_cash > 0 && (
              <span className="text-[10px] text-gray-500">
                Başlangıç: {fmt(r.inputs.starting_cash)} nakit
              </span>
            )}
            {r.exhaustion_month !== null && (
              <span className="text-[10px] font-bold text-red-600">
                ⚠ Ay {r.exhaustion_month}&apos;de tükenme
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

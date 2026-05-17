// ── CashflowTab — Nakit Baskı Analizi + Runway Tahmin ────────────────────────
//
// Zones:
//   1 — Command strip (6 KPIs: cumulative, receivables, burn, runway, danger month, exhaustion)
//   2 — Cashflow chart (client component)
//   3 — Baskı haritası (pressure signals)
//   4 — 12-month projection bar chart + monthly table
//   5 — Scenario panel (client island)

import { CashflowChart }   from '@/components/dashboard/CashflowChart'
import { ScenarioPanel }   from '@/components/dashboard/ScenarioPanel'
import { getCashflowTimeline, getRunwayForecast, getCfoMetrics } from '@/lib/finance/financial-core'
import { fmtTRY as fmt }  from '@/lib/format'
import type { CfoMetrics } from '@/lib/finance/cfo-metrics'

function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const names  = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
  return `${names[m - 1] ?? ym} ${y}`
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { userId: string; companyId: string }

export async function CashflowTab({ userId: _userId, companyId }: Props) {
  function sq<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    return fn().catch(() => fallback)
  }

  const ZERO_RUNWAY = {
    months: [] as never[], exhaustion_month: null, exhaustion_date: null, safe_months: 0,
    inputs: { starting_cash: 0, monthly_burn: 0, outstanding_total: 0, horizon_months: 12 },
  }
  const ZERO_METRICS: CfoMetrics = {
    cash:        { true_cash_position: 0, operational_cash: 0, restricted_cash: 0, distributable_cash: 0 },
    burn:        { monthly_burn_rate: 0, runway_months: null, runway_days: null, cash_exhaustion_date: null },
    receivables: { total_outstanding: 0, overdue_30d: 0, overdue_60d: 0, overdue_90d: 0, collection_rate_pct: 100 },
    tax:         { kdv_net: 0, corporate_tax_estimate: 0, total_fiscal_obligation: 0 },
    partner:     { total_equity: 0, total_loans: 0, total_dividends: 0, company_owes: 0 },
    stock:       { fifo_value: 0, coverage_months: null },
  }

  const now   = new Date()
  const year  = now.getFullYear()
  const mon   = String(now.getMonth() + 1).padStart(2, '0')
  const from  = `${year}-${mon}-01`
  const today = now.toISOString().slice(0, 10)

  const [timeline, runway, metrics] = await Promise.all([
    sq(() => getCashflowTimeline(companyId, { pastMonths: 6, futureMonths: 6 }), {
      months: [], pressureSignals: [], firstDangerMonth: null, totalReceivables: 0,
    }),
    sq(() => getRunwayForecast(companyId, { months: 12 }), ZERO_RUNWAY),
    sq(() => getCfoMetrics(companyId, { from, to: today }), ZERO_METRICS),
  ])

  const lastMonth     = timeline.months[timeline.months.length - 1]
  const finalCumul    = lastMonth?.cumulative ?? 0
  const runwayMonths  = metrics.burn.runway_months
  const chartMonths   = runway.months.slice(0, 12)
  const maxCash       = Math.max(1, ...chartMonths.map(mo => Math.max(0, mo.end_cash)))

  return (
    <div className="space-y-4">

      {/* Zone 1 — Command strip (6 KPIs) */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {[
          {
            label: '12 Ay Kümülatif',
            value: fmt(finalCumul),
            tone: finalCumul >= 0 ? 'text-emerald-700' : 'text-red-600',
          },
          {
            label: 'Toplam Alacak',
            value: fmt(timeline.totalReceivables),
            tone: timeline.totalReceivables > 0 ? 'text-amber-600' : 'text-gray-400',
          },
          {
            label: 'Aylık Burn',
            value: metrics.burn.monthly_burn_rate > 0 ? fmt(metrics.burn.monthly_burn_rate) : '—',
            tone: 'text-gray-900',
          },
          {
            label: 'Runway',
            value: runwayMonths !== null ? `${runwayMonths.toFixed(1)} ay` : '∞',
            tone: runwayMonths === null ? 'text-gray-400' : runwayMonths <= 2 ? 'text-red-600' : runwayMonths <= 6 ? 'text-amber-600' : 'text-emerald-600',
          },
          {
            label: timeline.firstDangerMonth ? 'İlk Tehlike Ayı' : 'Nakit Durumu',
            value: timeline.firstDangerMonth ? fmtMonth(timeline.firstDangerMonth) : 'Sağlıklı ✓',
            tone: timeline.firstDangerMonth ? 'text-red-600' : 'text-emerald-700',
          },
          {
            label: runway.exhaustion_date ? 'Nakit Tükenme' : 'Projeksiyon',
            value: runway.exhaustion_date
              ? new Date(runway.exhaustion_date + 'T00:00:00Z').toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' })
              : '12 ay sağlıklı',
            tone: runway.exhaustion_date ? 'text-red-600' : 'text-emerald-700',
          },
        ].map(c => (
          <div key={c.label} className="bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">{c.label}</div>
            <div className={`text-xl font-black tabular-nums leading-none ${c.tone}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Danger alert */}
      {timeline.firstDangerMonth && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 font-semibold">
          🔴 {fmtMonth(timeline.firstDangerMonth)} ayında kümülatif nakit negatife düşüyor.
          Tahsilatlar hızlandırılmalı veya giderler kısılmalıdır.
        </div>
      )}

      {/* Zone 2 — Chart */}
      <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
        <CashflowChart className="w-full" />
      </div>

      {/* Zone 3 — Pressure timeline */}
      {timeline.pressureSignals.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black text-gray-800">Baskı Haritası</h2>
              <p className="text-[10px] text-gray-400 mt-0.5">Negatif nakit akışı veya kümülatif tehlike olan gelecek aylar</p>
            </div>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
              timeline.pressureSignals.some(s => s.severity === 'critical')
                ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {timeline.pressureSignals.filter(s => s.severity === 'critical').length} kritik ·{' '}
              {timeline.pressureSignals.filter(s => s.severity === 'warn').length} uyarı
            </span>
          </div>
          <div className="divide-y divide-gray-50">
            {timeline.pressureSignals.map(sig => {
              const isCritical = sig.severity === 'critical'
              return (
                <div key={sig.month} className={`px-4 py-3 flex items-start gap-3 ${isCritical ? 'bg-red-50/50' : 'bg-amber-50/30'}`}>
                  <div className={`mt-0.5 flex-shrink-0 w-2 h-2 rounded-full ${isCritical ? 'bg-red-500' : 'bg-amber-400'}`} />
                  <div>
                    <div className={`text-xs font-black ${isCritical ? 'text-red-700' : 'text-amber-700'}`}>
                      {fmtMonth(sig.month)}
                    </div>
                    <ul className="mt-0.5 space-y-0.5">
                      {sig.reasons.map((r, i) => (
                        <li key={i} className="text-[11px] text-gray-600">{r}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {timeline.pressureSignals.length === 0 && timeline.months.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700 font-semibold">
          ✓ Önümüzdeki 6 ayda nakit baskı sinyali tespit edilmedi.
        </div>
      )}

      {/* Zone 4 — 12-month projection bar chart */}
      {chartMonths.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl px-4 py-4 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">12 Aylık Nakit Projeksiyonu</div>
          <div className="flex items-end gap-1.5 h-32">
            {chartMonths.map((mo) => {
              const barH     = maxCash > 0 ? Math.max(2, Math.round((Math.max(0, mo.end_cash) / maxCash) * 100)) : 0
              const isNeg    = mo.end_cash <= 0
              const isLow    = !isNeg && mo.end_cash < maxCash * 0.2
              const barColor = isNeg ? 'bg-red-400' : isLow ? 'bg-amber-400' : 'bg-emerald-400'
              return (
                <div key={mo.month} className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
                  <div className="w-full flex items-end justify-center" style={{ height: '120px' }}>
                    <div className={`w-full rounded-sm ${barColor} opacity-90`}
                      style={{ height: `${isNeg ? 4 : barH}%` }}
                      title={`${mo.month_label}: ${fmt(mo.end_cash)}`} />
                  </div>
                  <span className="text-[8px] text-gray-400 font-medium truncate w-full text-center leading-none">
                    {mo.month_label.split(' ')[0]}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="flex items-center justify-between mt-2 text-[10px] text-gray-400">
            <span>Başlangıç: {fmt(runway.inputs.starting_cash)}</span>
            <span>Burn: {fmt(runway.inputs.monthly_burn)}/ay</span>
          </div>
        </div>
      )}

      {/* Zone 5 — Monthly projection table */}
      {chartMonths.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-black text-gray-800">Aylık Projeksiyon Detayı</h2>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Ay</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-emerald-400">Gelen</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-red-400">Giden</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Net</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-primary-400">Nakit Sonu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {chartMonths.map(mo => {
                const isNeg = mo.end_cash <= 0
                const net   = mo.cash_in - mo.cash_out
                return (
                  <tr key={mo.month} className={`hover:bg-gray-50/60 ${isNeg ? 'bg-red-50/30' : ''}`}>
                    <td className="px-4 py-2.5 font-semibold text-gray-700">{mo.month_label}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-emerald-700 tabular-nums">
                      {mo.cash_in > 0 ? fmt(mo.cash_in) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-red-600 tabular-nums">
                      {mo.cash_out > 0 ? fmt(mo.cash_out) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono font-bold tabular-nums ${net >= 0 ? 'text-gray-700' : 'text-red-600'}`}>
                      {fmt(net)}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-black tabular-nums ${isNeg ? 'text-red-700' : 'text-gray-900'}`}>
                      {fmt(mo.end_cash)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Zone 6 — Scenario panel */}
      <ScenarioPanel
        inputs={runway.inputs}
        baseRunwayMonths={runway.safe_months > 0 ? runway.safe_months : null}
      />
    </div>
  )
}

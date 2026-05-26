// ── CashflowTab — Nakit Baskı Analizi + Runway Tahmin ────────────────────────
//
// Zones:
//   1 — Command strip (6 KPIs: cumulative, receivables, burn, runway, danger month, exhaustion)
//   2 — Cashflow chart (client component)
//   3 — Baskı haritası (pressure signals)
//   4 — 12-month projection bar chart + monthly table
//   5 — Scenario panel (client island)

import Link              from 'next/link'
import { NarrativeFooter } from '@/components/ds'
import { CashflowChart }   from '@/components/dashboard/CashflowChart'
import { ScenarioPanel }   from '@/components/dashboard/ScenarioPanel'
import { CashflowPrediction } from '@/components/dashboard/CashflowPrediction'
import { BurnRateSection }    from '@/components/dashboard/BurnRateSection'
import { getCashflowTimeline, getRunwayForecast, getCfoMetrics } from '@/lib/finance/financial-core'
import { CashFlowStatementService } from '@/lib/services/cashflow-statement.service'
import { createClient }             from '@/lib/supabase-server'
import { fmtTRY as fmt, fmtMonthShort as fmtMonth } from '@/lib/format'
import type { CfoMetrics } from '@/lib/finance/cfo-metrics'
import type { CashFlowStatement } from '@/types/dto'

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { userId: string; companyId: string }

export async function CashflowTab({ userId, companyId }: Props) {
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
  const ZERO_CF: CashFlowStatement = {
    period: { from: '', to: '' },
    operating: { net_income_try: 0, receivables_change_try: 0, inventory_change_try: 0, payables_change_try: 0, other_adjustments: [], net_operating_try: 0 },
    investing: { equipment_purchases_try: 0, other: [], net_investing_try: 0 },
    financing: { partner_loans_received_try: 0, partner_loans_repaid_try: 0, dividends_paid_try: 0, capital_injected_try: 0, other: [], net_financing_try: 0 },
    net_change_try: 0, opening_balance_try: 0, closing_balance_try: 0,
  }

  const now   = new Date()
  const year  = now.getFullYear()
  const mon   = String(now.getMonth() + 1).padStart(2, '0')
  const from  = `${year}-${mon}-01`
  const today = now.toISOString().slice(0, 10)
  const supabase = createClient()

  const [timeline, runway, metrics, cashflowStatement] = await Promise.all([
    sq(() => getCashflowTimeline(companyId, { pastMonths: 6, futureMonths: 6 }), {
      months: [], pressureSignals: [], firstDangerMonth: null, totalReceivables: 0,
    }),
    sq(() => getRunwayForecast(companyId, { months: 12 }), ZERO_RUNWAY),
    sq(() => getCfoMetrics(companyId, { from, to: today }), ZERO_METRICS),
    sq(() => CashFlowStatementService.compute(userId, companyId, { from, to: today }, supabase), ZERO_CF),
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
            tone: finalCumul >= 0 ? 'text-pos-text' : 'text-neg',
          },
          {
            label: 'Toplam Alacak',
            value: fmt(timeline.totalReceivables),
            tone: timeline.totalReceivables > 0 ? 'text-warn-text' : 'text-[#94a3b8]',
          },
          {
            label: 'Aylık Burn',
            value: metrics.burn.monthly_burn_rate > 0 ? fmt(metrics.burn.monthly_burn_rate) : '—',
            tone: 'text-[#0f172a]',
          },
          {
            label: 'Runway',
            value: runwayMonths !== null ? `${runwayMonths.toFixed(1)} ay` : '∞',
            tone: runwayMonths === null ? 'text-[#94a3b8]' : runwayMonths <= 2 ? 'text-neg' : runwayMonths <= 6 ? 'text-warn-text' : 'text-pos-text',
          },
          {
            label: timeline.firstDangerMonth ? 'İlk Tehlike Ayı' : 'Nakit Durumu',
            value: timeline.firstDangerMonth ? fmtMonth(timeline.firstDangerMonth) : 'Sağlıklı ✓',
            tone: timeline.firstDangerMonth ? 'text-neg' : 'text-pos-text',
          },
          {
            label: runway.exhaustion_date ? 'Nakit Tükenme' : 'Projeksiyon',
            value: runway.exhaustion_date
              ? new Date(runway.exhaustion_date + 'T00:00:00Z').toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' })
              : '12 ay sağlıklı',
            tone: runway.exhaustion_date ? 'text-neg' : 'text-pos-text',
          },
        ].map(c => (
          <div key={c.label} className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm">
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{c.label}</div>
            <div className={`text-xl font-black tabular-nums leading-none ${c.tone}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Danger alert */}
      {timeline.firstDangerMonth && (
        <div className="bg-neg-light border border-neg-light rounded px-4 py-3 text-xs text-neg-text font-semibold">
          {fmtMonth(timeline.firstDangerMonth)} ayında kümülatif nakit negatife düşüyor.
          Tahsilatlar hızlandırılmalı veya giderler kısılmalıdır.
        </div>
      )}

      {/* Zone 2 — Chart */}
      <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
        <CashflowChart className="w-full" />
      </div>

      {/* Zone 3 — Pressure timeline */}
      {timeline.pressureSignals.length > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-[#e2e8f0] flex items-center justify-between">
            <div>
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Baskı Haritası</div>
              <p className="text-[10px] text-[#94a3b8] mt-0.5">Negatif nakit akışı veya kümülatif tehlike olan gelecek aylar</p>
            </div>
            <span className={`text-xs font-bold px-2.5 py-1 rounded ${
              timeline.pressureSignals.some(s => s.severity === 'critical')
                ? 'bg-neg-light text-neg-text' : 'bg-warn-light text-warn-text'
            }`}>
              {timeline.pressureSignals.filter(s => s.severity === 'critical').length} kritik ·{' '}
              {timeline.pressureSignals.filter(s => s.severity === 'warn').length} uyarı
            </span>
          </div>
          <div className="divide-y divide-[#f1f5f9]">
            {timeline.pressureSignals.map(sig => {
              const isCritical = sig.severity === 'critical'
              return (
                <div key={sig.month} className={`px-4 py-3 flex items-start gap-3 ${isCritical ? 'bg-neg-light/50' : 'bg-warn-light/30'}`}>
                  <div className={`mt-0.5 flex-shrink-0 w-2 h-2 rounded-full ${isCritical ? 'bg-neg-light' : 'bg-warn'}`} />
                  <div>
                    <div className={`text-xs font-black ${isCritical ? 'text-neg-text' : 'text-warn-text'}`}>
                      {fmtMonth(sig.month)}
                    </div>
                    <ul className="mt-0.5 space-y-0.5">
                      {sig.reasons.map((r, i) => (
                        <li key={i} className="text-[11px] text-[#64748b]">{r}</li>
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
        <div className="bg-pos-light border border-pos-light rounded px-4 py-3 text-xs text-pos-text font-semibold">
          Önümüzdeki 6 ayda nakit baskı sinyali tespit edilmedi.
        </div>
      )}

      {/* Zone 3.5 — 3-Section Cash Flow Statement Strip */}
      <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#e2e8f0]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Nakit Akış Tablosu (Dönem Özeti)</div>
              <p className="text-[10px] text-[#94a3b8] mt-0.5">
                {from} – {today} · Faaliyet / Yatırım / Finansman
              </p>
            </div>
            <span className={`text-xs font-bold px-2.5 py-1 rounded ${
              cashflowStatement.net_change_try >= 0
                ? 'bg-pos-light text-pos-text'
                : 'bg-neg-light text-neg-text'
            }`}>
              Net {fmt(cashflowStatement.net_change_try)}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-[#e2e8f0]">
          {[
            {
              key:    'operating',
              label:  'Faaliyet Nakiti',
              value:  cashflowStatement.operating.net_operating_try,
              sub:    'Tahsilat − Giderler',
              icon:   '🔄',
            },
            {
              key:    'investing',
              label:  'Yatırım Nakiti',
              value:  cashflowStatement.investing.net_investing_try,
              sub:    'Ekipman ve varlık alımları',
              icon:   '🏗️',
            },
            {
              key:    'financing',
              label:  'Finansman Nakiti',
              value:  cashflowStatement.financing.net_financing_try,
              sub:    'Ortak borç + sermaye + temettü',
              icon:   '🤝',
            },
          ].map(section => {
            const tone = section.value === 0
              ? 'text-[#94a3b8]'
              : section.value > 0
                ? 'text-pos-text'
                : 'text-neg'
            return (
              <div key={section.key} className="px-4 py-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-base">{section.icon}</span>
                  <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">{section.label}</span>
                </div>
                <div className={`text-lg font-black tabular-nums leading-none ${tone}`}>
                  {fmt(section.value)}
                </div>
                <div className="text-[10px] text-[#94a3b8] mt-0.5">{section.sub}</div>
              </div>
            )
          })}
        </div>
        {/* Financing detail if non-zero */}
        {(cashflowStatement.financing.partner_loans_received_try !== 0 ||
          cashflowStatement.financing.partner_loans_repaid_try !== 0 ||
          cashflowStatement.financing.capital_injected_try !== 0 ||
          cashflowStatement.financing.dividends_paid_try !== 0) && (
          <div className="border-t border-[#e2e8f0] px-4 py-2.5 flex flex-wrap gap-3">
            {cashflowStatement.financing.partner_loans_received_try > 0 && (
              <span className="text-[10px] text-pos-text font-semibold">
                + {fmt(cashflowStatement.financing.partner_loans_received_try)} ortak borç girişi
              </span>
            )}
            {cashflowStatement.financing.partner_loans_repaid_try !== 0 && (
              <span className="text-[10px] text-neg font-semibold">
                {fmt(cashflowStatement.financing.partner_loans_repaid_try)} borç geri ödeme
              </span>
            )}
            {cashflowStatement.financing.capital_injected_try > 0 && (
              <span className="text-[10px] text-pos-text font-semibold">
                + {fmt(cashflowStatement.financing.capital_injected_try)} sermaye girişi
              </span>
            )}
            {cashflowStatement.financing.dividends_paid_try !== 0 && (
              <span className="text-[10px] text-neg font-semibold">
                {fmt(cashflowStatement.financing.dividends_paid_try)} temettü ödemesi
              </span>
            )}
          </div>
        )}
      </div>

      {/* Zone 4 — 12-month projection bar chart */}
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
            <span>Başlangıç: {fmt(runway.inputs.starting_cash)}</span>
            <span>Burn: {fmt(runway.inputs.monthly_burn)}/ay</span>
          </div>
        </div>
      )}

      {/* Zone 5 — Monthly projection table */}
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

      {/* Zone 6 — Scenario panel */}
      <ScenarioPanel
        inputs={runway.inputs}
        baseRunwayMonths={runway.safe_months > 0 ? runway.safe_months : null}
      />

      {/* Zone 7 — Tahmin (30/60/90-day cash flow prediction) */}
      <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#e2e8f0]">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Tahmin — 30/60/90 Günlük Nakit Projeksiyonu</div>
          <p className="text-[10px] text-[#94a3b8] mt-0.5">
            Alacak davranışı + taahhütler temelinde iyimser / baz / kötümser senaryo analizi
          </p>
        </div>
        <div className="p-4">
          <CashflowPrediction />
        </div>
      </div>

      {/* Zone 8 — Nakit Tüketim Hızı (Burn Rate Monitor) */}
      <BurnRateSection />

      {/* Cross-link → formal 3-section cash flow statement */}
      <NarrativeFooter
        narrative="Nakit baskısı tahsilat gecikmesi ve gider seviyesinin kesişiminden kaynaklanır — bu iki faktörü ayrı ayrı yönetin."
        links={[
          { label: 'Tahsilat',           href: '/dashboard/commercial?tab=collections' },
          { label: 'Nakit Projeksiyonu', href: '/dashboard/planning?tab=cash-projection' },
          { label: 'Nakit Akış Tablosu', href: '/dashboard/reports/cash-flow' },
        ]}
      />
    </div>
  )
}

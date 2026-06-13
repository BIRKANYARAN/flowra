'use client'

// ── SimulationInsightsPanel — Zone 2: revenue chart + tax effect + partner impact ──
// Extracted from SimulationClient.tsx to reduce file size.

import Link from 'next/link'
import { fmtC, fmtMonth } from './types'
import type { ProjectionRow, YearlyTotals, SimEqResult } from './types'

interface SimulationInsightsPanelProps {
  hasInputs:        boolean
  projection:       ProjectionRow[]
  maxRevenue:       number
  toDisplay:        (tryVal: number) => number
  S:                string
  CORP_TAX_RATE:    number
  yearly:           YearlyTotals
  estimatedCorpTax: number
  netAfterCorpTax:  number
  partnerCount:     number
  partnerEq:        SimEqResult
}

export function SimulationInsightsPanel({
  hasInputs,
  projection,
  maxRevenue,
  toDisplay,
  S,
  CORP_TAX_RATE,
  yearly,
  estimatedCorpTax,
  netAfterCorpTax,
  partnerCount,
  partnerEq,
}: SimulationInsightsPanelProps) {
  return (
    <>
      {/* ── Revenue timeline chart (CSS bars) ────────────────────────────────── */}
      {hasInputs && (
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4 shadow-sm">
          <h2 className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-4">
            Gelir Çizelgesi — 12 Ay
          </h2>
          <div className="grid grid-cols-12 gap-1 items-end h-24">
            {projection.map(r => {
              const heightPct = maxRevenue > 0 ? Math.max(4, (r.revenue / maxRevenue) * 100) : 4
              const isProfit  = r.netProfit >= 0
              return (
                <div key={r.ym} className="flex flex-col items-center gap-1 group relative">
                  <div
                    className={`w-full rounded-t transition-all ${isProfit ? 'bg-pos group-hover:bg-pos-light' : 'bg-neg-light group-hover:bg-neg'}`}
                    style={{ height: `${heightPct}%` }}
                  />
                  <div className="text-[8px] text-[#94a3b8] font-semibold leading-none">
                    {fmtMonth(r.ym).slice(0, 3)}
                  </div>
                  {/* Tooltip on hover */}
                  <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 bg-[#0f172a] text-white rounded px-2 py-1 text-[10px] whitespace-nowrap">
                    <div className="font-bold">{fmtMonth(r.ym)}</div>
                    <div>Gelir: {fmtC(toDisplay(r.revenue), S)}</div>
                    <div className={r.netProfit >= 0 ? 'text-pos' : 'text-neg'}>
                      Net: {fmtC(toDisplay(r.netProfit), S)}
                    </div>
                    <div className={r.cumProfit >= 0 ? 'text-pos' : 'text-neg'}>
                      Kümülatif: {fmtC(toDisplay(r.cumProfit), S)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-4 mt-3 text-[10px] text-[#94a3b8]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-pos inline-block" /> Kârlı ay</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-neg-light inline-block" /> Zararlı ay</span>
            <span className="ml-auto">Sütun yüksekliği = aylık gelir oranı</span>
          </div>
        </div>
      )}

      {/* ── Tax effect ───────────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4 shadow-sm">
        <h2 className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-3">
          Vergi Etkisi — Yıllık Tahmin
        </h2>
        <div className="grid grid-cols-3 gap-4 mb-3">
          <div>
            <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-0.5">Net Kâr (Vergi Öncesi)</div>
            <div className={`text-lg font-bold tabular-nums ${!hasInputs ? 'text-[#cbd5e1]' : yearly.totalNetProfit >= 0 ? 'text-[#1e293b]' : 'text-neg'}`}>
              {hasInputs ? fmtC(toDisplay(yearly.totalNetProfit), S) : '—'}
            </div>
          </div>
          <div>
            <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-0.5">
              Kurumlar Vergisi (%{CORP_TAX_RATE})
            </div>
            <div className="text-lg font-bold tabular-nums text-warn">
              {estimatedCorpTax > 0 ? `−${fmtC(toDisplay(estimatedCorpTax), S)}` : '—'}
            </div>
            <div className="text-[10px] text-[#94a3b8] mt-0.5">Tahmini KV</div>
          </div>
          <div>
            <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-0.5">Vergi Sonrası Net</div>
            <div className={`text-lg font-bold tabular-nums ${!hasInputs ? 'text-[#cbd5e1]' : netAfterCorpTax >= 0 ? 'text-pos-text' : 'text-neg'}`}>
              {hasInputs ? fmtC(toDisplay(netAfterCorpTax), S) : '—'}
            </div>
            <div className="text-[10px] text-[#94a3b8] mt-0.5">Ortaklara dağıtılabilir</div>
          </div>
        </div>
        {hasInputs && yearly.totalNetProfit > 0 && (
          <>
            <div className="flex rounded-full h-1.5 overflow-hidden bg-[#f1f5f9]">
              <div className="bg-pos h-1.5" style={{ width: `${100 - CORP_TAX_RATE}%` }} />
              <div className="bg-warn-light h-1.5" style={{ width: `${CORP_TAX_RATE}%` }} />
            </div>
            <div className="flex justify-between mt-0.5">
              <span className="text-[10px] text-pos-text font-semibold">%{100 - CORP_TAX_RATE} size kalır</span>
              <span className="text-[10px] text-warn font-semibold">%{CORP_TAX_RATE} kurumlar vergisi</span>
            </div>
          </>
        )}
        {hasInputs && yearly.yearlyExpenses > 0 && (
          <div className="mt-2 pt-2 border-t border-[#e8eaef] text-[10px] text-[#94a3b8]">
            Gider matrahı {fmtC(toDisplay(yearly.yearlyExpenses), S)} vergiden düşürülmüştür.
            KDV ayrıca Analitik sayfasında gösterilir.
          </div>
        )}
      </div>

      {/* ── Partner impact ────────────────────────────────────────────────────── */}
      {partnerCount > 0 && yearly.totalNetProfit !== 0 && (
        <div className={`border rounded p-4 ${
          yearly.totalNetProfit > 0 ? 'bg-pos-light border-pos-light' : 'bg-neg-light border-neg-light'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-0.5">
                Ortak Dengesi Nasıl Etkilenir?
              </h2>
              <p className="text-xs text-[#64748b]">
                {yearly.totalNetProfit > 0
                  ? `Vergi sonrası ${fmtC(toDisplay(netAfterCorpTax), S)} dağıtılır`
                  : 'Zarar durumunda ortak dağıtımı yapılamaz'}
              </p>
            </div>
            <Link href="/dashboard/partners" className="text-xs text-brand-light font-semibold hover:underline shrink-0">
              Ortak sayfası →
            </Link>
          </div>

          {yearly.totalNetProfit > 0 && partnerEq.entries.length > 0 ? (
            <>
              <div className="grid gap-2 mb-2"
                style={{ gridTemplateColumns: `repeat(${Math.min(partnerEq.entries.length, 4)}, 1fr)` }}>
                {partnerEq.entries.map(e => (
                  <div key={e.partner_id} className="bg-white rounded px-3 py-2 text-center border border-pos-light">
                    <div className="text-xs text-[#64748b] font-semibold truncate mb-0.5">{e.partner_name}</div>
                    <div className="text-base font-bold tabular-nums text-pos-text">
                      {fmtC(toDisplay(e.total_payout), S)}
                    </div>
                    <div className="text-[10px] text-[#94a3b8] mt-0.5">%{(e.share_ratio * 100).toFixed(0)} pay</div>
                    {e.equalization_amount > 0.01 && (
                      <div className="text-[10px] text-warn-text font-semibold mt-0.5">
                        +{fmtC(toDisplay(e.equalization_amount), S)} eşitleme
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {partnerEq.total_equalization > 0.01 ? (
                <div className="text-xs text-warn-text bg-warn-light rounded px-3 py-2 border border-warn-light">
                  ⚖ Bu plan <span className="font-bold">{fmtC(toDisplay(partnerEq.total_equalization), S)}</span> eşitleme açığını kapatır.{' '}
                  {partnerEq.remaining_after_eq > 0.01
                    ? `Kalan ${fmtC(toDisplay(partnerEq.remaining_after_eq), S)} hisse oranına göre dağıtılır.`
                    : 'Tüm tutar eşitlemeye gider.'}
                </div>
              ) : (
                <div className="text-xs text-pos-text bg-pos-light rounded px-3 py-2 border border-pos-light">
                  ✓ Ortak dengesi sağlıklı — tüm dağıtım hisse oranına göre yapılır.
                </div>
              )}
            </>
          ) : yearly.totalNetProfit > 0 ? (
            <div className="text-xs text-[#94a3b8]">Yükleniyor...</div>
          ) : (
            <div className="text-xs text-neg-text bg-neg-light rounded px-3 py-2 border border-neg-light">
              ⚠ Zarar durumunda ortak dağıtımı yapılamaz. Parametreleri ayarlayarak kâra geçin.
            </div>
          )}
        </div>
      )}
    </>
  )
}

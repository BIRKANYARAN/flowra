'use client'

// ── SimulationPressureZone — Zone 4: pressure timeline + runway + debt burden ──
// Extracted from SimulationClient.tsx to reduce file size.

import { fmtC, fmtMonth } from './types'
import type { ProjectionRow, DebtBurdenResult, DebtStatusStyle } from './types'

interface SimulationPressureZoneProps {
  hasInputs:              boolean
  hasScenario:            boolean
  collectionDelayPct:     number
  extraDebtTRY:           number
  activeProjection:       ProjectionRow[]
  toDisplay:              (tryVal: number) => number
  S:                      string
  turnsPositiveMonth:     number | null
  stableFromMonth:        number | null
  adjustedOutstanding:    number
  adjustedMonthsToClear:  number | null
  monthlyDistributable:   number
  debtBurden:             DebtBurdenResult | null
  partnerCount:           number
  debtBurdenLoading:      boolean
  ds:                     DebtStatusStyle
}

export function SimulationPressureZone({
  hasInputs,
  hasScenario,
  collectionDelayPct,
  extraDebtTRY,
  activeProjection,
  toDisplay,
  S,
  turnsPositiveMonth,
  stableFromMonth,
  adjustedOutstanding,
  adjustedMonthsToClear,
  monthlyDistributable,
  debtBurden,
  partnerCount,
  debtBurdenLoading,
  ds,
}: SimulationPressureZoneProps) {
  return (
    <>
      {/* ── Pressure Timeline ─────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
            Finansal Baskı Zaman Çizelgesi — 12 Ay
          </h2>
          {hasScenario && (
            <span className="text-[10px] bg-warn-light text-warn-text border border-warn-light rounded px-2 py-0.5 font-bold">
              Senaryo aktif{collectionDelayPct > 0 ? ` · %${collectionDelayPct} gecikme` : ''}{extraDebtTRY > 0 ? ` · +${fmtC(extraDebtTRY, '₺')} borç` : ''}
            </span>
          )}
        </div>
        <div className="grid grid-cols-12 gap-1.5">
          {activeProjection.map(r => {
            const isKritik = r.cumProfit < 0
            const isDikkat = !isKritik && r.netProfit < 0
            const bg   = isKritik ? 'bg-neg-light border-neg-light'   : isDikkat ? 'bg-warn-light border-warn-light'   : 'bg-pos-light border-pos-light'
            const text = isKritik ? 'text-neg-text'                   : isDikkat ? 'text-warn-text'                    : 'text-pos-text'
            const lbl  = isKritik ? 'Kritik'                          : isDikkat ? 'Dikkat'                            : 'Güvenli'
            return (
              <div key={r.ym}
                className={`border rounded p-1.5 flex flex-col items-center gap-0.5 group relative cursor-default ${bg}`}>
                <div className={`text-[9px] font-bold leading-none ${text}`}>
                  {fmtMonth(r.ym).slice(0, 3)}
                </div>
                <div className={`text-[8px] font-semibold leading-none ${text} opacity-80`}>{lbl}</div>
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 bg-[#0f172a] text-white rounded px-2 py-1.5 text-[10px] whitespace-nowrap pointer-events-none">
                  <div className="font-bold mb-0.5">{fmtMonth(r.ym)}</div>
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
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-pos-light border border-pos inline-block" />
            Güvenli
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-warn-light border border-warn inline-block" />
            Dikkat
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-neg-light border border-neg inline-block" />
            Kritik
          </span>
          <span className="ml-auto text-[10px] text-[#cbd5e1]">Hover = detay</span>
        </div>
      </div>

      {/* ── Runway Forecast ───────────────────────────────────────────────────── */}
      {hasInputs && (
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4 shadow-sm">
          <h2 className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-3">
            Pist Tahmini — Güvenli Bölgeye Ne Zaman Ulaşılır?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-0.5">İlk Kümülatif Kâr</div>
              <div className={`text-xl font-bold tabular-nums ${turnsPositiveMonth ? 'text-pos-text' : 'text-neg'}`}>
                {turnsPositiveMonth ? `${turnsPositiveMonth}. Ay` : '12+ ay'}
              </div>
              <div className="text-[10px] text-[#94a3b8] mt-0.5">Kümülatif nakit pozitife geçer</div>
            </div>
            <div>
              <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-0.5">
                {adjustedOutstanding > 0 ? 'Borç Temizlenir' : 'Borç Durumu'}
              </div>
              <div className={`text-xl font-bold tabular-nums ${
                adjustedOutstanding <= 0 ? 'text-pos-text'
                : adjustedMonthsToClear === null ? 'text-neg'
                : adjustedMonthsToClear > 24 ? 'text-neg'
                : adjustedMonthsToClear > 12 ? 'text-warn-text'
                : 'text-pos-text'
              }`}>
                {adjustedOutstanding <= 0 ? 'Borç yok'
                  : adjustedMonthsToClear === null ? '∞'
                  : `${adjustedMonthsToClear} ay`}
              </div>
              <div className="text-[10px] text-[#94a3b8] mt-0.5">Dağıtım kapasitesine göre</div>
            </div>
            <div>
              <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-0.5">12 Ay Sonu Kümülatif</div>
              <div className={`text-xl font-bold tabular-nums ${(activeProjection[11]?.cumProfit ?? 0) >= 0 ? 'text-pos-text' : 'text-neg'}`}>
                {activeProjection[11] ? fmtC(toDisplay(activeProjection[11].cumProfit), S) : '—'}
              </div>
              <div className="text-[10px] text-[#94a3b8] mt-0.5">Yıl sonu kümülatif nakit</div>
            </div>
          </div>
          {stableFromMonth ? (
            <div className="mt-3 bg-pos-light border border-pos-light rounded px-3 py-2 text-xs text-pos-text font-semibold">
              ✓ {stableFromMonth}. aydan itibaren güvenli bölge — kümülatif nakit kalıcı olarak pozitif
            </div>
          ) : turnsPositiveMonth ? (
            <div className="mt-3 bg-warn-light border border-warn-light rounded px-3 py-2 text-xs text-warn-text font-semibold">
              ⚠ {turnsPositiveMonth}. ayda pozitife geçiyor ancak sonraki aylarda dalgalanma var
            </div>
          ) : (
            <div className="mt-3 bg-neg-light border border-neg-light rounded px-3 py-2 text-xs text-neg-text font-semibold">
              ✗ 12 ay içinde kümülatif pozitife geçilemiyor — parametreleri gözden geçirin
            </div>
          )}
        </div>
      )}

      {/* ── Debt burden tracking ──────────────────────────────────────────────── */}
      <div className={`border rounded p-4 ${ds.bg} ${ds.border}`}>
        <h2 className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-3">
          Borç Baskısı Takibi
        </h2>
        {debtBurdenLoading ? (
          <div className="text-xs text-[#94a3b8]">Yükleniyor...</div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3">
              <div>
                <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-0.5">
                  Toplam Borç{extraDebtTRY > 0 && <span className="text-warn ml-1">(+senaryo)</span>}
                </div>
                <div className="text-lg font-bold tabular-nums text-[#1e293b]">
                  {adjustedOutstanding > 0 ? fmtC(toDisplay(adjustedOutstanding), S) : '—'}
                </div>
                <div className="text-[10px] text-[#94a3b8]">
                  Ortaklara kalan{extraDebtTRY > 0 && ` · +${fmtC(toDisplay(extraDebtTRY), S)} senaryo`}
                </div>
              </div>
              <div>
                <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-0.5">Aylık Dağıtım Kapasitesi</div>
                <div className={`text-lg font-bold tabular-nums ${monthlyDistributable >= 0 ? 'text-pos-text' : 'text-neg'}`}>
                  {hasInputs ? fmtC(toDisplay(monthlyDistributable), S) : '—'}
                </div>
                <div className="text-[10px] text-[#94a3b8]">Vergi sonrası / 12</div>
              </div>
              <div>
                <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-0.5">Tahmini Temizlenme</div>
                <div className={`text-lg font-bold tabular-nums ${
                  adjustedMonthsToClear === null ? 'text-[#cbd5e1]'
                  : adjustedMonthsToClear > 24 ? 'text-neg'
                  : adjustedMonthsToClear > 12 ? 'text-warn-text'
                  : 'text-pos-text'
                }`}>
                  {adjustedOutstanding <= 0 ? '—'
                    : adjustedMonthsToClear === null ? '∞'
                    : `${adjustedMonthsToClear} ay`}
                </div>
                <div className="text-[10px] text-[#94a3b8]">Borç / aylık kapasite</div>
              </div>
              <div>
                <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-0.5">Ortak Sayısı</div>
                <div className="text-lg font-bold tabular-nums text-[#334155]">
                  {debtBurden?.summary.partner_count ?? partnerCount}
                </div>
                <div className="text-[10px] text-[#94a3b8]">Aktif ortak</div>
              </div>
            </div>
            <div className={`rounded px-3 py-2 border text-xs font-semibold ${ds.color} ${ds.bg} ${ds.border}`}>
              {ds.label}
            </div>
          </>
        )}
      </div>
    </>
  )
}

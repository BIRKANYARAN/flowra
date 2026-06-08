'use client'

// ── WaterfallTab — Visual waterfall debt allocation ───────────────────────────
//
// Shows:
//   1. Allocation bar — horizontal stacked segments (partner debt → remaining)
//   2. Summary strip — available / total debt / remaining (divide-x instrument)
//   3. Debt clearance projection
//   4. Allocation steps list (numbered waterfall)
//   5. Tranche detail table

import Link from 'next/link'
import { NarrativeFooter, Skeleton } from '@/components/ds'
import {
  WaterfallData,
  DebtTranche,
  PartnerRow,
  fmt,
} from '@/app/dashboard/partners/_components/types'
import { StatusPill } from '@/app/dashboard/partners/_components/ui'

export interface WaterfallTabProps {
  loading: boolean
  waterfall: WaterfallData | null
  totalDebt: number
  availCash: number
  partners: PartnerRow[]
  onCashChange: (v: number) => void
  onLoadWaterfall: (cash: number) => void
}

// ── Colour palette per partner index ─────────────────────────────────────────

// Partner discriminator palette — intentional multi-hue visualization set
// (SPEC exception: data visualization requires diverse distinguishable colors)
const PARTNER_COLORS = [
  'bg-brand-light',
  'bg-info',
  'bg-brand',
  'bg-fuchsia-500',
  'bg-sky-500',
  'bg-purple-500',
]

const PARTNER_COLORS_TEXT = [
  'text-brand',
  'text-info-text',
  'text-brand',
  'text-fuchsia-700',
  'text-sky-700',
  'text-purple-700',
]

const PARTNER_COLORS_BG_LIGHT = [
  'bg-brand-subtle',
  'bg-info-light',
  'bg-brand-subtle',
  'bg-fuchsia-50',
  'bg-sky-50',
  'bg-purple-50',
]

// ── Visual waterfall bar ──────────────────────────────────────────────────────

function AllocationBar({ waterfall, totalDebt }: { waterfall: WaterfallData; totalDebt: number }) {
  const { available_cash_try, tranches, remaining_after_debt } = waterfall
  const activeTranches = tranches.filter(t => t.principal_try > 0 && t.remaining_principal_try > 0)

  // Universe = max(available, totalDebt) for proportional display
  const universe = Math.max(available_cash_try, totalDebt, 1)

  // Compute how much of each tranche is actually covered by available cash
  const cashForDebt = Math.min(available_cash_try, totalDebt)
  let cashLeft = cashForDebt
  const segments: { tranche: DebtTranche; covered: number; idx: number }[] = []
  activeTranches.forEach((t, idx) => {
    const needed = t.remaining_principal_try
    const covered = Math.min(cashLeft, needed)
    cashLeft -= covered
    segments.push({ tranche: t, covered, idx })
  })

  const remainingPct = remaining_after_debt > 0 ? (remaining_after_debt / universe) * 100 : 0
  const shortfallPct = available_cash_try < totalDebt ? ((totalDebt - available_cash_try) / universe) * 100 : 0

  return (
    <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft px-4 py-3 shadow-sm">
      <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
        Nakit Dağılım Haritası
      </div>

      {/* The bar */}
      <div className="flex rounded-full overflow-hidden h-5 bg-[#f1f5f9] mb-4">
        {segments.map(({ tranche: t, covered, idx }) => {
          const pct = (covered / universe) * 100
          if (pct < 0.5) return null
          return (
            <div
              key={t.id}
              className={`${PARTNER_COLORS[idx % PARTNER_COLORS.length]} flex-shrink-0 transition-all`}
              style={{ width: `${pct}%` }}
              title={`${t.partner_name}: ${fmt(covered)}`}
            />
          )
        })}
        {remainingPct > 0 && (
          <div
            className="bg-pos-light flex-shrink-0"
            style={{ width: `${remainingPct}%` }}
            title={`Dağıtılabilir: ${fmt(remaining_after_debt)}`}
          />
        )}
        {shortfallPct > 0 && (
          <div
            className="bg-neg-light flex-shrink-0"
            style={{ width: `${shortfallPct}%` }}
            title={`Karşılanamayan borç: ${fmt(totalDebt - available_cash_try)}`}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {segments.map(({ tranche: t, covered, idx }) => (
          <div key={t.id} className="flex items-center gap-1.5 text-[10px]">
            <div className={`w-2.5 h-2.5 rounded-sm ${PARTNER_COLORS[idx % PARTNER_COLORS.length]}`} />
            <span className="text-[#64748b]">{t.partner_name}</span>
            <span className={`font-bold tabular-nums ${PARTNER_COLORS_TEXT[idx % PARTNER_COLORS_TEXT.length]}`}>
              {fmt(covered)}
            </span>
          </div>
        ))}
        {remaining_after_debt > 0 && (
          <div className="flex items-center gap-1.5 text-[10px]">
            <div className="w-2.5 h-2.5 rounded-sm bg-pos-light" />
            <span className="text-[#64748b]">Dağıtılabilir</span>
            <span className="font-bold tabular-nums text-pos-text">{fmt(remaining_after_debt)}</span>
          </div>
        )}
        {available_cash_try < totalDebt && (
          <div className="flex items-center gap-1.5 text-[10px]">
            <div className="w-2.5 h-2.5 rounded-sm bg-neg-light" />
            <span className="text-[#64748b]">Karşılanamayan</span>
            <span className="font-bold tabular-nums text-neg">{fmt(totalDebt - available_cash_try)}</span>
          </div>
        )}
      </div>

      {/* Per-partner mini bars */}
      {activeTranches.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-[#f1f5f9] pt-4">
          {activeTranches.map((t, idx) => {
            const share = totalDebt > 0 ? t.remaining_principal_try / totalDebt : 0
            const isCovered = available_cash_try >= t.remaining_principal_try
            return (
              <div key={t.id}>
                <div className="flex items-center justify-between text-[11px] mb-0.5">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-4 rounded-sm ${PARTNER_COLORS[idx % PARTNER_COLORS.length]} flex-shrink-0`} />
                    <span className="font-semibold text-[#334155]">{t.partner_name}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                      isCovered
                        ? 'bg-pos-light text-pos-text'
                        : 'bg-warn-light text-warn-text'
                    }`}>
                      {isCovered ? 'Nakit yeterli' : 'Kısmi'}
                    </span>
                  </div>
                  <span className={`font-black tabular-nums ${PARTNER_COLORS_TEXT[idx % PARTNER_COLORS_TEXT.length]}`}>
                    {fmt(t.remaining_principal_try)}
                    <span className="text-[#94a3b8] font-medium"> · %{(share * 100).toFixed(0)}</span>
                  </span>
                </div>
                <div className="bg-[#f1f5f9] rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`${PARTNER_COLORS[idx % PARTNER_COLORS.length]} h-full rounded-full`}
                    style={{ width: `${share * 100}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WaterfallTab({
  loading,
  waterfall,
  totalDebt,
  partners,
}: WaterfallTabProps) {
  return (
    <div className="flex flex-col gap-4">
      {loading ? <Skeleton height="h-32" /> : !waterfall ? (
        <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-4 py-6 text-center text-xs text-[#94a3b8]">
          Waterfall verisi yüklenemedi.
        </div>
      ) : (
        <>
          {/* ── Instrument strip ───────────────────────────────────────────── */}
          <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden shadow-sm">
            <div className="grid grid-cols-3 divide-x divide-[#e2e8f0]">
              <div className="px-4 py-3">
                <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Mevcut Nakit</div>
                <div className="text-xl font-black tabular-nums text-[#0f172a]">
                  {fmt(waterfall.available_cash_try)}
                </div>
              </div>
              <div className="px-4 py-3">
                <div className="text-[9px] font-black uppercase tracking-widest text-warn mb-1">Toplam Ortak Borcu</div>
                <div className={`text-xl font-black tabular-nums ${totalDebt > 0 ? 'text-warn-text' : 'text-[#94a3b8]'}`}>
                  {fmt(totalDebt)}
                </div>
                {totalDebt > 0 && waterfall.available_cash_try > 0 && (
                  <div className="text-[9px] text-[#94a3b8] mt-0.5">
                    {waterfall.available_cash_try >= totalDebt
                      ? '✓ Nakit karşılıyor'
                      : `%${Math.round((waterfall.available_cash_try / totalDebt) * 100)} karşılanıyor`
                    }
                  </div>
                )}
              </div>
              <div className="px-4 py-3">
                <div className={`text-[9px] font-black uppercase tracking-widest mb-1 ${
                  waterfall.remaining_after_debt >= 0 ? 'text-pos-text' : 'text-neg'
                }`}>Borç Sonrası Kalan</div>
                <div className={`text-xl font-black tabular-nums ${
                  waterfall.remaining_after_debt >= 0 ? 'text-pos-text' : 'text-neg'
                }`}>
                  {fmt(waterfall.remaining_after_debt)}
                </div>
                {waterfall.remaining_after_debt > 0 && (
                  <div className="text-[9px] text-pos-text mt-0.5">Temettüye hazır</div>
                )}
              </div>
            </div>
          </div>

          {/* ── Loan Positions + Pro-Rata Summary ─────────────────────────── */}
          {totalDebt > 0 && waterfall.tranches.length > 0 && (() => {
            // Build per-partner position data merging waterfall tranches with partner share ratios
            const partnerMap = new Map(partners.map(p => [p.id, p]))
            const positions = waterfall.tranches
              .filter(t => t.principal_try > 0)
              .map(t => {
                const p           = partnerMap.get(t.partner_id)
                const shareRatio  = p?.share_ratio ?? 0
                const expectedLoan = totalDebt * shareRatio
                const excess      = t.remaining_principal_try - expectedLoan
                return { t, shareRatio, expectedLoan, excess }
              })

            // "Normalleşme Durumu": balanced if all |burden_pct| within ±5%
            const allBalanced = positions.every(pos => {
              const burdenPct = totalDebt > 0 ? Math.abs(pos.excess / totalDebt) * 100 : 0
              return burdenPct <= 5
            })

            // Phase 1/2 simulation driven by the real distributable cash entered by the user
            const SIM_PAYMENT = waterfall.available_cash_try
            const overfinanced = positions.filter(pos => pos.excess > 0.005)
            const totalExcess  = overfinanced.reduce((s, pos) => s + pos.excess, 0)
            const phase1Allocs = positions.map(pos => {
              if (pos.excess <= 0.005) return { ...pos, phase1: 0, phase2: 0 }
              const phase1 = totalExcess > 0
                ? (SIM_PAYMENT >= totalExcess
                  ? Math.min(pos.excess, SIM_PAYMENT)
                  : (pos.excess / totalExcess) * SIM_PAYMENT)
                : 0
              return { ...pos, phase1: Math.round(phase1 * 100) / 100, phase2: 0 }
            })
            const cashAfterPhase1   = Math.max(0, SIM_PAYMENT - totalExcess)
            const phase2Allocs = phase1Allocs.map(pos => {
              const phase2 = cashAfterPhase1 > 0 ? cashAfterPhase1 * pos.shareRatio : 0
              return { ...pos, phase2: Math.round(phase2 * 100) / 100 }
            })

            return (
              <>
                {/* Normalization badge */}
                <div className={`flex items-center gap-3 rounded px-4 py-2.5 border text-xs ${
                  allBalanced
                    ? 'bg-pos-light border-pos-light text-pos-text'
                    : 'bg-warn-light border-warn-light text-warn-text'
                }`}>
                  <span className="font-black text-sm">{allBalanced ? '✓' : '⚠'}</span>
                  <div>
                    <span className="font-bold">Normalleşme Durumu: </span>
                    <span className="font-black">{allBalanced ? 'Dengeli' : 'Dengesiz'}</span>
                    <span className="ml-1 opacity-70">
                      {allBalanced
                        ? '— Tüm ortaklar pay oranına göre ±%5 içinde.'
                        : '— Bazı ortakların borç yükü pay oranından sapıyor.'}
                    </span>
                  </div>
                </div>

                {/* Loan positions table */}
                <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden shadow-sm">
                  <div className="px-4 py-2.5 border-b border-[#e2e8f0] bg-[#f8fafc]/60">
                    <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Ortak Borç Pozisyonları</div>
                    <div className="text-[10px] text-[#94a3b8] mt-0.5">Mevcut borç · Beklenen pro-rata · Fazla/Eksik</div>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]/40">
                        {['Ortak', 'Pay %', 'Net Borç', 'Beklenen', 'Fark'].map(h => (
                          <th key={h} className={`px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8] ${h === 'Ortak' ? 'text-left' : 'text-right'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f1f5f9]">
                      {positions.map(({ t, shareRatio, expectedLoan, excess }) => (
                        <tr key={t.id} className="hover:bg-[#f8fafc]/60">
                          <td className="px-4 py-2.5 font-semibold text-[#0f172a]">{t.partner_name}</td>
                          <td className="px-4 py-2.5 text-right text-[#64748b]">%{(shareRatio * 100).toFixed(0)}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-warn-text">{fmt(t.remaining_principal_try)}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-[#64748b]">{fmt(expectedLoan)}</td>
                          <td className={`px-4 py-2.5 text-right font-mono font-bold ${excess > 0 ? 'text-neg-text' : excess < -100 ? 'text-pos-text' : 'text-[#94a3b8]'}`}>
                            {excess > 100 ? '+' : ''}{fmt(excess)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Phase 1 & 2 simulation driven by the real distributable cash */}
                <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden shadow-sm">
                  <div className="px-4 py-2.5 border-b border-[#e2e8f0] bg-[#f8fafc]/60">
                    <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Ödeme Simülasyonu — {fmt(waterfall.available_cash_try)} dağıtım</div>
                    <div className="text-[10px] text-[#94a3b8] mt-0.5">Faz 1: Aşırı yük normalizasyonu · Faz 2: Pay oranına göre pro-rata</div>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]/40">
                        {['Ortak', 'Faz 1 (Normalizasyon)', 'Faz 2 (Pro-Rata)', 'Toplam'].map(h => (
                          <th key={h} className={`px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8] ${h === 'Ortak' ? 'text-left' : 'text-right'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f1f5f9]">
                      {phase2Allocs.map(pos => (
                        <tr key={pos.t.id} className="hover:bg-[#f8fafc]/60">
                          <td className="px-4 py-2.5 font-semibold text-[#0f172a]">{pos.t.partner_name}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-brand">
                            {pos.phase1 > 0 ? fmt(pos.phase1) : <span className="text-[#94a3b8]">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-info-text">
                            {pos.phase2 > 0 ? fmt(pos.phase2) : <span className="text-[#94a3b8]">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-[#0f172a]">
                            {fmt(pos.phase1 + pos.phase2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )
          })()}

          {/* ── Clearance projection ───────────────────────────────────────── */}
          {waterfall.debt_clearance_months != null && totalDebt > 0 && (
            <div className={`rounded px-4 py-3 text-xs flex items-center justify-between ${
              waterfall.debt_clearance_months <= 3  ? 'bg-pos-light border border-pos-light text-pos-text' :
              waterfall.debt_clearance_months <= 12 ? 'bg-warn-light border border-warn-light text-warn-text' :
              'bg-neg-light border border-neg-light text-neg-text'
            }`}>
              <span>
                <span className="font-bold">Borç kapanma tahmini: </span>
                Mevcut nakit oranında yaklaşık{' '}
                <span className="font-black">{waterfall.debt_clearance_months} ay</span>
                {waterfall.debt_clearance_months > 12 && ' — borç yükü kritik seviyede.'}
              </span>
              <span className="text-[10px] font-black opacity-60">
                {waterfall.debt_clearance_months <= 3 ? '✓' : waterfall.debt_clearance_months <= 12 ? '⚠' : '!'}
              </span>
            </div>
          )}

          {totalDebt === 0 && (
            <div className="bg-pos-light border border-pos-light rounded px-4 py-4 text-xs text-pos-text font-semibold text-center">
              ✓ Tüm ortak borçları kapatılmış. Nakit dağıtıma hazır.
            </div>
          )}

          {/* ── Visual allocation bar ──────────────────────────────────────── */}
          {totalDebt > 0 && (
            <AllocationBar waterfall={waterfall} totalDebt={totalDebt} />
          )}

          {/* ── Allocation steps ───────────────────────────────────────────── */}
          {waterfall.steps.length > 0 && (
            <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden shadow-sm">
              <div className="px-4 py-2.5 border-b border-[#e2e8f0] bg-[#f8fafc]/60">
                <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Öncelik Sırası</div>
                <div className="text-[10px] text-[#94a3b8] mt-0.5">Normalleştirilmiş iki aşamalı waterfall</div>
              </div>
              <div className="divide-y divide-[#f1f5f9]">
                {waterfall.steps.map((step, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-[#f1f5f9] text-[#64748b] text-[10px] font-black flex items-center justify-center shrink-0">
                        {i + 1}
                      </div>
                      <div className="text-xs font-semibold text-[#1e293b]">{step.description}</div>
                    </div>
                    <div className="text-xs font-black tabular-nums text-brand">{fmt(step.allocated_try)}</div>
                  </div>
                ))}
                {waterfall.remaining_after_debt > 0 && (
                  <div className="flex items-center justify-between px-4 py-3 bg-pos-light/60">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-pos-light text-pos-text text-[10px] font-black flex items-center justify-center shrink-0">
                        {waterfall.steps.length + 1}
                      </div>
                      <div className="text-xs font-semibold text-pos-text">Dağıtılabilir nakit (temettü için)</div>
                    </div>
                    <div className="text-xs font-black tabular-nums text-pos-text">{fmt(waterfall.remaining_after_debt)}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Tranche positions table ────────────────────────────────────── */}
          {waterfall.tranches.filter(t => t.principal_try > 0).length > 0 && (
            <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden shadow-sm">
              <div className="px-4 py-2.5 border-b border-[#e2e8f0] bg-[#f8fafc]/60 flex items-center justify-between">
                <div>
                  <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Borç Pozisyonları</div>
                  <div className="text-[10px] text-[#94a3b8] mt-0.5">{waterfall.tranches.filter(t => t.principal_try > 0).length} aktif borç dilimi</div>
                </div>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]/40">
                    {['Ortak','Toplam Borç','Ödenen','Kalan','Açık Gün','Durum'].map(h => (
                      <th key={h} className={`px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8] ${h === 'Ortak' ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {waterfall.tranches.filter(t => t.principal_try > 0).map((t, idx) => {
                    const repaidPct = t.principal_try > 0 ? (t.actual_repaid_try / t.principal_try) * 100 : 0
                    return (
                      <tr key={t.id} className="hover:bg-[#f8fafc]/60">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-1.5 h-4 rounded-sm ${PARTNER_COLORS[idx % PARTNER_COLORS.length]}`} />
                            <span className="font-semibold text-[#0f172a]">{t.partner_name}</span>
                          </div>
                          {/* Mini progress bar */}
                          <div className="ml-3.5 mt-1 bg-[#f1f5f9] rounded-full h-1 w-24 overflow-hidden">
                            <div
                              className={`${PARTNER_COLORS[idx % PARTNER_COLORS.length]} h-full rounded-full`}
                              style={{ width: `${Math.min(100, repaidPct)}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-[#334155]">{fmt(t.principal_try)}</td>
                        <td className="px-4 py-3 text-right font-mono text-pos-text">{fmt(t.actual_repaid_try)}</td>
                        <td className={`px-4 py-3 text-right font-mono font-bold ${t.remaining_principal_try > 0 ? 'text-warn-text' : 'text-[#94a3b8]'}`}>
                          {fmt(t.remaining_principal_try)}
                        </td>
                        <td className="px-4 py-3 text-right text-[#64748b]">{t.days_outstanding}g</td>
                        <td className="px-4 py-3 text-right"><StatusPill status={t.status} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {waterfall.steps.length === 0 && totalDebt === 0 && (
            <p className="text-xs text-center text-[#94a3b8]">Geri ödeme adımı yok — borç mevcut değil.</p>
          )}
        </>
      )}

      {/* Cross-navigation */}
      <NarrativeFooter
        className="pt-2"
        narrative="Geri ödeme planı nakit akışı ve borç baskısıyla birlikte değerlendirilmeli."
        links={[
          { label: 'Borç Baskısı', href: '/dashboard/planning?tab=debt-pressure' },
          { label: 'Nakit Akışı',  href: '/dashboard/finance?tab=cashflow' },
          { label: 'Bilanço',      href: '/dashboard/finance?tab=balance' },
        ]}
      />
    </div>
  )
}

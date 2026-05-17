'use client'

// ── WaterfallTab — Visual waterfall debt allocation ───────────────────────────
//
// Shows:
//   1. Allocation bar — horizontal stacked segments (partner debt → remaining)
//   2. Summary strip — available / total debt / remaining (divide-x instrument)
//   3. Debt clearance projection
//   4. Allocation steps list (numbered waterfall)
//   5. Tranche detail table

import {
  WaterfallData,
  DebtTranche,
  fmt,
} from '@/app/dashboard/partners/_components/types'
import { Skeleton, StatusPill } from '@/app/dashboard/partners/_components/ui'

export interface WaterfallTabProps {
  loading: boolean
  waterfall: WaterfallData | null
  totalDebt: number
  availCash: number
  onCashChange: (v: number) => void
  onLoadWaterfall: (cash: number) => void
}

// ── Colour palette per partner index ─────────────────────────────────────────

const PARTNER_COLORS = [
  'bg-violet-500',
  'bg-blue-500',
  'bg-indigo-500',
  'bg-fuchsia-500',
  'bg-sky-500',
  'bg-purple-500',
]

const PARTNER_COLORS_TEXT = [
  'text-violet-700',
  'text-blue-700',
  'text-indigo-700',
  'text-fuchsia-700',
  'text-sky-700',
  'text-purple-700',
]

const PARTNER_COLORS_BG_LIGHT = [
  'bg-violet-50',
  'bg-blue-50',
  'bg-indigo-50',
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
    <div className="bg-white border border-gray-100 rounded-xl px-5 py-4 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
      <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">
        Nakit Dağılım Haritası
      </div>

      {/* The bar */}
      <div className="flex rounded-full overflow-hidden h-5 bg-gray-100 mb-4">
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
            className="bg-emerald-500 flex-shrink-0"
            style={{ width: `${remainingPct}%` }}
            title={`Dağıtılabilir: ${fmt(remaining_after_debt)}`}
          />
        )}
        {shortfallPct > 0 && (
          <div
            className="bg-red-200 flex-shrink-0"
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
            <span className="text-gray-500">{t.partner_name}</span>
            <span className={`font-bold tabular-nums ${PARTNER_COLORS_TEXT[idx % PARTNER_COLORS_TEXT.length]}`}>
              {fmt(covered)}
            </span>
          </div>
        ))}
        {remaining_after_debt > 0 && (
          <div className="flex items-center gap-1.5 text-[10px]">
            <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
            <span className="text-gray-500">Dağıtılabilir</span>
            <span className="font-bold tabular-nums text-emerald-700">{fmt(remaining_after_debt)}</span>
          </div>
        )}
        {available_cash_try < totalDebt && (
          <div className="flex items-center gap-1.5 text-[10px]">
            <div className="w-2.5 h-2.5 rounded-sm bg-red-300" />
            <span className="text-gray-500">Karşılanamayan</span>
            <span className="font-bold tabular-nums text-red-600">{fmt(totalDebt - available_cash_try)}</span>
          </div>
        )}
      </div>

      {/* Per-partner mini bars */}
      {activeTranches.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-gray-50 pt-4">
          {activeTranches.map((t, idx) => {
            const share = totalDebt > 0 ? t.remaining_principal_try / totalDebt : 0
            const isCovered = available_cash_try >= t.remaining_principal_try
            return (
              <div key={t.id}>
                <div className="flex items-center justify-between text-[11px] mb-0.5">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-4 rounded-sm ${PARTNER_COLORS[idx % PARTNER_COLORS.length]} flex-shrink-0`} />
                    <span className="font-semibold text-gray-700">{t.partner_name}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                      isCovered
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {isCovered ? 'Nakit yeterli' : 'Kısmi'}
                    </span>
                  </div>
                  <span className={`font-black tabular-nums ${PARTNER_COLORS_TEXT[idx % PARTNER_COLORS_TEXT.length]}`}>
                    {fmt(t.remaining_principal_try)}
                    <span className="text-gray-400 font-medium"> · %{(share * 100).toFixed(0)}</span>
                  </span>
                </div>
                <div className="bg-gray-100 rounded-full h-1.5 overflow-hidden">
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
}: WaterfallTabProps) {
  return (
    <div className="flex flex-col gap-4">
      {loading ? <Skeleton h="h-32" /> : !waterfall ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-6 text-center text-sm text-gray-400">
          Waterfall verisi yüklenemedi.
        </div>
      ) : (
        <>
          {/* ── Instrument strip ───────────────────────────────────────────── */}
          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
            <div className="grid grid-cols-3 divide-x divide-gray-100">
              <div className="px-5 py-3.5">
                <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1">Mevcut Nakit</div>
                <div className="text-xl font-black tabular-nums text-gray-900">
                  {fmt(waterfall.available_cash_try)}
                </div>
              </div>
              <div className="px-5 py-3.5">
                <div className="text-[9px] font-black uppercase tracking-widest text-amber-500 mb-1">Toplam Ortak Borcu</div>
                <div className={`text-xl font-black tabular-nums ${totalDebt > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                  {fmt(totalDebt)}
                </div>
                {totalDebt > 0 && waterfall.available_cash_try > 0 && (
                  <div className="text-[9px] text-gray-400 mt-0.5">
                    {waterfall.available_cash_try >= totalDebt
                      ? '✓ Nakit karşılıyor'
                      : `%${Math.round((waterfall.available_cash_try / totalDebt) * 100)} karşılanıyor`
                    }
                  </div>
                )}
              </div>
              <div className="px-5 py-3.5">
                <div className={`text-[9px] font-black uppercase tracking-widest mb-1 ${
                  waterfall.remaining_after_debt >= 0 ? 'text-emerald-600' : 'text-red-500'
                }`}>Borç Sonrası Kalan</div>
                <div className={`text-xl font-black tabular-nums ${
                  waterfall.remaining_after_debt >= 0 ? 'text-emerald-700' : 'text-red-600'
                }`}>
                  {fmt(waterfall.remaining_after_debt)}
                </div>
                {waterfall.remaining_after_debt > 0 && (
                  <div className="text-[9px] text-emerald-600 mt-0.5">Temettüye hazır</div>
                )}
              </div>
            </div>
          </div>

          {/* ── Clearance projection ───────────────────────────────────────── */}
          {waterfall.debt_clearance_months != null && totalDebt > 0 && (
            <div className={`rounded-xl px-4 py-3 text-xs flex items-center justify-between ${
              waterfall.debt_clearance_months <= 3  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' :
              waterfall.debt_clearance_months <= 12 ? 'bg-amber-50 border border-amber-200 text-amber-800' :
              'bg-red-50 border border-red-200 text-red-800'
            }`}>
              <span>
                <span className="font-bold">Borç kapanma tahmini: </span>
                Mevcut nakit oranında yaklaşık{' '}
                <span className="font-black">{waterfall.debt_clearance_months} ay</span>
                {waterfall.debt_clearance_months > 12 && ' — borç yükü kritik seviyede.'}
              </span>
              <span className="text-[10px] font-black opacity-60">
                {waterfall.debt_clearance_months <= 3 ? '✓' : waterfall.debt_clearance_months <= 12 ? '⚠' : '⚡'}
              </span>
            </div>
          )}

          {totalDebt === 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-4 text-sm text-emerald-800 font-semibold text-center">
              ✓ Tüm ortak borçları kapatılmış. Nakit dağıtıma hazır.
            </div>
          )}

          {/* ── Visual allocation bar ──────────────────────────────────────── */}
          {totalDebt > 0 && (
            <AllocationBar waterfall={waterfall} totalDebt={totalDebt} />
          )}

          {/* ── Allocation steps ───────────────────────────────────────────── */}
          {waterfall.steps.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
              <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
                <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Öncelik Sırası</div>
                <div className="text-[10px] text-gray-400 mt-0.5">Normalleştirilmiş iki aşamalı waterfall</div>
              </div>
              <div className="divide-y divide-gray-50">
                {waterfall.steps.map((step, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-[10px] font-black flex items-center justify-center shrink-0">
                        {i + 1}
                      </div>
                      <div className="text-xs font-semibold text-gray-800">{step.description}</div>
                    </div>
                    <div className="text-sm font-black tabular-nums text-primary-700">{fmt(step.allocated_try)}</div>
                  </div>
                ))}
                {waterfall.remaining_after_debt > 0 && (
                  <div className="flex items-center justify-between px-4 py-3 bg-emerald-50/60">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black flex items-center justify-center shrink-0">
                        {waterfall.steps.length + 1}
                      </div>
                      <div className="text-xs font-semibold text-emerald-800">Dağıtılabilir nakit (temettü için)</div>
                    </div>
                    <div className="text-sm font-black tabular-nums text-emerald-700">{fmt(waterfall.remaining_after_debt)}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Tranche positions table ────────────────────────────────────── */}
          {waterfall.tranches.filter(t => t.principal_try > 0).length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
              <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Borç Pozisyonları</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{waterfall.tranches.filter(t => t.principal_try > 0).length} aktif tranche</div>
                </div>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/40">
                    {['Ortak','Toplam Borç','Ödenen','Kalan','Açık Gün','Durum'].map(h => (
                      <th key={h} className={`px-4 py-2 text-[9px] font-black uppercase tracking-widest text-gray-400 ${h === 'Ortak' ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {waterfall.tranches.filter(t => t.principal_try > 0).map((t, idx) => {
                    const repaidPct = t.principal_try > 0 ? (t.actual_repaid_try / t.principal_try) * 100 : 0
                    return (
                      <tr key={t.id} className="hover:bg-gray-50/60">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-1.5 h-4 rounded-sm ${PARTNER_COLORS[idx % PARTNER_COLORS.length]}`} />
                            <span className="font-semibold text-gray-900">{t.partner_name}</span>
                          </div>
                          {/* Mini progress bar */}
                          <div className="ml-3.5 mt-1 bg-gray-100 rounded-full h-1 w-24 overflow-hidden">
                            <div
                              className={`${PARTNER_COLORS[idx % PARTNER_COLORS.length]} h-full rounded-full`}
                              style={{ width: `${Math.min(100, repaidPct)}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-700">{fmt(t.principal_try)}</td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-600">{fmt(t.actual_repaid_try)}</td>
                        <td className={`px-4 py-3 text-right font-mono font-bold ${t.remaining_principal_try > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                          {fmt(t.remaining_principal_try)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">{t.days_outstanding}g</td>
                        <td className="px-4 py-3 text-right"><StatusPill status={t.status} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {waterfall.steps.length === 0 && totalDebt === 0 && (
            <p className="text-xs text-center text-gray-400">Geri ödeme adımı yok — borç mevcut değil.</p>
          )}
        </>
      )}
    </div>
  )
}

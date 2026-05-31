'use client'

// ─────────────────────────────────────────────────────────────────────────────
// app/dashboard/partners/_tabs/WaterfallTab.tsx
//
// WATERFALL SİMÜLATÖRÜ — İki Fazlı Normalleştirilmiş Geri Ödeme
//
// Interactive simulator. Real company partners (share + outstanding loan) are
// loaded from /api/partners; the user enters a hypothetical distributable cash
// amount and the two-phase repayment is computed client-side with the existing
// pure PCLE helpers. No fabricated partner data.
//
// Layout:
//   1. Cash input + Hesapla button
//   2. Faz 1 — Normalleşme table
//   3. Faz 2 — Pro-Rata table
//   4. Özet table
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  computeExcessLoan,
  computeProRataAllocation,
  normalizeShareRatios,
} from '@/lib/services/pcle/pcle.liability'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SimPartner {
  id: string
  name: string
  share_pct: number   // 0-100
  loan: number        // outstanding loan in TRY
}

interface Phase1Row {
  partner: SimPartner
  fairShare: number
  excess: number
  phase1Payment: number
}

interface Phase2Row {
  partner: SimPartner
  remainingAfterPhase1: number
  normalizedRatio: number
  phase2Payment: number
}

interface SummaryRow {
  partner: SimPartner
  phase1Payment: number
  phase2Payment: number
  totalPayment: number
  remainingBalance: number
}

interface SimResult {
  phase1Rows: Phase1Row[]
  phase2Rows: Phase2Row[]
  summaryRows: SummaryRow[]
  totalNormalization: number
  cashAfterPhase1: number
  totalPhase2: number
  cashForDividend: number
  totalLoans: number
}

// ── Real partner source (/api/partners) ──────────────────────────────────────

interface ApiPartner {
  id:          string
  name:        string
  share_ratio: number                       // 0–1
  balance:     { net_loan_try: number } | null
}

/**
 * Map real partners onto the simulator's SimPartner shape.
 * share_pct = share_ratio × 100; loan = outstanding net loan (clamped ≥ 0).
 * Field re-mapping only — no new calculations.
 */
function toSimPartners(partners: ApiPartner[]): SimPartner[] {
  return partners.map(p => ({
    id:        p.id,
    name:      p.name,
    share_pct: (Number(p.share_ratio) || 0) * 100,
    loan:      Math.max(0, p.balance?.net_loan_try ?? 0),
  }))
}

// ── Pure simulation ───────────────────────────────────────────────────────────

function runSimulation(availableCash: number, partners: SimPartner[]): SimResult {
  const totalLoans = partners.reduce((s, p) => s + p.loan, 0)

  // Phase 1 — Normalization
  const phase1Rows: Phase1Row[] = partners.map(p => {
    const fairShare = totalLoans * p.share_pct / 100
    const excess    = computeExcessLoan(p.loan, totalLoans, p.share_pct)
    return { partner: p, fairShare, excess, phase1Payment: 0 }
  })

  const overfinanced      = phase1Rows.filter(r => r.excess > 0.005)
  const totalExcess       = overfinanced.reduce((s, r) => s + r.excess, 0)
  let cashAfterPhase1     = availableCash

  if (overfinanced.length > 0 && totalExcess > 0) {
    if (availableCash >= totalExcess) {
      // Full excess repayment
      for (const row of overfinanced) {
        row.phase1Payment = Math.min(row.excess, row.partner.loan)
      }
      cashAfterPhase1 = availableCash - totalExcess
    } else {
      // Proportional excess repayment
      for (const row of overfinanced) {
        const proportion    = row.excess / totalExcess
        row.phase1Payment   = Math.min(availableCash * proportion, row.partner.loan)
      }
      cashAfterPhase1 = 0
    }
  }

  const totalNormalization = phase1Rows.reduce((s, r) => s + r.phase1Payment, 0)

  // Build remaining balances after Phase 1
  const remainingAfterP1 = new Map<string, number>(
    partners.map(p => {
      const row     = phase1Rows.find(r => r.partner.id === p.id)!
      const remaining = Math.max(0, p.loan - row.phase1Payment)
      return [p.id, remaining]
    })
  )

  // Phase 2 — Pro-rata (iterative, cap-aware)
  const normalizedRatios = normalizeShareRatios(
    partners.map(p => ({ share_pct: p.share_pct, loan: remainingAfterP1.get(p.id) ?? 0 }))
  )

  // Working copies for iteration
  const p2Allocated = new Map<string, number>(partners.map(p => [p.id, 0]))
  const p2Remaining = new Map<string, number>(
    partners.map((p, i) => [p.id, remainingAfterP1.get(p.id) ?? 0])
  )

  const ratioByIndex = new Map<string, number>(
    partners.map((p, i) => [p.id, normalizedRatios[i]])
  )

  let cash = cashAfterPhase1
  const activeSet = new Set(
    partners
      .filter(p => (p2Remaining.get(p.id) ?? 0) > 0.005)
      .map(p => p.id)
  )

  let iterations = 0
  while (cash > 0.005 && activeSet.size > 0) {
    iterations++
    if (iterations > 50) break

    const totalActiveRatio = [...activeSet].reduce(
      (s, id) => s + (ratioByIndex.get(id) ?? 0),
      0,
    )
    if (totalActiveRatio <= 0) break

    let allocatedThisRound = 0
    for (const id of [...activeSet]) {
      const partnerLoan = p2Remaining.get(id) ?? 0
      const ratio       = ratioByIndex.get(id) ?? 0
      const alloc       = computeProRataAllocation(partnerLoan, ratio, totalActiveRatio, cash)

      if (alloc <= 0) {
        activeSet.delete(id)
        continue
      }

      p2Allocated.set(id, (p2Allocated.get(id) ?? 0) + alloc)
      p2Remaining.set(id, Math.max(0, partnerLoan - alloc))
      allocatedThisRound += alloc

      if ((p2Remaining.get(id) ?? 0) <= 0.005) {
        activeSet.delete(id)
      }
    }

    cash -= allocatedThisRound
    if (allocatedThisRound < 0.005) break
  }

  const totalPhase2 = [...p2Allocated.values()].reduce((s, v) => s + v, 0)
  const cashForDividend = Math.max(0, cashAfterPhase1 - totalPhase2)

  const phase2Rows: Phase2Row[] = partners.map((p, i) => ({
    partner:              p,
    remainingAfterPhase1: remainingAfterP1.get(p.id) ?? 0,
    normalizedRatio:      normalizedRatios[i],
    phase2Payment:        p2Allocated.get(p.id) ?? 0,
  }))

  const summaryRows: SummaryRow[] = partners.map(p => {
    const p1 = phase1Rows.find(r => r.partner.id === p.id)!.phase1Payment
    const p2 = p2Allocated.get(p.id) ?? 0
    return {
      partner:          p,
      phase1Payment:    p1,
      phase2Payment:    p2,
      totalPayment:     p1 + p2,
      remainingBalance: Math.max(0, p.loan - p1 - p2),
    }
  })

  return {
    phase1Rows,
    phase2Rows,
    summaryRows,
    totalNormalization,
    cashAfterPhase1,
    totalPhase2,
    cashForDividend,
    totalLoans,
  }
}

// ── Formatting ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `₺${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000)    return `₺${(n / 1_000).toFixed(1)}K`
  return `₺${n.toFixed(0)}`
}

function fmtFull(n: number): string {
  return `₺${Math.round(n).toLocaleString('tr-TR')}`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="px-4 py-2.5 border-b border-[#e2e8f0] bg-[#f8fafc]/60">
      <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">{title}</div>
      {subtitle && <div className="text-[10px] text-[#94a3b8] mt-0.5">{subtitle}</div>}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function WaterfallSimulatorTab() {
  const [inputCash, setInputCash]     = useState<string>('1000000')
  const [result, setResult]           = useState<SimResult | null>(null)
  const [lastCash, setLastCash]       = useState<number | null>(null)

  // Real partners (share + outstanding loan) from /api/partners
  const partnersQuery = useQuery({
    queryKey: ['partners'],
    queryFn:  () => fetch('/api/partners').then(r => {
      if (!r.ok) throw new Error('partners')
      return r.json() as Promise<ApiPartner[]>
    }),
  })
  const partners = toSimPartners(partnersQuery.data ?? [])
  const hasPartners = partners.length > 0

  const handleCalculate = useCallback(() => {
    const cash = parseFloat(inputCash.replace(/[^\d.]/g, ''))
    if (isNaN(cash) || cash < 0 || partners.length === 0) return
    const sim = runSimulation(cash, partners)
    setResult(sim)
    setLastCash(cash)
  }, [inputCash, partners])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleCalculate()
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#e2e8f0] bg-[#f8fafc]/60">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            WATERFALL SİMÜLATÖRÜ — İki Fazlı Normalleştirilmiş Geri Ödeme
          </div>
          <div className="text-[10px] text-[#94a3b8] mt-0.5">
            Faz 1: Aşırı finansman düzeltmesi · Faz 2: Pay oranında pro-rata dağıtım
          </div>
        </div>

        {/* Partner overview (real) */}
        <div className="px-4 py-3 border-b border-[#e2e8f0]">
          <div className="text-[10px] font-semibold text-[#64748b] mb-2">Ortaklar</div>
          {partnersQuery.isLoading ? (
            <div className="flex gap-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-7 w-28 bg-[#f1f5f9] rounded animate-pulse" />)}
            </div>
          ) : !hasPartners ? (
            <div className="text-xs text-[#94a3b8]">
              Kayıtlı ortak bulunamadı — simülasyon için önce Ortaklar sekmesinden ortak ekleyin.
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {partners.map(p => (
                <div key={p.id} className="flex items-center gap-2 text-xs bg-[#f8fafc] rounded px-3 py-1.5 border border-[#e2e8f0]">
                  <span className="font-bold text-[#0f172a]">{p.name}</span>
                  <span className="text-[#94a3b8]">%{p.share_pct.toFixed(1)}</span>
                  <span className={`font-mono font-bold ${p.loan > 0 ? 'text-warn-text' : 'text-[#94a3b8]'}`}>
                    {p.loan > 0 ? fmt(p.loan) : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cash input */}
        <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
          <label className="text-xs font-bold text-[#334155] shrink-0">
            Dağıtılabilir Nakit
          </label>
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type="text"
                value={inputCash}
                onChange={e => setInputCash(e.target.value)}
                onKeyDown={handleKeyDown}
                className="border border-[#e2e8f0] rounded px-3 py-1.5 text-xs font-mono w-44 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand/20"
                placeholder="1000000"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-[#94a3b8] pointer-events-none">₺</span>
            </div>
            <button
              onClick={handleCalculate}
              disabled={!hasPartners}
              className="bg-brand text-white text-xs font-bold px-4 py-1.5 rounded hover:bg-brand/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Hesapla
            </button>
            {lastCash !== null && (
              <span className="text-[10px] text-[#94a3b8]">
                Son hesaplama: {fmtFull(lastCash)}
              </span>
            )}
          </div>
        </div>
      </div>

      {result && (
        <>
          {/* ── Phase 1 — Normalization ──────────────────────────────────────── */}
          <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
            <SectionHeader
              title="FAZ 1 — Normalleşme (Aşırı Finansman Düzeltmesi)"
              subtitle="Fazla borç yükü taşıyan ortaklar öncelikli geri ödeme alır"
            />
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]/40">
                  {['Ortak', 'Bakiye', 'Fair Share (%' + 'pay)', 'Fazla/Eksik', 'Faz 1 Ödeme'].map(h => (
                    <th
                      key={h}
                      className={`px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8] ${
                        h === 'Ortak' ? 'text-left' : 'text-right'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {result.phase1Rows.map(row => (
                  <tr key={row.partner.id} className="hover:bg-[#f8fafc]/60">
                    <td className="px-4 py-2.5 font-semibold text-[#0f172a]">
                      {row.partner.name}
                      <span className="ml-1.5 text-[9px] font-normal text-[#94a3b8]">%{row.partner.share_pct}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-warn-text">
                      {row.partner.loan > 0 ? fmt(row.partner.loan) : <span className="text-[#94a3b8]">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[#64748b]">
                      {fmt(row.fairShare)}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono font-bold ${
                      row.excess > 0.005
                        ? 'text-neg-text'
                        : row.excess < -0.005
                        ? 'text-pos-text'
                        : 'text-[#94a3b8]'
                    }`}>
                      {Math.abs(row.excess) < 0.005
                        ? '—'
                        : `${row.excess > 0 ? '+' : ''}${fmt(row.excess)}`}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-brand">
                      {row.phase1Payment > 0.005 ? fmt(row.phase1Payment) : <span className="text-[#94a3b8]">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[#e2e8f0] bg-[#f8fafc]/60">
                  <td colSpan={4} className="px-4 py-2.5 text-xs text-[#64748b] font-semibold">
                    Toplam normalleşme: {fmtFull(result.totalNormalization)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs font-black text-[#0f172a]">
                    Kalan: {fmtFull(result.cashAfterPhase1)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ── Phase 2 — Pro-Rata ──────────────────────────────────────────── */}
          <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
            <SectionHeader
              title="FAZ 2 — Pro-Rata Dağıtım (Hisse Oranında)"
              subtitle="Kalan nakit aktif borçlulara normalize edilmiş pay oranında dağıtılır"
            />
            {result.cashAfterPhase1 < 0.005 ? (
              <div className="px-4 py-4 text-xs text-[#94a3b8] text-center">
                Faz 1 nakit tüm normalleşmeyi karşıladı — Faz 2 için kalan nakit yok.
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]/40">
                    {['Ortak', 'Kalan Bakiye', 'Norm. Hisse', 'Faz 2 Ödeme'].map(h => (
                      <th
                        key={h}
                        className={`px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8] ${
                          h === 'Ortak' ? 'text-left' : 'text-right'
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {result.phase2Rows.map(row => (
                    <tr key={row.partner.id} className="hover:bg-[#f8fafc]/60">
                      <td className="px-4 py-2.5 font-semibold text-[#0f172a]">
                        {row.partner.name}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-warn-text font-bold">
                        {row.remainingAfterPhase1 > 0.005
                          ? fmt(row.remainingAfterPhase1)
                          : <span className="text-[#94a3b8]">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-[#64748b]">
                        {row.normalizedRatio > 0
                          ? `%${(row.normalizedRatio * 100).toFixed(1)}`
                          : <span className="text-[#94a3b8]">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-info-text">
                        {row.phase2Payment > 0.005
                          ? fmt(row.phase2Payment)
                          : <span className="text-[#94a3b8]">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#e2e8f0] bg-[#f8fafc]/60">
                    <td colSpan={3} className="px-4 py-2.5 text-xs text-[#64748b] font-semibold">
                      Toplam Faz 2: {fmtFull(result.totalPhase2)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs font-black text-pos-text">
                      Temettü için kalan: {fmtFull(result.cashForDividend)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* ── Summary ─────────────────────────────────────────────────────── */}
          <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
            <SectionHeader
              title="ÖZET — Her Ortak İçin Toplam Geri Ödeme + Kalan Bakiye"
              subtitle="Faz 1 + Faz 2 toplamı ve ödeme sonrası kalan borç"
            />
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]/40">
                  {['Ortak', 'Başlangıç Borcu', 'Faz 1', 'Faz 2', 'Toplam Ödeme', 'Kalan Bakiye'].map(h => (
                    <th
                      key={h}
                      className={`px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8] ${
                        h === 'Ortak' ? 'text-left' : 'text-right'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {result.summaryRows.map(row => {
                  const repaidPct = row.partner.loan > 0
                    ? (row.totalPayment / row.partner.loan) * 100
                    : 0
                  return (
                    <tr key={row.partner.id} className="hover:bg-[#f8fafc]/60">
                      <td className="px-4 py-3 font-semibold text-[#0f172a]">
                        <div>{row.partner.name}</div>
                        {row.partner.loan > 0 && (
                          <div className="mt-1 w-24 bg-[#f1f5f9] rounded-full h-1 overflow-hidden">
                            <div
                              className="bg-brand h-full rounded-full"
                              style={{ width: `${Math.min(100, repaidPct)}%` }}
                            />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[#64748b]">
                        {row.partner.loan > 0 ? fmt(row.partner.loan) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-brand">
                        {row.phase1Payment > 0.005 ? fmt(row.phase1Payment) : <span className="text-[#94a3b8]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-info-text">
                        {row.phase2Payment > 0.005 ? fmt(row.phase2Payment) : <span className="text-[#94a3b8]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-black text-[#0f172a]">
                        {row.totalPayment > 0.005 ? fmt(row.totalPayment) : <span className="text-[#94a3b8]">—</span>}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-bold ${
                        row.remainingBalance > 0.005 ? 'text-warn-text' : 'text-pos-text'
                      }`}>
                        {row.remainingBalance > 0.005 ? fmt(row.remainingBalance) : '✓ Kapatıldı'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[#e2e8f0] bg-[#f8fafc]/60">
                  <td className="px-4 py-2.5 text-xs font-black text-[#334155]">Toplam</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-[#64748b]">
                    {fmt(result.totalLoans)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-brand">
                    {fmt(result.totalNormalization)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-info-text">
                    {fmt(result.totalPhase2)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-black text-[#0f172a]">
                    {fmt(result.totalNormalization + result.totalPhase2)}
                  </td>
                  <td className={`px-4 py-2.5 text-right font-mono font-bold ${
                    result.cashForDividend > 0.005 ? 'text-pos-text' : 'text-[#94a3b8]'
                  }`}>
                    {result.cashForDividend > 0.005
                      ? `${fmt(result.cashForDividend)} temettüye hazır`
                      : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ── Clearance note ────────────────────────────────────────────────── */}
          {result.cashForDividend > 0 ? (
            <div className="bg-pos-light border border-pos-light rounded px-4 py-3 text-xs text-pos-text font-semibold">
              ✓ Borç ödemeleri tamamlandı. {fmtFull(result.cashForDividend)} temettü dağıtımı için kullanılabilir.
            </div>
          ) : (
            <div className="bg-warn-light border border-warn-light rounded px-4 py-3 text-xs text-warn-text font-semibold">
              ⚠ Nakit tüm ortak borçlarını karşılamak için yetersiz. Temettü dağıtımı yapılamaz.
            </div>
          )}
        </>
      )}

      {!result && (
        <div className="bg-[#f8fafc] border border-dashed border-[#e2e8f0] rounded px-4 py-8 text-center">
          <div className="text-xs text-[#94a3b8] font-medium">
            Dağıtılabilir nakit miktarını girin ve <strong>Hesapla</strong> butonuna tıklayın.
          </div>
          <div className="text-[10px] text-[#cbd5e1] mt-1">
            Gerçek ortak verisi (pay oranı ve güncel borç) üzerinden, girdiğiniz nakit için iki fazlı geri ödeme hesaplanır.
          </div>
        </div>
      )}
    </div>
  )
}

export default WaterfallSimulatorTab

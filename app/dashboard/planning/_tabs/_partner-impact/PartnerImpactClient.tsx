'use client'

// ── PartnerImpactClient — Interactive distribution simulator ──────────────────
//
// Receives server-computed baseline data.
// Adds a local "simulate distribution" slider so the user can model
// different distributable amounts and see per-partner payouts in real time.

import { useState, useMemo } from 'react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

interface EqualizationEntry {
  partner_id:            string
  partner_name:          string
  share_ratio:           number
  total_contributed_try: number
  per_unit_contribution: number
  equalization_amount:   number
  pro_rata_share:        number
  total_payout:          number
  loan_balance_try:      number
}

interface Props {
  cashDistributable:  number
  cashBalance:        number
  netIncome:          number
  legalReserve:       number
  entries:            EqualizationEntry[]
  totalLoanBalance:   number
  nextDue:            { due_date: string; outstanding_try: number } | null
  partnerCount:       number
  baselinePerUnit:    number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TRY_FMT = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
function fmt(n: number): string {
  const v = Number(n || 0)
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1).replace('.', ',') + 'M ₺'
  if (Math.abs(v) >= 1_000)     return (v / 1_000).toFixed(0) + 'K ₺'
  return TRY_FMT.format(v) + ' ₺'
}
function pct(v: number): string { return (v * 100).toFixed(1) + '%' }
function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) }
  catch { return iso }
}
function round2(n: number): number { return Math.round(n * 100) / 100 }

// Pure equalization kernel — same algorithm as server-side computeEqualization
function computeEq(entries: EqualizationEntry[], distributable: number): EqualizationEntry[] {
  if (entries.length === 0 || distributable <= 0) {
    return entries.map(e => ({ ...e, equalization_amount: 0, pro_rata_share: 0, total_payout: 0 }))
  }

  const baseline = Math.max(...entries.map(e => e.per_unit_contribution))
  const withEq   = entries.map(e => ({
    ...e,
    eq_needed: round2(Math.max(0, (baseline - e.per_unit_contribution) * e.share_ratio)),
  }))
  const totalEq = round2(withEq.reduce((s, e) => s + e.eq_needed, 0))

  let eqPayouts: number[]
  let remaining: number

  if (totalEq === 0) {
    eqPayouts = withEq.map(() => 0)
    remaining = distributable
  } else if (distributable >= totalEq) {
    eqPayouts = withEq.map(e => e.eq_needed)
    remaining = round2(distributable - totalEq)
  } else {
    eqPayouts = withEq.map(e => round2(distributable * (e.eq_needed / totalEq)))
    remaining = 0
  }

  const totalRatio = entries.reduce((s, e) => s + e.share_ratio, 0) || 1
  let runningPR = 0
  return withEq.map((e, i) => {
    let proRata: number
    if (remaining === 0) {
      proRata = 0
    } else if (i === withEq.length - 1) {
      proRata = round2(remaining - runningPR)
    } else {
      proRata = round2(remaining * (e.share_ratio / totalRatio))
      runningPR += proRata
    }
    return {
      ...e,
      equalization_amount: eqPayouts[i],
      pro_rata_share:      proRata,
      total_payout:        round2(eqPayouts[i] + proRata),
    }
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PartnerImpactClient({
  cashDistributable,
  cashBalance,
  netIncome,
  legalReserve,
  entries,
  totalLoanBalance,
  nextDue,
  partnerCount,
  baselinePerUnit,
}: Props) {
  // Slider state: simulate distributing a custom amount
  const [simAmount, setSimAmount] = useState<number>(Math.max(0, Math.round(cashDistributable)))
  const [sliderActive, setSliderActive] = useState(false)

  const displayAmount = sliderActive ? simAmount : cashDistributable
  const displayEntries = useMemo(
    () => computeEq(entries, displayAmount),
    [entries, displayAmount]
  )

  const hasEqualization = displayEntries.some(e => e.equalization_amount > 0)
  const maxSlider       = Math.max(cashDistributable * 2, 1_000_000, simAmount * 1.5)
  const legalReserveWarning = netIncome > 0 && displayAmount > netIncome - legalReserve

  if (partnerCount === 0) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded p-10 text-center">
        <div className="text-3xl mb-3">👥</div>
        <div className="text-sm font-semibold text-gray-700 mb-1">Ortak bulunamadı</div>
        <div className="text-xs text-gray-400 mb-4">
          Dağıtım analizi için önce ortak eklemeniz gerekiyor.
        </div>
        <Link
          href="/dashboard/partners/new"
          className="inline-flex items-center gap-1.5 bg-primary-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-primary-700"
        >
          + Ortak Ekle
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 max-w-4xl">

      {/* ── Position summary strip ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3">
          <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1">Nakit Bakiye</div>
          <div className={`text-lg font-black tabular-nums ${cashBalance >= 0 ? 'text-gray-900' : 'text-neg'}`}>
            {fmt(cashBalance)}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">tahsil − ödenen</div>
        </div>

        <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3">
          <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1">Dağıtılabilir</div>
          <div className={`text-lg font-black tabular-nums ${cashDistributable > 0 ? 'text-pos-text' : 'text-gray-400'}`}>
            {cashDistributable > 0 ? fmt(cashDistributable) : '—'}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">yükümlülükler düşülmüş</div>
        </div>

        <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3">
          <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1">Net Gelir (Tahakkuk)</div>
          <div className={`text-lg font-black tabular-nums ${netIncome >= 0 ? 'text-gray-900' : 'text-neg'}`}>
            {fmt(netIncome)}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">vergi sonrası</div>
        </div>

        <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3">
          <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1">Toplam Ortak Borcu</div>
          <div className={`text-lg font-black tabular-nums ${totalLoanBalance > 0 ? 'text-warn-text' : 'text-gray-400'}`}>
            {totalLoanBalance > 0 ? fmt(totalLoanBalance) : 'Yok'}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">{partnerCount} aktif ortak</div>
        </div>
      </div>

      {/* ── Next loan due alert ────────────────────────────────────────────── */}
      {nextDue && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-warn-light border border-warn-light rounded">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-[9px] font-black uppercase tracking-widest text-warn-text flex-shrink-0">Yaklaşan Geri Ödeme</span>
            <span className="text-sm font-medium text-warn-text truncate">
              {fmt(nextDue.outstanding_try)} · {fmtDate(nextDue.due_date)}
            </span>
          </div>
          <Link
            href="/dashboard/partners?tab=tranches"
            className="flex-shrink-0 text-xs font-bold text-warn-text hover:underline whitespace-nowrap"
          >
            Trancheler →
          </Link>
        </div>
      )}

      {/* ── Distribution simulator ─────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#f1f5f9]">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Dağıtım Simülatörü</div>
            <div className="text-[10px] text-gray-400 mt-0.5">
              Kaydırıcıyla dağıtılacak tutarı değiştirin, payları canlı görün
            </div>
          </div>
          <div className="flex items-center gap-2">
            {sliderActive && (
              <button
                onClick={() => { setSimAmount(Math.max(0, Math.round(cashDistributable))); setSliderActive(false) }}
                className="text-[10px] font-semibold text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-[#e2e8f0] hover:bg-[#f8fafc]"
              >
                Sıfırla
              </button>
            )}
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${sliderActive ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-500'}`}>
              {sliderActive ? 'Simülasyon' : 'Canlı'}
            </span>
          </div>
        </div>

        {/* Slider */}
        <div className="px-5 py-4 border-b border-[#f1f5f9]">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <input
                type="range"
                min={0}
                max={Math.round(maxSlider)}
                step={Math.round(maxSlider / 200)}
                value={Math.round(displayAmount)}
                onChange={e => { setSimAmount(Number(e.target.value)); setSliderActive(true) }}
                className="w-full h-2 rounded-full appearance-none bg-gray-200 accent-primary-600 cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-gray-400 mt-1">
                <span>₺0</span>
                <span>{fmt(maxSlider / 2)}</span>
                <span>{fmt(maxSlider)}</span>
              </div>
            </div>
            <div className="flex-shrink-0 text-right">
              <div className={`text-xl font-black tabular-nums ${displayAmount > 0 ? 'text-primary-700' : 'text-gray-400'}`}>
                {fmt(displayAmount)}
              </div>
              <div className="text-[9px] text-gray-400">dağıtılacak</div>
            </div>
          </div>

          {/* Legal reserve warning */}
          {legalReserveWarning && (
            <div className="mt-3 flex items-start gap-2 px-3 py-2 bg-warn-light border border-warn-light rounded">
              <span className="text-warn flex-shrink-0 text-sm">⚠</span>
              <div className="text-[11px] text-warn-text">
                <span className="font-bold">TTK 519 uyarısı:</span> Yasal yedek ({fmt(legalReserve)}) ayrılmadan
                net gelirin tamamı dağıtılamaz. Önerilen maksimum: {fmt(Math.max(0, netIncome - legalReserve))}.
              </div>
            </div>
          )}
        </div>

        {/* Distribution table */}
        {displayAmount > 0 && displayEntries.length > 0 ? (
          <div>
            {/* Equalization notice */}
            {hasEqualization && (
              <div className="px-5 py-2 bg-info-light/60 border-b border-info-light">
                <span className="text-[9px] font-black uppercase tracking-widest text-info-text">
                  Eşitleme aktif — katkı dengesizliği gideriliyor
                </span>
              </div>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#f1f5f9] bg-[#f8fafc]/60">
                  <th className="text-left px-5 py-2.5 text-[9px] font-black uppercase tracking-widest text-gray-400">Ortak</th>
                  <th className="text-right px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-gray-400">Pay</th>
                  {hasEqualization && (
                    <th className="text-right px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-info">Eşitleme</th>
                  )}
                  <th className="text-right px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-gray-400">Pro-rata</th>
                  <th className="text-right px-5 py-2.5 text-[9px] font-black uppercase tracking-widest text-gray-400">Toplam</th>
                  <th className="text-right px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-warn">Ortak Borcu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {displayEntries.map(e => (
                  <tr key={e.partner_id} className="hover:bg-[#f8fafc]/50">
                    <td className="px-5 py-3">
                      <div className="font-semibold text-gray-900">{e.partner_name}</div>
                      <div className="text-[10px] text-gray-400">{pct(e.share_ratio)} hisse</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[11px] text-gray-500">
                      {pct(e.share_ratio)}
                    </td>
                    {hasEqualization && (
                      <td className="px-4 py-3 text-right">
                        {e.equalization_amount > 0 ? (
                          <span className="font-mono text-[11px] text-info-text">{fmt(e.equalization_amount)}</span>
                        ) : (
                          <span className="text-[10px] text-gray-300">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right font-mono text-[11px] text-gray-600">
                      {e.pro_rata_share > 0 ? fmt(e.pro_rata_share) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="font-black text-[13px] text-pos-text tabular-nums">{fmt(e.total_payout)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {e.loan_balance_try > 0 ? (
                        <span className="font-mono text-[11px] text-warn-text">{fmt(e.loan_balance_try)}</span>
                      ) : (
                        <span className="text-[10px] text-pos font-semibold">Kapalı</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[#e2e8f0] bg-[#f8fafc]/40">
                  <td colSpan={hasEqualization ? 4 : 3} className="px-5 py-2.5 text-[9px] font-black uppercase tracking-widest text-gray-400">
                    Toplam
                  </td>
                  <td className="px-5 py-2.5 text-right font-black text-[14px] tabular-nums text-pos-text">
                    {fmt(displayEntries.reduce((s, e) => s + e.total_payout, 0))}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-[11px] text-warn-text">
                    {fmt(totalLoanBalance)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : displayAmount <= 0 ? (
          <div className="px-5 py-6 text-center">
            <div className="text-sm text-gray-400">Kaydırıcıyı hareket ettirerek dağıtım senaryosunu simüle edin</div>
          </div>
        ) : (
          <div className="px-5 py-6 text-center">
            <div className="text-sm text-gray-400">Ortak verisi yükleniyor…</div>
          </div>
        )}
      </div>

      {/* ── Per-partner loan breakdown ─────────────────────────────────────── */}
      {totalLoanBalance > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#f1f5f9]">
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Ortak Borç Pozisyonları</div>
            <Link href="/dashboard/partners?tab=tranches" className="text-[10px] font-semibold text-primary-600 hover:text-primary-700">
              Tranche detayı →
            </Link>
          </div>
          <div className="divide-y divide-[#f1f5f9]">
            {displayEntries.map(e => {
              const loanPct = totalLoanBalance > 0 ? (e.loan_balance_try / totalLoanBalance) * 100 : 0
              return (
                <div key={e.partner_id} className="px-5 py-3 flex items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-900">{e.partner_name}</span>
                      <span className={`text-sm font-black tabular-nums ${e.loan_balance_try > 0 ? 'text-warn-text' : 'text-gray-400'}`}>
                        {e.loan_balance_try > 0 ? fmt(e.loan_balance_try) : 'Yok'}
                      </span>
                    </div>
                    {e.loan_balance_try > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-warn rounded-full"
                            style={{ width: `${Math.min(100, loanPct)}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-gray-400 flex-shrink-0 tabular-nums">
                          %{loanPct.toFixed(0)} payı
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Footer: go deeper ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 text-[11px] text-gray-400 flex-wrap">
        <span>Daha ayrıntılı analiz için:</span>
        <Link href="/dashboard/partners" className="text-primary-600 font-semibold hover:underline">
          Ortak Merkezi →
        </Link>
        <span>·</span>
        <Link href="/dashboard/partners?tab=distribution" className="text-primary-600 font-semibold hover:underline">
          Dağıtım Tablosu →
        </Link>
        <span>·</span>
        <Link href="/dashboard/admin/governance" className="text-primary-600 font-semibold hover:underline">
          Yönetişim Raporu →
        </Link>
      </div>
    </div>
  )
}

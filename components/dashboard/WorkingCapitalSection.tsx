'use client'

// ── WorkingCapitalSection — İşletme Sermayesi Analizi ─────────────────────────
// Client island: fetches /api/finance/working-capital and renders CCC,
// liquidity ratios, risk flags, 12-month trend table, and CCC decomposition.

import { useQuery }  from '@tanstack/react-query'
import { Skeleton }  from '@/components/ds'
import { fmtTRY }    from '@/lib/format'
import type {
  WorkingCapitalReport,
  WorkingCapitalMonth,
} from '@/lib/services/finance/working-capital.service'

// ── API response shape ────────────────────────────────────────────────────────

interface ApiResponse {
  report: WorkingCapitalReport
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDays(n: number | null): string {
  if (n === null) return '—'
  return `${n.toFixed(1)} gün`
}

function fmtRatio(n: number | null): string {
  if (n === null) return '—'
  return n.toFixed(2)
}

/** Color CCC chip: < 45 = green, 45-60 = yellow, > 60 = red */
function cccChipClass(ccc: number | null): string {
  if (ccc === null) return 'bg-[#f1f5f9] text-[#64748b] border-[#e2e8f0]'
  if (ccc < 45)  return 'bg-pos-light text-pos-text border-pos-light'
  if (ccc <= 60) return 'bg-warn-light text-warn-text border-warn-light'
  return 'bg-neg-light text-neg-text border-neg-light'
}

/** Color current-ratio chip: > 1.5 = green, 1.2-1.5 = yellow, < 1.2 = red */
function ratioChipClass(ratio: number | null): string {
  if (ratio === null) return 'bg-[#f1f5f9] text-[#64748b] border-[#e2e8f0]'
  if (ratio > 1.5)   return 'bg-pos-light text-pos-text border-pos-light'
  if (ratio >= 1.2)  return 'bg-warn-light text-warn-text border-warn-light'
  return 'bg-neg-light text-neg-text border-neg-light'
}

/** Trend arrow vs prior month */
function trendArrow(current: number | null, prior: number | null, lowerIsBetter = true) {
  if (current === null || prior === null) return null
  const diff = current - prior
  if (Math.abs(diff) < 0.5) return null
  const improving = lowerIsBetter ? diff < 0 : diff > 0
  return improving
    ? <span className="text-pos text-[10px]">↓</span>
    : <span className="text-neg text-[10px]">↑</span>
}

const TREND_LABELS: Record<string, string> = {
  improving:    'İyileşiyor',
  deteriorating:'Kötüleşiyor',
  stable:       'Stabil',
  insufficient: 'Yetersiz Veri',
}

const TREND_BADGE: Record<string, string> = {
  improving:    'bg-pos-light text-pos-text',
  deteriorating:'bg-neg-light text-neg-text',
  stable:       'bg-warn-light text-warn-text',
  insufficient: 'bg-[#f1f5f9] text-[#64748b]',
}

// ── Metric Chip ───────────────────────────────────────────────────────────────

function MetricChip({
  label,
  value,
  chipClass,
}: {
  label: string
  value: string
  chipClass: string
}) {
  return (
    <div className={`border rounded px-3 py-2.5 flex flex-col gap-1 ${chipClass}`}>
      <span className="text-[0.6rem] font-black uppercase tracking-widest opacity-70">{label}</span>
      <span className="text-sm font-black tabular-nums leading-none">{value}</span>
    </div>
  )
}

// ── Monthly table row ─────────────────────────────────────────────────────────

function MonthRow({ month, prior }: { month: WorkingCapitalMonth; prior: WorkingCapitalMonth | null }) {
  return (
    <tr className="hover:bg-[#f8fafc]/60">
      <td className="px-4 py-2 text-xs font-semibold text-[#334155]">{month.label}</td>
      <td className="px-4 py-2 text-right text-xs tabular-nums font-mono">
        <span className={month.ccc_days !== null && month.ccc_days > 60 ? 'text-neg font-bold' : month.ccc_days !== null && month.ccc_days < 45 ? 'text-pos-text font-bold' : 'text-warn-text'}>
          {month.ccc_days !== null ? `${month.ccc_days.toFixed(1)}g` : '—'}
        </span>
        {' '}
        {trendArrow(month.ccc_days, prior?.ccc_days ?? null, true)}
      </td>
      <td className="px-4 py-2 text-right text-xs tabular-nums font-mono">
        <span className={
          month.current_ratio !== null
            ? month.current_ratio > 1.5
              ? 'text-pos-text font-bold'
              : month.current_ratio >= 1.2
                ? 'text-warn-text'
                : 'text-neg font-bold'
            : 'text-[#94a3b8]'
        }>
          {fmtRatio(month.current_ratio)}
        </span>
      </td>
      <td className="px-4 py-2 text-right text-xs tabular-nums font-mono">
        <span className={month.working_capital < 0 ? 'text-neg font-bold' : month.working_capital > 0 ? 'text-pos-text' : 'text-[#94a3b8]'}>
          {fmtTRY(month.working_capital)}
        </span>
      </td>
    </tr>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function WorkingCapitalSection() {
  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['working-capital-report'],
    queryFn: async () => {
      const res = await fetch('/api/finance/working-capital')
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Veri alınamadı' })) as { error?: string }
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      return res.json() as Promise<ApiResponse>
    },
    staleTime: 300_000,
  })

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton height="h-8" />
        <Skeleton height="h-56" />
      </div>
    )
  }

  if (error || !data) {
    const msg = error instanceof Error ? error.message : 'İşletme sermayesi verileri alınamadı'
    return (
      <div className="bg-[#fef2f2] border border-[#fecaca] rounded px-4 py-3 text-xs text-[#dc2626] font-medium">
        {msg}
      </div>
    )
  }

  const { report } = data
  const {
    months,
    current_ccc_days,
    current_ratio,
    quick_ratio,
    working_capital,
    ccc_trend,
    liquidity_trend,
    negative_working_capital,
    high_ccc,
    low_current_ratio,
  } = report

  const current = months[0]

  return (
    <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden shadow-sm">

      {/* Header */}
      <div className="px-4 py-3 border-b border-[#e2e8f0] flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            İşletme Sermayesi Analizi
          </div>
          <p className="text-[10px] text-[#94a3b8] mt-0.5">
            Nakit dönüşüm döngüsü · Likidite oranları · 12 aylık trend
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${TREND_BADGE[ccc_trend] ?? 'bg-[#f1f5f9] text-[#64748b]'}`}>
            NDD: {TREND_LABELS[ccc_trend] ?? ccc_trend}
          </span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${TREND_BADGE[liquidity_trend] ?? 'bg-[#f1f5f9] text-[#64748b]'}`}>
            Likidite: {TREND_LABELS[liquidity_trend] ?? liquidity_trend}
          </span>
        </div>
      </div>

      {/* Risk flags */}
      {(negative_working_capital || high_ccc || low_current_ratio) && (
        <div className="border-b border-[#e2e8f0] px-4 py-3 flex flex-col gap-2 bg-neg-light">
          {negative_working_capital && (
            <div className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-neg shrink-0 mt-1.5" />
              <span className="text-xs text-neg-text font-semibold">
                Negatif İşletme Sermayesi — Kısa vadeli borçlar dönen varlıkları aşıyor.
                Likidite krizine dikkat.
              </span>
            </div>
          )}
          {high_ccc && (
            <div className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-neg shrink-0 mt-1.5" />
              <span className="text-xs text-neg-text font-semibold">
                Yüksek NDD ({current_ccc_days?.toFixed(1)} gün &gt; 60 gün eşiği) — Nakit tahsilat ve stok devri optimize edilmeli.
              </span>
            </div>
          )}
          {low_current_ratio && (
            <div className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-neg shrink-0 mt-1.5" />
              <span className="text-xs text-neg-text font-semibold">
                Düşük Cari Oran ({current_ratio?.toFixed(2)} &lt; 1.2) — Kısa vadeli yükümlülük karşılama kapasitesi yetersiz.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Top row — 4 metric chips */}
      <div className="grid grid-cols-4 gap-3 p-4 border-b border-[#e2e8f0]">
        <MetricChip
          label="Nakit Dönüşüm Döngüsü"
          value={fmtDays(current_ccc_days)}
          chipClass={cccChipClass(current_ccc_days)}
        />
        <MetricChip
          label="Cari Oran"
          value={fmtRatio(current_ratio)}
          chipClass={ratioChipClass(current_ratio)}
        />
        <MetricChip
          label="Asit-Test Oranı"
          value={fmtRatio(quick_ratio)}
          chipClass={ratioChipClass(quick_ratio)}
        />
        <MetricChip
          label="İşletme Sermayesi"
          value={fmtTRY(working_capital)}
          chipClass={
            working_capital < 0
              ? 'bg-neg-light text-neg-text border-neg-light'
              : working_capital > 0
                ? 'bg-pos-light text-pos-text border-pos-light'
                : 'bg-[#f1f5f9] text-[#64748b] border-[#e2e8f0]'
          }
        />
      </div>

      {/* CCC decomposition */}
      {current && (
        <div className="px-4 py-3 border-b border-[#e2e8f0] bg-[#f8fafc] text-xs text-[#64748b]">
          <span className="font-black text-[#334155] uppercase tracking-widest text-[0.6rem] mr-2">NDD Bileşenleri</span>
          <span className="font-mono tabular-nums">
            = {current.dio_days !== null ? `${current.dio_days.toFixed(1)}g stok` : '—g stok'}
            {' '}+{' '}
            {current.dso_days !== null ? `${current.dso_days.toFixed(1)}g tahsilat` : '—g tahsilat'}
            {' '}−{' '}
            {current.dpo_days !== null ? `${current.dpo_days.toFixed(1)}g borç` : '—g borç'}
          </span>
        </div>
      )}

      {/* 12-month table */}
      {months.length > 0 ? (
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#f8fafc] border-b border-[#e2e8f0]">
              <th className="text-left px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Ay</th>
              <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">NDD</th>
              <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Cari Oran</th>
              <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">İşletme Sermayesi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f5f9]">
            {months.map((m, i) => (
              <MonthRow key={m.month} month={m} prior={months[i + 1] ?? null} />
            ))}
          </tbody>
        </table>
      ) : (
        <div className="px-4 py-6 text-xs text-[#94a3b8] text-center">
          Henüz veri yok.
        </div>
      )}

      {/* Benchmark legend */}
      <div className="border-t border-[#e2e8f0] px-4 py-2.5 flex items-center gap-4 bg-[#f8fafc] text-[10px] text-[#94a3b8]">
        <span>Benchmark: NDD &lt; <strong>45g</strong> (sağlıklı)</span>
        <span>Cari Oran &gt; <strong>1.50</strong></span>
        <span>Asit-Test &gt; <strong>1.20</strong></span>
      </div>
    </div>
  )
}

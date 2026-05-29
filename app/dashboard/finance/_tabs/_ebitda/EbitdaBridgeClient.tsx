'use client'

// ─────────────────────────────────────────────────────────────────────────────
// EbitdaBridgeClient
//
// EBITDA Köprüsü — waterfall from prior period EBITDA to current EBITDA.
//
// Features:
//   - Prior EBITDA → waterfall rows (volume / COGS / margin / opex) → Current EBITDA
//   - Operating leverage number with health badge
//   - Current vs prior period comparison table (revenue / COGS / opex / EBITDA / margin)
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }             from '@tanstack/react-query'
import { fmtTRY, fmtPct }      from '@/lib/format'
import type { EbitdaBridgeReport, EbitdaBridgeComponent } from '@/lib/services/finance/ebitda-bridge.service'

// ── Leverage health badge ─────────────────────────────────────────────────────

type LeverageHealth =
  | 'high_leverage_positive'
  | 'high_leverage_negative'
  | 'low_leverage'
  | 'improving'
  | 'declining'
  | 'insufficient_data'

const HEALTH_CONFIG: Record<LeverageHealth, { label: string; cls: string }> = {
  high_leverage_positive: { label: 'Yüksek Kaldıraç (Olumlu)',  cls: 'bg-green-50 border-green-200 text-green-800' },
  high_leverage_negative: { label: 'Yüksek Kaldıraç (Olumsuz)', cls: 'bg-red-50 border-red-200 text-red-800' },
  improving:              { label: 'İyileşen',                  cls: 'bg-blue-50 border-blue-200 text-blue-800' },
  declining:              { label: 'Gerileyen',                 cls: 'bg-red-50 border-red-200 text-red-700' },
  low_leverage:           { label: 'Düşük Kaldıraç',            cls: 'bg-slate-50 border-slate-200 text-slate-700' },
  insufficient_data:      { label: 'Yetersiz Veri',             cls: 'bg-slate-50 border-slate-200 text-slate-400' },
}

// ── Bridge waterfall row ──────────────────────────────────────────────────────

function BridgeRow({
  label,
  value,
  isBase,
  isFinal,
  pctOfPrior,
}: {
  label:      string
  value:      number
  isBase?:    boolean
  isFinal?:   boolean
  pctOfPrior?: number | null
}) {
  const isPositive = value >= 0
  const sign       = value > 0 ? '+' : value < 0 ? '−' : ''
  const absVal     = Math.abs(value)

  if (isBase || isFinal) {
    const borderCls = isFinal
      ? 'border-t-2 border-[#0f172a] mt-1'
      : 'border-b border-dashed border-[#e2e8f0] pb-2 mb-2'
    return (
      <div className={`flex items-center justify-between gap-3 py-2 ${borderCls}`}>
        <span className="text-[11px] font-black text-[#0f172a]">{label}</span>
        <span className={`text-sm font-black tabular-nums ${value >= 0 ? 'text-[#059669]' : 'text-[#dc2626]'}`}>
          {fmtTRY(value, 0)}
        </span>
      </div>
    )
  }

  const valueColor = isPositive ? 'text-[#059669]' : 'text-[#dc2626]'
  const indicator  = isPositive ? '▲' : '▼'

  return (
    <div className="flex items-center justify-between gap-3 py-1.5 pl-3 border-l-2 border-[#e2e8f0]">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-[10px] font-bold shrink-0 ${valueColor}`}>{indicator}</span>
        <span className="text-[11px] font-medium text-[#64748b] truncate">{label}</span>
        {pctOfPrior !== null && pctOfPrior !== undefined && (
          <span className="text-[9px] text-[#94a3b8] shrink-0">
            ({pctOfPrior > 0 ? '+' : ''}{pctOfPrior.toFixed(1)}%)
          </span>
        )}
      </div>
      <span className={`text-xs font-bold tabular-nums shrink-0 ${valueColor}`}>
        {sign}{fmtTRY(absVal, 0)}
      </span>
    </div>
  )
}

// ── Period comparison table ───────────────────────────────────────────────────

function PeriodTable({ report }: { report: EbitdaBridgeReport }) {
  const cur = report.current_period
  const pri = report.prior_period

  const rows = [
    { label: 'Ciro',       cur: cur.revenue, pri: pri.revenue, isBold: false },
    { label: 'SMM',        cur: cur.cogs,    pri: pri.cogs,    isBold: false },
    { label: 'Opex',       cur: cur.opex,    pri: pri.opex,    isBold: false },
    { label: 'EBITDA',     cur: cur.ebitda,  pri: pri.ebitda,  isBold: true },
  ]

  function deltaColor(c: number, p: number) {
    if (c > p) return 'text-[#059669]'
    if (c < p) return 'text-[#dc2626]'
    return 'text-[#94a3b8]'
  }

  function deltaTxt(c: number, p: number) {
    const d = c - p
    if (d === 0) return '—'
    return `${d > 0 ? '+' : ''}${fmtTRY(d, 0)}`
  }

  return (
    <div className="bg-white border border-[#e2e8f0] rounded p-5 shadow-sm overflow-x-auto">
      <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-4">
        Dönem Karşılaştırması
      </div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-[#e2e8f0]">
            {['Kalem', 'Geçen Dönem', 'Bu Dönem', 'Fark'].map(h => (
              <th key={h} className={`py-2 px-2 text-[10px] font-black uppercase tracking-wide text-[#94a3b8] ${h === 'Kalem' ? 'text-left' : 'text-right'}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.label} className={`border-t ${row.isBold ? 'border-dashed border-[#e2e8f0] bg-[#f8fafc]' : 'border-[#f1f5f9]'}`}>
              <td className={`py-1.5 px-2 ${row.isBold ? 'font-black text-[#0f172a]' : 'font-medium text-[#64748b]'} text-[11px]`}>
                {row.label}
              </td>
              <td className="py-1.5 px-2 text-right text-[11px] tabular-nums text-[#475569]">
                {fmtTRY(row.pri, 0)}
              </td>
              <td className={`py-1.5 px-2 text-right text-[11px] tabular-nums ${row.isBold ? 'font-black' : 'font-medium'} ${row.cur >= 0 ? 'text-[#1e293b]' : 'text-[#dc2626]'}`}>
                {fmtTRY(row.cur, 0)}
              </td>
              <td className={`py-1.5 px-2 text-right text-[11px] tabular-nums font-bold ${deltaColor(row.cur, row.pri)}`}>
                {deltaTxt(row.cur, row.pri)}
              </td>
            </tr>
          ))}

          {/* Margin rows */}
          <tr className="border-t border-[#f1f5f9]">
            <td className="py-1.5 px-2 text-[11px] font-medium text-[#94a3b8]">EBITDA Marjı</td>
            <td className="py-1.5 px-2 text-right text-[11px] tabular-nums text-[#475569]">
              {pri.ebitda_margin_pct !== null ? fmtPct(pri.ebitda_margin_pct) : '—'}
            </td>
            <td className="py-1.5 px-2 text-right text-[11px] tabular-nums text-[#475569]">
              {cur.ebitda_margin_pct !== null ? fmtPct(cur.ebitda_margin_pct) : '—'}
            </td>
            <td className={`py-1.5 px-2 text-right text-[11px] tabular-nums font-bold ${
              cur.ebitda_margin_pct !== null && pri.ebitda_margin_pct !== null
                ? cur.ebitda_margin_pct > pri.ebitda_margin_pct ? 'text-[#059669]' : cur.ebitda_margin_pct < pri.ebitda_margin_pct ? 'text-[#dc2626]' : 'text-[#94a3b8]'
                : 'text-[#94a3b8]'
            }`}>
              {cur.ebitda_margin_pct !== null && pri.ebitda_margin_pct !== null
                ? (() => {
                    const d = cur.ebitda_margin_pct - pri.ebitda_margin_pct
                    return d === 0 ? '—' : `${d > 0 ? '+' : ''}${d.toFixed(1)}pp`
                  })()
                : '—'}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

export function EbitdaBridgeClient({ companyId }: Props) {
  const { data, isLoading, isError } = useQuery<{ report: EbitdaBridgeReport }>({
    queryKey:  ['ebitda-bridge', companyId],
    queryFn:   async () => {
      const res = await fetch('/api/finance/ebitda-bridge')
      if (!res.ok) throw new Error('EBITDA köprüsü verisi yüklenemedi')
      return res.json()
    },
    staleTime: 10 * 60 * 1000,
  })

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded p-6 shadow-sm">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-[#f1f5f9] rounded w-56" />
          <div className="h-64 bg-[#f1f5f9] rounded" />
          <div className="h-32 bg-[#f1f5f9] rounded" />
        </div>
      </div>
    )
  }

  // ── Error / empty ──────────────────────────────────────────────────────────
  if (isError || !data?.report) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded p-6 shadow-sm text-center">
        <p className="text-sm text-[#64748b] font-medium">EBITDA köprüsü hesaplanamadı</p>
        <p className="text-xs text-[#94a3b8] mt-1">Satış ve gider verileri mevcut olduğunda otomatik hesaplanır.</p>
      </div>
    )
  }

  const report          = data.report
  const bridge          = report.bridge
  const health          = HEALTH_CONFIG[report.leverage_health]
  const ol              = report.operating_leverage
  const revGrowth       = report.revenue_growth_pct
  const ebitdaGrowth    = report.ebitda_growth_pct

  return (
    <div className="space-y-4">

      {/* ── Section header ───────────────────────────────────────────────────── */}
      <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
        EBITDA Köprüsü
      </div>

      {/* ── Bridge waterfall ─────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded p-5 shadow-sm">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-4">
          Dönemden Döneme EBITDA Değişimi
        </div>

        <div className="space-y-0.5">
          <BridgeRow label="Önceki Dönem EBITDA" value={bridge.prior_ebitda} isBase />

          {bridge.components.map((c: EbitdaBridgeComponent) => (
            <BridgeRow
              key={c.label}
              label={c.label}
              value={c.value}
              pctOfPrior={c.pct_of_prior}
            />
          ))}

          <BridgeRow label="Bu Dönem EBITDA" value={bridge.current_ebitda} isFinal />
        </div>

        {/* Reconciliation note */}
        {Math.abs(bridge.reconciliation_error) > 1 && (
          <div className="mt-3 text-[9px] text-[#94a3b8]">
            Mutabakat hatası: {fmtTRY(bridge.reconciliation_error, 2)}
          </div>
        )}
      </div>

      {/* ── Operating leverage card ───────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded p-5 shadow-sm">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-4">
          Faaliyet Kaldıracı
        </div>
        <div className="flex items-start gap-6">
          <div>
            <div className="text-3xl font-black tabular-nums text-[#0f172a]">
              {ol !== null ? ol.toFixed(2) : '—'}
            </div>
            <div className="text-[10px] text-[#94a3b8] mt-1">
              EBITDA %Δ / Ciro %Δ
            </div>
          </div>
          <div className="space-y-2">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[10px] font-bold ${health.cls}`}>
              {health.label}
            </span>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
              <span className="text-[#94a3b8]">Ciro Büyümesi</span>
              <span className={`font-bold tabular-nums ${(revGrowth ?? 0) >= 0 ? 'text-[#059669]' : 'text-[#dc2626]'}`}>
                {revGrowth !== null ? `${revGrowth > 0 ? '+' : ''}${revGrowth.toFixed(1)}%` : '—'}
              </span>
              <span className="text-[#94a3b8]">EBITDA Büyümesi</span>
              <span className={`font-bold tabular-nums ${(ebitdaGrowth ?? 0) >= 0 ? 'text-[#059669]' : 'text-[#dc2626]'}`}>
                {ebitdaGrowth !== null ? `${ebitdaGrowth > 0 ? '+' : ''}${ebitdaGrowth.toFixed(1)}%` : '—'}
              </span>
            </div>
          </div>
        </div>
        <div className="mt-4 text-[9px] text-[#94a3b8] border-t border-[#f1f5f9] pt-3">
          Kaldıraç &gt; 2: Sabit maliyet avantajı yüksek. Kaldıraç &lt; 0: Gelir artarken EBITDA düşüyor.
        </div>
      </div>

      {/* ── Period comparison table ───────────────────────────────────────────── */}
      <PeriodTable report={report} />

    </div>
  )
}

'use client'

// ─────────────────────────────────────────────────────────────────────────────
// EbitdaBridgeClient
//
// EBITDA Köprüsü — waterfall from prior period EBITDA to current EBITDA.
//
// Features:
//   - Prior EBITDA → bridge effects (volume / price-mix / cost / residual) → Current EBITDA
//   - Trend & primary driver badge
//   - Current vs prior period comparison table (revenue / gross profit / opex / EBITDA / margin)
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }       from '@tanstack/react-query'
import { fmtTRY, fmtPct } from '@/lib/format'
import type { EbitdaBridgeReport } from '@/lib/services/finance/ebitda-bridge.service'

// ── Trend badge config ────────────────────────────────────────────────────────

type EbitdaTrend = EbitdaBridgeReport['trend']

const TREND_CONFIG: Record<EbitdaTrend, { label: string; cls: string }> = {
  strong_growth:    { label: 'Güçlü Büyüme',     cls: 'bg-green-50 border-green-200 text-green-800' },
  growth:           { label: 'Büyüme',            cls: 'bg-green-50 border-green-100 text-green-700' },
  stable:           { label: 'Stabil',            cls: 'bg-info-light border-info-light text-info-text' },
  decline:          { label: 'Gerileme',          cls: 'bg-amber-50 border-amber-200 text-amber-800' },
  severe_decline:   { label: 'Ciddi Düşüş',       cls: 'bg-red-50 border-red-200 text-red-800' },
  turnaround:       { label: 'Dönüş',             cls: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
  deterioration:    { label: 'Bozulma',           cls: 'bg-red-50 border-red-300 text-red-900' },
  insufficient_data:{ label: 'Yetersiz Veri',     cls: 'bg-slate-50 border-slate-200 text-slate-400' },
}

type PrimaryDriver = EbitdaBridgeReport['primary_driver']

const DRIVER_LABELS: Record<PrimaryDriver, string> = {
  volume:           'Hacim',
  price_mix:        'Fiyat / Ürün Karması',
  cost:             'Maliyet',
  mixed:            'Karma Etkenler',
  insufficient_data:'Belirsiz',
}

// ── Bridge waterfall row ──────────────────────────────────────────────────────

function BridgeRow({
  label,
  value,
  isBase,
  isFinal,
}: {
  label:    string
  value:    number | null
  isBase?:  boolean
  isFinal?: boolean
}) {
  if (value === null && !isBase && !isFinal) {
    return (
      <div className="flex items-center justify-between gap-3 py-1.5 pl-3 border-l-2 border-[#e8eaef]">
        <span className="text-[11px] font-medium text-[#64748b] truncate">{label}</span>
        <span className="text-xs text-[#94a3b8]">—</span>
      </div>
    )
  }

  const v = value ?? 0

  if (isBase || isFinal) {
    const borderCls = isFinal
      ? 'border-t-2 border-[#0f172a] mt-1'
      : 'border-b border-dashed border-[#e8eaef] pb-2 mb-2'
    return (
      <div className={`flex items-center justify-between gap-3 py-2 ${borderCls}`}>
        <span className="text-[11px] font-black text-[#0f172a]">{label}</span>
        <span className={`text-sm font-extrabold tabular-nums ${v >= 0 ? 'text-[#059669]' : 'text-[#dc2626]'}`}>
          {fmtTRY(v, 0)}
        </span>
      </div>
    )
  }

  const isPositive = v >= 0
  const sign       = v > 0 ? '+' : v < 0 ? '−' : ''
  const absVal     = Math.abs(v)
  const indicator  = isPositive ? '▲' : '▼'
  const valueColor = isPositive ? 'text-[#059669]' : 'text-[#dc2626]'

  return (
    <div className="flex items-center justify-between gap-3 py-1.5 pl-3 border-l-2 border-[#e8eaef]">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-[10px] font-bold shrink-0 ${valueColor}`}>{indicator}</span>
        <span className="text-[11px] font-medium text-[#64748b] truncate">{label}</span>
      </div>
      <span className={`text-xs font-bold tabular-nums shrink-0 ${valueColor}`}>
        {sign}{fmtTRY(absVal, 0)}
      </span>
    </div>
  )
}

// ── Period comparison table ───────────────────────────────────────────────────

function PeriodTable({ report }: { report: EbitdaBridgeReport }) {
  const cur = report.current
  const pri = report.prior

  const rows: Array<{ label: string; cur: number; pri: number; isBold: boolean }> = [
    { label: 'Ciro',         cur: cur.revenue,      pri: pri.revenue,      isBold: false },
    { label: 'Brüt Kâr',    cur: cur.gross_profit, pri: pri.gross_profit, isBold: false },
    { label: 'Opex',         cur: cur.opex,         pri: pri.opex,         isBold: false },
    { label: 'FAVÖK',        cur: cur.ebitda,       pri: pri.ebitda,       isBold: true  },
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
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-5 shadow-sm overflow-x-auto">
      <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-4">
        Dönem Karşılaştırması
      </div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-[#e8eaef]">
            {['Kalem', report.prior_period, report.current_period, 'Fark'].map(h => (
              <th key={h} className={`py-2 px-2 text-[10px] font-bold uppercase tracking-wide text-[#94a3b8] ${h === 'Kalem' ? 'text-left' : 'text-right'}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.label} className={`border-t ${row.isBold ? 'border-dashed border-[#e8eaef] bg-[#f8fafc]' : 'border-[#f1f5f9]'}`}>
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

          {/* EBITDA margin row */}
          <tr className="border-t border-[#f1f5f9]">
            <td className="py-1.5 px-2 text-[11px] font-medium text-[#94a3b8]">FAVÖK Marjı</td>
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
    staleTime: 5 * 60 * 1000,
  })

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-6 shadow-sm">
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
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-6 shadow-sm text-center">
        <p className="text-sm text-[#64748b] font-medium">EBITDA köprüsü hesaplanamadı</p>
        <p className="text-xs text-[#94a3b8] mt-1">Satış ve gider verileri mevcut olduğunda otomatik hesaplanır.</p>
      </div>
    )
  }

  const report         = data.report
  const bridge         = report.bridge
  const trendConfig    = TREND_CONFIG[report.trend]
  const driverLabel    = DRIVER_LABELS[report.primary_driver]

  const bridgeRows: Array<{ label: string; value: number | null }> = [
    { label: 'Hacim Etkisi',          value: bridge.volume_effect },
    { label: 'Fiyat / Karışım Etkisi',value: bridge.price_mix_effect },
    { label: 'Maliyet Verimliliği',   value: bridge.cost_effect },
    { label: 'Diğer (Artık)',         value: bridge.residual_effect },
  ]

  return (
    <div className="space-y-4">

      {/* ── Section header ───────────────────────────────────────────────────── */}
      <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
        FAVÖK Köprüsü
      </div>

      {/* ── Bridge waterfall ─────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-5 shadow-sm">
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-4">
          {report.prior_period} → {report.current_period} FAVÖK Değişimi
        </div>

        <div className="space-y-0.5">
          <BridgeRow label="Önceki Dönem FAVÖK" value={report.prior.ebitda} isBase />

          {bridgeRows.map(row => (
            <BridgeRow
              key={row.label}
              label={row.label}
              value={row.value}
            />
          ))}

          <BridgeRow label="Bu Dönem FAVÖK" value={report.current.ebitda} isFinal />
        </div>

        {/* Reconciliation note */}
        {bridge.reconciliation_gap !== null && Math.abs(bridge.reconciliation_gap) > 1 && (
          <div className="mt-3 text-[9px] text-[#94a3b8]">
            Mutabakat farkı: {fmtTRY(bridge.reconciliation_gap, 2)}
          </div>
        )}
      </div>

      {/* ── Trend & driver card ───────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-5 shadow-sm">
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-4">
          Trend & Birincil Etken
        </div>
        <div className="flex items-start gap-6 flex-wrap">
          <div>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[10px] font-bold ${trendConfig.cls}`}>
              {trendConfig.label}
            </span>
            <div className="text-[10px] text-[#94a3b8] mt-1.5">Trend</div>
          </div>
          <div>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full border bg-slate-50 border-slate-200 text-slate-700 text-[10px] font-bold">
              {driverLabel}
            </span>
            <div className="text-[10px] text-[#94a3b8] mt-1.5">Birincil Etken</div>
          </div>
          <div>
            <div className="text-2xl font-extrabold tabular-nums text-[#0f172a]">
              {bridge.total_ebitda_change >= 0 ? '+' : ''}{fmtTRY(bridge.total_ebitda_change, 0)}
            </div>
            <div className="text-[10px] text-[#94a3b8] mt-1">FAVÖK Değişimi</div>
          </div>
        </div>
        {/* Narrative */}
        <div className="mt-4 text-[11px] text-[#475569] border-t border-[#f1f5f9] pt-3 leading-relaxed">
          {report.narrative}
        </div>
      </div>

      {/* ── Period comparison table ───────────────────────────────────────────── */}
      <PeriodTable report={report} />

    </div>
  )
}

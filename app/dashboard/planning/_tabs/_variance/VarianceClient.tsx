'use client'
// ── VarianceClient — Scenario vs Actuals comparison table ────────────────────
// Client island: fetches /api/planning/variance via TanStack Query,
// renders summary strip + comparison table with expandable row detail.

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cn }       from '@/components/ds'
import { fmtTRY, fmtDate } from '@/lib/format'
import type { ScenarioVariance } from '@/lib/services/planning/scenario-variance.service'

// ── Types ─────────────────────────────────────────────────────────────────────

interface VarianceApiResponse {
  variances: ScenarioVariance[]
  total:     number
}

// ── Local helpers ─────────────────────────────────────────────────────────────

function fmtK(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
  return n.toFixed(0)
}

function fmtPctVal(v: number | null): string {
  if (v === null) return '—'
  const sign = v >= 0 ? '+' : ''
  return `${sign}${(v * 100).toFixed(1)}%`
}

// ── Verdict badge ─────────────────────────────────────────────────────────────

const VERDICT_CFG = {
  accurate:          { label: 'Doğru',          bg: 'bg-pos-light',  text: 'text-pos-text',  border: 'border-pos-light'  },
  optimistic:        { label: 'İyimser',         bg: 'bg-warn-light', text: 'text-warn-text', border: 'border-warn-light' },
  pessimistic:       { label: 'Muhafazakâr',     bg: 'bg-brand-subtle', text: 'text-brand',   border: 'border-brand/20'  },
  insufficient_data: { label: 'Veri Yok',        bg: 'bg-[#f1f5f9]',  text: 'text-[#94a3b8]', border: 'border-[#e8eaef]'  },
} as const

function VerdictBadge({ verdict }: { verdict: ScenarioVariance['verdict'] }) {
  const cfg = VERDICT_CFG[verdict]
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wide border',
      cfg.bg, cfg.text, cfg.border
    )}>
      {cfg.label}
    </span>
  )
}

// ── Accuracy gauge ────────────────────────────────────────────────────────────

function AccuracyBar({ score }: { score: number | null }) {
  if (score === null) return <span className="text-[#cbd5e1] text-[10px]">—</span>
  const color = score >= 85 ? 'bg-pos-light' : score >= 60 ? 'bg-warn-light' : 'bg-neg-light'
  const textColor = score >= 85 ? 'text-pos-text' : score >= 60 ? 'text-warn-text' : 'text-neg'
  return (
    <div className="flex items-center gap-1.5 min-w-[80px]">
      <div className="flex-1 h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${score}%` }} />
      </div>
      <span className={cn('text-[10px] font-black tabular-nums', textColor)}>{score.toFixed(0)}</span>
    </div>
  )
}

// ── Variance delta cell ───────────────────────────────────────────────────────

function DeltaCell({ value, pct }: { value: number | null; pct: number | null }) {
  if (value === null) return <td className="px-3 py-2 text-right text-[#cbd5e1] text-[10px]">—</td>
  const positive = value >= 0
  const color    = positive ? 'text-pos-text' : 'text-neg'
  return (
    <td className={cn('px-3 py-2 text-right tabular-nums text-[10px] font-semibold', color)}>
      {positive ? '+' : ''}₺{fmtK(value)}
      {pct !== null && (
        <span className="ml-1 text-[9px] opacity-70">({fmtPctVal(pct)})</span>
      )}
    </td>
  )
}

// ── Expandable detail row ─────────────────────────────────────────────────────

function DetailRow({ v }: { v: ScenarioVariance }) {
  const rows: Array<{ label: string; proj: number; actual: number | null; diff: number | null; pct: number | null }> = [
    {
      label:  'Gelir',
      proj:   v.projected.revenue_try,
      actual: v.actuals?.revenue_try ?? null,
      diff:   v.variance?.revenue_try ?? null,
      pct:    v.variance?.revenue_pct ?? null,
    },
    {
      label:  'SMM',
      proj:   v.projected.cogs_try,
      actual: v.actuals?.cogs_try ?? null,
      diff:   v.actuals && v.projected.cogs_try !== 0 ? v.actuals.cogs_try - v.projected.cogs_try : null,
      pct:    v.actuals && v.projected.cogs_try !== 0
        ? (v.actuals.cogs_try - v.projected.cogs_try) / Math.abs(v.projected.cogs_try)
        : null,
    },
    {
      label:  'Brüt Kâr',
      proj:   v.projected.gross_profit_try,
      actual: v.actuals?.gross_profit_try ?? null,
      diff:   v.actuals && v.projected.gross_profit_try !== 0 ? v.actuals.gross_profit_try - v.projected.gross_profit_try : null,
      pct:    v.actuals && v.projected.gross_profit_try !== 0
        ? (v.actuals.gross_profit_try - v.projected.gross_profit_try) / Math.abs(v.projected.gross_profit_try)
        : null,
    },
    {
      label:  'Giderler',
      proj:   v.projected.expenses_try,
      actual: v.actuals?.expenses_try ?? null,
      diff:   v.variance?.expenses_try ?? null,
      pct:    v.variance?.expenses_pct ?? null,
    },
    {
      label:  'Net Gelir',
      proj:   v.projected.net_income_try,
      actual: v.actuals?.net_income_try ?? null,
      diff:   v.variance?.net_income_try ?? null,
      pct:    v.variance?.net_income_pct ?? null,
    },
  ]

  return (
    <tr>
      <td colSpan={6} className="px-0 py-0">
        <div className="mx-4 mb-3 mt-1 rounded border border-[#e8eaef] overflow-hidden bg-[#f8fafc]/60">
          <div className="px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8] border-b border-[#e8eaef]">
            {v.scenario_name} — Detay ({v.period_from.slice(0, 7)})
          </div>
          <table className="w-full text-[10px]">
            <thead>
              <tr className="bg-[#f1f5f9]/60">
                <th className="text-left px-4 py-2 font-black text-[#94a3b8] whitespace-nowrap">Kalem</th>
                <th className="text-right px-4 py-2 font-black text-[#94a3b8] whitespace-nowrap">Plan</th>
                <th className="text-right px-4 py-2 font-black text-[#94a3b8] whitespace-nowrap">Gerçek</th>
                <th className="text-right px-4 py-2 font-black text-[#94a3b8] whitespace-nowrap">Fark</th>
                <th className="text-right px-4 py-2 font-black text-[#94a3b8] whitespace-nowrap">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {rows.map(r => {
                const hasData = r.proj !== 0 || r.actual !== null
                if (!hasData) return null
                const diff   = r.diff
                const isPos  = diff !== null && diff >= 0
                return (
                  <tr key={r.label} className="hover:bg-white/60">
                    <td className="px-4 py-1.5 font-semibold text-[#334155]">{r.label}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums text-[#64748b]">
                      {r.proj !== 0 ? `₺${fmtK(r.proj)}` : '—'}
                    </td>
                    <td className="px-4 py-1.5 text-right tabular-nums text-[#334155] font-semibold">
                      {r.actual !== null ? `₺${fmtK(r.actual)}` : '—'}
                    </td>
                    <td className={cn(
                      'px-4 py-1.5 text-right tabular-nums font-semibold',
                      diff === null ? 'text-[#cbd5e1]' : isPos ? 'text-pos-text' : 'text-neg'
                    )}>
                      {diff !== null ? `${isPos ? '+' : ''}₺${fmtK(diff)}` : '—'}
                    </td>
                    <td className={cn(
                      'px-4 py-1.5 text-right tabular-nums text-[9px]',
                      r.pct === null ? 'text-[#cbd5e1]'
                      : r.pct >= 0   ? 'text-pos-text'
                      : 'text-neg'
                    )}>
                      {r.pct !== null ? fmtPctVal(r.pct) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="px-4 py-2 text-[9px] text-[#cbd5e1]">
            {v.verdict_detail}
          </div>
        </div>
      </td>
    </tr>
  )
}

// ── Summary strip ─────────────────────────────────────────────────────────────

function SummaryStrip({ variances }: { variances: ScenarioVariance[] }) {
  const withActuals  = variances.filter(v => v.actuals_available)
  const avgAccuracy  = withActuals.length > 0
    ? withActuals.reduce((s, v) => s + (v.accuracy_score ?? 0), 0) / withActuals.length
    : null

  const verdictCounts = variances.reduce<Record<string, number>>((acc, v) => {
    acc[v.verdict] = (acc[v.verdict] ?? 0) + 1
    return acc
  }, {})

  const kpis = [
    {
      label: 'Toplam Senaryo',
      value: String(variances.length),
      sub:   `${withActuals.length} gerçekleşen var`,
      color: 'text-[#0f172a]',
    },
    {
      label: 'Ort. Doğruluk',
      value: avgAccuracy !== null ? `${avgAccuracy.toFixed(0)}/100` : '—',
      sub:   avgAccuracy !== null
        ? avgAccuracy >= 85 ? 'Yüksek doğruluk' : avgAccuracy >= 60 ? 'Orta doğruluk' : 'Düşük doğruluk'
        : 'Gerçekleşen yok',
      color: avgAccuracy !== null
        ? avgAccuracy >= 85 ? 'text-pos-text' : avgAccuracy >= 60 ? 'text-warn-text' : 'text-neg'
        : 'text-[#94a3b8]',
    },
    {
      label: 'Doğru Tahmin',
      value: String(verdictCounts['accurate'] ?? 0),
      sub:   'Gelir ±%10 içinde',
      color: 'text-pos-text',
    },
    {
      label: 'İyimser / Muhafazakâr',
      value: `${verdictCounts['optimistic'] ?? 0} / ${verdictCounts['pessimistic'] ?? 0}`,
      sub:   'Fazla iyimser / Gerçek daha iyi',
      color: 'text-warn-text',
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {kpis.map(k => (
        <div key={k.label} className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3">
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{k.label}</div>
          <div className={cn('text-xl font-black tabular-nums leading-none', k.color)}>{k.value}</div>
          <div className="text-[10px] text-[#94a3b8] mt-0.5">{k.sub}</div>
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function VarianceClient() {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery<VarianceApiResponse>({
    queryKey: ['planning-variance'],
    queryFn:  async () => {
      const res = await fetch('/api/planning/variance', { cache: 'no-store' })
      if (!res.ok) throw new Error('Variance fetch failed')
      return res.json() as Promise<VarianceApiResponse>
    },
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="bg-[#f1f5f9] rounded h-16" />)}
        </div>
        <div className="bg-[#f1f5f9] rounded h-48" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="px-4 py-8 text-center text-[#94a3b8] text-xs">
        Senaryo karşılaştırması yüklenemedi. Sayfayı yenileyin.
      </div>
    )
  }

  const variances = data?.variances ?? []

  if (variances.length === 0) {
    return (
      <div className="px-4 py-12 text-center space-y-3">
        <div className="text-[#94a3b8] text-sm font-semibold">Henüz kaydedilmiş senaryo yok</div>
        <div className="text-[#cbd5e1] text-xs">
          Senaryolar sekmesinde what-if analizi yapın ve bir senaryo kaydedin.
          Burada gerçekleşen verilerle karşılaştırılacak.
        </div>
        <a href="/dashboard/planning?tab=scenarios" className="inline-block mt-2 text-xs text-brand-light font-semibold hover:underline">
          Senaryo Oluştur →
        </a>
      </div>
    )
  }

  const toggleExpand = (id: string) =>
    setExpandedId(prev => prev === id ? null : id)

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <SummaryStrip variances={variances} />

      {/* Comparison table */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
        <div className="px-4 py-3 border-b border-[#f1f5f9] flex items-center justify-between">
          <span className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">
            Senaryo Karşılaştırması
          </span>
          <span className="text-[9px] text-[#cbd5e1]">{variances.length} senaryo</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="bg-[#f8fafc]/60">
                <th className="text-left px-4 py-2.5 font-black text-[#94a3b8] whitespace-nowrap">Senaryo</th>
                <th className="text-left px-4 py-2.5 font-black text-[#94a3b8] whitespace-nowrap">Dönem</th>
                <th className="text-right px-4 py-2.5 font-black text-[#94a3b8] whitespace-nowrap">Doğruluk</th>
                <th className="text-center px-4 py-2.5 font-black text-[#94a3b8] whitespace-nowrap">Karar</th>
                <th className="text-right px-3 py-2.5 font-black text-[#94a3b8] whitespace-nowrap">Net Fark</th>
                <th className="text-right px-4 py-2.5 font-black text-[#94a3b8] whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {variances.map(v => {
                const isExpanded = expandedId === v.scenario_id
                const netDiff    = v.variance?.net_income_try ?? null
                const netPct     = v.variance?.net_income_pct ?? null

                return [
                  <tr
                    key={v.scenario_id}
                    className={cn(
                      'hover:bg-[#f8fafc]/60 cursor-pointer transition-colors',
                      isExpanded && 'bg-[#f8fafc]/40'
                    )}
                    onClick={() => toggleExpand(v.scenario_id)}
                  >
                    {/* Scenario name */}
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-[#334155] whitespace-nowrap max-w-[160px] truncate" title={v.scenario_name}>
                        {v.scenario_name}
                      </div>
                      <div className="text-[9px] text-[#94a3b8]">{fmtDate(v.scenario_created_at)}</div>
                    </td>

                    {/* Period */}
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="text-[#64748b]">{v.period_from.slice(0, 7)}</div>
                      <div className="text-[9px] text-[#94a3b8]">
                        {v.period_complete ? 'Tamamlandı' : 'Süren dönem'}
                      </div>
                    </td>

                    {/* Accuracy */}
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end">
                        {v.actuals_available
                          ? <AccuracyBar score={v.accuracy_score} />
                          : <span className="text-[9px] text-[#cbd5e1]">Veri bekleniyor</span>
                        }
                      </div>
                    </td>

                    {/* Verdict */}
                    <td className="px-4 py-2.5 text-center">
                      <VerdictBadge verdict={v.verdict} />
                    </td>

                    {/* Net income delta */}
                    <DeltaCell value={netDiff} pct={netPct} />

                    {/* Expand toggle */}
                    <td className="px-4 py-2.5 text-right">
                      <span className="text-[#94a3b8] text-[10px] select-none">
                        {isExpanded ? '▲' : '▼'}
                      </span>
                    </td>
                  </tr>,

                  isExpanded && <DetailRow key={`${v.scenario_id}-detail`} v={v} />,
                ]
              })}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-2.5 text-[9px] text-[#cbd5e1] border-t border-[#f1f5f9]">
          Her senaryo, kaydedildiği ayın gerçekleşen finansallarıyla karşılaştırılır ·
          Gelir verisi eksik senaryolarda net gelir esas alınır
        </div>
      </div>
    </div>
  )
}

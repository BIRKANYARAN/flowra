'use client'
// ── CohortRevenueClient — Monthly Customer Cohort Revenue Analysis ─────────────
// Fetches /api/commercial/cohort-revenue via TanStack Query.
// Features:
//   • Summary KPIs: avg 3m retention, best cohort, cohort count
//   • Cohort heatmap table (rows = cohorts, cols = period_offset 0–5)
//   • Cell color coding by retention %
//   • Cohort health badge

import { useQuery } from '@tanstack/react-query'
import {
  Panel,
  PanelHeader,
  KpiStrip,
  KpiCell,
  EmptySlate,
  Skeleton,
} from '@/components/ds'
import type {
  CohortRevenueReport,
  HeatmapCell,
} from '@/lib/services/commercial/cohort-revenue.service'

// ── Formatters ────────────────────────────────────────────────────────────────

const PCT_FMT = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

function fmtPct(n: number): string {
  return `%${PCT_FMT.format(n)}`
}

function fmtMonth(ym: string): string {
  const [year, month] = ym.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('tr-TR', {
    month: 'short',
    year: 'numeric',
  })
}

// ── Cell color helper ─────────────────────────────────────────────────────────

function cellClass(
  retention: number | null,
  isBase: boolean,
): string {
  if (isBase) return 'bg-[#1e293b] text-white'
  if (retention === null) return 'bg-[#f1f5f9] text-[#cbd5e1]'
  if (retention >= 60) return 'bg-emerald-100 text-emerald-800'
  if (retention >= 40) return 'bg-lime-100 text-lime-800'
  if (retention >= 20) return 'bg-yellow-100 text-yellow-700'
  return 'bg-red-100 text-red-700'
}

// ── Health badge ──────────────────────────────────────────────────────────────

const HEALTH_CFG = {
  excellent:        { label: 'Mükemmel',      bg: 'bg-emerald-100', text: 'text-emerald-800' },
  good:             { label: 'İyi',            bg: 'bg-lime-100',    text: 'text-lime-800'    },
  moderate:         { label: 'Orta',           bg: 'bg-yellow-100',  text: 'text-yellow-700'  },
  weak:             { label: 'Zayıf',          bg: 'bg-orange-100',  text: 'text-orange-700'  },
  poor:             { label: 'Kötü',           bg: 'bg-red-100',     text: 'text-red-700'     },
  insufficient_data:{ label: 'Veri Yetersiz',  bg: 'bg-[#f1f5f9]',  text: 'text-[#94a3b8]'  },
} as const

type HealthKey = keyof typeof HEALTH_CFG

function HealthBadge({ health }: { health: HealthKey }) {
  const cfg = HEALTH_CFG[health]
  return (
    <span className={`inline-block text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  )
}

// ── Trend badge ───────────────────────────────────────────────────────────────

const TREND_CFG = {
  improving:         { label: '↑ İyileşiyor',    text: 'text-emerald-700' },
  stable:            { label: '→ Stabil',         text: 'text-[#64748b]'  },
  declining:         { label: '↓ Düşüyor',        text: 'text-red-700'    },
  insufficient_data: { label: '— Veri Yetersiz',  text: 'text-[#94a3b8]' },
} as const

type TrendKey = keyof typeof TREND_CFG

function TrendBadge({ trend }: { trend: TrendKey }) {
  const cfg = TREND_CFG[trend]
  return (
    <span className={`text-[11px] font-bold ${cfg.text}`}>
      {cfg.label}
    </span>
  )
}

// ── Heatmap table ─────────────────────────────────────────────────────────────

const MAX_OFFSET = 5  // show period_offset 0 through 5

function HeatmapTable({ heatmap, cohortMonths }: { heatmap: HeatmapCell[]; cohortMonths: string[] }) {
  // Build lookup: cohort_month → offset → HeatmapCell
  const lookup = new Map<string, Map<number, HeatmapCell>>()
  for (const cell of heatmap) {
    if (!lookup.has(cell.cohort_month)) lookup.set(cell.cohort_month, new Map())
    lookup.get(cell.cohort_month)!.set(cell.period_offset, cell)
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#f1f5f9]">
            <th className="text-left px-4 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] w-28">
              Kohort
            </th>
            {Array.from({ length: MAX_OFFSET + 1 }, (_, i) => (
              <th key={i} className="text-center px-1 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] w-16">
                Ay {i}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f8fafc]">
          {cohortMonths.map(cohortMonth => {
            const offsets = lookup.get(cohortMonth)
            return (
              <tr key={cohortMonth} className="hover:bg-[#f8fafc]/60">
                <td className="px-4 py-2 text-[11px] font-bold text-[#334155] whitespace-nowrap">
                  {fmtMonth(cohortMonth)}
                </td>
                {Array.from({ length: MAX_OFFSET + 1 }, (_, offset) => {
                  const cell = offsets?.get(offset)
                  const isBase = offset === 0
                  const ret = cell?.retention_pct ?? null

                  return (
                    <td key={offset} className="px-1 py-1.5 text-center">
                      <span
                        className={`inline-block w-14 py-1 rounded text-[10px] font-bold tabular-nums cursor-default ${cellClass(ret, isBase)}`}
                        title={
                          cell
                            ? `₺${Math.round(cell.revenue_try).toLocaleString('tr-TR')} · ${ret !== null ? fmtPct(ret) : '—'} tutma`
                            : 'Veri yok'
                        }
                      >
                        {ret !== null ? `%${Math.round(ret)}` : '—'}
                      </span>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

interface ApiResponse {
  report: CohortRevenueReport
}

export default function CohortRevenueClient({ companyId }: Props) {
  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['cohort-revenue', companyId],
    queryFn: async () => {
      const res = await fetch('/api/commercial/cohort-revenue')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<ApiResponse>
    },
    staleTime: 60 * 60 * 1000, // 1 hour
  })

  if (isLoading) {
    return (
      <Panel>
        <PanelHeader label="Kohort Gelir Analizi" />
        <div className="p-4 space-y-3 animate-pulse">
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-16 bg-[#f1f5f9] rounded" />
            ))}
          </div>
          <Skeleton />
        </div>
      </Panel>
    )
  }

  if (error) return null

  const report = data?.report

  if (!report || report.cohort_rows.length === 0) {
    return (
      <Panel>
        <PanelHeader label="Kohort Gelir Analizi" />
        <EmptySlate
          title="Kohort verisi yok"
          sub="Kohort analizi için en az 1 aylık satış verisi gereklidir."
        />
      </Panel>
    )
  }

  const { summary, cohort_health, cohort_trend, heatmap } = report
  const cohortMonths = report.cohort_rows.map(r => r.cohort_month).sort()

  return (
    <Panel>
      <PanelHeader label="Kohort Gelir Analizi" />

      {/* KPI strip */}
      <KpiStrip>
        <KpiCell
          label="Ort. 3 Aylık Tutma"
          value={
            summary.avg_month_3_retention_pct !== null
              ? fmtPct(summary.avg_month_3_retention_pct)
              : '—'
          }
          sub={HEALTH_CFG[cohort_health].label}
        />
        <KpiCell
          label="Toplam Kohort"
          value={String(summary.total_cohorts)}
          sub={`Ort. ${Math.round(summary.avg_cohort_size)} müş./kohort`}
        />
        <KpiCell
          label="En İyi Kohort"
          value={summary.best_cohort ? fmtMonth(summary.best_cohort) : '—'}
          sub={summary.best_cohort ? 'En yüksek 3 ay tutma' : undefined}
        />
        <KpiCell
          label="Gelir Trendi"
          value={TREND_CFG[cohort_trend].label}
          sub="Son kohort vs. ort."
        />
      </KpiStrip>

      {/* Heatmap */}
      <div className="border-t border-[#f1f5f9]">
        <div className="px-4 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Gelir Tutma Heatmap (Ay 0–{MAX_OFFSET})
        </div>
        <HeatmapTable heatmap={heatmap} cohortMonths={cohortMonths} />
      </div>

      {/* Legend */}
      <div className="px-4 py-2 border-t border-[#f8fafc] flex flex-wrap gap-3 items-center">
        <span className="text-[9px] text-[#94a3b8]">Tutma rengi:</span>
        {[
          { cls: 'bg-emerald-100 text-emerald-800', label: '≥%60' },
          { cls: 'bg-lime-100 text-lime-800',       label: '≥%40' },
          { cls: 'bg-yellow-100 text-yellow-700',   label: '≥%20' },
          { cls: 'bg-red-100 text-red-700',          label: '<%20' },
          { cls: 'bg-[#f1f5f9] text-[#cbd5e1]',     label: 'Veri yok' },
        ].map(({ cls, label }) => (
          <span key={label} className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${cls}`}>
            {label}
          </span>
        ))}
      </div>
    </Panel>
  )
}

'use client'
// ── PipelineVelocityClient — Sales Pipeline Velocity & Conversion Analysis ───
// Fetches /api/commercial/pipeline-velocity via TanStack Query.
// Displays:
//   • Header: "Satış Boru Hattı Hızı"
//   • 4 KPI cards: Dönüşüm Oranı / Ort. Kapanma Günü / Pipeline Hızı / Win/Loss Oranı
//   • Pipeline health badge
//   • Stuck deals warning (if stuck_rate > 20%)
//   • Monthly flow table (6 months)

import { useQuery } from '@tanstack/react-query'
import { fmtTRY, fmtPct } from '@/lib/format'
import type {
  classifyPipelineHealth,
  computeStuckDealRate,
  computeMonthlyPipelineFlow,
} from '@/lib/services/commercial/pipeline-velocity.service'

// ── Types mirrored from the service ──────────────────────────────────────────

type PipelineHealth = ReturnType<typeof classifyPipelineHealth>
type StuckDeals     = ReturnType<typeof computeStuckDealRate>
type MonthlyFlow    = ReturnType<typeof computeMonthlyPipelineFlow>

interface PipelineReport {
  current: {
    open_deal_count:        number
    open_pipeline_value:    number
    conversion_rate_pct:    number | null
    avg_days_to_close:      number | null
    pipeline_velocity:      number | null
    pipeline_health:        PipelineHealth
    win_loss_ratio:         number | null
    sales_cycle_efficiency: number | null
  }
  stuck_deals: StuckDeals
  monthly_flow: MonthlyFlow
  summary: {
    total_deals_ytd:           number
    total_converted_ytd:       number
    total_revenue_from_pipeline: number
    best_conversion_month:     string | null
    worst_conversion_month:    string | null
  }
}

interface ApiResponse {
  report: PipelineReport
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDays(d: number | null): string {
  if (d === null) return '—'
  return `${Math.round(d)} gün`
}

function fmtRatio(r: number | null): string {
  if (r === null) return '—'
  return r.toFixed(2)
}

function fmtVelocity(v: number | null): string {
  if (v === null) return '—'
  if (v >= 1_000_000) return `₺${(v / 1_000_000).toFixed(1)}M/gün`
  if (v >= 1_000)     return `₺${(v / 1_000).toFixed(1)}K/gün`
  return `₺${Math.round(v).toLocaleString('tr-TR')}/gün`
}

function fmtMonth(ym: string): string {
  const [year, month] = ym.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('tr-TR', {
    month: 'short',
    year: '2-digit',
  })
}

// ── Health badge ──────────────────────────────────────────────────────────────

const HEALTH_CONFIG: Record<PipelineHealth, { label: string; cls: string }> = {
  excellent:         { label: 'Mükemmel',      cls: 'bg-emerald-100 text-emerald-800' },
  good:              { label: 'İyi',            cls: 'bg-teal-100 text-teal-700' },
  average:           { label: 'Ortalama',       cls: 'bg-yellow-100 text-yellow-700' },
  underperforming:   { label: 'Yetersiz',       cls: 'bg-red-100 text-red-700' },
  insufficient_data: { label: 'Veri Yetersiz',  cls: 'bg-[#f1f5f9] text-[#94a3b8]' },
}

function HealthBadge({ health }: { health: PipelineHealth }) {
  const cfg = HEALTH_CONFIG[health]
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string
  value: string
  sub?: string
  color?: string
}

function KpiCard({ label, value, sub, color = 'text-[#0f172a]' }: KpiCardProps) {
  return (
    <div className="p-3">
      <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
        {label}
      </div>
      <div className={`text-xl font-extrabold tabular-nums leading-none ${color}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-[#94a3b8] mt-1">{sub}</div>}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

export default function PipelineVelocityClient({ companyId }: Props) {
  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['pipeline-velocity', companyId],
    queryFn:  () => fetch('/api/commercial/pipeline-velocity').then(r => r.json()),
    staleTime: 4 * 60 * 1000,  // 4 minutes
  })

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-[#f1f5f9] rounded w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden h-24" />
        <div className="h-40 bg-[#f1f5f9] rounded" />
      </div>
    )
  }

  if (error || !data?.report) {
    return (
      <div className="bg-neg-light border border-neg-light rounded px-4 py-3">
        <span className="text-[10px] font-bold text-neg">
          Pipeline hızı verisi yüklenemedi.
        </span>
      </div>
    )
  }

  const { current, stuck_deals, monthly_flow, summary } = data.report
  const showStuckWarning = (stuck_deals.stuck_rate_pct ?? 0) > 20

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
          Satış Boru Hattı Hızı
        </span>
        <HealthBadge health={current.pipeline_health} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden divide-x divide-y sm:divide-y-0 divide-[#e8eaef]">
        <KpiCard
          label="Dönüşüm Oranı"
          value={current.conversion_rate_pct !== null ? fmtPct(current.conversion_rate_pct) : '—'}
          sub={`${summary.total_converted_ytd} / ${summary.total_deals_ytd} YTD`}
          color={
            current.conversion_rate_pct === null ? 'text-[#94a3b8]' :
            current.conversion_rate_pct >= 60 ? 'text-emerald-700' :
            current.conversion_rate_pct >= 40 ? 'text-teal-700' :
            current.conversion_rate_pct >= 20 ? 'text-yellow-700' :
            'text-red-600'
          }
        />
        <KpiCard
          label="Ort. Kapanma Günü"
          value={fmtDays(current.avg_days_to_close)}
          sub={
            current.sales_cycle_efficiency !== null
              ? current.sales_cycle_efficiency >= 100
                ? `Benchmarktan %${(current.sales_cycle_efficiency - 100).toFixed(0)} hızlı`
                : `Benchmarktan %${(100 - current.sales_cycle_efficiency).toFixed(0)} yavaş`
              : 'Benchmark: 14 gün'
          }
          color={
            current.avg_days_to_close === null ? 'text-[#94a3b8]' :
            current.avg_days_to_close <= 10.5 ? 'text-emerald-700' :
            current.avg_days_to_close <= 17.5 ? 'text-teal-700' :
            current.avg_days_to_close <= 28 ? 'text-yellow-700' :
            'text-red-600'
          }
        />
        <KpiCard
          label="Pipeline Hızı"
          value={fmtVelocity(current.pipeline_velocity)}
          sub={`${current.open_deal_count} açık anlaşma · ${fmtTRY(current.open_pipeline_value, 0)}`}
          color="text-[#0f172a]"
        />
        <KpiCard
          label="Win/Loss Oranı"
          value={fmtRatio(current.win_loss_ratio)}
          sub={current.win_loss_ratio !== null
            ? current.win_loss_ratio >= 1
              ? 'Kazanç lehine'
              : 'Kayıp lehine'
            : 'Veri yetersiz'
          }
          color={
            current.win_loss_ratio === null ? 'text-[#94a3b8]' :
            current.win_loss_ratio >= 2 ? 'text-emerald-700' :
            current.win_loss_ratio >= 1 ? 'text-teal-700' :
            'text-red-600'
          }
        />
      </div>

      {/* Pipeline revenue summary */}
      {summary.total_revenue_from_pipeline > 0 && (
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
              Pipeline'dan Toplam Gelir
            </div>
            <div className="text-lg font-black text-[#0f172a] tabular-nums mt-0.5">
              {fmtTRY(summary.total_revenue_from_pipeline, 0)}
            </div>
          </div>
          <div className="flex gap-4 text-right">
            {summary.best_conversion_month && (
              <div>
                <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">En İyi Ay</div>
                <div className="text-sm font-bold text-emerald-700">{fmtMonth(summary.best_conversion_month)}</div>
              </div>
            )}
            {summary.worst_conversion_month && (
              <div>
                <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">En Kötü Ay</div>
                <div className="text-sm font-bold text-red-600">{fmtMonth(summary.worst_conversion_month)}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stuck deals warning */}
      {showStuckWarning && (
        <div className="bg-warn-light border border-warn-light rounded px-4 py-3">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-warn-text mb-1">
            Takılı Anlaşma Uyarısı
          </div>
          <div className="text-[10px] text-warn-text">
            <span className="font-bold">{stuck_deals.stuck_count} anlaşma</span>
            {' '}30+ gün boyunca hareket etmedi —{' '}
            <span className="font-bold">
              {stuck_deals.stuck_rate_pct !== null ? fmtPct(stuck_deals.stuck_rate_pct) : '—'}
            </span>
            {' '}takılı oran ·{' '}
            {fmtTRY(stuck_deals.stuck_value, 0)} değerinde pipeline beklemede.
          </div>
        </div>
      )}

      {/* Monthly flow table */}
      {monthly_flow.length > 0 && (
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#e8eaef]">
            <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
              Aylık Pipeline Akışı — Son 6 Ay
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] border-b border-[#e8eaef]">
                  <th className="text-left px-4 py-2">Ay</th>
                  <th className="text-right px-4 py-2">Oluştu</th>
                  <th className="text-right px-4 py-2">Dönüştü</th>
                  <th className="text-right px-4 py-2">Kayıp</th>
                  <th className="text-right px-4 py-2">Bekleyen</th>
                  <th className="text-right px-4 py-2">Dönüşüm %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {monthly_flow.map(m => (
                  <tr key={m.month} className="hover:bg-[#f8fafc]">
                    <td className="px-4 py-2.5 font-semibold text-[#334155]">
                      {fmtMonth(m.month)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[#334155]">
                      {m.created}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700 font-semibold">
                      {m.converted > 0 ? m.converted : <span className="text-[#94a3b8]">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-red-600">
                      {m.lost > 0 ? m.lost : <span className="text-[#94a3b8]">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[#334155]">
                      {m.pending}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                      {m.conversion_rate !== null ? (
                        <span className={
                          m.conversion_rate >= 60 ? 'text-emerald-700' :
                          m.conversion_rate >= 40 ? 'text-teal-700' :
                          m.conversion_rate >= 20 ? 'text-yellow-700' :
                          'text-red-600'
                        }>
                          {fmtPct(m.conversion_rate)}
                        </span>
                      ) : (
                        <span className="text-[#94a3b8]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

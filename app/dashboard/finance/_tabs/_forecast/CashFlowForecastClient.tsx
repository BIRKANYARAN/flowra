'use client'

// ─────────────────────────────────────────────────────────────────────────────
// CashFlowForecastClient
//
// Aylık Nakit Akış Tahmini (Monthly Cash Flow Forecast)
//
// Features:
//   - Runway status badge (critical / at_risk / caution / healthy)
//   - Starting cash KPI
//   - 3-scenario (baseline / worst / best) monthly bars
//   - Summary KPI grid (avg burn, trend, break-even)
//   - Narrative footer
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }    from '@tanstack/react-query'
import { fmtTRY }      from '@/lib/format'
import {
  LoadingSpinner,
  ErrorBanner,
} from '@/components/ds'
import type {
  CashFlowForecastReport,
  MonthlyForecastPoint,
} from '@/lib/services/finance/cashflow-forecast.service'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

// ── Runway status badge ───────────────────────────────────────────────────────

type RunwayStatus = 'critical' | 'at_risk' | 'caution' | 'healthy'

const RUNWAY_CONFIG: Record<RunwayStatus, { label: string; cls: string }> = {
  healthy:  { label: 'Sağlıklı',     cls: 'bg-green-100 text-green-800'   },
  caution:  { label: 'Dikkatli',     cls: 'bg-yellow-100 text-yellow-800' },
  at_risk:  { label: 'Risk Altında', cls: 'bg-orange-100 text-orange-800' },
  critical: { label: 'Kritik',       cls: 'bg-red-100 text-red-800'       },
}

function RunwayBadge({ status }: { status: RunwayStatus }) {
  const cfg = RUNWAY_CONFIG[status]
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-bold ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

// ── Month bar row ─────────────────────────────────────────────────────────────

function MonthBar({
  point,
  maxValue,
}: {
  point: MonthlyForecastPoint
  maxValue: number
}) {
  const revPct = maxValue > 0 ? (point.revenue_forecast_try / maxValue) * 100 : 0
  const expPct = maxValue > 0 ? (point.expense_forecast_try / maxValue) * 100 : 0
  const isNeg  = point.cumulative_position_try < 0

  return (
    <div className="flex items-center gap-2 py-1">
      {/* Month label */}
      <div className="w-14 text-right text-[10px] font-semibold text-[#475569] shrink-0">
        {point.month.slice(5)}
      </div>

      {/* Bar group */}
      <div className="flex-1 space-y-0.5">
        {/* Revenue bar */}
        <div className="h-2 bg-[#f1f5f9] rounded-sm overflow-hidden">
          <div
            className="h-full bg-green-400 rounded-sm"
            style={{ width: `${Math.min(100, revPct)}%` }}
          />
        </div>
        {/* Expense bar */}
        <div className="h-2 bg-[#f1f5f9] rounded-sm overflow-hidden">
          <div
            className="h-full bg-red-400 rounded-sm"
            style={{ width: `${Math.min(100, expPct)}%` }}
          />
        </div>
      </div>

      {/* Cumulative cash */}
      <div
        className={`w-24 text-right text-[10px] font-black tabular-nums shrink-0 ${
          isNeg ? 'text-red-600' : 'text-[#334155]'
        }`}
      >
        {fmtTRY(point.cumulative_position_try)}
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CashFlowForecastClient({ companyId }: Props) {
  void companyId
  const { data, isLoading, isError } = useQuery<{ report: CashFlowForecastReport }>({
    queryKey:  ['cashflow-forecast', companyId],
    queryFn:   async () => {
      const res = await fetch('/api/finance/cashflow-forecast', { cache: 'no-store' })
      if (!res.ok) throw new Error('Aylık nakit tahmini verisi alınamadı')
      return res.json()
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSpinner />
      </div>
    )
  }

  if (isError || !data?.report) {
    return (
      <div className="p-4">
        <ErrorBanner msg="Aylık nakit tahmini yüklenemedi." />
      </div>
    )
  }

  const report = data.report
  const { baseline, worst_case, best_case, narrative, starting_cash_try, avg_monthly_burn_try, cash_flow_trend } = report

  // Compute max value for bar scaling across baseline monthly points
  const maxValue = Math.max(
    ...baseline.monthly.map(p => Math.max(p.revenue_forecast_try, p.expense_forecast_try)),
    1,
  )

  const trendLabel: Record<typeof cash_flow_trend, string> = {
    improving:         'İyileşiyor',
    stable:            'Stabil',
    deteriorating:     'Bozuluyor',
    insufficient_data: 'Yetersiz veri',
  }

  const kpis = [
    {
      label: 'Başlangıç Nakit',
      value: fmtTRY(starting_cash_try),
      tone: starting_cash_try >= 0 ? 'text-[#334155]' : 'text-red-700',
    },
    {
      label: 'Baseline Runway',
      value: baseline.runway_months !== null ? `${baseline.runway_months} ay` : '∞',
      tone: baseline.runway_status === 'critical' ? 'text-red-700' :
            baseline.runway_status === 'at_risk'  ? 'text-orange-600' :
            baseline.runway_status === 'caution'  ? 'text-yellow-700' : 'text-green-700',
    },
    {
      label: 'Kötümser Son Nakit',
      value: fmtTRY(worst_case.final_cash_position_try),
      tone: worst_case.final_cash_position_try < 0 ? 'text-red-700 font-black' : 'text-[#334155]',
    },
    {
      label: 'İyimser Son Nakit',
      value: fmtTRY(best_case.final_cash_position_try),
      tone: best_case.final_cash_position_try >= 0 ? 'text-green-700' : 'text-red-600',
    },
    {
      label: 'Ort. Aylık Burn',
      value: avg_monthly_burn_try !== null ? fmtTRY(avg_monthly_burn_try) : '—',
      tone: avg_monthly_burn_try !== null ? 'text-red-600' : 'text-[#94a3b8]',
    },
    {
      label: 'Trend',
      value: trendLabel[cash_flow_trend],
      tone: cash_flow_trend === 'improving'    ? 'text-green-700' :
            cash_flow_trend === 'deteriorating' ? 'text-red-600'   : 'text-[#334155]',
    },
  ]

  return (
    <div className="border border-[#e2e8f0] rounded-lg overflow-hidden bg-white text-[#0f172a]">

      {/* Header */}
      <div className="px-4 py-3 border-b border-[#e2e8f0] flex items-center justify-between gap-3 flex-wrap bg-[#f8fafc]">
        <div>
          <div className="text-xs font-black uppercase tracking-widest text-[#94a3b8]">
            {report.forecast_months} Aylık Nakit Akış Tahmini
          </div>
          <div className="text-lg font-black tabular-nums text-[#0f172a] mt-0.5">
            {fmtTRY(starting_cash_try)}
            <span className="ml-1 text-[10px] font-semibold text-[#94a3b8]">başlangıç nakit</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <RunwayBadge status={baseline.runway_status} />
          {baseline.break_even_month !== null && (
            <span className="text-[9px] font-semibold text-[#64748b] bg-[#f1f5f9] px-2 py-0.5 rounded">
              Başabaş: {baseline.break_even_month}. ay
            </span>
          )}
        </div>
      </div>

      {/* Bar legend */}
      <div className="px-4 py-2 border-b border-[#e2e8f0] flex items-center gap-4 bg-white">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2 rounded-sm bg-green-400" />
          <span className="text-[9px] font-semibold text-[#64748b]">Gelir Tahmini</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2 rounded-sm bg-red-400" />
          <span className="text-[9px] font-semibold text-[#64748b]">Gider Tahmini</span>
        </div>
        <div className="ml-auto text-[9px] font-semibold text-[#94a3b8]">Kümülatif Nakit →</div>
      </div>

      {/* Monthly bar visualization (baseline) */}
      <div className="px-4 py-3 border-b border-[#e2e8f0] space-y-0">
        {baseline.monthly.map(point => (
          <MonthBar key={point.month} point={point} maxValue={maxValue} />
        ))}
      </div>

      {/* Runway alert */}
      {baseline.runway_months !== null && baseline.runway_months < 6 && (
        <div className="border-b border-[#e2e8f0] px-4 py-2.5 bg-red-50 text-xs text-red-700 font-semibold">
          Nakit {baseline.runway_months} ay içinde kritik seviyeye ulaşabilir.
        </div>
      )}

      {/* Summary KPI grid */}
      <div className="grid grid-cols-3 sm:grid-cols-6 divide-x divide-y sm:divide-y-0 divide-[#e2e8f0] border-b border-[#e2e8f0]">
        {kpis.map(kpi => (
          <div key={kpi.label} className="px-3 py-3">
            <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
              {kpi.label}
            </div>
            <div className={`text-sm font-black tabular-nums leading-none ${kpi.tone}`}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* Narrative footer */}
      <div className="px-4 py-3 bg-white">
        <p className="text-xs text-[#475569] leading-relaxed">{narrative}</p>
      </div>
    </div>
  )
}

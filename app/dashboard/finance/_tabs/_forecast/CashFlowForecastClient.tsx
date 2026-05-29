'use client'

// ─────────────────────────────────────────────────────────────────────────────
// CashFlowForecastClient
//
// 13-Haftalık Nakit Akış Tahmini (13-Week Cash Flow Forecast)
//
// Features:
//   - Liquidity outlook badge (strong / stable / cautious / at_risk / critical)
//   - Current cash KPI
//   - 13-week bar visualization (simple divs, scaled to max outflow/inflow)
//   - Summary KPI grid (total inflows, outflows, best/worst week)
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
  WeeklyBucket,
} from '@/lib/services/finance/cashflow-forecast.service'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

// ── Outlook badge ─────────────────────────────────────────────────────────────

type Outlook = CashFlowForecastReport['liquidity_outlook']

const OUTLOOK_CONFIG: Record<Outlook, { label: string; cls: string }> = {
  strong:   { label: 'Güçlü',      cls: 'bg-green-100 text-green-800'   },
  stable:   { label: 'Dengede',    cls: 'bg-blue-100 text-blue-800'     },
  cautious: { label: 'Dikkatli',   cls: 'bg-yellow-100 text-yellow-800' },
  at_risk:  { label: 'Risk Altında', cls: 'bg-orange-100 text-orange-800' },
  critical: { label: 'Kritik',     cls: 'bg-red-100 text-red-800'       },
}

function OutlookBadge({ outlook }: { outlook: Outlook }) {
  const cfg = OUTLOOK_CONFIG[outlook]
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-bold ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

// ── Bar chart row ─────────────────────────────────────────────────────────────

function WeekBar({
  bucket,
  maxValue,
}: {
  bucket: WeeklyBucket
  maxValue: number
}) {
  const inflowPct  = maxValue > 0 ? (bucket.expected_inflows / maxValue) * 100 : 0
  const outflowPct = maxValue > 0 ? (bucket.expected_outflows / maxValue) * 100 : 0
  const isNeg = bucket.is_negative

  return (
    <div className="flex items-center gap-2 py-1">
      {/* Week label */}
      <div className="w-14 text-right text-[10px] font-semibold text-[#475569] shrink-0">
        H{bucket.week_number}
      </div>

      {/* Bar group */}
      <div className="flex-1 space-y-0.5">
        {/* Inflow bar */}
        <div className="h-2 bg-[#f1f5f9] rounded-sm overflow-hidden">
          <div
            className="h-full bg-green-400 rounded-sm"
            style={{ width: `${Math.min(100, inflowPct)}%` }}
          />
        </div>
        {/* Outflow bar */}
        <div className="h-2 bg-[#f1f5f9] rounded-sm overflow-hidden">
          <div
            className="h-full bg-red-400 rounded-sm"
            style={{ width: `${Math.min(100, outflowPct)}%` }}
          />
        </div>
      </div>

      {/* Cumulative cash */}
      <div
        className={`w-24 text-right text-[10px] font-black tabular-nums shrink-0 ${
          isNeg ? 'text-red-600' : 'text-[#334155]'
        }`}
      >
        {fmtTRY(bucket.cumulative_cash)}
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CashFlowForecastClient({ companyId }: Props) {
  const { data, isLoading, isError } = useQuery<{ report: CashFlowForecastReport }>({
    queryKey:  ['cashflow-forecast', companyId],
    queryFn:   async () => {
      const res = await fetch('/api/finance/cashflow-forecast', { cache: 'no-store' })
      if (!res.ok) throw new Error('13 haftalık nakit tahmini verisi alınamadı')
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
        <ErrorBanner msg="13 haftalık nakit tahmini yüklenemedi." />
      </div>
    )
  }

  const report = data.report
  const { summary, weekly_buckets, liquidity_outlook, narrative, current_cash_estimate, data_quality } = report

  // Compute max value for bar scaling
  const maxValue = Math.max(
    ...weekly_buckets.map(b => Math.max(b.expected_inflows, b.expected_outflows)),
    1,
  )

  // Summary KPIs
  const kpis = [
    {
      label: 'Toplam Giriş',
      value: fmtTRY(summary.total_inflows),
      tone: 'text-green-700',
    },
    {
      label: 'Toplam Çıkış',
      value: fmtTRY(summary.total_outflows),
      tone: 'text-red-600',
    },
    {
      label: 'En İyi Hafta Net',
      value: fmtTRY(summary.best_week_net),
      tone: summary.best_week_net >= 0 ? 'text-green-700' : 'text-red-600',
    },
    {
      label: 'En Kötü Hafta Net',
      value: fmtTRY(summary.worst_week_net),
      tone: summary.worst_week_net >= 0 ? 'text-[#334155]' : 'text-red-600',
    },
    {
      label: 'Min Kümülatif Nakit',
      value: fmtTRY(summary.min_cumulative_cash),
      tone: summary.min_cumulative_cash < 0 ? 'text-red-700 font-black' : 'text-[#334155]',
    },
    {
      label: 'Negatif Hafta Sayısı',
      value: String(summary.weeks_negative),
      tone: summary.weeks_negative > 0 ? 'text-red-600' : 'text-green-700',
    },
  ]

  const dataQualityLabel: Record<typeof data_quality, string> = {
    full:      'Tam veri',
    partial:   'Kısmi veri',
    estimated: 'Tahmini veri',
  }

  return (
    <div className="border border-[#e2e8f0] rounded-lg overflow-hidden bg-white text-[#0f172a]">

      {/* Header */}
      <div className="px-4 py-3 border-b border-[#e2e8f0] flex items-center justify-between gap-3 flex-wrap bg-[#f8fafc]">
        <div>
          <div className="text-xs font-black uppercase tracking-widest text-[#94a3b8]">
            13 Haftalık Nakit Akış Tahmini
          </div>
          {current_cash_estimate !== null && (
            <div className="text-lg font-black tabular-nums text-[#0f172a] mt-0.5">
              {fmtTRY(current_cash_estimate)}
              <span className="ml-1 text-[10px] font-semibold text-[#94a3b8]">mevcut nakit</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <OutlookBadge outlook={liquidity_outlook} />
          <span className="text-[9px] font-semibold text-[#94a3b8] bg-[#f1f5f9] px-2 py-0.5 rounded">
            {dataQualityLabel[data_quality]}
          </span>
        </div>
      </div>

      {/* Bar legend */}
      <div className="px-4 py-2 border-b border-[#e2e8f0] flex items-center gap-4 bg-white">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2 rounded-sm bg-green-400" />
          <span className="text-[9px] font-semibold text-[#64748b]">Giriş</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2 rounded-sm bg-red-400" />
          <span className="text-[9px] font-semibold text-[#64748b]">Çıkış</span>
        </div>
        <div className="ml-auto text-[9px] font-semibold text-[#94a3b8]">Kapanış Nakit →</div>
      </div>

      {/* 13-week bar visualization */}
      <div className="px-4 py-3 border-b border-[#e2e8f0] space-y-0">
        {weekly_buckets.map(bucket => (
          <WeekBar key={bucket.week_number} bucket={bucket} maxValue={maxValue} />
        ))}
      </div>

      {/* First negative week alert */}
      {summary.first_negative_week !== null && (
        <div className="border-b border-[#e2e8f0] px-4 py-2.5 bg-red-50 text-xs text-red-700 font-semibold">
          Hafta {summary.first_negative_week}&apos;da kümülatif nakit negatife düşüyor.
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

      {/* Breakeven revenue */}
      <div className="border-b border-[#e2e8f0] px-4 py-2 bg-[#f8fafc] text-[10px] text-[#64748b]">
        Başa baş haftalık gelir:{' '}
        <strong className="text-[#0f172a]">{fmtTRY(report.breakeven_weekly_revenue)}</strong>
      </div>

      {/* Narrative footer */}
      <div className="px-4 py-3 bg-white">
        <p className="text-xs text-[#475569] leading-relaxed">{narrative}</p>
      </div>
    </div>
  )
}

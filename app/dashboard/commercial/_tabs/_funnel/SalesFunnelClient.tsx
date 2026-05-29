'use client'
// ── SalesFunnelClient — Sales Funnel Conversion Analytics ─────────────────────
// Fetches /api/commercial/sales-funnel via TanStack Query.
// Features:
//   • 4 KPI cells: open pipeline, weighted pipeline, 30d forecast, overall conversion %
//   • Funnel visualization: 5 horizontal bars by stage (decreasing width)
//   • Bottleneck badge + velocity badge
//   • Monthly flow: new proformas, won, lost this month

import { useQuery } from '@tanstack/react-query'
import type {
  SalesFunnelReport,
  FunnelStage,
} from '@/lib/services/commercial/sales-funnel.service'

// ── Formatters ────────────────────────────────────────────────────────────────

const TRY_FMT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })
const PCT_FMT = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

function fmtTRY(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₺${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `₺${(n / 1_000).toFixed(1)}K`
  return `₺${TRY_FMT.format(Math.round(n))}`
}

function fmtPct(n: number): string {
  return `%${PCT_FMT.format(n)}`
}

// ── Stage color config ────────────────────────────────────────────────────────

const STAGE_COLOR: Record<string, { bg: string; bar: string; text: string }> = {
  proforma:  { bg: 'bg-blue-50',   bar: 'bg-blue-500',   text: 'text-blue-700'   },
  confirmed: { bg: 'bg-indigo-50', bar: 'bg-indigo-500', text: 'text-indigo-700' },
  partial:   { bg: 'bg-amber-50',  bar: 'bg-amber-500',  text: 'text-amber-700'  },
  paid:      { bg: 'bg-green-50',  bar: 'bg-green-500',  text: 'text-green-700'  },
  overdue:   { bg: 'bg-red-50',    bar: 'bg-red-500',    text: 'text-red-700'    },
}

// ── Health / velocity badges ──────────────────────────────────────────────────

const HEALTH_CFG = {
  excellent: { label: 'Mükemmel', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  good:      { label: 'İyi',      bg: 'bg-teal-100',    text: 'text-teal-700'    },
  moderate:  { label: 'Orta',     bg: 'bg-yellow-100',  text: 'text-yellow-700'  },
  low:       { label: 'Düşük',    bg: 'bg-orange-100',  text: 'text-orange-700'  },
  poor:      { label: 'Zayıf',    bg: 'bg-red-100',     text: 'text-red-700'     },
} as const

const VELOCITY_CFG = {
  fast:    { label: 'Hızlı',     bg: 'bg-emerald-100', text: 'text-emerald-800' },
  normal:  { label: 'Normal',    bg: 'bg-teal-100',    text: 'text-teal-700'    },
  slow:    { label: 'Yavaş',     bg: 'bg-yellow-100',  text: 'text-yellow-700'  },
  stalled: { label: 'Durağan',   bg: 'bg-red-100',     text: 'text-red-700'     },
} as const

function Badge({ label, bg, text }: { label: string; bg: string; text: string }) {
  return (
    <span className={`inline-block text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${bg} ${text}`}>
      {label}
    </span>
  )
}

// ── KPI Cell ──────────────────────────────────────────────────────────────────

function KpiCell({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="p-3">
      <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
        {label}
      </div>
      <div className="text-lg font-black tabular-nums leading-none text-[#0f172a]">
        {value}
      </div>
      {sub && (
        <div className="text-[9px] text-[#94a3b8] mt-0.5">{sub}</div>
      )}
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 space-y-3 animate-pulse">
      <div className="h-3 w-52 bg-[#f1f5f9] rounded" />
      <div className="grid grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-14 bg-[#f1f5f9] rounded" />
        ))}
      </div>
      <div className="h-40 bg-[#f8fafc] rounded" />
    </div>
  )
}

// ── Funnel bar ────────────────────────────────────────────────────────────────

function FunnelBar({
  stage,
  maxValue,
  nextStage,
}: {
  stage: FunnelStage
  maxValue: number
  nextStage: FunnelStage | undefined
}) {
  const colors  = STAGE_COLOR[stage.stage_id] ?? STAGE_COLOR['proforma']
  const widthPct = maxValue > 0 ? (stage.value_try / maxValue) * 100 : 0
  const convRate = nextStage
    ? (stage.count > 0 ? (nextStage.count / stage.count) * 100 : 0)
    : null

  return (
    <div className={`rounded px-3 py-2 ${colors.bg}`}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-bold ${colors.text}`}>
            {stage.stage_name}
          </span>
          <span className="text-[10px] text-[#64748b] tabular-nums">
            {stage.count} adet
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-black tabular-nums ${colors.text}`}>
            {fmtTRY(stage.value_try)}
          </span>
          {convRate !== null && (
            <span className="text-[10px] text-[#94a3b8]">
              → {fmtPct(convRate)}
            </span>
          )}
        </div>
      </div>
      <div className="h-3 bg-white/60 rounded overflow-hidden">
        <div
          className={`h-3 rounded ${colors.bar} transition-all`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      {stage.avg_days_in_stage !== null && (
        <div className="text-[9px] text-[#94a3b8] mt-1">
          Ort. {Math.round(stage.avg_days_in_stage)} gün bu aşamada
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

interface ApiResponse {
  report: SalesFunnelReport
}

export default function SalesFunnelClient({ companyId }: Props) {
  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['sales-funnel', companyId],
    queryFn: async () => {
      const res = await fetch('/api/commercial/sales-funnel')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<ApiResponse>
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  if (isLoading) return <Skeleton />
  if (error)     return null

  const report = data?.report

  // Empty state
  if (!report || report.stages.every(s => s.count === 0)) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded px-4 py-6 text-center">
        <p className="text-sm text-[#94a3b8]">
          Satış hunisi analizi için yeterli veri yok
        </p>
        <p className="text-[10px] text-[#cbd5e1] mt-1">
          Son 90 gün tarandı
        </p>
      </div>
    )
  }

  const { stages, metrics, conversion_health, deal_velocity, bottleneck_stage, monthly_flow } = report
  const maxValue = Math.max(...stages.map(s => s.value_try), 1)

  const healthCfg   = HEALTH_CFG[conversion_health]
  const velocityCfg = VELOCITY_CFG[deal_velocity]

  const bottleneckStageObj = bottleneck_stage
    ? stages.find(s => s.stage_id === bottleneck_stage)
    : null

  return (
    <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#f1f5f9] flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Satış Hunisi Dönüşüm Analizi
        </span>
        <div className="flex items-center gap-2">
          <Badge {...healthCfg} />
          <Badge {...velocityCfg} />
          {bottleneckStageObj && (
            <span className="text-[10px] text-red-600 font-bold">
              Darboğaz: {bottleneckStageObj.stage_name}
            </span>
          )}
        </div>
      </div>

      {/* KPI strip — 4 cells */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-[#e2e8f0] border-b border-[#e2e8f0]">
        <KpiCell
          label="Açık Pipeline"
          value={fmtTRY(report.open_pipeline_value_try)}
          sub="Proforma + onaylı sipariş"
        />
        <KpiCell
          label="Ağırlıklı Pipeline"
          value={fmtTRY(report.weighted_pipeline_value_try)}
          sub="Olasılık ağırlıklı değer"
        />
        <KpiCell
          label="30 Günlük Tahmin"
          value={report.pipeline_30d_forecast_try !== null
            ? fmtTRY(report.pipeline_30d_forecast_try)
            : '—'}
          sub={report.pipeline_30d_forecast_try !== null ? 'Beklenen gelir' : 'Yeterli döngü verisi yok'}
        />
        <KpiCell
          label="Genel Dönüşüm"
          value={fmtPct(metrics.overall_conversion_rate)}
          sub="Proforma → Tam tahsilat"
        />
      </div>

      {/* Funnel visualization */}
      <div className="px-4 py-3 space-y-2 border-b border-[#f1f5f9]">
        <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
          Huni Aşamaları
        </div>
        {stages.map((stage, i) => (
          <FunnelBar
            key={stage.stage_id}
            stage={stage}
            maxValue={maxValue}
            nextStage={stages[i + 1]}
          />
        ))}
      </div>

      {/* Conversion rates row */}
      <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-3 border-b border-[#f1f5f9]">
        <div>
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            Proforma → Satış
          </div>
          <div className="text-base font-black tabular-nums text-[#0f172a]">
            {fmtPct(metrics.proforma_to_sale_rate)}
          </div>
        </div>
        <div>
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            Satış → Tam Ödeme
          </div>
          <div className="text-base font-black tabular-nums text-[#0f172a]">
            {fmtPct(metrics.sale_to_paid_rate)}
          </div>
        </div>
        <div>
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            Toplam Kayıp Değer
          </div>
          <div className="text-base font-black tabular-nums text-red-600">
            {fmtTRY(report.total_leakage_try)}
          </div>
        </div>
      </div>

      {/* Monthly flow */}
      <div className="px-4 py-3">
        <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
          Bu Ay Huni Akışı
        </div>
        <div className="flex flex-wrap gap-4">
          <div>
            <div className="text-[9px] text-[#94a3b8]">Yeni Proforma</div>
            <div className="text-sm font-black tabular-nums text-[#0f172a]">
              {monthly_flow.won_rate > 0 || monthly_flow.lost_rate > 0
                ? Math.round(monthly_flow.still_open + (monthly_flow.won_rate / 100) * (monthly_flow.still_open + 1) + (monthly_flow.lost_rate / 100) * (monthly_flow.still_open + 1))
                : monthly_flow.still_open}
            </div>
          </div>
          <div>
            <div className="text-[9px] text-[#94a3b8]">Kazanılan</div>
            <div className="text-sm font-black tabular-nums text-green-600">
              {fmtPct(monthly_flow.won_rate)}
            </div>
          </div>
          <div>
            <div className="text-[9px] text-[#94a3b8]">Kaybedilen</div>
            <div className="text-sm font-black tabular-nums text-red-600">
              {fmtPct(monthly_flow.lost_rate)}
            </div>
          </div>
          <div>
            <div className="text-[9px] text-[#94a3b8]">Açık Kalan</div>
            <div className="text-sm font-black tabular-nums text-[#64748b]">
              {monthly_flow.still_open}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-2 border-t border-[#f8fafc] text-[9px] text-[#cbd5e1]">
        Son 90 gün. Ağırlıklar: Proforma %10 · Sipariş %40 · Kısmi %70 · Vadesi Geçmiş %20. Yeşil ≥%70 · Teal %50-70 · Sarı %30-50 · Turuncu %15-30 · Kırmızı &lt;%15.
      </div>
    </div>
  )
}

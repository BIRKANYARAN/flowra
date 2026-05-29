'use client'
// ── RevenueConcentrationClient — Revenue Concentration Risk Analysis ───────────
// Fetches /api/commercial/revenue-concentration via TanStack Query.
// Features:
//   • 4 KPI cells: resilience score, top customer %, pareto 80 count, annual at risk
//   • Risk level badge + Turkish narrative text
//   • Customer concentration table (top 10) with share bar and critical badges
//   • Product concentration table (if available)

import { useQuery } from '@tanstack/react-query'
import type {
  RevenueConcentrationReport,
  ConcentrationAnalysis,
  ConcentrationEntity,
} from '@/lib/services/commercial/revenue-concentration.service'

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

// ── Risk level config ─────────────────────────────────────────────────────────

type RiskLevel = 'critical' | 'high' | 'moderate' | 'low' | 'diversified'

const RISK_CFG: Record<RiskLevel, { label: string; bg: string; text: string }> = {
  critical:    { label: 'Kritik',         bg: 'bg-red-100',     text: 'text-red-800'     },
  high:        { label: 'Yüksek',         bg: 'bg-orange-100',  text: 'text-orange-800'  },
  moderate:    { label: 'Orta',           bg: 'bg-yellow-100',  text: 'text-yellow-700'  },
  low:         { label: 'Düşük',          bg: 'bg-teal-100',    text: 'text-teal-700'    },
  diversified: { label: 'Çeşitlendirilmiş', bg: 'bg-emerald-100', text: 'text-emerald-800' },
}

function RiskBadge({ level }: { level: RiskLevel }) {
  const cfg = RISK_CFG[level]
  return (
    <span className={`inline-block text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
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

// ── Share bar for table rows ──────────────────────────────────────────────────

function ShareBar({ pct, isPareto }: { pct: number; isPareto: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-[#f1f5f9] rounded overflow-hidden">
        <div
          className={`h-2 rounded ${isPareto ? 'bg-red-400' : 'bg-[#cbd5e1]'}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className="text-[10px] tabular-nums font-bold w-10 text-right text-[#64748b]">
        {fmtPct(pct)}
      </span>
    </div>
  )
}

// ── Entity table (top 10) ────────────────────────────────────────────────────

function EntityTable({
  analysis,
  showCriticalBadge = false,
}: {
  analysis: ConcentrationAnalysis
  showCriticalBadge?: boolean
}) {
  const top10 = analysis.entities.slice(0, 10)

  if (top10.length === 0) {
    return (
      <div className="px-4 py-4 text-center">
        <p className="text-sm text-[#94a3b8]">Yeterli veri yok</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#f1f5f9]">
            <th className="text-left px-4 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              {analysis.dimension === 'customer' ? 'Müşteri' : 'Ürün'}
            </th>
            <th className="text-right px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] w-24">
              Gelir
            </th>
            <th className="px-3 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] w-40">
              Pay
            </th>
            {showCriticalBadge && (
              <th className="px-3 py-2 w-20" />
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f8fafc]">
          {top10.map((entity: ConcentrationEntity) => {
            const isCritical = showCriticalBadge && entity.revenue_pct > 20
            return (
              <tr key={entity.entity_key} className="hover:bg-[#f8fafc]/60">
                <td className="px-4 py-2 text-[11px] font-medium text-[#334155] truncate max-w-[180px]">
                  {entity.entity_name}
                </td>
                <td className="px-3 py-2 text-right text-[11px] tabular-nums font-bold text-[#0f172a]">
                  {fmtTRY(entity.revenue_try)}
                </td>
                <td className="px-3 py-2">
                  <ShareBar pct={entity.revenue_pct} isPareto={entity.is_pareto_80} />
                </td>
                {showCriticalBadge && (
                  <td className="px-3 py-2 text-center">
                    {isCritical && (
                      <span className="inline-block text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-100 text-red-800">
                        Kritik
                      </span>
                    )}
                  </td>
                )}
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
  report: RevenueConcentrationReport
}

export default function RevenueConcentrationClient({ companyId }: Props) {
  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['revenue-concentration', companyId],
    queryFn: async () => {
      const res = await fetch('/api/commercial/revenue-concentration')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<ApiResponse>
    },
    staleTime: 60 * 60 * 1000, // 1 hour
  })

  if (isLoading) return <Skeleton />
  if (error) return null

  const report = data?.report

  if (!report || report.customer_concentration.entity_count === 0) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded px-4 py-6 text-center">
        <p className="text-sm text-[#94a3b8]">
          Gelir yoğunlaşma analizi için yeterli müşteri verisi yok
        </p>
        <p className="text-[10px] text-[#cbd5e1] mt-1">
          Son 3 ay tarandı
        </p>
      </div>
    )
  }

  const { customer_concentration: cc } = report

  return (
    <div className="space-y-4">
      {/* Panel: KPI strip + risk badge */}
      <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#f1f5f9] flex items-center justify-between gap-3 flex-wrap">
          <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Gelir Yoğunlaşma Riski
          </span>
          <div className="flex items-center gap-2">
            <RiskBadge level={report.overall_risk_level} />
            {report.concentration_trend !== 'insufficient_data' && (
              <span className={`text-[9px] font-bold uppercase tracking-wide ${
                report.concentration_trend === 'improving'
                  ? 'text-emerald-600'
                  : report.concentration_trend === 'worsening'
                    ? 'text-red-600'
                    : 'text-[#94a3b8]'
              }`}>
                {report.concentration_trend === 'improving' ? '↓ İyileşiyor'
                  : report.concentration_trend === 'worsening' ? '↑ Kötüleşiyor'
                  : '→ Stabil'}
              </span>
            )}
          </div>
        </div>

        {/* 4 KPI cells */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-[#e2e8f0] border-b border-[#e2e8f0]">
          {/* Resilience score */}
          <div className="p-3">
            <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
              Dayanıklılık Skoru
            </div>
            <div className={`text-lg font-black tabular-nums leading-none ${
              report.revenue_resilience_score >= 70
                ? 'text-emerald-700'
                : report.revenue_resilience_score >= 40
                  ? 'text-yellow-700'
                  : 'text-red-700'
            }`}>
              {report.revenue_resilience_score.toFixed(0)}
            </div>
            <div className="text-[9px] text-[#94a3b8] mt-0.5">/ 100</div>
          </div>

          {/* Top customer % */}
          <div className="p-3">
            <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
              En Büyük Müşteri
            </div>
            <div className={`text-lg font-black tabular-nums leading-none ${
              cc.top_1_pct > 30
                ? 'text-red-700'
                : cc.top_1_pct > 20
                  ? 'text-orange-700'
                  : 'text-[#0f172a]'
            }`}>
              {fmtPct(cc.top_1_pct)}
            </div>
            <div className="text-[9px] text-[#94a3b8] mt-0.5">toplam gelirden</div>
          </div>

          {/* Pareto 80% count */}
          <div className="p-3">
            <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
              Pareto 80% Sayısı
            </div>
            <div className="text-lg font-black tabular-nums leading-none text-[#0f172a]">
              {cc.pareto_80_count}
            </div>
            <div className="text-[9px] text-[#94a3b8] mt-0.5">müşteri → %80 gelir</div>
          </div>

          {/* Annual at risk */}
          <div className="p-3">
            <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
              Yıllık Risk (₺)
            </div>
            <div className="text-lg font-black tabular-nums leading-none text-red-700">
              {fmtTRY(report.annual_at_risk_try)}
            </div>
            <div className="text-[9px] text-[#94a3b8] mt-0.5">en büyük müşteri kaybı</div>
          </div>
        </div>

        {/* Narrative */}
        <div className="px-4 py-3 bg-[#f8fafc] border-b border-[#f1f5f9]">
          <p className="text-[11px] text-[#475569] leading-relaxed">
            {report.narrative}
          </p>
        </div>

        {/* Customer concentration table */}
        <div>
          <div className="px-4 py-2 border-b border-[#f1f5f9]">
            <span className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Müşteri Yoğunlaşması (İlk 10) — Kırmızı çubuk: Pareto %80 grubunda
            </span>
          </div>
          <EntityTable analysis={cc} showCriticalBadge />
        </div>

        {/* Footer note */}
        <div className="px-4 py-2 border-t border-[#f8fafc] text-[9px] text-[#cbd5e1]">
          Son 3 ay verisi · Kırmızı çubuk = gelirin %80'ini oluşturan müşteri grubu · &quot;Kritik&quot; rozet = tek başına &gt;%20 pay
        </div>
      </div>

      {/* Product concentration (if available) */}
      {report.product_concentration && (
        <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
          <div className="px-4 py-3 border-b border-[#f1f5f9] flex items-center justify-between gap-3 flex-wrap">
            <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Ürün Yoğunlaşması (İlk 10)
            </span>
            <RiskBadge level={
              report.product_concentration.hhi > 0.5 ? 'critical'
                : report.product_concentration.hhi > 0.25 ? 'high'
                : report.product_concentration.hhi > 0.15 ? 'moderate'
                : report.product_concentration.hhi > 0.08 ? 'low'
                : 'diversified'
            } />
          </div>

          {/* Product KPI mini strip */}
          <div className="grid grid-cols-3 gap-0 divide-x divide-[#e2e8f0] border-b border-[#e2e8f0]">
            <div className="p-2">
              <div className="text-[0.55rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">
                Top 1 Ürün
              </div>
              <div className="text-sm font-black tabular-nums text-[#0f172a]">
                {fmtPct(report.product_concentration.top_1_pct)}
              </div>
            </div>
            <div className="p-2">
              <div className="text-[0.55rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">
                Top 3 Ürün
              </div>
              <div className="text-sm font-black tabular-nums text-[#0f172a]">
                {fmtPct(report.product_concentration.top_3_pct)}
              </div>
            </div>
            <div className="p-2">
              <div className="text-[0.55rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">
                HHI
              </div>
              <div className="text-sm font-black tabular-nums text-[#0f172a]">
                {report.product_concentration.hhi.toFixed(3)}
              </div>
            </div>
          </div>

          <EntityTable analysis={report.product_concentration} showCriticalBadge={false} />

          <div className="px-4 py-2 border-t border-[#f8fafc] text-[9px] text-[#cbd5e1]">
            Son 3 ay satış verisinden hesaplanmıştır
          </div>
        </div>
      )}
    </div>
  )
}

'use client'
// ── CustomerChurnClient — Customer Churn Risk Prediction Dashboard ─────────────
// Fetches /api/commercial/customer-churn via TanStack Query.
// Features:
//   • 4 KPI cells: critical count, high count, total revenue at risk, portfolio health
//   • Risk level pill distribution row
//   • Customer table sorted by churn score with risk badge, signal, revenue at risk, recommendation

import { useQuery } from '@tanstack/react-query'
import type {
  CustomerChurnReport,
  CustomerChurnScore,
  ChurnRiskLevel,
} from '@/lib/services/commercial/customer-churn.service'

// ── Formatters ────────────────────────────────────────────────────────────────

const TRY_FMT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })

function fmtTRY(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₺${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `₺${(n / 1_000).toFixed(1)}K`
  return `₺${TRY_FMT.format(Math.round(n))}`
}

// ── Risk level badge config ───────────────────────────────────────────────────

const RISK_CFG: Record<ChurnRiskLevel, { label: string; bg: string; text: string; dot: string }> = {
  critical: {
    label: 'Kritik',
    bg: 'bg-red-100',
    text: 'text-red-800',
    dot: 'bg-red-500',
  },
  high: {
    label: 'Yüksek',
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    dot: 'bg-orange-500',
  },
  moderate: {
    label: 'Orta',
    bg: 'bg-amber-100',
    text: 'text-amber-800',
    dot: 'bg-amber-400',
  },
  low: {
    label: 'Düşük',
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    dot: 'bg-yellow-400',
  },
  loyal: {
    label: 'Sadık',
    bg: 'bg-green-100',
    text: 'text-green-800',
    dot: 'bg-green-500',
  },
}

const HEALTH_CFG: Record<string, { label: string; bg: string; text: string }> = {
  high_risk:  { label: 'Yüksek Risk', bg: 'bg-red-100',    text: 'text-red-800'    },
  elevated:   { label: 'Yükselen',    bg: 'bg-orange-100', text: 'text-orange-800' },
  manageable: { label: 'Yönetilebilir', bg: 'bg-yellow-100', text: 'text-yellow-800' },
  healthy:    { label: 'Sağlıklı',    bg: 'bg-green-100',  text: 'text-green-800'  },
}

// ── Risk badge ────────────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: ChurnRiskLevel }) {
  const cfg = RISK_CFG[level]
  return (
    <span
      className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

// ── KPI Cell ──────────────────────────────────────────────────────────────────

function KpiCell({
  label,
  value,
  sub,
  highlight,
}: {
  label: string
  value: string | number
  sub?: string
  highlight?: 'red' | 'orange' | 'green' | 'neutral'
}) {
  const valueColor =
    highlight === 'red'
      ? 'text-red-700'
      : highlight === 'orange'
        ? 'text-orange-700'
        : highlight === 'green'
          ? 'text-emerald-700'
          : 'text-[#0f172a]'

  return (
    <div className="p-3">
      <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
        {label}
      </div>
      <div className={`text-xl font-black tabular-nums leading-none ${valueColor}`}>{value}</div>
      {sub && <div className="text-[9px] text-[#94a3b8] mt-0.5">{sub}</div>}
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
      <div className="h-10 bg-[#f8fafc] rounded" />
      <div className="h-40 bg-[#f8fafc] rounded" />
    </div>
  )
}

// ── Risk Distribution Pills ───────────────────────────────────────────────────

function RiskDistributionRow({ report }: { report: CustomerChurnReport }) {
  const s = report.portfolio_summary
  const total = s.total_customers || 1

  const levels: { key: ChurnRiskLevel; count: number }[] = [
    { key: 'critical', count: s.critical_count },
    { key: 'high',     count: s.high_count },
    { key: 'moderate', count: s.moderate_count },
    { key: 'low',      count: s.low_count },
    { key: 'loyal',    count: s.loyal_count },
  ]

  return (
    <div className="px-4 py-2 border-b border-[#f1f5f9] flex flex-wrap gap-2 items-center">
      <span className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mr-1">
        Dağılım
      </span>
      {levels.map(({ key, count }) => {
        const cfg = RISK_CFG[key]
        const pct = Math.round((count / total) * 100)
        return (
          <span
            key={key}
            className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded ${cfg.bg} ${cfg.text}`}
          >
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
            <span className="font-black">{count}</span>
            <span className="font-normal opacity-70">({pct}%)</span>
          </span>
        )
      })}
    </div>
  )
}

// ── Customer Table ────────────────────────────────────────────────────────────

function CustomerChurnTable({ scores }: { scores: CustomerChurnScore[] }) {
  if (scores.length === 0) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-sm text-[#94a3b8]">Churn riski değerlendirmek için yeterli veri yok</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#f1f5f9]">
            <th className="text-left px-4 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Müşteri
            </th>
            <th className="text-center px-2 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Risk
            </th>
            <th className="text-center px-2 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Skor
            </th>
            <th className="text-left px-2 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Ana Sinyal
            </th>
            <th className="text-right px-2 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Risk (Aylık)
            </th>
            <th className="text-left px-4 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Öneri
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f8fafc]">
          {scores.map(score => (
            <tr key={score.customer_key} className="hover:bg-[#f8fafc]/60">
              <td className="px-4 py-2 text-[11px] font-bold text-[#334155] whitespace-nowrap max-w-[140px] truncate">
                {score.customer_name}
              </td>
              <td className="px-2 py-2 text-center">
                <RiskBadge level={score.churn_risk_level} />
              </td>
              <td className="px-2 py-2 text-center">
                <ScoreBar score={score.churn_risk_score} level={score.churn_risk_level} />
              </td>
              <td className="px-2 py-2 text-[10px] text-[#64748b] max-w-[180px] truncate">
                {score.key_signal}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-[11px] font-bold text-[#334155]">
                {fmtTRY(score.estimated_revenue_at_risk_try)}
              </td>
              <td className="px-4 py-2 text-[10px] text-[#64748b] max-w-[200px] truncate">
                {score.recommendation}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Score Bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ score, level }: { score: number; level: ChurnRiskLevel }) {
  const barColor =
    level === 'critical'
      ? 'bg-red-500'
      : level === 'high'
        ? 'bg-orange-400'
        : level === 'moderate'
          ? 'bg-amber-400'
          : level === 'low'
            ? 'bg-yellow-400'
            : 'bg-green-400'

  return (
    <div className="flex items-center gap-1.5 justify-center">
      <div className="w-16 h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
        <div
          className={`h-1.5 rounded-full ${barColor}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-[10px] font-bold tabular-nums text-[#475569] w-5 text-right">
        {score}
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

interface ApiResponse {
  report: CustomerChurnReport
}

export default function CustomerChurnClient({ companyId }: Props) {
  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['customer-churn', companyId],
    queryFn: async () => {
      const res = await fetch('/api/commercial/customer-churn')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<ApiResponse>
    },
    staleTime: 2 * 60 * 60 * 1000, // 2 hours
  })

  if (isLoading) return <Skeleton />
  if (error) return null

  const report = data?.report

  // Empty state
  if (!report || report.customer_scores.length === 0) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded px-4 py-6 text-center">
        <p className="text-sm text-[#94a3b8]">Churn riski analizi için yeterli müşteri verisi yok</p>
        <p className="text-[10px] text-[#cbd5e1] mt-1">Son 180 gün tarandı</p>
      </div>
    )
  }

  const s = report.portfolio_summary
  const healthCfg = HEALTH_CFG[report.portfolio_health] ?? HEALTH_CFG['healthy']

  return (
    <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#f1f5f9] flex items-center justify-between gap-3">
        <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Müşteri Churn Risk Tahmini
        </span>
        <span className="text-[9px] text-[#94a3b8]">
          Analiz tarihi: {report.analysis_date}
        </span>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-[#e2e8f0] border-b border-[#e2e8f0]">
        <KpiCell
          label="Kritik Risk"
          value={s.critical_count}
          sub={`${s.total_customers} müşteriden`}
          highlight={s.critical_count > 0 ? 'red' : 'neutral'}
        />
        <KpiCell
          label="Yüksek Risk"
          value={s.high_count}
          sub="Aksiyon gerekli"
          highlight={s.high_count > 0 ? 'orange' : 'neutral'}
        />
        <KpiCell
          label="Risk Altındaki Gelir"
          value={fmtTRY(s.total_revenue_at_risk_try)}
          sub="Aylık ortalama"
          highlight={s.total_revenue_at_risk_try > 0 ? 'red' : 'neutral'}
        />
        <div className="p-3">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            Portföy Sağlığı
          </div>
          <span
            className={`inline-block text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${healthCfg.bg} ${healthCfg.text}`}
          >
            {healthCfg.label}
          </span>
          <div className="text-[9px] text-[#94a3b8] mt-0.5">
            Risk endeksi: {s.churn_risk_index.toFixed(1)}
          </div>
        </div>
      </div>

      {/* Risk distribution */}
      <RiskDistributionRow report={report} />

      {/* Customer table */}
      <CustomerChurnTable scores={report.customer_scores} />

      <div className="px-4 py-2 border-t border-[#f8fafc] text-[9px] text-[#cbd5e1]">
        Kural tabanlı skor: Alım gecikmesi (40p) + Sıklık düşüşü (25p) + Gelir trendi (20p) + Ödeme davranışı (15p). Kritik ≥75 · Yüksek ≥55 · Orta ≥35 · Düşük ≥15 · Sadık &lt;15.
      </div>
    </div>
  )
}

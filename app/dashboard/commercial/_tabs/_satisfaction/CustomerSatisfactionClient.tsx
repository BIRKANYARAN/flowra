'use client'
// ── CustomerSatisfactionClient — Relationship Health Dashboard ────────────────
// Fetches /api/commercial/customer-satisfaction via TanStack Query.
// Features:
//   • Portfolio health badge + narrative
//   • 5 KPI cells: avg score, tier counts (at-risk, churning), total customers
//   • Tier distribution pills
//   • At-risk customers list with action recommendations
//   • Top customers table sorted by health score

import { useQuery } from '@tanstack/react-query'
import type {
  CustomerSatisfactionReport,
  SatisfactionScore,
} from '@/lib/services/commercial/customer-satisfaction.service'

// ── Formatters ────────────────────────────────────────────────────────────────

const TRY_FMT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })

function fmtTRY(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₺${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `₺${(n / 1_000).toFixed(1)}K`
  return `₺${TRY_FMT.format(Math.round(n))}`
}

// ── Tier config ───────────────────────────────────────────────────────────────

type Tier = SatisfactionScore['satisfaction_tier']

const TIER_CFG: Record<Tier, { label: string; bg: string; text: string; dot: string }> = {
  excellent: { label: 'Mükemmel', bg: 'bg-emerald-100', text: 'text-emerald-800', dot: 'bg-emerald-500' },
  good:      { label: 'İyi',      bg: 'bg-green-100',   text: 'text-green-800',   dot: 'bg-green-500'   },
  neutral:   { label: 'Nötr',     bg: 'bg-yellow-100',  text: 'text-yellow-800',  dot: 'bg-yellow-500'  },
  at_risk:   { label: 'Risk',     bg: 'bg-orange-100',  text: 'text-orange-800',  dot: 'bg-orange-500'  },
  churning:  { label: 'Kaybediyor', bg: 'bg-red-100',   text: 'text-red-800',     dot: 'bg-red-500'     },
}

type PortfolioHealth = CustomerSatisfactionReport['portfolio_health']

const HEALTH_CFG: Record<PortfolioHealth, { label: string; bg: string; text: string }> = {
  thriving:   { label: 'Mükemmel',     bg: 'bg-emerald-100', text: 'text-emerald-800' },
  healthy:    { label: 'Sağlıklı',     bg: 'bg-green-100',   text: 'text-green-800'   },
  mixed:      { label: 'Karma',        bg: 'bg-yellow-100',  text: 'text-yellow-800'  },
  concerning: { label: 'Endişe verici', bg: 'bg-orange-100', text: 'text-orange-800'  },
  critical:   { label: 'Kritik',       bg: 'bg-red-100',     text: 'text-red-800'     },
}

// ── Tier Badge ────────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: Tier }) {
  const cfg = TIER_CFG[tier]
  return (
    <span
      className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

// ── Health Score Bar ──────────────────────────────────────────────────────────

function ScoreBar({ score, tier }: { score: number; tier: Tier }) {
  const barColor =
    tier === 'excellent' ? 'bg-emerald-500' :
    tier === 'good'      ? 'bg-green-400'   :
    tier === 'neutral'   ? 'bg-yellow-400'  :
    tier === 'at_risk'   ? 'bg-orange-400'  :
                           'bg-red-500'

  return (
    <div className="flex items-center gap-1.5 justify-center">
      <div className="w-16 h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
        <div
          className={`h-1.5 rounded-full ${barColor}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-[10px] font-bold tabular-nums text-[#475569] w-6 text-right">
        {score}
      </span>
    </div>
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
    highlight === 'red'    ? 'text-red-700'     :
    highlight === 'orange' ? 'text-orange-700'  :
    highlight === 'green'  ? 'text-emerald-700' :
                             'text-[#0f172a]'

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

// ── Tier Distribution Pills ───────────────────────────────────────────────────

function TierDistributionRow({ report }: { report: CustomerSatisfactionReport }) {
  const s     = report.portfolio_summary
  const total = report.total_customers || 1

  const tiers: { key: Tier; count: number }[] = [
    { key: 'excellent', count: s.excellent_count },
    { key: 'good',      count: s.good_count      },
    { key: 'neutral',   count: s.neutral_count   },
    { key: 'at_risk',   count: s.at_risk_count   },
    { key: 'churning',  count: s.churning_count  },
  ]

  return (
    <div className="px-4 py-2 border-b border-[#f1f5f9] flex flex-wrap gap-2 items-center">
      <span className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mr-1">
        Dağılım
      </span>
      {tiers.map(({ key, count }) => {
        const cfg = TIER_CFG[key]
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

// ── At-Risk List ──────────────────────────────────────────────────────────────

function AtRiskList({ customers }: { customers: SatisfactionScore[] }) {
  if (customers.length === 0) {
    return (
      <div className="px-4 py-4 text-center text-sm text-[#94a3b8]">
        Risk altında müşteri yok
      </div>
    )
  }

  return (
    <div className="divide-y divide-[#f8fafc]">
      {customers.map(c => (
        <div key={c.customer_id} className="px-4 py-2.5 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[11px] font-bold text-[#334155] truncate">
                {c.customer_name}
              </span>
              <TierBadge tier={c.satisfaction_tier} />
            </div>
            {c.risk_flags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {c.risk_flags.map(flag => (
                  <span
                    key={flag}
                    className="text-[9px] bg-[#fff7ed] text-[#9a3412] px-1.5 py-0.5 rounded border border-[#fed7aa]"
                  >
                    {flag}
                  </span>
                ))}
              </div>
            )}
            <p className="text-[10px] text-[#64748b] mt-1 italic">{c.recommended_action}</p>
          </div>
          <ScoreBar score={c.relationship_health_score} tier={c.satisfaction_tier} />
        </div>
      ))}
    </div>
  )
}

// ── Top Customers Table ───────────────────────────────────────────────────────

function TopCustomersTable({ customers }: { customers: SatisfactionScore[] }) {
  if (customers.length === 0) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-sm text-[#94a3b8]">Henüz yeterli müşteri verisi yok</p>
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
              Tier
            </th>
            <th className="text-center px-2 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Skor
            </th>
            <th className="text-center px-2 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Alım
            </th>
            <th className="text-center px-2 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Ödeme
            </th>
            <th className="text-center px-2 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Büyüme
            </th>
            <th className="text-left px-4 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Öneri
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f8fafc]">
          {customers.map(c => (
            <tr key={c.customer_id} className="hover:bg-[#f8fafc]/60">
              <td className="px-4 py-2 text-[11px] font-bold text-[#334155] whitespace-nowrap max-w-[140px] truncate">
                {c.customer_name}
              </td>
              <td className="px-2 py-2 text-center">
                <TierBadge tier={c.satisfaction_tier} />
              </td>
              <td className="px-2 py-2 text-center">
                <ScoreBar score={c.relationship_health_score} tier={c.satisfaction_tier} />
              </td>
              <td className="px-2 py-2 text-center text-[10px] font-bold text-[#475569]">
                {c.signals.recency_score + c.signals.frequency_score}
                <span className="font-normal text-[#94a3b8]">/50</span>
              </td>
              <td className="px-2 py-2 text-center text-[10px] font-bold text-[#475569]">
                {c.signals.payment_score}
                <span className="font-normal text-[#94a3b8]">/30</span>
              </td>
              <td className="px-2 py-2 text-center text-[10px] font-bold text-[#475569]">
                {c.signals.growth_score}
                <span className="font-normal text-[#94a3b8]">/20</span>
              </td>
              <td className="px-4 py-2 text-[10px] text-[#64748b] max-w-[200px] truncate">
                {c.recommended_action}
              </td>
            </tr>
          ))}
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
  report: CustomerSatisfactionReport
}

export default function CustomerSatisfactionClient({ companyId }: Props) {
  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['customer-satisfaction', companyId],
    queryFn: async () => {
      const res = await fetch('/api/commercial/customer-satisfaction')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<ApiResponse>
    },
    staleTime: 2 * 60 * 60 * 1000, // 2 hours
  })

  if (isLoading) return <Skeleton />
  if (error) return null

  const report = data?.report

  if (!report || report.total_customers === 0) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded px-4 py-6 text-center">
        <p className="text-sm text-[#94a3b8]">Müşteri ilişki sağlığı için yeterli veri yok</p>
        <p className="text-[10px] text-[#cbd5e1] mt-1">Son 24 ay tarandı</p>
      </div>
    )
  }

  const s         = report.portfolio_summary
  const healthCfg = HEALTH_CFG[report.portfolio_health] ?? HEALTH_CFG['critical']
  const avgScore  = s.avg_health_score !== null ? Math.round(s.avg_health_score) : '—'

  return (
    <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#f1f5f9] flex items-center justify-between gap-3">
        <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Müşteri İlişki Sağlığı
        </span>
        <div className="flex items-center gap-2">
          <span
            className={`text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${healthCfg.bg} ${healthCfg.text}`}
          >
            {healthCfg.label}
          </span>
          <span className="text-[9px] text-[#94a3b8]">{report.as_of_date}</span>
        </div>
      </div>

      {/* Narrative */}
      <div className="px-4 py-2 bg-[#f8fafc] border-b border-[#f1f5f9]">
        <p className="text-[10px] text-[#475569]">{report.narrative}</p>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-0 divide-x divide-[#e2e8f0] border-b border-[#e2e8f0]">
        <KpiCell
          label="Ortalama Skor"
          value={avgScore}
          sub="0–100 ilişki skoru"
          highlight="neutral"
        />
        <KpiCell
          label="Mükemmel"
          value={s.excellent_count}
          sub="excellent tier"
          highlight="green"
        />
        <KpiCell
          label="Risk"
          value={s.at_risk_count}
          sub="Aksiyon gerekli"
          highlight={s.at_risk_count > 0 ? 'orange' : 'neutral'}
        />
        <KpiCell
          label="Kaybediyor"
          value={s.churning_count}
          sub="Acil müdahale"
          highlight={s.churning_count > 0 ? 'red' : 'neutral'}
        />
        <KpiCell
          label="Toplam Müşteri"
          value={report.total_customers}
          sub={`Sağlık endeksi: ${(s.health_index * 100).toFixed(0)}%`}
          highlight="neutral"
        />
      </div>

      {/* Tier distribution */}
      <TierDistributionRow report={report} />

      {/* At-risk section */}
      {report.at_risk_customers.length > 0 && (
        <>
          <div className="px-4 py-2 border-b border-[#f1f5f9] bg-[#fff7ed]">
            <span className="text-[0.6rem] font-black uppercase tracking-widest text-[#c2410c]">
              Risk Altındaki Müşteriler ({report.at_risk_customers.length})
            </span>
          </div>
          <AtRiskList customers={report.at_risk_customers} />
        </>
      )}

      {/* Top customers table */}
      <div className="px-4 py-2 border-t border-[#f1f5f9]">
        <span className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
          En İyi Müşteriler
        </span>
      </div>
      <TopCustomersTable customers={report.top_customers} />

      <div className="px-4 py-2 border-t border-[#f8fafc] text-[9px] text-[#cbd5e1]">
        Skor bileşenleri: Güncellik (25p) + Sıklık (25p) + Ödeme (30p) + Büyüme (20p). Mükemmel ≥80 · İyi ≥60 · Nötr ≥40 · Risk ≥20 · Kaybediyor &lt;20.
      </div>
    </div>
  )
}

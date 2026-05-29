'use client'
// ── CustomerCreditRiskClient — B2B Customer Credit Risk Dashboard ─────────────
// Fetches /api/commercial/credit-risk via TanStack Query.
// Features:
//   • 4 KPI cells: total customers, investment grade %, high risk outstanding, watch list count
//   • Grade distribution pill row (AAA through D)
//   • Customer credit table with grade badge, score bar, outstanding, recommended terms
//   • Watch list section for BB and below customers

import { useQuery } from '@tanstack/react-query'
import type {
  CustomerCreditRiskReport,
  CustomerCreditScore,
  CreditRiskGrade,
} from '@/lib/services/commercial/customer-credit-risk.service'

// ── Formatters ────────────────────────────────────────────────────────────────

const TRY_FMT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })

function fmtTRY(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₺${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `₺${(n / 1_000).toFixed(1)}K`
  return `₺${TRY_FMT.format(Math.round(n))}`
}

function fmtPct(n: number): string {
  return `%${Math.round(n)}`
}

// ── Grade config ──────────────────────────────────────────────────────────────

type GradeCfg = { label: string; bg: string; text: string; dot: string; border: string }

const GRADE_CFG: Record<CreditRiskGrade, GradeCfg> = {
  AAA: { label: 'AAA', bg: 'bg-emerald-100', text: 'text-emerald-900', dot: 'bg-emerald-600', border: 'border-emerald-200' },
  AA:  { label: 'AA',  bg: 'bg-green-100',   text: 'text-green-900',   dot: 'bg-green-500',   border: 'border-green-200' },
  A:   { label: 'A',   bg: 'bg-teal-100',    text: 'text-teal-900',    dot: 'bg-teal-500',    border: 'border-teal-200' },
  BBB: { label: 'BBB', bg: 'bg-lime-100',    text: 'text-lime-900',    dot: 'bg-lime-500',    border: 'border-lime-200' },
  BB:  { label: 'BB',  bg: 'bg-yellow-100',  text: 'text-yellow-900',  dot: 'bg-yellow-500',  border: 'border-yellow-200' },
  B:   { label: 'B',   bg: 'bg-amber-100',   text: 'text-amber-900',   dot: 'bg-amber-500',   border: 'border-amber-200' },
  CCC: { label: 'CCC', bg: 'bg-orange-100',  text: 'text-orange-900',  dot: 'bg-orange-500',  border: 'border-orange-200' },
  D:   { label: 'D',   bg: 'bg-red-100',     text: 'text-red-900',     dot: 'bg-red-600',     border: 'border-red-200' },
}

const GRADES_ORDER: CreditRiskGrade[] = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'D']

// ── Grade badge ───────────────────────────────────────────────────────────────

function GradeBadge({ grade }: { grade: CreditRiskGrade }) {
  const cfg = GRADE_CFG[grade]
  return (
    <span
      className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded border ${cfg.bg} ${cfg.text} ${cfg.border}`}
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
      <div className="h-48 bg-[#f8fafc] rounded" />
    </div>
  )
}

// ── Score Bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ score, grade }: { score: number; grade: CreditRiskGrade }) {
  const barColor =
    grade === 'AAA' || grade === 'AA'
      ? 'bg-emerald-500'
      : grade === 'A' || grade === 'BBB'
        ? 'bg-green-400'
        : grade === 'BB' || grade === 'B'
          ? 'bg-yellow-400'
          : grade === 'CCC'
            ? 'bg-orange-400'
            : 'bg-red-500'

  return (
    <div className="flex items-center gap-1.5 justify-center">
      <div className="w-16 h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
        <div
          className={`h-1.5 rounded-full ${barColor}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-[10px] font-bold tabular-nums text-[#475569] w-6 text-right">
        {Math.round(score)}
      </span>
    </div>
  )
}

// ── Grade Distribution Row ────────────────────────────────────────────────────

function GradeDistributionRow({ scores }: { scores: CustomerCreditScore[] }) {
  const total = scores.length || 1

  const gradeCounts: Record<CreditRiskGrade, number> = {
    AAA: 0, AA: 0, A: 0, BBB: 0, BB: 0, B: 0, CCC: 0, D: 0,
  }

  for (const s of scores) {
    gradeCounts[s.credit_grade]++
  }

  return (
    <div className="px-4 py-2 border-b border-[#f1f5f9] flex flex-wrap gap-2 items-center">
      <span className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mr-1">
        Dağılım
      </span>
      {GRADES_ORDER.map(grade => {
        const count = gradeCounts[grade]
        if (count === 0) return null
        const cfg = GRADE_CFG[grade]
        const pct = Math.round((count / total) * 100)
        return (
          <span
            key={grade}
            className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded border ${cfg.bg} ${cfg.text} ${cfg.border}`}
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

// ── Customer Credit Table ─────────────────────────────────────────────────────

function CustomerCreditTable({ scores }: { scores: CustomerCreditScore[] }) {
  if (scores.length === 0) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-sm text-[#94a3b8]">Kredi riski değerlendirmek için yeterli veri yok</p>
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
              Derece
            </th>
            <th className="text-center px-2 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Skor
            </th>
            <th className="text-right px-2 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Açık Bakiye
            </th>
            <th className="text-right px-2 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Kredi Limiti
            </th>
            <th className="text-left px-2 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Ödeme Koşulu
            </th>
            <th className="text-center px-4 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Trend
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
                <GradeBadge grade={score.credit_grade} />
              </td>
              <td className="px-2 py-2 text-center">
                <ScoreBar score={score.credit_score} grade={score.credit_grade} />
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-[11px] font-bold text-[#334155]">
                {/* outstanding shown as dash if 0 — actual value comes from profile */}
                —
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-[11px] text-[#64748b]">
                {fmtTRY(score.recommended_credit_limit_try)}
              </td>
              <td className="px-2 py-2 text-[10px] text-[#64748b] whitespace-nowrap">
                {score.recommended_payment_terms}
              </td>
              <td className="px-4 py-2 text-center">
                {score.is_improving ? (
                  <span className="text-[9px] font-bold text-emerald-600">▲ İyileşiyor</span>
                ) : (
                  <span className="text-[9px] font-bold text-[#94a3b8]">— Stabil</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Watch List Section ────────────────────────────────────────────────────────

function WatchListSection({ watchList }: { watchList: CustomerCreditScore[] }) {
  if (watchList.length === 0) return null

  return (
    <div className="border-t border-[#f1f5f9]">
      <div className="px-4 py-2 flex items-center gap-2">
        <span className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
          İzleme Listesi
        </span>
        <span className="text-[9px] bg-orange-100 text-orange-800 font-bold px-1.5 py-0.5 rounded">
          {watchList.length} Müşteri
        </span>
        <span className="text-[9px] text-[#94a3b8]">BB ve altı · ₺50K+ açık bakiye</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <tbody className="divide-y divide-[#f8fafc]">
            {watchList.map(score => (
              <tr key={score.customer_key} className="hover:bg-orange-50/40">
                <td className="px-4 py-2 text-[11px] font-bold text-[#334155] whitespace-nowrap max-w-[180px] truncate">
                  {score.customer_name}
                </td>
                <td className="px-2 py-2">
                  <GradeBadge grade={score.credit_grade} />
                </td>
                <td className="px-2 py-2 text-[10px] text-[#64748b]">
                  {score.recommended_payment_terms}
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    {score.risk_flags.map((flag, i) => (
                      <span
                        key={i}
                        className="text-[9px] bg-red-50 text-red-700 border border-red-100 px-1 py-0.5 rounded"
                      >
                        {flag}
                      </span>
                    ))}
                    {score.risk_flags.length === 0 && (
                      <span className="text-[9px] text-[#94a3b8]">Risk bayrağı yok</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

interface ApiResponse {
  report: CustomerCreditRiskReport
}

export default function CustomerCreditRiskClient({ companyId }: Props) {
  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['customer-credit-risk', companyId],
    queryFn: async () => {
      const res = await fetch('/api/commercial/credit-risk')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<ApiResponse>
    },
    staleTime: 60 * 60 * 1000, // 1 hour
  })

  if (isLoading) return <Skeleton />
  if (error) return null

  const report = data?.report

  // Empty state
  if (!report || report.customer_scores.length === 0) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded px-4 py-6 text-center">
        <p className="text-sm text-[#94a3b8]">Kredi risk analizi için yeterli müşteri verisi yok</p>
        <p className="text-[10px] text-[#cbd5e1] mt-1">Tüm satış geçmişi tarandı</p>
      </div>
    )
  }

  const s = report.portfolio_summary
  const total = s.total_customers || 1
  const investmentGradePct = (s.investment_grade_count / total) * 100

  return (
    <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#f1f5f9] flex items-center justify-between gap-3">
        <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Müşteri Kredi Risk Skoru
        </span>
        <span className="text-[9px] text-[#94a3b8]">
          Ortalama skor: {s.weighted_avg_score.toFixed(1)}
        </span>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-[#e2e8f0] border-b border-[#e2e8f0]">
        <KpiCell
          label="Toplam Müşteri"
          value={s.total_customers}
          sub="Kredi profili olan"
          highlight="neutral"
        />
        <KpiCell
          label="Yatırım Derecesi"
          value={fmtPct(investmentGradePct)}
          sub={`${s.investment_grade_count} müşteri (AAA–BBB)`}
          highlight={investmentGradePct >= 70 ? 'green' : investmentGradePct >= 40 ? 'neutral' : 'orange'}
        />
        <KpiCell
          label="Yüksek Risk Açığı"
          value={fmtTRY(s.high_risk_outstanding_try)}
          sub="BB ve altı müşterilerde"
          highlight={s.high_risk_outstanding_try > 0 ? 'red' : 'neutral'}
        />
        <KpiCell
          label="İzleme Listesi"
          value={report.recommended_watch_list.length}
          sub="BB altı + ₺50K+ açık bakiye"
          highlight={report.recommended_watch_list.length > 0 ? 'orange' : 'neutral'}
        />
      </div>

      {/* Grade distribution */}
      <GradeDistributionRow scores={report.customer_scores} />

      {/* Customer credit table */}
      <CustomerCreditTable scores={report.customer_scores} />

      {/* Watch list */}
      <WatchListSection watchList={report.recommended_watch_list} />

      <div className="px-4 py-2 border-t border-[#f8fafc] text-[9px] text-[#cbd5e1]">
        Kredi skoru: Ödeme geçmişi (40%) + Açık bakiye (30%) + Müşteri ilişkisi (20%) + Konsantrasyon (10%). Yatırım derecesi AAA–BBB · Spekülatif BB–CCC · Temerrüt D.
      </div>
    </div>
  )
}

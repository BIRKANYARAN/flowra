'use client'

// ─────────────────────────────────────────────────────────────────────────────
// RiskCompositeTab — Risk Kompozit Skorlama
//
// Displays the 6-dimension composite partner risk scoring report:
//   • Company summary: avg score, grade distribution pills
//   • Per-partner cards: name, grade badge, composite score, risk level, key risk factor
//   • Dimension breakdown: horizontal bar list per dimension
//   • Risk trend badge
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import {
  Panel, PanelHeader, KpiStrip, KpiCell, EmptySlate, Skeleton,
  NarrativeFooter,
} from '@/components/ds'
import { fmtPct } from '@/lib/format'
import type {
  classifyRiskLevel,
  computeRiskTrend,
} from '@/lib/services/pcle/partner-risk-composite.service'

// ── Types ─────────────────────────────────────────────────────────────────────

type RiskLevel = ReturnType<typeof classifyRiskLevel>
type RiskTrend = ReturnType<typeof computeRiskTrend>
type RiskGrade = 'A' | 'B' | 'C' | 'D' | 'F'

interface DimensionScores {
  debt_concentration:    number
  repayment_timeliness:  number
  equity_fulfillment:    number
  liquidity_contribution: number
  loan_to_equity:        number
  duration_stability:    number
}

interface PartnerRiskResult {
  partner_id: string
  partner_name: string
  share_pct: number
  dimension_scores: DimensionScores
  composite_score: number
  grade: RiskGrade
  risk_level: RiskLevel
  risk_trend: RiskTrend
  key_risk_factor: string
}

interface CompanySummary {
  avg_composite_score: number | null
  grade_distribution: { A: number; B: number; C: number; D: number; F: number }
  highest_risk_partner: string | null
  company_risk_level: RiskLevel
}

interface RiskCompositeReport {
  partners: PartnerRiskResult[]
  company_summary: CompanySummary
}

interface ApiResponse {
  report: RiskCompositeReport
}

interface Props {
  companyId?: string
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchReport(): Promise<RiskCompositeReport> {
  const res  = await fetch('/api/partners/risk-composite')
  const data = await res.json()
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  return (data as ApiResponse).report
}

// ── Grade colors ──────────────────────────────────────────────────────────────

const GRADE_COLORS: Record<RiskGrade, string> = {
  A: 'bg-pos-light text-pos-text border-pos-text/20',
  B: 'bg-[#ecfdf5] text-[#065f46] border-[#6ee7b7]/30',
  C: 'bg-[#fffbeb] text-[#92400e] border-[#fde68a]/30',
  D: 'bg-[#fff7ed] text-[#9a3412] border-[#fdba74]/30',
  F: 'bg-neg-light text-neg-text border-neg-text/20',
}

const GRADE_BAR_COLORS: Record<RiskGrade, string> = {
  A: 'bg-pos-text',
  B: 'bg-[#059669]',
  C: 'bg-[#d97706]',
  D: 'bg-[#ea580c]',
  F: 'bg-neg-text',
}

const RISK_LEVEL_COLORS: Record<RiskLevel, string> = {
  low:       'bg-pos-light text-pos-text',
  moderate:  'bg-[#ecfdf5] text-[#065f46]',
  elevated:  'bg-[#fffbeb] text-[#92400e]',
  high:      'bg-[#fff7ed] text-[#9a3412]',
  critical:  'bg-neg-light text-neg-text',
}

const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  low:      'Düşük',
  moderate: 'Orta',
  elevated: 'Yüksek',
  high:     'Ciddi',
  critical: 'Kritik',
}

const TREND_ICONS: Record<RiskTrend, string> = {
  improving:    '↑',
  stable:       '=',
  deteriorating: '↓',
  new_partner:  '★',
}

const TREND_LABELS: Record<RiskTrend, string> = {
  improving:    'İyileşiyor',
  stable:       'Stabil',
  deteriorating: 'Kötüleşiyor',
  new_partner:  'Yeni Ortak',
}

const TREND_COLORS: Record<RiskTrend, string> = {
  improving:    'text-pos-text',
  stable:       'text-[#64748b]',
  deteriorating: 'text-neg-text',
  new_partner:  'text-[#7c3aed]',
}

const DIMENSION_LABELS: Record<keyof DimensionScores, string> = {
  debt_concentration:    'Borç Konsantrasyonu',
  repayment_timeliness:  'Geri Ödeme Zamanlaması',
  equity_fulfillment:    'Sermaye Taahhüdü',
  liquidity_contribution: 'Likidite Katkısı',
  loan_to_equity:        'Borç/Özkaynak Oranı',
  duration_stability:    'Ortaklık Süresi İstikrarı',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function GradeBadge({ grade, size = 'md' }: { grade: RiskGrade; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'lg'
    ? 'text-2xl font-bold w-10 h-10'
    : size === 'sm'
    ? 'text-xs font-bold w-6 h-6'
    : 'text-base font-black w-8 h-8'

  return (
    <span className={[
      'inline-flex items-center justify-center rounded border',
      sizeClass,
      GRADE_COLORS[grade],
    ].join(' ')}>
      {grade}
    </span>
  )
}

function RiskLevelBadge({ level }: { level: RiskLevel }) {
  return (
    <span className={[
      'inline-flex items-center px-2 py-0.5 rounded text-[0.65rem] font-semibold',
      RISK_LEVEL_COLORS[level],
    ].join(' ')}>
      {RISK_LEVEL_LABELS[level]}
    </span>
  )
}

function TrendBadge({ trend }: { trend: RiskTrend }) {
  return (
    <span className={['text-xs font-semibold', TREND_COLORS[trend]].join(' ')}>
      {TREND_ICONS[trend]} {TREND_LABELS[trend]}
    </span>
  )
}

function DimensionBars({ scores }: { scores: DimensionScores }) {
  const entries = Object.entries(scores) as Array<[keyof DimensionScores, number]>

  return (
    <div className="space-y-1.5">
      {entries.map(([key, value]) => {
        const pct = Math.round(value)
        const barColor =
          pct >= 80 ? 'bg-pos-text' :
          pct >= 65 ? 'bg-[#059669]' :
          pct >= 50 ? 'bg-[#d97706]' :
          pct >= 35 ? 'bg-[#ea580c]' :
          'bg-neg-text'

        return (
          <div key={key} className="space-y-0.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[0.6rem] text-[#64748b] font-medium truncate">
                {DIMENSION_LABELS[key]}
              </span>
              <span className="text-[0.6rem] font-bold text-[#334155] shrink-0">{pct}</span>
            </div>
            <div className="h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
              <div
                className={['h-full rounded-full transition-all', barColor].join(' ')}
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function GradeDistributionPills({
  distribution,
}: {
  distribution: { A: number; B: number; C: number; D: number; F: number }
}) {
  const grades = (['A', 'B', 'C', 'D', 'F'] as RiskGrade[])
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {grades.map(g => (
        <div key={g} className="flex items-center gap-1">
          <GradeBadge grade={g} size="sm" />
          <span className="text-xs font-bold text-[#334155]">{distribution[g]}</span>
        </div>
      ))}
    </div>
  )
}

function PartnerRiskCard({ partner }: { partner: PartnerRiskResult }) {
  return (
    <div className="border border-[#e8eaef] rounded-lg p-4 space-y-3 bg-white">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <GradeBadge grade={partner.grade} size="lg" />
          <div>
            <p className="text-sm font-semibold text-[#0f172a] leading-tight">
              {partner.partner_name}
            </p>
            <p className="text-[0.65rem] text-[#94a3b8] mt-0.5">
              Pay: {fmtPct(partner.share_pct ?? 0)}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <RiskLevelBadge level={partner.risk_level} />
          <TrendBadge trend={partner.risk_trend} />
        </div>
      </div>

      {/* Composite score */}
      <div className="flex items-center justify-between border-t border-[#f1f5f9] pt-2">
        <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
          Kompozit Skor
        </span>
        <span className="text-lg font-black text-[#0f172a]">
          {partner.composite_score.toFixed(1)}
        </span>
      </div>

      {/* Key risk factor */}
      {partner.key_risk_factor && (
        <div className="bg-[#fef2f2] rounded px-2.5 py-1.5 border border-[#fecaca]">
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-[#dc2626] mb-0.5">
            Ana Risk Faktörü
          </p>
          <p className="text-xs text-[#991b1b] font-medium">{partner.key_risk_factor}</p>
        </div>
      )}

      {/* Dimension bars */}
      <div>
        <p className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-2">
          Boyut Skorları
        </p>
        <DimensionBars scores={partner.dimension_scores} />
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function RiskCompositeTab({ companyId }: Props) {
  const { data: report, isLoading, error } = useQuery<RiskCompositeReport, Error>({
    queryKey: ['partner-risk-composite', companyId ?? ''],
    queryFn:  fetchReport,
    staleTime: 1000 * 60 * 10,
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-neg-light border border-neg-text/20 rounded px-4 py-3 text-xs text-neg-text font-medium">
        {error.message}
      </div>
    )
  }

  if (!report || report.partners.length === 0) {
    return (
      <EmptySlate
        title="Ortak Verisi Bulunamadı"
        sub="Risk skoru hesaplanabilmesi için en az bir ortak tanımlanmış olmalıdır."
      />
    )
  }

  const { company_summary: summary, partners } = report
  const avgScore = summary.avg_composite_score

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Panel>
        <PanelHeader
          label="Risk Kompozit Skorlama"
          sub="6 boyutlu ağırlıklı risk değerlendirmesi · Ortak bazında kompozit skor ve derece"
        />

        {/* Company KPIs */}
        <KpiStrip cols={3}>
          <KpiCell
            label="Ortalama Kompozit Skor"
            value={avgScore !== null ? avgScore.toFixed(1) : '—'}
          />
          <KpiCell
            label="Şirket Risk Seviyesi"
            value={RISK_LEVEL_LABELS[summary.company_risk_level]}
          />
          <KpiCell
            label="En Riskli Ortak"
            value={summary.highest_risk_partner ?? '—'}
          />
        </KpiStrip>

        {/* Grade distribution */}
        <div className="px-4 pb-4">
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-2">
            Derece Dağılımı
          </p>
          <GradeDistributionPills distribution={summary.grade_distribution} />
        </div>
      </Panel>

      {/* ── Per-partner cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {partners.map(partner => (
          <PartnerRiskCard key={partner.partner_id} partner={partner} />
        ))}
      </div>

      {/* ── Legend ─────────────────────────────────────────────────────────── */}
      <Panel>
        <div className="px-4 py-3 space-y-2">
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
            Boyut Ağırlıkları
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-xs text-[#64748b]">
            <span><span className="font-semibold text-[#334155]">%25</span> — Borç Konsantrasyonu</span>
            <span><span className="font-semibold text-[#334155]">%20</span> — Geri Ödeme Zamanlaması</span>
            <span><span className="font-semibold text-[#334155]">%20</span> — Sermaye Taahhüdü</span>
            <span><span className="font-semibold text-[#334155]">%15</span> — Likidite Katkısı</span>
            <span><span className="font-semibold text-[#334155]">%10</span> — Borç/Özkaynak Oranı</span>
            <span><span className="font-semibold text-[#334155]">%10</span> — Ortaklık Süresi İstikrarı</span>
          </div>
          <p className="text-[0.6rem] text-[#94a3b8] pt-1">
            A ≥80 · B ≥65 · C ≥50 · D ≥35 · F &lt;35
          </p>
        </div>
      </Panel>

      <NarrativeFooter narrative="Skor hesaplamada mevcut tranche bakiyeleri, sermaye taahhütleri ve ortak işlemleri kullanılmaktadır. Geçmiş dönem skoru yoksa trend 'Yeni Ortak' olarak gösterilir." links={[]} />
    </div>
  )
}

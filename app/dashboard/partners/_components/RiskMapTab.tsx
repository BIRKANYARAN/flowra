'use client'

// ── RiskMapTab — 6-Dimension Partner Risk Map ─────────────────────────────────
//
// Visualises PCLE risk scoring with:
//   • Company-level grade circle at top
//   • Per-partner risk cards with 6 dimension bars
//   • Color coding: A/B=green, C=amber, D/F=red
//   • Uses mock data for 3 partners with different risk profiles
// ─────────────────────────────────────────────────────────────────────────────

import type { RiskGrade, PartnerRiskProfile, CompanyRiskSummary } from '@/lib/services/pcle/pcle.risk'
import { scoreToGrade, gradeToRiskLabel, computeCompanyRiskGrade } from '@/lib/services/pcle/pcle.risk'

// ── Mock data ────────────────────────────────────────────────────────────────

const MOCK_PROFILES: PartnerRiskProfile[] = [
  {
    partner_id:   'p1',
    partner_name: 'Ahmet Yılmaz',
    share_ratio:  0.40,
    net_loan:     400_000,
    dimensions: {
      concentration: { name: 'Konsantrasyon Riski', score: 88, grade: 'B', detail: 'Toplam borcun %40\'ı', value: 40, benchmark: 30 },
      duration:      { name: 'Vade Riski',           score: 92, grade: 'A', detail: '95 gündür ödenmemiş', value: 95, benchmark: 180 },
      burden:        { name: 'Yük Denge Riski',      score: 91, grade: 'A', detail: 'Yük dengeli dağılmış', value: 3, benchmark: 10 },
      coverage:      { name: 'Teminat Riski',        score: 85, grade: 'B', detail: '0.9× borç/sermaye', value: 0.9, benchmark: 1.5 },
      liquidity:     { name: 'Likidite Riski',       score: 93, grade: 'A', detail: 'DSR: 22%', value: 22, benchmark: 35 },
      compliance:    { name: 'Uyum Riski',           score: 100, grade: 'A', detail: 'Uyum sorunu yok', value: 0, benchmark: 0 },
    },
    composite_score: 91,
    composite_grade: 'A',
    recommended_action: 'Risk yönetimi gerekmiyor.',
  },
  {
    partner_id:   'p2',
    partner_name: 'Fatma Kaya',
    share_ratio:  0.35,
    net_loan:     350_000,
    dimensions: {
      concentration: { name: 'Konsantrasyon Riski', score: 68, grade: 'C', detail: 'Toplam borcun %35\'i', value: 35, benchmark: 30 },
      duration:      { name: 'Vade Riski',           score: 62, grade: 'C', detail: '420 gündür ödenmemiş', value: 420, benchmark: 180 },
      burden:        { name: 'Yük Denge Riski',      score: 76, grade: 'B', detail: 'Yük dengeli dağılmış', value: 8, benchmark: 10 },
      coverage:      { name: 'Teminat Riski',        score: 55, grade: 'C', detail: '2.1× borç/sermaye', value: 2.1, benchmark: 1.5 },
      liquidity:     { name: 'Likidite Riski',       score: 61, grade: 'C', detail: 'DSR: 48%', value: 48, benchmark: 35 },
      compliance:    { name: 'Uyum Riski',           score: 75, grade: 'B', detail: '1 uyum uyarısı', value: 1, benchmark: 0 },
    },
    composite_score: 66,
    composite_grade: 'C',
    recommended_action: 'Kısmi geri ödeme planı hazırlayın.',
  },
  {
    partner_id:   'p3',
    partner_name: 'Mehmet Demir',
    share_ratio:  0.25,
    net_loan:     250_000,
    dimensions: {
      concentration: { name: 'Konsantrasyon Riski', score: 38, grade: 'F', detail: 'Toplam borcun %25\'i', value: 25, benchmark: 30 },
      duration:      { name: 'Vade Riski',           score: 22, grade: 'D', detail: '800 gündür ödenmemiş', value: 800, benchmark: 180 },
      burden:        { name: 'Yük Denge Riski',      score: 44, grade: 'D', detail: 'Pay oranına göre %19 sapma', value: 19, benchmark: 10 },
      coverage:      { name: 'Teminat Riski',        score: 18, grade: 'F', detail: 'Özkaynak borcu karşılamıyor', value: 4.5, benchmark: 1.5 },
      liquidity:     { name: 'Likidite Riski',       score: 30, grade: 'D', detail: 'Nakit akışı yüksek borç servisi altında', value: 72, benchmark: 35 },
      compliance:    { name: 'Uyum Riski',           score: 50, grade: 'C', detail: '2 uyum uyarısı', value: 2, benchmark: 0 },
    },
    composite_score: 32,
    composite_grade: 'F',
    recommended_action: 'Kritik: Hukuki danışmanlık alın.',
  },
]

const MOCK_SUMMARY: CompanyRiskSummary = {
  partner_profiles:      MOCK_PROFILES,
  company_composite:     63,
  company_grade:         'C',
  total_debt_try:        1_000_000,
  dsr:                   0.48,
  concentration_pct:     40,
  highest_risk_partner:  'Mehmet Demir',
  concentration_warning: null,
}

// ── Colour helpers ────────────────────────────────────────────────────────────

const GRADE_RING: Record<RiskGrade, string> = {
  A: 'border-green-400 text-green-700  bg-green-50',
  B: 'border-green-400 text-green-700  bg-green-50',
  C: 'border-amber-400 text-amber-700  bg-amber-50',
  D: 'border-red-400   text-red-700    bg-red-50',
  F: 'border-red-400   text-red-700    bg-red-50',
}

const GRADE_BADGE: Record<RiskGrade, string> = {
  A: 'bg-green-100 text-green-700  border-green-300',
  B: 'bg-green-100 text-green-700  border-green-300',
  C: 'bg-amber-100 text-amber-700  border-amber-300',
  D: 'bg-red-100   text-red-700    border-red-300',
  F: 'bg-red-100   text-red-700    border-red-300',
}

const BAR_COLOR: Record<RiskGrade, string> = {
  A: 'bg-green-500',
  B: 'bg-green-400',
  C: 'bg-amber-400',
  D: 'bg-red-400',
  F: 'bg-red-600',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function GradeCircle({ grade, composite }: { grade: RiskGrade; composite: number }) {
  return (
    <div className={`w-20 h-20 rounded-full border-4 flex flex-col items-center justify-center shrink-0 ${GRADE_RING[grade]}`}>
      <span className="text-2xl font-black leading-none">{grade}</span>
      <span className="text-[10px] font-semibold mt-0.5 tabular-nums">{composite.toFixed(0)}</span>
    </div>
  )
}

function DimBar({ dim }: { dim: { name: string; score: number; grade: RiskGrade; detail: string } }) {
  const barCls = BAR_COLOR[dim.grade]
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] text-[#64748b] truncate max-w-[140px]">{dim.name}</span>
        <span className="text-[10px] font-black tabular-nums text-[#334155]">{dim.score.toFixed(0)}</span>
      </div>
      <div className="h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
        <div
          className={`h-1.5 rounded-full transition-all ${barCls}`}
          style={{ width: `${Math.min(100, Math.max(0, dim.score))}%` }}
        />
      </div>
    </div>
  )
}

function PartnerRiskCard({ profile }: { profile: PartnerRiskProfile }) {
  const { partner_name, dimensions, composite_score, composite_grade, recommended_action } = profile
  const badgeCls  = GRADE_BADGE[composite_grade]
  const dimList   = [
    { ...dimensions.concentration, name: 'Kredi Konsantrasyonu' },
    { ...dimensions.duration,      name: 'Vade Riski' },
    { ...dimensions.liquidity,     name: 'Likidite Baskısı' },
    { ...dimensions.burden,        name: 'Eşitlik Açığı' },
    { ...dimensions.coverage,      name: 'Taahhüt Riski' },
    { ...dimensions.compliance,    name: 'Genel Uyum' },
  ] as const

  return (
    <div className="bg-white border border-[#e2e8f0] rounded shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e2e8f0]">
        <span className="text-sm font-bold text-[#0f172a]">{partner_name}</span>
        <span className={`text-xs font-black border px-2 py-0.5 rounded tracking-wide ${badgeCls}`}>
          {composite_grade} · {gradeToRiskLabel(composite_grade)}
        </span>
      </div>

      {/* Score bar */}
      <div className="px-4 pt-2.5 pb-1">
        <div className="h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
          <div
            className={`h-1.5 rounded-full transition-all ${BAR_COLOR[composite_grade]}`}
            style={{ width: `${composite_score}%` }}
          />
        </div>
        <div className="text-[10px] text-[#94a3b8] mt-0.5 tabular-nums">
          Kompozit skor: {composite_score.toFixed(0)}/100
        </div>
      </div>

      {/* 6-dimension bars */}
      <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {dimList.map(dim => (
          <DimBar key={dim.name} dim={dim} />
        ))}
      </div>

      {/* Recommended action */}
      {recommended_action && (
        <div className="px-4 py-2 bg-[#f8fafc] border-t border-[#e2e8f0] flex items-center gap-2">
          <span className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] shrink-0">Öneri</span>
          <span className="text-[11px] text-[#64748b]">{recommended_action}</span>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export interface RiskMapTabProps {
  loading?: boolean
}

export function RiskMapTab({ loading = false }: RiskMapTabProps) {
  const summary  = MOCK_SUMMARY
  const profiles = MOCK_PROFILES

  // Compute company grade from partner profiles for display consistency
  const companyGrade = computeCompanyRiskGrade(
    profiles.map(p => ({ grade: p.composite_grade, weight: p.share_ratio }))
  )
  const companyLabel = gradeToRiskLabel(companyGrade)
  const now          = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-24 bg-[#f1f5f9] rounded" />
        <div className="h-48 bg-[#f1f5f9] rounded" />
        <div className="h-48 bg-[#f1f5f9] rounded" />
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* ── Title row ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-base font-black text-[#0f172a]">Risk Haritası</div>
          <div className="text-[10px] text-[#94a3b8] mt-0.5">Son güncelleme: {now}</div>
        </div>
        <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">
          6 Boyutlu PCLE Analizi
        </div>
      </div>

      {/* ── Company-level grade circle banner ─────────────────────────────────── */}
      <div className={`rounded border px-5 py-4 flex items-center gap-5 ${GRADE_RING[companyGrade]}`}>
        <GradeCircle grade={companyGrade} composite={summary.company_composite} />
        <div>
          <div className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1">
            Şirket Geneli Risk Notu
          </div>
          <div className="text-lg font-black text-[#0f172a] leading-snug">{companyLabel}</div>
          <div className="text-[10px] text-[#64748b] mt-0.5">
            Toplam Borç: ₺{(summary.total_debt_try / 1_000_000).toFixed(1)}M ·
            DSR: {(summary.dsr * 100).toFixed(0)}% ·
            Konsantrasyon: {summary.concentration_pct.toFixed(0)}%
          </div>
          {summary.highest_risk_partner && (
            <div className="text-[10px] text-red-600 mt-0.5 font-semibold">
              En yüksek risk: {summary.highest_risk_partner}
            </div>
          )}
        </div>
      </div>

      {/* ── Concentration warning ──────────────────────────────────────────────── */}
      {summary.concentration_warning && (
        <div className="bg-red-50 border border-red-200 rounded px-4 py-3 text-xs text-red-700">
          <span className="font-black uppercase tracking-widest mr-2">Konsantrasyon Uyarısı</span>
          {summary.concentration_warning}
        </div>
      )}

      {/* ── Per-partner risk cards ─────────────────────────────────────────────── */}
      {profiles.map(p => (
        <PartnerRiskCard key={p.partner_id} profile={p} />
      ))}

      <div className="text-[10px] text-[#94a3b8] px-1 leading-relaxed">
        Boyutlar: Kredi Konsantrasyonu · Vade Riski · Likidite Baskısı · Eşitlik Açığı · Taahhüt Riski · Genel Uyum
        · Skor A ≥ 90 · B ≥ 75 · C ≥ 60 · D ≥ 40 · F &lt; 40
      </div>
    </div>
  )
}

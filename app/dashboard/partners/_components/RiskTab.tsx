'use client'

// ── RiskTab — Partner Risk Dashboard + PCLE 6-dimension risk scoring ──────────
//
// Section 1 — Partner Risk Dashboard (/api/partners/risk):
//   • Portfolio overview: avg_score, flagged_partners, grade distribution
//   • Critical flags list (up to 5)
//   • Per-partner risk cards with 6 new dimensions
//
// Section 2 — PCLE Risk Analysis (/api/partners/pcle/risk):
//   • Company-level composite grade banner
//   • Per-partner 6-dimension scorecards (concentration/duration/burden/coverage/liquidity/compliance)
//   • Compliance warnings
//   • Recommended actions per partner

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { NarrativeFooter } from '@/components/ds'
import type { RiskGrade }      from '@/lib/services/pcle/pcle.risk'
import type { PartnerRiskReport, PartnerRiskProfile as NewPartnerRiskProfile, PartnerRiskDimension } from '@/lib/services/pcle/partner-risk.service'

// ── Types (mirrors pcle.risk.ts output shape) ─────────────────────────────────

interface RiskDimension {
  name:      string
  score:     number
  grade:     RiskGrade
  detail:    string
  value:     number
  benchmark: number
}

interface PartnerRiskProfile {
  partner_id:         string
  partner_name:       string
  share_ratio:        number
  net_loan:           number
  dimensions: {
    concentration: RiskDimension
    duration:      RiskDimension
    burden:        RiskDimension
    coverage:      RiskDimension
    liquidity:     RiskDimension
    compliance:    RiskDimension
  }
  composite_score:    number
  composite_grade:    RiskGrade
  recommended_action: string
}

interface CompanyRiskSummary {
  partner_profiles:     PartnerRiskProfile[]
  company_composite:    number
  company_grade:        RiskGrade
  total_debt_try:       number
  dsr:                  number
  concentration_pct:    number
  highest_risk_partner: string | null
  concentration_warning: string | null
}

interface ComplianceWarning {
  type:     string
  partner?: string
  message:  string
  amount?:  number
}

interface RiskApiResponse {
  risk_summary:        CompanyRiskSummary
  compliance_warnings: ComplianceWarning[]
}

// ── Partner Risk Dashboard Types ───────────────────────────────────────────────

// (imported from partner-risk.service — kept as local alias for convenience)
type NewProfile = NewPartnerRiskProfile
type NewDimension = PartnerRiskDimension

export interface RiskTabProps {
  loading: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const GRADE_COLORS: Record<RiskGrade, string> = {
  A: 'bg-pos-light border-pos-light text-pos-text',
  B: 'bg-info-light border-info-light text-info-text',
  C: 'bg-warn-light border-warn-light text-warn-text',
  D: 'bg-warn-light border-warn/20 text-warn-text',
  F: 'bg-neg-light border-neg-light text-neg-text',
}
const GRADE_DOT: Record<RiskGrade, string> = {
  A: 'bg-pos-light', B: 'bg-info-light0', C: 'bg-warn-light', D: 'bg-warn', F: 'bg-neg-light',
}
const GRADE_BAR: Record<RiskGrade, string> = {
  A: 'bg-pos', B: 'bg-info', C: 'bg-warn', D: 'bg-warn', F: 'bg-neg',
}

const FMT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })
function fmt(n: number) {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₺${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `₺${(n / 1_000).toFixed(0)}K`
  return `₺${FMT.format(n)}`
}

const DIM_KEYS: Array<keyof PartnerRiskProfile['dimensions']> = [
  'concentration', 'duration', 'burden', 'coverage', 'liquidity', 'compliance',
]

// ── Heatmap helpers ────────────────────────────────────────────────────────────

// Score thresholds per task spec: ≥70=green, 40-69=amber, <40=red
// (slightly different from the grade system — these are cell colour thresholds)
function heatCell(score: number): string {
  if (score >= 70) return 'bg-pos-light text-pos-text'
  if (score >= 40) return 'bg-warn-light text-warn-text'
  return 'bg-neg-light text-neg-text'
}

// Letter grade per task spec: A(≥80), B(60-79), C(40-59), D(<40)
function gradeFromScore(score: number): string {
  if (score >= 80) return 'A'
  if (score >= 60) return 'B'
  if (score >= 40) return 'C'
  return 'D'
}

const DIM_LABELS: Record<keyof PartnerRiskProfile['dimensions'], string> = {
  concentration: 'Konsant.',
  duration:      'Vade',
  burden:        'Yük',
  coverage:      'Teminat',
  liquidity:     'Likidite',
  compliance:    'Uyum',
}

function HeatmapGrid({ profiles }: { profiles: PartnerRiskProfile[] }) {
  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 border-b border-[#e8eaef] bg-[#f8fafc]/60">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Risk Isı Haritası</div>
        <div className="text-[10px] text-[#94a3b8] mt-0.5">
          Yeşil ≥70 · Turuncu 40–69 · Kırmızı &lt;40 · Not: A≥80 · B≥60 · C≥40 · D&lt;40
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#e8eaef]">
              <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-widest text-[#94a3b8] bg-[#f8fafc] sticky left-0 z-10 min-w-[100px]">
                Ortak
              </th>
              {DIM_KEYS.map(k => (
                <th key={k} className="px-2 py-2 text-center text-[9px] font-black uppercase tracking-widest text-[#94a3b8] bg-[#f8fafc] whitespace-nowrap min-w-[72px]">
                  {DIM_LABELS[k]}
                </th>
              ))}
              <th className="px-3 py-2 text-center text-[9px] font-black uppercase tracking-widest text-[#94a3b8] bg-[#f8fafc] whitespace-nowrap">
                Genel Not
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f5f9]">
            {profiles.map(p => (
              <tr key={p.partner_id} className="hover:bg-[#fafafa]">
                <td className="px-3 py-2 font-semibold text-[#0f172a] sticky left-0 bg-white z-10 whitespace-nowrap">
                  {p.partner_name}
                </td>
                {DIM_KEYS.map(k => {
                  const dim = p.dimensions[k]
                  return (
                    <td key={k} className="px-2 py-1.5 text-center">
                      <div className={`inline-flex items-center justify-center w-10 h-6 rounded text-[11px] font-black tabular-nums ${heatCell(dim.score)}`}>
                        {dim.score.toFixed(0)}
                      </div>
                    </td>
                  )
                })}
                <td className="px-3 py-1.5 text-center">
                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-black border-2 ${GRADE_COLORS[p.composite_grade]}`}>
                    {gradeFromScore(p.composite_score)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ScoreBar({ score, grade }: { score: number; grade: RiskGrade }) {
  return (
    <div className="h-1 bg-[#f1f5f9] rounded-full overflow-hidden mt-0.5">
      <div
        className={`h-1 rounded-full transition-all ${GRADE_BAR[grade]}`}
        style={{ width: `${Math.min(100, score)}%` }}
      />
    </div>
  )
}

function GradeBadge({ grade }: { grade: RiskGrade }) {
  return (
    <span className={`text-[10px] font-black border px-1.5 py-0.5 rounded tracking-wide ${GRADE_COLORS[grade]}`}>
      {grade}
    </span>
  )
}

// ── New Partner Risk Dashboard sub-components ─────────────────────────────────

const NEW_GRADE_COLORS: Record<string, string> = {
  A: 'bg-pos-light text-pos-text border-pos-light',
  B: 'bg-info-light text-info-text border-info-light',
  C: 'bg-warn-light text-warn-text border-warn-light',
  D: 'bg-orange-50 text-orange-700 border-orange-200',
  F: 'bg-neg-light text-neg-text border-neg-light',
}
const NEW_GRADE_BAR: Record<string, string> = {
  A: 'bg-pos', B: 'bg-info', C: 'bg-warn', D: 'bg-orange-400', F: 'bg-neg',
}

function DimScoreCell({ dim }: { dim: NewDimension }) {
  const color = dim.is_flagged ? 'text-neg-text' : dim.score >= 75 ? 'text-pos-text' : 'text-warn-text'
  return (
    <div className="bg-[#f8fafc] rounded px-2 py-1.5">
      <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] truncate mb-0.5">
        {dim.label}
      </div>
      <div className={`text-xs font-black tabular-nums ${color}`}>
        {dim.score.toFixed(0)}
        {dim.is_flagged && <span className="ml-1 text-neg-text text-[9px]">!</span>}
      </div>
      <div className="h-0.5 bg-[#e2e8f0] rounded-full mt-1 overflow-hidden">
        <div
          className={`h-0.5 rounded-full transition-all ${NEW_GRADE_BAR[dim.score >= 90 ? 'A' : dim.score >= 75 ? 'B' : dim.score >= 60 ? 'C' : dim.score >= 40 ? 'D' : 'F']}`}
          style={{ width: `${dim.score}%` }}
        />
      </div>
    </div>
  )
}

function NewRiskCard({ p }: { p: NewProfile }) {
  const gradeColors = NEW_GRADE_COLORS[p.grade] ?? 'bg-[#f8fafc] text-[#64748b] border-[#e8eaef]'
  const barColor    = NEW_GRADE_BAR[p.grade]    ?? 'bg-[#94a3b8]'
  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8eaef]">
        <div>
          <div className="text-sm font-bold text-[#0f172a]">{p.partner_name}</div>
          <div className="text-[10px] text-[#94a3b8]">
            %{p.share_pct.toFixed(0)} pay
            {p.flagged_dimensions > 0 && (
              <span className="ml-2 text-neg-text font-semibold">
                {p.flagged_dimensions} boyut riskli
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right hidden sm:block">
            <div className="text-[9px] text-[#94a3b8] uppercase tracking-widest">Kompozit</div>
            <div className="text-xs font-black text-[#334155]">{p.composite_score.toFixed(0)}/100</div>
          </div>
          <span className={`text-xs font-black border px-2 py-0.5 rounded tracking-wide ${gradeColors}`}>
            {p.grade} · {p.grade_label}
          </span>
        </div>
      </div>

      {/* Score bar */}
      <div className="px-4 pt-2 pb-1">
        <div className="h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
          <div
            className={`h-1.5 rounded-full transition-all ${barColor}`}
            style={{ width: `${p.composite_score}%` }}
          />
        </div>
      </div>

      {/* 6-dimension mini grid */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 px-4 pb-3">
        {p.dimensions.map(dim => (
          <DimScoreCell key={dim.key} dim={dim} />
        ))}
      </div>

      {/* Top concern */}
      {p.top_concern && (
        <div className="px-4 py-2 bg-neg-light/50 border-t border-neg-light/60">
          <span className="text-[9px] font-black uppercase tracking-widest text-neg-text mr-2">Ana Endişe</span>
          <span className="text-[11px] text-neg-text">{p.top_concern}</span>
        </div>
      )}
    </div>
  )
}

function PartnerRiskDashboard() {
  const [report,     setReport]     = useState<PartnerRiskReport | null>(null)
  const [fetchErr,   setFetchErr]   = useState('')
  const [fetchDone,  setFetchDone]  = useState(false)

  useEffect(() => {
    const ctrl = new AbortController()
    fetch('/api/partners/risk', { signal: ctrl.signal })
      .then(r => r.ok ? r.json() as Promise<PartnerRiskReport> : Promise.reject(r.status))
      .then(d  => { setReport(d); setFetchDone(true) })
      .catch(err => {
        if ((err as Error)?.name !== 'AbortError') {
          setFetchErr('Risk dashboard verileri yüklenemedi')
          setFetchDone(true)
        }
      })
    return () => ctrl.abort()
  }, [])

  if (!fetchDone) {
    return (
      <div className="space-y-2 animate-pulse">
        <div className="h-16 bg-[#f1f5f9] rounded" />
        <div className="h-32 bg-[#f1f5f9] rounded" />
      </div>
    )
  }

  if (fetchErr) {
    return (
      <div className="bg-neg-light border border-neg-light rounded px-4 py-3 text-xs text-neg-text">
        {fetchErr}
      </div>
    )
  }

  if (!report || report.profiles.length === 0) {
    return (
      <div className="bg-[#f8fafc] border border-[#e8eaef] rounded px-4 py-6 text-center text-xs text-[#94a3b8]">
        Risk dashboard için yeterli veri yok.
      </div>
    )
  }

  const { profiles, avg_score, grade_distribution, flagged_partners, critical_flags } = report

  const avgGrade = avg_score >= 90 ? 'A' : avg_score >= 75 ? 'B' : avg_score >= 60 ? 'C' : avg_score >= 40 ? 'D' : 'F'
  const avgGradeColors = NEW_GRADE_COLORS[avgGrade] ?? 'bg-[#f8fafc] text-[#64748b] border-[#e8eaef]'

  return (
    <div className="space-y-3">
      {/* Portfolio overview row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {/* Avg score chip */}
        <div className={`border rounded px-3 py-2.5 ${avgGradeColors}`}>
          <div className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-0.5">Portföy Skoru</div>
          <div className="text-xl font-black tabular-nums leading-none">{avg_score.toFixed(0)}</div>
          <div className="text-[10px] opacity-70 mt-0.5">Not: {avgGrade}</div>
        </div>

        {/* Flagged partners */}
        <div className={`border rounded px-3 py-2.5 ${flagged_partners > 0 ? 'bg-neg-light border-neg-light text-neg-text' : 'bg-pos-light border-pos-light text-pos-text'}`}>
          <div className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-0.5">Riskli Ortak</div>
          <div className="text-xl font-black tabular-nums leading-none">{flagged_partners}</div>
          <div className="text-[10px] opacity-70 mt-0.5">D veya F notu</div>
        </div>

        {/* Grade distribution */}
        <div className="col-span-2 border border-[#e8eaef] rounded px-3 py-2.5 bg-white">
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">Not Dağılımı</div>
          <div className="flex items-center gap-2 flex-wrap">
            {(['A', 'B', 'C', 'D', 'F'] as const).map(g => (
              <div key={g} className="flex items-center gap-1">
                <span className={`text-[10px] font-black border px-1.5 py-0.5 rounded ${NEW_GRADE_COLORS[g]}`}>{g}</span>
                <span className="text-xs font-bold text-[#334155]">{grade_distribution[g] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Critical flags */}
      {critical_flags.length > 0 && (
        <div className="bg-neg-light/60 border border-neg-light rounded px-4 py-3">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-neg-text mb-2">
            Kritik Uyarılar
          </div>
          <div className="space-y-1">
            {critical_flags.map((flag, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px] text-neg-text">
                <span className="shrink-0 mt-px font-bold">{i + 1}.</span>
                <span>{flag}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-partner risk cards */}
      {profiles.map(p => (
        <NewRiskCard key={p.partner_id} p={p} />
      ))}

      <div className="text-[10px] text-[#94a3b8] px-1">
        Boyutlar: Borç Konsantrasyonu (25%) · Sermaye Açığı (20%) · Borç Servisi (20%) · Vade (15%) · Faiz Oranı (10%) · Waterfall (10%)
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RiskTab({ loading }: RiskTabProps) {
  const [data,      setData]      = useState<RiskApiResponse | null>(null)
  const [fetchErr,  setFetchErr]  = useState('')
  const [fetchDone, setFetchDone] = useState(false)

  useEffect(() => {
    const ctrl = new AbortController()
    fetch('/api/partners/pcle/risk?available_cash=0&net_income=0', { signal: ctrl.signal })
      .then(r => r.ok ? r.json() as Promise<RiskApiResponse> : Promise.reject(r.status))
      .then(d  => { setData(d); setFetchDone(true) })
      .catch(err => { if (err !== 'AbortError' && (err as Error)?.name !== 'AbortError') { setFetchErr('Risk verileri yüklenemedi'); setFetchDone(true) } })
    return () => ctrl.abort()
  }, [])

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (loading || !fetchDone) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-20 bg-[#f1f5f9] rounded" />
        <div className="h-48 bg-[#f1f5f9] rounded" />
        <div className="h-48 bg-[#f1f5f9] rounded" />
      </div>
    )
  }

  if (fetchErr) {
    return (
      <div className="bg-neg-light border border-neg-light rounded px-4 py-3 text-sm text-neg">
        {fetchErr}
      </div>
    )
  }

  const rs = data?.risk_summary
  const cw = data?.compliance_warnings ?? []

  if (!rs || rs.partner_profiles.length === 0) {
    return (
      <div className="bg-[#f8fafc] border border-[#e8eaef] rounded px-4 py-8 text-center text-sm text-[#94a3b8]">
        Ortak borç kaydı bulunamadı — risk skoru hesaplanamadı.
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Section 1: Partner Risk Dashboard (new) ───────────────────────────── */}
      <div className="space-y-2">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Partner Risk Dashboard
        </div>
        <PartnerRiskDashboard />
      </div>

      {/* ── Divider ───────────────────────────────────────────────────────────── */}
      <div className="border-t border-[#e8eaef] pt-4">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
          PCLE Risk Analizi
        </div>
      </div>

      {/* ── Section 2: Company-Level PCLE Grade Banner ───────────────────────── */}
      <div className={`rounded border px-5 py-4 flex items-center justify-between gap-4 ${GRADE_COLORS[rs.company_grade]}`}>
        <div>
          <div className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1.5">Şirket Geneli Risk Notu</div>
          <div className="flex items-center gap-3">
            <span className="text-4xl font-black leading-none">{rs.company_grade}</span>
            <div>
              <div className="text-sm font-bold leading-snug">
                {rs.company_grade === 'A' ? 'Düşük Risk — Sağlıklı Yapı' :
                 rs.company_grade === 'B' ? 'Kabul Edilebilir — Rutin Takip' :
                 rs.company_grade === 'C' ? 'Orta Risk — Dikkat Gerekli' :
                 rs.company_grade === 'D' ? 'Yüksek Risk — Aksiyon Gerekli' :
                 'Kritik Risk — Acil Müdahale'}
              </div>
              <div className="text-[10px] opacity-70 mt-0.5">
                Kompozit skor: {rs.company_composite.toFixed(0)}/100
              </div>
            </div>
          </div>
        </div>
        <div className="text-right shrink-0 space-y-1">
          <div className="text-[10px] opacity-60 uppercase tracking-widest">Toplam Borç</div>
          <div className="text-xl font-black tabular-nums">{fmt(rs.total_debt_try)}</div>
          <div className="text-[10px] opacity-60">
            DSR: <span className="font-bold">{(rs.dsr * 100).toFixed(0)}%</span> · Konsantrasyon: <span className="font-bold">{rs.concentration_pct.toFixed(0)}%</span>
          </div>
        </div>
      </div>

      {/* ── Konsantrasyon Uyarısı Banner ─────────────────────────────────────── */}
      {rs.concentration_warning && (
        <div className="bg-neg-light border border-neg-light rounded px-4 py-3 flex items-start gap-3">
          <span className="text-neg font-black text-base shrink-0">!</span>
          <div>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-neg-text mb-1">
              Konsantrasyon Uyarısı
            </div>
            <div className="text-xs text-neg-text">{rs.concentration_warning}</div>
          </div>
        </div>
      )}

      {/* ── Risk Heatmap Grid ────────────────────────────────────────────────── */}
      {rs.partner_profiles.length > 0 && (
        <HeatmapGrid profiles={rs.partner_profiles} />
      )}

      {/* ── Compliance Warnings ─────────────────────────────────────────────── */}
      {cw.length > 0 && (
        <div className="bg-warn-light border border-warn-light rounded px-4 py-3">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-warn-text mb-2">
            ⚠ Yasal Uyum Uyarıları
          </div>
          <div className="space-y-1.5">
            {cw.map((w, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px] text-warn-text">
                <span className="shrink-0 mt-px">•</span>
                <span>
                  {w.partner && <span className="font-bold">{w.partner}: </span>}
                  {w.message}
                  {w.amount != null && w.amount > 0 && (
                    <span className="ml-1 font-semibold">({fmt(w.amount)})</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Per-Partner Risk Profiles ────────────────────────────────────────── */}
      {rs.partner_profiles.map(p => (
        <div key={p.partner_id} className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">

          {/* Partner header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8eaef]">
            <div className="flex items-center gap-2.5">
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${GRADE_DOT[p.composite_grade]}`} />
              <div>
                <div className="text-sm font-bold text-[#0f172a]">{p.partner_name}</div>
                <div className="text-[10px] text-[#94a3b8]">
                  %{(p.share_ratio * 100).toFixed(0)} pay · {fmt(p.net_loan)} net borç
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="text-right hidden sm:block">
                <div className="text-[9px] text-[#94a3b8] uppercase tracking-widest">Kompozit</div>
                <div className="text-xs font-black text-[#334155]">{p.composite_score.toFixed(0)}/100</div>
              </div>
              <GradeBadge grade={p.composite_grade} />
            </div>
          </div>

          {/* 6-Dimension grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-[#f1f5f9]">
            {DIM_KEYS.map(key => {
              const dim = p.dimensions[key]
              return (
                <div key={key} className="bg-white px-3 py-2.5">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <div className="text-[9px] font-bold text-[#94a3b8] uppercase tracking-widest truncate">
                      {dim.name}
                    </div>
                    <GradeBadge grade={dim.grade} />
                  </div>
                  <ScoreBar score={dim.score} grade={dim.grade} />
                  <div className="text-[10px] text-[#64748b] mt-1.5 leading-tight line-clamp-2">
                    {dim.detail}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Recommended action */}
          {p.recommended_action && (
            <div className="px-4 py-2 bg-[#f8fafc] border-t border-[#e8eaef] flex items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] shrink-0">Öneri</span>
              <span className="text-[11px] text-[#64748b]">{p.recommended_action}</span>
            </div>
          )}
        </div>
      ))}

      <div className="text-[10px] text-[#94a3b8] px-1 leading-relaxed">
        6 boyutlu skor: Konsantrasyon · Süre · Yük dengesi · Teminat · Likidite · Yasal uyum.
        Her boyut 0–100 puan · A ≥ 90 · B ≥ 75 · C ≥ 60 · D ≥ 40 · F &lt; 40
      </div>

      {/* Cross-navigation */}
      <NarrativeFooter
        className="pt-2"
        narrative="Ortak riski bilanço ve müşteri riski ile bütünleşik değerlendirilmeli."
        links={[
          { label: 'Alacak Riskleri', href: '/dashboard/finance?tab=risks' },
          { label: 'Bilanço',         href: '/dashboard/finance?tab=balance' },
          { label: 'Borç Baskısı',    href: '/dashboard/planning?tab=debt-pressure' },
        ]}
      />
    </div>
  )
}

'use client'

// ── RiskTab — PCLE 6-dimension partner risk scoring ──────────────────────────
//
// Renders the CompanyRiskSummary from /api/partners/pcle/risk:
//   • Company-level composite grade banner
//   • Per-partner 6-dimension scorecards (concentration/duration/burden/coverage/liquidity/compliance)
//   • Compliance warnings
//   • Recommended actions per partner

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { RiskGrade }      from '@/lib/services/pcle/pcle.risk'

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

export interface RiskTabProps {
  loading: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const GRADE_COLORS: Record<RiskGrade, string> = {
  A: 'bg-pos-light border-pos-light text-pos-text',
  B: 'bg-info-light border-info-light text-info-text',
  C: 'bg-warn-light border-warn-light text-warn-text',
  D: 'bg-orange-50 border-orange-200 text-orange-800',
  F: 'bg-neg-light border-neg-light text-neg-text',
}
const GRADE_DOT: Record<RiskGrade, string> = {
  A: 'bg-pos-light', B: 'bg-info-light0', C: 'bg-warn-light', D: 'bg-orange-500', F: 'bg-neg-light',
}
const GRADE_BAR: Record<RiskGrade, string> = {
  A: 'bg-pos', B: 'bg-info', C: 'bg-warn', D: 'bg-orange-400', F: 'bg-neg',
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
      <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-4 py-8 text-center text-sm text-[#94a3b8]">
        Ortak borç kaydı bulunamadı — risk skoru hesaplanamadı.
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Company-Level Grade Banner ───────────────────────────────────────── */}
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

      {/* ── Compliance Warnings ─────────────────────────────────────────────── */}
      {cw.length > 0 && (
        <div className="bg-warn-light border border-warn-light rounded px-4 py-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-warn-text mb-2">
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
        <div key={p.partner_id} className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">

          {/* Partner header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#e2e8f0]">
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
            <div className="px-4 py-2 bg-[#f8fafc] border-t border-[#e2e8f0] flex items-center gap-2">
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
      <div className="flex items-center justify-between px-1 pt-2">
        <p className="text-[10px] text-[#94a3b8] leading-relaxed">
          Ortak riski bilanço ve müşteri riski ile bütünleşik değerlendirilmeli.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link href="/dashboard/finance?tab=risks" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Alacak Riskleri →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/finance?tab=balance" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Bilanço →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/planning?tab=debt-pressure" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Borç Baskısı →
          </Link>
        </div>
      </div>
    </div>
  )
}

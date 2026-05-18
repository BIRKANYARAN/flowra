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
  A: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  B: 'bg-blue-50 border-blue-200 text-blue-800',
  C: 'bg-amber-50 border-amber-200 text-amber-800',
  D: 'bg-orange-50 border-orange-200 text-orange-800',
  F: 'bg-red-50 border-red-200 text-red-800',
}
const GRADE_DOT: Record<RiskGrade, string> = {
  A: 'bg-emerald-500', B: 'bg-blue-500', C: 'bg-amber-500', D: 'bg-orange-500', F: 'bg-red-500',
}
const GRADE_BAR: Record<RiskGrade, string> = {
  A: 'bg-emerald-400', B: 'bg-blue-400', C: 'bg-amber-400', D: 'bg-orange-400', F: 'bg-red-400',
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
    <div className="h-1 bg-gray-100 rounded-full overflow-hidden mt-0.5">
      <div
        className={`h-1 rounded-full transition-all ${GRADE_BAR[grade]}`}
        style={{ width: `${Math.min(100, score)}%` }}
      />
    </div>
  )
}

function GradeBadge({ grade }: { grade: RiskGrade }) {
  return (
    <span className={`text-[10px] font-black border px-1.5 py-0.5 rounded-lg tracking-wide ${GRADE_COLORS[grade]}`}>
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
        <div className="h-20 bg-gray-100 rounded-xl" />
        <div className="h-48 bg-gray-100 rounded-xl" />
        <div className="h-48 bg-gray-100 rounded-xl" />
      </div>
    )
  }

  if (fetchErr) {
    return (
      <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">
        {fetchErr}
      </div>
    )
  }

  const rs = data?.risk_summary
  const cw = data?.compliance_warnings ?? []

  if (!rs || rs.partner_profiles.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-8 text-center text-sm text-gray-400">
        Ortak borç kaydı bulunamadı — risk skoru hesaplanamadı.
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Company-Level Grade Banner ───────────────────────────────────────── */}
      <div className={`rounded-xl border px-5 py-4 flex items-center justify-between gap-4 ${GRADE_COLORS[rs.company_grade]}`}>
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
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-2">
            ⚠ Yasal Uyum Uyarıları
          </div>
          <div className="space-y-1.5">
            {cw.map((w, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px] text-amber-800">
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
        <div key={p.partner_id} className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(17,24,39,0.04)]">

          {/* Partner header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${GRADE_DOT[p.composite_grade]}`} />
              <div>
                <div className="text-sm font-bold text-gray-900">{p.partner_name}</div>
                <div className="text-[10px] text-gray-400">
                  %{(p.share_ratio * 100).toFixed(0)} pay · {fmt(p.net_loan)} net borç
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="text-right hidden sm:block">
                <div className="text-[9px] text-gray-400 uppercase tracking-widest">Kompozit</div>
                <div className="text-xs font-black text-gray-700">{p.composite_score.toFixed(0)}/100</div>
              </div>
              <GradeBadge grade={p.composite_grade} />
            </div>
          </div>

          {/* 6-Dimension grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-gray-100">
            {DIM_KEYS.map(key => {
              const dim = p.dimensions[key]
              return (
                <div key={key} className="bg-white px-3 py-2.5">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest truncate">
                      {dim.name}
                    </div>
                    <GradeBadge grade={dim.grade} />
                  </div>
                  <ScoreBar score={dim.score} grade={dim.grade} />
                  <div className="text-[10px] text-gray-500 mt-1.5 leading-tight line-clamp-2">
                    {dim.detail}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Recommended action */}
          {p.recommended_action && (
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 shrink-0">Öneri</span>
              <span className="text-[11px] text-gray-600">{p.recommended_action}</span>
            </div>
          )}
        </div>
      ))}

      <div className="text-[10px] text-gray-400 px-1 leading-relaxed">
        6 boyutlu skor: Konsantrasyon · Süre · Yük dengesi · Teminat · Likidite · Yasal uyum.
        Her boyut 0–100 puan · A ≥ 90 · B ≥ 75 · C ≥ 60 · D ≥ 40 · F &lt; 40
      </div>

      {/* Cross-navigation */}
      <div className="flex items-center justify-between px-1 pt-2">
        <p className="text-[10px] text-gray-400 leading-relaxed">
          Ortak riski bilanço ve müşteri riski ile bütünleşik değerlendirilmeli.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link href="/dashboard/finance?tab=risks" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Alacak Riskleri →
          </Link>
          <span className="text-gray-200">|</span>
          <Link href="/dashboard/finance?tab=balance" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Bilanço →
          </Link>
          <span className="text-gray-200">|</span>
          <Link href="/dashboard/planning?tab=debt-pressure" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Borç Baskısı →
          </Link>
        </div>
      </div>
    </div>
  )
}

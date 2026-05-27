// ─────────────────────────────────────────────────────────────────────────────
// lib/services/pcle/partner-risk.service.ts — Partner Risk Dashboard
//
// 6-dimension composite risk scoring (NEW — distinct from pcle.risk.ts):
//   1. loan_concentration  — % of total company debt held by this partner
//   2. equity_gap          — how much committed capital is still unpaid
//   3. debt_service        — monthly repayment burden vs avg monthly revenue
//   4. loan_duration       — loans maturing within 90 days
//   5. interest_rate       — VUK compliance (zero-rate loans)
//   6. waterfall_burden    — deviation from expected share-ratio allocation
//
// All functions are pure (no DB access). Deterministic.
// ─────────────────────────────────────────────────────────────────────────────

import { round2 } from '@/lib/calc'

// ── Exported Types ────────────────────────────────────────────────────────────

export interface PartnerRiskDimension {
  key:        string
  label:      string       // Turkish
  score:      number       // 0-100
  weight:     number       // e.g. 0.25
  finding:    string       // Turkish one-line description
  is_flagged: boolean      // score < 60
}

export interface PartnerRiskProfile {
  partner_id:         string
  partner_name:       string
  share_pct:          number
  dimensions:         PartnerRiskDimension[]
  composite_score:    number
  grade:              'A' | 'B' | 'C' | 'D' | 'F'
  grade_label:        string          // Turkish
  flagged_dimensions: number          // count of is_flagged
  top_concern:        string          // worst dimension label in Turkish
}

export interface PartnerRiskReport {
  company_id:         string
  profiles:           PartnerRiskProfile[]
  // Portfolio summary
  avg_score:          number
  grade_distribution: Record<string, number>  // { 'A': 2, 'B': 1, 'C': 0, 'D': 0, 'F': 0 }
  flagged_partners:   number   // partners with grade D or F
  critical_flags:     string[] // top actionable issues across all partners (max 5)
  computed_at:        string
}

// ── Input shape for computePartnerRiskReport ──────────────────────────────────

export interface PartnerRiskInput {
  partner_id:   string
  partner_name: string
  /** share_pct = share_ratio × 100, e.g. 40 means 40% */
  share_pct:    number
  /** total outstanding loan from this partner to the company (TRY) */
  net_loan_try: number
  /** committed equity capital (TRY) — from subscription agreement */
  committed_equity_try: number
  /** equity capital actually paid in (TRY) */
  paid_equity_try: number
  /** monthly scheduled repayment amount due to this partner (TRY) */
  monthly_repayment_try: number
  /** loan tranches: principal + maturity date */
  tranches: Array<{
    principal_try:         number
    expected_repayment_date: string | null
    interest_rate_annual_pct: number
  }>
}

export interface PartnerRiskReportInput {
  company_id:          string
  partners:            PartnerRiskInput[]
  total_company_debt:  number   // sum of ALL partner loans (TRY)
  avg_monthly_revenue: number   // average monthly revenue (TRY), used for debt service
}

// ── Pure scoring functions (exported for testing) ─────────────────────────────

/**
 * Compute weighted composite score from dimension array.
 * Returns 0–100 rounded to 2 decimals.
 */
export function computeCompositeScore(
  dimensions: Array<{ score: number; weight: number }>,
): number {
  if (dimensions.length === 0) return 100
  const weighted = dimensions.reduce((s, d) => s + d.score * d.weight, 0)
  const totalWeight = dimensions.reduce((s, d) => s + d.weight, 0)
  if (totalWeight === 0) return 100
  return round2(weighted / totalWeight)
}

/** Map score to A–F grade. */
export function scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A'
  if (score >= 75) return 'B'
  if (score >= 60) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

/** Turkish grade label. */
export function scoreToGradeLabel(grade: string): string {
  const labels: Record<string, string> = {
    A: 'Mükemmel',
    B: 'İyi',
    C: 'Orta',
    D: 'Zayıf',
    F: 'Kritik',
  }
  return labels[grade] ?? 'Bilinmiyor'
}

/**
 * Dimension 1: Loan Concentration Risk
 * Score 100 at 0%, linearly decreasing to 0 at 100%.
 * High-risk threshold: >50%
 */
export function computeLoanConcentrationScore(partnerLoanPct: number): number {
  const pct = Math.max(0, Math.min(100, partnerLoanPct))
  return round2(Math.max(0, 100 - pct))
}

/**
 * Dimension 2: Equity Gap Risk
 * Score 100 if fully paid (gap = 0). 0 if nothing paid.
 * If committed = 0 (no obligation), returns 100.
 */
export function computeEquityGapScore(committed: number, paid: number): number {
  if (committed <= 0) return 100
  const gap_pct = Math.max(0, (committed - paid) / committed) * 100
  return round2(Math.max(0, 100 - gap_pct))
}

/**
 * Dimension 3: Debt Service Pressure
 * burden = monthlyRepayment / avgMonthlyRevenue × 100
 * Score 100 if burden = 0, 0 if burden ≥ 100%.
 */
export function computeDebtServiceScore(
  monthlyRepayment: number,
  avgMonthlyRevenue: number,
): number {
  if (monthlyRepayment <= 0) return 100
  if (avgMonthlyRevenue <= 0) return 0
  const burden_pct = (monthlyRepayment / avgMonthlyRevenue) * 100
  return round2(Math.max(0, 100 - burden_pct))
}

// ── Internal scoring helpers ───────────────────────────────────────────────────

/** Dimension 4: Loan Duration Risk — maturities within 90 days */
function computeLoanDurationScore(
  tranches: PartnerRiskInput['tranches'],
  referenceDate: Date,
): number {
  if (tranches.length === 0) return 100
  const totalPrincipal = tranches.reduce((s, t) => s + t.principal_try, 0)
  if (totalPrincipal <= 0) return 100

  const due90 = tranches
    .filter(t => {
      if (!t.expected_repayment_date) return false
      const maturity = new Date(t.expected_repayment_date)
      const diffDays = (maturity.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24)
      return diffDays >= 0 && diffDays <= 90
    })
    .reduce((s, t) => s + t.principal_try, 0)

  const due90Pct = (due90 / totalPrincipal) * 100
  if (due90Pct <= 0) return 100
  // 0% due within 90 days → 100; >50% → 0
  return round2(Math.max(0, 100 - due90Pct * 2))
}

/** Dimension 5: Interest Rate Risk (VUK compliance) */
function computeInterestRateScore(
  tranches: PartnerRiskInput['tranches'],
): number {
  if (tranches.length === 0) return 100

  let hasVukRisk = false
  let hasZeroRate = false

  for (const t of tranches) {
    if (t.interest_rate_annual_pct === 0) {
      hasZeroRate = true
      // VUK threshold: zero-rate > 50K TRY for a duration > 12 months
      if (t.principal_try > 50_000) {
        hasVukRisk = true
      }
    }
  }

  if (hasVukRisk) return 40
  if (hasZeroRate) return 60
  return 100
}

/**
 * Dimension 6: Waterfall Burden Score
 * |excess| / total_loans > 20% → score decreases.
 * excess = net_loan - total_debt × share_ratio
 */
function computeWaterfallBurdenScore(
  netLoanTry:        number,
  sharePct:          number,
  totalCompanyDebt:  number,
): number {
  if (totalCompanyDebt <= 0) return 100
  const shareRatio    = sharePct / 100
  const expected      = totalCompanyDebt * shareRatio
  const excess_pct    = (Math.abs(netLoanTry - expected) / totalCompanyDebt) * 100
  // Graceful decay: ≤5% → 100, 20% → 55, ≥50% → 0
  return round2(Math.max(0, 100 - excess_pct * 2))
}

// ── Main service function ──────────────────────────────────────────────────────

const DIMENSION_WEIGHTS = {
  loan_concentration: 0.25,
  equity_gap:         0.20,
  debt_service:       0.20,
  loan_duration:      0.15,
  interest_rate:      0.10,
  waterfall_burden:   0.10,
} as const

export function computePartnerRiskReport(
  input: PartnerRiskReportInput,
): PartnerRiskReport {
  const now = new Date()

  const profiles: PartnerRiskProfile[] = input.partners.map(p => {
    // ── 1. Loan Concentration ──────────────────────────────────────────────────
    const conc_pct   = input.total_company_debt > 0
      ? (p.net_loan_try / input.total_company_debt) * 100
      : 0
    const conc_score = computeLoanConcentrationScore(conc_pct)
    const d_conc: PartnerRiskDimension = {
      key:        'loan_concentration',
      label:      'Borç Konsantrasyonu',
      score:      conc_score,
      weight:     DIMENSION_WEIGHTS.loan_concentration,
      finding:    conc_pct > 50
        ? `Toplam şirket borcunun %${conc_pct.toFixed(0)}'ı tek ortakta`
        : `Borç payı: %${conc_pct.toFixed(0)}`,
      is_flagged: conc_score < 60,
    }

    // ── 2. Equity Gap ──────────────────────────────────────────────────────────
    const eq_score = computeEquityGapScore(p.committed_equity_try, p.paid_equity_try)
    const gap_try  = Math.max(0, p.committed_equity_try - p.paid_equity_try)
    const d_eq: PartnerRiskDimension = {
      key:        'equity_gap',
      label:      'Sermaye Açığı',
      score:      eq_score,
      weight:     DIMENSION_WEIGHTS.equity_gap,
      finding:    gap_try > 0
        ? `Ödenmemiş sermaye taahhüdü: ₺${gap_try.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`
        : 'Tüm sermaye taahhüdü karşılanmış',
      is_flagged: eq_score < 60,
    }

    // ── 3. Debt Service Pressure ───────────────────────────────────────────────
    const ds_score = computeDebtServiceScore(p.monthly_repayment_try, input.avg_monthly_revenue)
    const burden_pct = input.avg_monthly_revenue > 0
      ? (p.monthly_repayment_try / input.avg_monthly_revenue) * 100
      : 0
    const d_ds: PartnerRiskDimension = {
      key:        'debt_service',
      label:      'Borç Servisi Baskısı',
      score:      ds_score,
      weight:     DIMENSION_WEIGHTS.debt_service,
      finding:    burden_pct > 0
        ? `Aylık geri ödeme gelirin %${burden_pct.toFixed(0)}'ı`
        : 'Aylık geri ödeme yok',
      is_flagged: ds_score < 60,
    }

    // ── 4. Loan Duration ───────────────────────────────────────────────────────
    const dur_score = computeLoanDurationScore(p.tranches, now)
    const due90_count = p.tranches.filter(t => {
      if (!t.expected_repayment_date) return false
      const diffDays = (new Date(t.expected_repayment_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      return diffDays >= 0 && diffDays <= 90
    }).length
    const d_dur: PartnerRiskDimension = {
      key:        'loan_duration',
      label:      'Vade Riski',
      score:      dur_score,
      weight:     DIMENSION_WEIGHTS.loan_duration,
      finding:    due90_count > 0
        ? `${due90_count} tranche 90 gün içinde vadesi doluyor`
        : 'Yakın vadeli vade yok',
      is_flagged: dur_score < 60,
    }

    // ── 5. Interest Rate Risk ──────────────────────────────────────────────────
    const ir_score = computeInterestRateScore(p.tranches)
    const zeroRateTranches = p.tranches.filter(t => t.interest_rate_annual_pct === 0)
    const d_ir: PartnerRiskDimension = {
      key:        'interest_rate',
      label:      'Faiz Oranı Riski',
      score:      ir_score,
      weight:     DIMENSION_WEIGHTS.interest_rate,
      finding:    ir_score === 40
        ? 'VUK uyum riski: faizsiz borç >50K ₺'
        : zeroRateTranches.length > 0
          ? `${zeroRateTranches.length} faizsiz tranche — izleme gerekli`
          : 'Piyasa faizi uygulanıyor',
      is_flagged: ir_score < 60,
    }

    // ── 6. Waterfall Burden ────────────────────────────────────────────────────
    const wf_score = computeWaterfallBurdenScore(p.net_loan_try, p.share_pct, input.total_company_debt)
    const d_wf: PartnerRiskDimension = {
      key:        'waterfall_burden',
      label:      'Waterfall Dengesizliği',
      score:      wf_score,
      weight:     DIMENSION_WEIGHTS.waterfall_burden,
      finding:    wf_score < 60
        ? `Pay oranına göre borç yükü dengesiz`
        : 'Borç yükü pay oranıyla dengeli',
      is_flagged: wf_score < 60,
    }

    const dimensions: PartnerRiskDimension[] = [d_conc, d_eq, d_ds, d_dur, d_ir, d_wf]

    const composite_score = computeCompositeScore(dimensions)
    const grade           = scoreToGrade(composite_score)
    const grade_label     = scoreToGradeLabel(grade)
    const flagged_dimensions = dimensions.filter(d => d.is_flagged).length

    // Top concern = worst dimension label (lowest score)
    const worst = dimensions.reduce((a, b) => b.score < a.score ? b : a)
    const top_concern = worst.is_flagged ? worst.label : ''

    return {
      partner_id:   p.partner_id,
      partner_name: p.partner_name,
      share_pct:    p.share_pct,
      dimensions,
      composite_score,
      grade,
      grade_label,
      flagged_dimensions,
      top_concern,
    }
  })

  // ── Portfolio summary ────────────────────────────────────────────────────────

  const avg_score: number = profiles.length > 0
    ? round2(profiles.reduce((s, p) => s + p.composite_score, 0) / profiles.length)
    : 100

  const grade_distribution: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 }
  for (const p of profiles) {
    grade_distribution[p.grade] = (grade_distribution[p.grade] ?? 0) + 1
  }

  const flagged_partners = profiles.filter(p => p.grade === 'D' || p.grade === 'F').length

  // Critical flags: gather the top concern from worst partners (max 5)
  const critical_flags: string[] = profiles
    .filter(p => p.flagged_dimensions > 0)
    .sort((a, b) => a.composite_score - b.composite_score)
    .slice(0, 5)
    .flatMap(p =>
      p.dimensions
        .filter(d => d.is_flagged)
        .sort((a, b) => a.score - b.score)
        .slice(0, 1)
        .map(d => `${p.partner_name}: ${d.finding}`)
    )
    .slice(0, 5)

  return {
    company_id: input.company_id,
    profiles,
    avg_score,
    grade_distribution,
    flagged_partners,
    critical_flags,
    computed_at: new Date().toISOString(),
  }
}

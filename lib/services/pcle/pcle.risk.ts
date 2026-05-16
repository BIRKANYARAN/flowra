// ─────────────────────────────────────────────────────────────────────────────
// lib/services/pcle/pcle.risk.ts — PCLE Risk Context
//
// 6-dimension risk scoring per partner + company-level composite grade.
// All computations are pure (no DB access). Deterministic.
//
// Dimensions:
//   1. concentration_risk  — single partner's share of total debt
//   2. duration_risk       — how long the loan has been outstanding
//   3. burden_risk         — deviation from expected share-ratio allocation
//   4. coverage_risk       — debt vs equity coverage ratio
//   5. liquidity_risk      — debt service vs net income (DSR)
//   6. compliance_risk     — Turkish law compliance issues
// ─────────────────────────────────────────────────────────────────────────────

import { round2 } from '@/lib/calc'
import type { BurdenScore } from './pcle.liability'

export type RiskGrade = 'A' | 'B' | 'C' | 'D' | 'F'

export interface PartnerRiskDimension {
  name:        string
  score:       number      // 0 (worst) to 100 (best)
  grade:       RiskGrade
  detail:      string
  value:       number      // raw value (for display)
  benchmark:   number      // reference threshold
}

export interface PartnerRiskProfile {
  partner_id:   string
  partner_name: string
  share_ratio:  number
  net_loan:     number
  dimensions:   {
    concentration: PartnerRiskDimension
    duration:      PartnerRiskDimension
    burden:        PartnerRiskDimension
    coverage:      PartnerRiskDimension
    liquidity:     PartnerRiskDimension
    compliance:    PartnerRiskDimension
  }
  composite_score: number
  composite_grade: RiskGrade
  recommended_action: string
}

export interface CompanyRiskSummary {
  partner_profiles:      PartnerRiskProfile[]
  company_composite:     number
  company_grade:         RiskGrade
  total_debt_try:        number
  dsr:                   number   // debt service ratio
  concentration_pct:     number   // largest single lender % of total debt
  highest_risk_partner:  string | null
}

function scoreToGrade(score: number): RiskGrade {
  if (score >= 90) return 'A'
  if (score >= 75) return 'B'
  if (score >= 60) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

export class PCLERisk {
  /**
   * Compute 6-dimension risk profile for each partner.
   */
  static computePartnerRisks(params: {
    partners: Array<{ id: string; name: string; share_ratio: number; net_loan: number; days_outstanding: number; equity_paid: number }>
    total_debt_try:       number
    net_income_try:       number   // last 12 months net income
    monthly_debt_service: number   // interest + scheduled repayments per month
    compliance_issue_count: Map<string, number>  // partner_id → #warnings
  }): CompanyRiskSummary {
    const { partners, total_debt_try, net_income_try, monthly_debt_service, compliance_issue_count } = params

    const dsr = net_income_try > 0 ? round2((monthly_debt_service * 12) / net_income_try) : 1
    const concentration_pct = total_debt_try > 0
      ? round2((Math.max(...partners.map(p => p.net_loan), 0) / total_debt_try) * 100)
      : 0

    const profiles: PartnerRiskProfile[] = partners.map(p => {
      // ── 1. Concentration Risk ────────────────────────────────────────────────
      const conc_pct   = total_debt_try > 0 ? (p.net_loan / total_debt_try) * 100 : 0
      const conc_score = Math.max(0, Math.min(100, 100 - (conc_pct - 30) * 2))  // >50% → F
      const concentration: PartnerRiskDimension = {
        name:      'Konsantrasyon Riski',
        score:     round2(conc_score),
        grade:     scoreToGrade(conc_score),
        detail:    conc_pct > 70 ? 'Tek ortak toplam borcun %70\'ini aşıyor' : `Toplam borcun %${conc_pct.toFixed(0)}\'i`,
        value:     round2(conc_pct),
        benchmark: 30,
      }

      // ── 2. Duration Risk ─────────────────────────────────────────────────────
      const days         = p.days_outstanding
      // 0-90 days: 100, 90-365: linear 100→60, 365-730: 60→20, >730: 20→0
      const dur_score =
        days <= 90   ? 100 :
        days <= 365  ? round2(100 - ((days - 90) / 275) * 40) :
        days <= 730  ? round2(60  - ((days - 365) / 365) * 40) :
                       round2(Math.max(0, 20 - ((days - 730) / 365) * 20))
      const duration: PartnerRiskDimension = {
        name:      'Vade Riski',
        score:     dur_score,
        grade:     scoreToGrade(dur_score),
        detail:    `${days} gündür ödenmemiş`,
        value:     days,
        benchmark: 180,
      }

      // ── 3. Burden Risk ───────────────────────────────────────────────────────
      // Uses burden score: excess_pct = |excess| / total_debt × 100
      const excess_pct = total_debt_try > 0
        ? Math.abs(p.net_loan - total_debt_try * p.share_ratio) / total_debt_try * 100
        : 0
      const burden_score = Math.max(0, Math.min(100, 100 - excess_pct * 3))
      const burden: PartnerRiskDimension = {
        name:      'Yük Denge Riski',
        score:     round2(burden_score),
        grade:     scoreToGrade(round2(burden_score)),
        detail:    excess_pct > 15
          ? `Pay oranına göre ${excess_pct.toFixed(0)}% sapma`
          : 'Yük dengeli dağılmış',
        value:     round2(excess_pct),
        benchmark: 10,
      }

      // ── 4. Coverage Risk ─────────────────────────────────────────────────────
      // Debt vs equity coverage: how much equity backs this partner's loan
      const coverage_ratio = p.equity_paid > 0 ? p.net_loan / p.equity_paid : 99
      // 0-1: 100 (fully covered), 1-3: 80→40, 3-5: 40→0, >5: 0
      const cov_score =
        coverage_ratio <= 1 ? 100 :
        coverage_ratio <= 3 ? round2(100 - ((coverage_ratio - 1) / 2) * 60) :
        coverage_ratio <= 5 ? round2(40  - ((coverage_ratio - 3) / 2) * 40) :
                              0
      const coverage: PartnerRiskDimension = {
        name:      'Teminat Riski',
        score:     round2(cov_score),
        grade:     scoreToGrade(round2(cov_score)),
        detail:    coverage_ratio > 3 ? 'Özkaynak borcu karşılamıyor' : `${coverage_ratio.toFixed(1)}× borç/sermaye`,
        value:     round2(coverage_ratio),
        benchmark: 1.5,
      }

      // ── 5. Liquidity Risk ────────────────────────────────────────────────────
      // Partner's share of DSR (company-level, attributed by share_ratio)
      const partner_dsr_share = dsr * p.share_ratio
      const liq_score =
        partner_dsr_share <= 0.15 ? 100 :
        partner_dsr_share <= 0.35 ? round2(100 - ((partner_dsr_share - 0.15) / 0.20) * 40) :
        partner_dsr_share <= 0.70 ? round2(60  - ((partner_dsr_share - 0.35) / 0.35) * 40) :
                                    round2(Math.max(0, 20 - ((partner_dsr_share - 0.70) / 0.30) * 20))
      const liquidity: PartnerRiskDimension = {
        name:      'Likidite Riski',
        score:     round2(liq_score),
        grade:     scoreToGrade(round2(liq_score)),
        detail:    dsr > 0.70 ? 'Nakit akışı yüksek borç servisi altında' : `DSR: ${(dsr * 100).toFixed(0)}%`,
        value:     round2(dsr * 100),
        benchmark: 35,
      }

      // ── 6. Compliance Risk ───────────────────────────────────────────────────
      const issue_count = compliance_issue_count.get(p.id) ?? 0
      const comp_score  = Math.max(0, 100 - issue_count * 25)
      const compliance: PartnerRiskDimension = {
        name:      'Uyum Riski',
        score:     comp_score,
        grade:     scoreToGrade(comp_score),
        detail:    issue_count === 0 ? 'Uyum sorunu yok' : `${issue_count} uyum uyarısı`,
        value:     issue_count,
        benchmark: 0,
      }

      // ── Composite ─────────────────────────────────────────────────────────────
      const composite_score = round2(
        concentration.score * 0.20 +
        duration.score      * 0.20 +
        burden.score        * 0.15 +
        coverage.score      * 0.20 +
        liquidity.score     * 0.15 +
        compliance.score    * 0.10
      )
      const composite_grade = scoreToGrade(composite_score)

      const recommended_action =
        composite_grade === 'A' ? 'Risk yönetimi gerekmiyor.' :
        composite_grade === 'B' ? 'Rutin izleme yeterli.' :
        composite_grade === 'C' ? 'Kısmi geri ödeme planı hazırlayın.' :
        composite_grade === 'D' ? 'Acil geri ödeme görüşmesi başlatın.' :
                                  'Kritik: Hukuki danışmanlık alın.'

      return {
        partner_id:          p.id,
        partner_name:        p.name,
        share_ratio:         p.share_ratio,
        net_loan:            p.net_loan,
        dimensions:          { concentration, duration, burden, coverage, liquidity, compliance },
        composite_score,
        composite_grade,
        recommended_action,
      }
    })

    const company_composite = profiles.length > 0
      ? round2(profiles.reduce((s, p) => s + p.composite_score, 0) / profiles.length)
      : 100

    const highest_risk = profiles.length > 0
      ? profiles.reduce((worst, p) => p.composite_score < worst.composite_score ? p : worst).partner_name
      : null

    return {
      partner_profiles:      profiles,
      company_composite,
      company_grade:         scoreToGrade(company_composite),
      total_debt_try:        total_debt_try,
      dsr:                   round2(dsr),
      concentration_pct,
      highest_risk_partner:  highest_risk,
    }
  }
}

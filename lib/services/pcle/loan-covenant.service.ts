// ─────────────────────────────────────────────────────────────────────────────
// lib/services/pcle/loan-covenant.service.ts
//
// Partner Loan Covenant Monitoring — DSR, ICR, and breach alerting.
//
// Monitors financial covenants on partner loans:
//   - DSR  (Debt Service Ratio):      annual_debt_service / annual_net_income
//   - ICR  (Interest Coverage Ratio): ebitda / interest_expense
//
// Pure helpers are exported for direct unit testing.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 } from '@/lib/calc'

// ── Public types ──────────────────────────────────────────────────────────────

export type DsrStatus = 'healthy' | 'elevated' | 'high' | 'critical' | 'unknown'
export type IcrStatus = 'strong' | 'adequate' | 'thin' | 'breached' | 'unknown'

export interface LoanCovenantStatus {
  tranche_id: string
  partner_id: string
  partner_name: string
  principal_try: number
  outstanding_try: number
  annual_rate_pct: number
  annual_interest_try: number
  covenant_risk_score: number
  dsr: number | null
  dsr_status: DsrStatus
  icr: number | null
  icr_status: IcrStatus
  alerts: string[]
}

export interface CovenantMonitoringReport {
  as_of_date: string
  company_dsr: number | null
  company_icr: number | null
  company_dsr_status: DsrStatus
  company_icr_status: IcrStatus
  overall_covenant_risk_score: number
  total_annual_debt_service_try: number
  total_outstanding_loans_try: number
  tranches: LoanCovenantStatus[]
  critical_alerts: string[]
  ytd_net_income_try: number
  ytd_ebitda_try: number
}

// ── Pure helpers (exported) ───────────────────────────────────────────────────

/**
 * Compute Debt Service Ratio: annual_debt_service / annual_net_income
 * Returns null if net_income = 0
 */
export function computeDsr(
  annualDebtServiceTry: number,
  annualNetIncomeTry: number,
): number | null {
  if (annualNetIncomeTry === 0) return null
  return round2(annualDebtServiceTry / annualNetIncomeTry)
}

/**
 * Compute Interest Coverage Ratio: ebitda / interest_expense
 * Returns null if interest_expense = 0
 */
export function computeInterestCoverage(
  ebitdaTry: number,
  interestExpenseTry: number,
): number | null {
  if (interestExpenseTry === 0) return null
  return round2(ebitdaTry / interestExpenseTry)
}

/**
 * Classify DSR status:
 *   <0.30:      'healthy'
 *   0.30–0.50:  'elevated'
 *   0.50–0.70:  'high'
 *   >0.70:      'critical'
 *   null:       'unknown'
 */
export function classifyDsrStatus(dsr: number | null): DsrStatus {
  if (dsr === null) return 'unknown'
  if (dsr < 0.30) return 'healthy'
  if (dsr < 0.50) return 'elevated'
  if (dsr < 0.70) return 'high'
  return 'critical'
}

/**
 * Classify Interest Coverage Ratio status:
 *   >3.0:      'strong'
 *   2.0–3.0:   'adequate'
 *   1.0–2.0:   'thin'
 *   <1.0:      'breached'
 *   null:      'unknown'
 */
export function classifyIcrStatus(icr: number | null): IcrStatus {
  if (icr === null) return 'unknown'
  if (icr > 3.0) return 'strong'
  if (icr >= 2.0) return 'adequate'
  if (icr >= 1.0) return 'thin'
  return 'breached'
}

/**
 * Compute covenant breach risk score 0–100.
 * DSR component (50%): healthy=0, elevated=25, high=65, critical=100, unknown=50
 * ICR component (50%): strong=0, adequate=20, thin=60, breached=100, unknown=50
 */
export function computeCovenantRiskScore(
  dsrStatus: DsrStatus,
  icrStatus: IcrStatus,
): number {
  const DSR_SCORES: Record<DsrStatus, number> = {
    healthy:  0,
    elevated: 25,
    high:     65,
    critical: 100,
    unknown:  50,
  }
  const ICR_SCORES: Record<IcrStatus, number> = {
    strong:   0,
    adequate: 20,
    thin:     60,
    breached: 100,
    unknown:  50,
  }

  const dsrComponent = DSR_SCORES[dsrStatus] * 0.5
  const icrComponent = ICR_SCORES[icrStatus] * 0.5
  return round2(dsrComponent + icrComponent)
}

// ── Alert generation helpers ──────────────────────────────────────────────────

/** Generate Turkish alert messages for a tranche based on covenant status. */
function generateAlerts(
  dsr: number | null,
  dsrStatus: DsrStatus,
  icr: number | null,
  icrStatus: IcrStatus,
): string[] {
  const alerts: string[] = []

  if (dsrStatus === 'critical' && dsr !== null) {
    alerts.push(`Borç karşılama oranı kritik seviyede (%${Math.round(dsr * 100)})`)
  } else if (dsrStatus === 'high' && dsr !== null) {
    alerts.push(`Borç karşılama oranı yüksek (%${Math.round(dsr * 100)})`)
  }

  if (icrStatus === 'breached' && icr !== null) {
    alerts.push(`Faiz karşılama oranı 1.0'ın altında (${icr.toFixed(1)}x)`)
  } else if (icrStatus === 'thin' && icr !== null) {
    alerts.push(`Faiz karşılama oranı zayıf (${icr.toFixed(1)}x)`)
  }

  return alerts
}

// ── Service class ─────────────────────────────────────────────────────────────

export class LoanCovenantService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Generate the covenant monitoring report for a company.
   * Fetches active loan tranches, YTD financials, and computes DSR + ICR metrics.
   */
  async getReport(companyId: string): Promise<CovenantMonitoringReport> {
    const asOfDate = new Date().toISOString().substring(0, 10)
    const currentYear = new Date().getFullYear()
    const ytdStart = `${currentYear}-01-01`

    // ── Fetch active tranches ─────────────────────────────────────────────────
    const { data: trancheRows, error: trancheError } = await this.supabase
      .from('partner_loan_tranches')
      .select(`
        id,
        partner_id,
        principal_try,
        total_repaid_try,
        interest_rate_annual_pct,
        annual_interest_rate,
        status,
        partners(name)
      `)
      .eq('company_id', companyId)
      .in('status', ['active', 'partially_repaid', 'overdue'])
      .is('deleted_at', null)

    if (trancheError) {
      throw new Error(`Tranche verisi alınamadı: ${trancheError.message}`)
    }

    // ── Fetch YTD revenue (sales) ─────────────────────────────────────────────
    const { data: salesRows } = await this.supabase
      .from('sales')
      .select('total_try')
      .eq('company_id', companyId)
      .gte('created_at', ytdStart)
      .is('deleted_at', null)

    const ytdRevenue = (salesRows ?? []).reduce(
      (s: number, r: Record<string, unknown>) => s + (Number(r.total_try) || 0),
      0,
    )

    // ── Fetch YTD expenses ────────────────────────────────────────────────────
    const { data: expenseRows } = await this.supabase
      .from('expenses')
      .select('amount, expense_type')
      .eq('company_id', companyId)
      .gte('created_at', ytdStart)
      .is('deleted_at', null)

    const allExpenses = expenseRows ?? []

    const ytdTotalExpenses = allExpenses.reduce(
      (s: number, r: Record<string, unknown>) => s + (Number(r.amount) || 0),
      0,
    )

    // Interest expense (account 780 / expense_type 'interest')
    const ytdInterestExpense = allExpenses
      .filter((r: Record<string, unknown>) =>
        String(r.expense_type ?? '').toLowerCase().includes('interest') ||
        String(r.expense_type ?? '').toLowerCase().includes('faiz'),
      )
      .reduce((s: number, r: Record<string, unknown>) => s + (Number(r.amount) || 0), 0)

    // Depreciation/amortization (expense_type 'depreciation'/'amortization')
    const ytdDepreciation = allExpenses
      .filter((r: Record<string, unknown>) =>
        String(r.expense_type ?? '').toLowerCase().includes('depreciation') ||
        String(r.expense_type ?? '').toLowerCase().includes('amortization') ||
        String(r.expense_type ?? '').toLowerCase().includes('amortisman'),
      )
      .reduce((s: number, r: Record<string, unknown>) => s + (Number(r.amount) || 0), 0)

    // YTD net income = revenue - expenses (simplified)
    const ytdNetIncome = round2(ytdRevenue - ytdTotalExpenses)

    // EBITDA = net_income + interest + depreciation
    const ytdEbitda = round2(ytdNetIncome + ytdInterestExpense + ytdDepreciation)

    // ── Process tranches ──────────────────────────────────────────────────────
    const tranches: LoanCovenantStatus[] = []
    let totalAnnualDebtService = 0
    let totalOutstanding = 0

    for (const row of (trancheRows ?? [])) {
      const r = row as Record<string, unknown>
      const trancheId = r.id as string
      const partnerId = r.partner_id as string
      const partnersJoin = r.partners as { name?: string } | null
      const partnerName = partnersJoin?.name ?? 'Ortak'

      const principal = Number(r.principal_try) || 0
      const repaid = Number(r.total_repaid_try) || 0
      const outstanding = round2(principal - repaid)
      if (outstanding <= 0) continue

      // Interest rate
      let ratePct: number
      if (r.interest_rate_annual_pct != null && !isNaN(Number(r.interest_rate_annual_pct))) {
        ratePct = Number(r.interest_rate_annual_pct)
      } else if (r.annual_interest_rate != null && !isNaN(Number(r.annual_interest_rate))) {
        const raw = Number(r.annual_interest_rate)
        ratePct = raw <= 1 ? raw * 100 : raw
      } else {
        ratePct = 0
      }

      // Annual interest = outstanding × rate
      const annualInterest = round2(outstanding * (ratePct / 100))

      // Annual debt service = interest (principal repayment is handled at maturity for partner loans)
      // We use only interest here; full principal is accounted at company level as outstanding balance
      const annualDebtService = annualInterest

      totalAnnualDebtService += annualDebtService
      totalOutstanding += outstanding

      // Per-tranche DSR and ICR (using company-level income for context)
      const trancheDsr = computeDsr(annualDebtService, ytdNetIncome)
      const trancheIcr = computeInterestCoverage(ytdEbitda, annualInterest)

      const dsrStatus = classifyDsrStatus(trancheDsr)
      const icrStatus = classifyIcrStatus(trancheIcr)
      const covenantRisk = computeCovenantRiskScore(dsrStatus, icrStatus)
      const alerts = generateAlerts(trancheDsr, dsrStatus, trancheIcr, icrStatus)

      tranches.push({
        tranche_id: trancheId,
        partner_id: partnerId,
        partner_name: partnerName,
        principal_try: principal,
        outstanding_try: outstanding,
        annual_rate_pct: ratePct,
        annual_interest_try: annualInterest,
        covenant_risk_score: covenantRisk,
        dsr: trancheDsr,
        dsr_status: dsrStatus,
        icr: trancheIcr,
        icr_status: icrStatus,
        alerts,
      })
    }

    // ── Company-level metrics ─────────────────────────────────────────────────
    const companyDsr = computeDsr(totalAnnualDebtService, ytdNetIncome)
    const companyIcr = computeInterestCoverage(ytdEbitda, totalAnnualDebtService)

    const companyDsrStatus = classifyDsrStatus(companyDsr)
    const companyIcrStatus = classifyIcrStatus(companyIcr)
    const overallRisk = computeCovenantRiskScore(companyDsrStatus, companyIcrStatus)

    // Collect critical alerts (DSR critical or ICR breached)
    const criticalAlerts: string[] = []
    for (const t of tranches) {
      for (const a of t.alerts) {
        if (
          t.dsr_status === 'critical' ||
          t.icr_status === 'breached'
        ) {
          const prefixed = `${t.partner_name}: ${a}`
          if (!criticalAlerts.includes(prefixed)) {
            criticalAlerts.push(prefixed)
          }
        }
      }
    }

    return {
      as_of_date: asOfDate,
      company_dsr: companyDsr,
      company_icr: companyIcr,
      company_dsr_status: companyDsrStatus,
      company_icr_status: companyIcrStatus,
      overall_covenant_risk_score: overallRisk,
      total_annual_debt_service_try: round2(totalAnnualDebtService),
      total_outstanding_loans_try: round2(totalOutstanding),
      tranches,
      critical_alerts: criticalAlerts,
      ytd_net_income_try: ytdNetIncome,
      ytd_ebitda_try: ytdEbitda,
    }
  }
}

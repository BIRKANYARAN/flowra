// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/pcle/debt-service-coverage.service.ts
//
// Partner Loan Debt Service Coverage Analytics
//
// Computes a comprehensive debt service coverage report for a company's
// partner loan portfolio, including:
//   - Debt Service Coverage Ratio (DSCR)
//   - Interest Coverage Ratio (ICR)
//   - Debt Burden Ratio
//   - Loan-to-Equity Ratio
//   - Monthly Debt Service Ratio (DSR)
//   - Weighted Average Interest Rate
//   - Debt Concentration (top-partner share)
//   - Maturity Profile (90-day / 1-year / beyond buckets)
//   - Loan Runoff Date Estimate
//   - Per-partner debt breakdown
//   - Turkish narrative summary
//
// All pure functions are exported for unit testing.
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Pure computation functions ────────────────────────────────────────────────

/**
 * Compute monthly interest for a tranche (simple interest).
 * Formula: principal × annualRatePct / 100 / 12
 */
export function computeMonthlyInterest(
  principal: number,
  annualRatePct: number,
): number {
  if (principal <= 0 || annualRatePct <= 0) return 0
  return principal * (annualRatePct / 100) / 12
}

/**
 * Compute total monthly debt service (interest + scheduled principal repayment).
 */
export function computeMonthlyDebtService(
  monthlyInterest: number,
  monthlyPrincipalRepayment: number,
): number {
  return monthlyInterest + monthlyPrincipalRepayment
}

/**
 * Compute Debt Service Coverage Ratio: EBITDA / annualDebtService.
 * Returns null if annualDebtService <= 0.
 */
export function computeDscr(
  ebitda: number,
  annualDebtService: number,
): number | null {
  if (annualDebtService <= 0) return null
  return ebitda / annualDebtService
}

/**
 * Classify DSCR health into descriptive categories.
 *   strong:            >= 2.0  (very comfortable)
 *   adequate:          >= 1.5
 *   tight:             >= 1.25
 *   stressed:          >= 1.0  (barely covering)
 *   distressed:        <  1.0  (cannot cover debt service)
 *   insufficient_data: null
 */
export function classifyDscrHealth(
  dscr: number | null,
): 'strong' | 'adequate' | 'tight' | 'stressed' | 'distressed' | 'insufficient_data' {
  if (dscr === null) return 'insufficient_data'
  if (dscr >= 2.0) return 'strong'
  if (dscr >= 1.5) return 'adequate'
  if (dscr >= 1.25) return 'tight'
  if (dscr >= 1.0) return 'stressed'
  return 'distressed'
}

/**
 * Compute Interest Coverage Ratio: EBIT / annualInterestExpense.
 * Returns null if annualInterestExpense <= 0.
 */
export function computeInterestCoverageRatio(
  ebit: number,
  annualInterestExpense: number,
): number | null {
  if (annualInterestExpense <= 0) return null
  return ebit / annualInterestExpense
}

/**
 * Classify interest coverage ratio.
 *   excellent:         >= 5.0
 *   good:              >= 3.0
 *   adequate:          >= 2.0
 *   weak:              >= 1.0
 *   critical:          <  1.0
 *   insufficient_data: null
 */
export function classifyInterestCoverage(
  icr: number | null,
): 'excellent' | 'good' | 'adequate' | 'weak' | 'critical' | 'insufficient_data' {
  if (icr === null) return 'insufficient_data'
  if (icr >= 5.0) return 'excellent'
  if (icr >= 3.0) return 'good'
  if (icr >= 2.0) return 'adequate'
  if (icr >= 1.0) return 'weak'
  return 'critical'
}

/**
 * Compute debt burden ratio: totalDebt / annualRevenue.
 * Returns null if annualRevenue <= 0.
 */
export function computeDebtBurdenRatio(
  totalDebt: number,
  annualRevenue: number,
): number | null {
  if (annualRevenue <= 0) return null
  return totalDebt / annualRevenue
}

/**
 * Classify debt burden ratio.
 *   minimal:           < 0.10  (debt < 10% of annual revenue)
 *   manageable:        < 0.25
 *   moderate:          < 0.50
 *   heavy:             < 1.0
 *   critical:          >= 1.0
 *   insufficient_data: null
 */
export function classifyDebtBurden(
  ratio: number | null,
): 'minimal' | 'manageable' | 'moderate' | 'heavy' | 'critical' | 'insufficient_data' {
  if (ratio === null) return 'insufficient_data'
  if (ratio < 0.10) return 'minimal'
  if (ratio < 0.25) return 'manageable'
  if (ratio < 0.50) return 'moderate'
  if (ratio < 1.0)  return 'heavy'
  return 'critical'
}

/**
 * Compute loan-to-equity ratio: totalLoans / equityCapital.
 * Returns null if equityCapital <= 0.
 */
export function computeLoanToEquityRatio(
  totalLoans: number,
  equityCapital: number,
): number | null {
  if (equityCapital <= 0) return null
  return totalLoans / equityCapital
}

/**
 * Estimate loan runoff date — when all debt is repaid at current repayment pace.
 * Returns null if monthlyRepaymentPace <= 0 or totalDebt <= 0.
 * months = ceil(totalDebt / monthlyRepaymentPace)
 * estimated_date = YYYY-MM-DD (today + months months, first of month)
 */
export function estimateLoanRunoffDate(
  totalDebt: number,
  monthlyRepaymentPace: number,
): { months: number; estimated_date: string } | null {
  if (monthlyRepaymentPace <= 0 || totalDebt <= 0) return null
  const months = Math.ceil(totalDebt / monthlyRepaymentPace)
  const today = new Date()
  const runoffDate = new Date(today.getFullYear(), today.getMonth() + months, 1)
  // Use local date components to avoid UTC offset shifting the date
  const y = runoffDate.getFullYear()
  const m = String(runoffDate.getMonth() + 1).padStart(2, '0')
  const estimated_date = `${y}-${m}-01`
  return { months, estimated_date }
}

/**
 * Compute debt concentration — what % of total debt is from the top partner.
 * Returns null if no loans or total = 0.
 * Returns top partner % of total (0–100).
 */
export function computeDebtConcentration(
  partnerLoans: Array<{ partner_id: string; net_loan_try: number }>,
): number | null {
  if (partnerLoans.length === 0) return null
  const total = partnerLoans.reduce((s, p) => s + p.net_loan_try, 0)
  if (total <= 0) return null
  const topPartnerLoan = Math.max(...partnerLoans.map(p => p.net_loan_try))
  return (topPartnerLoan / total) * 100
}

/**
 * Compute monthly debt service as % of revenue (debt service ratio).
 * Returns null if monthlyRevenue <= 0; returns percentage.
 */
export function computeMonthlyDebtServiceRatio(
  monthlyDebtService: number,
  monthlyRevenue: number,
): number | null {
  if (monthlyRevenue <= 0) return null
  return (monthlyDebtService / monthlyRevenue) * 100
}

/**
 * Classify monthly debt service ratio.
 *   healthy:           < 10%  of monthly revenue
 *   manageable:        < 20%
 *   elevated:          < 35%
 *   high:              < 50%
 *   critical:          >= 50%
 *   insufficient_data: null
 */
export function classifyMonthlyDebtServiceRatio(
  ratio: number | null,
): 'healthy' | 'manageable' | 'elevated' | 'high' | 'critical' | 'insufficient_data' {
  if (ratio === null) return 'insufficient_data'
  if (ratio < 10) return 'healthy'
  if (ratio < 20) return 'manageable'
  if (ratio < 35) return 'elevated'
  if (ratio < 50) return 'high'
  return 'critical'
}

/**
 * Compute weighted average interest rate across all tranches.
 * Returns null if total principal = 0.
 */
export function computeWeightedAvgInterestRate(
  tranches: Array<{ principal: number; annual_rate_pct: number }>,
): number | null {
  if (tranches.length === 0) return null
  const totalPrincipal = tranches.reduce((s, t) => s + t.principal, 0)
  if (totalPrincipal <= 0) return null
  const weightedSum = tranches.reduce(
    (s, t) => s + t.annual_rate_pct * t.principal,
    0,
  )
  return weightedSum / totalPrincipal
}

/**
 * Generate maturity profile buckets by time to maturity.
 * Buckets are mutually exclusive:
 *   due_within_90_days  — items with expected_repayment_date within 90 days (incl. overdue)
 *   due_within_1_year   — items due after 90 days but within 1 year
 *   due_beyond_1_year   — items due after 1 year
 *   no_due_date         — items with null expected_repayment_date
 *
 * Overdue tranches (past date) → due_within_90_days with days_to_maturity = 0
 */
export function computeMaturityProfile(
  tranches: Array<{
    tranche_id: string
    partner_name: string
    principal: number
    expected_repayment_date: string | null
  }>,
): {
  due_within_90_days: Array<{ tranche_id: string; partner_name: string; principal: number; days_to_maturity: number }>
  due_within_1_year: Array<{ tranche_id: string; partner_name: string; principal: number; days_to_maturity: number }>
  due_beyond_1_year: Array<{ tranche_id: string; partner_name: string; principal: number; days_to_maturity: number }>
  no_due_date: Array<{ tranche_id: string; partner_name: string; principal: number }>
} {
  const result = {
    due_within_90_days: [] as Array<{ tranche_id: string; partner_name: string; principal: number; days_to_maturity: number }>,
    due_within_1_year:  [] as Array<{ tranche_id: string; partner_name: string; principal: number; days_to_maturity: number }>,
    due_beyond_1_year:  [] as Array<{ tranche_id: string; partner_name: string; principal: number; days_to_maturity: number }>,
    no_due_date:        [] as Array<{ tranche_id: string; partner_name: string; principal: number }>,
  }

  const today = new Date()
  // Normalize to start of day for consistent day calculations
  today.setHours(0, 0, 0, 0)

  for (const t of tranches) {
    if (!t.expected_repayment_date) {
      result.no_due_date.push({
        tranche_id:   t.tranche_id,
        partner_name: t.partner_name,
        principal:    t.principal,
      })
      continue
    }

    const maturityDate = new Date(t.expected_repayment_date)
    maturityDate.setHours(0, 0, 0, 0)
    const diffMs = maturityDate.getTime() - today.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const days_to_maturity = diffDays <= 0 ? 0 : diffDays

    const entry = {
      tranche_id:      t.tranche_id,
      partner_name:    t.partner_name,
      principal:       t.principal,
      days_to_maturity,
    }

    if (diffDays <= 90) {
      // Overdue (diffDays <= 0) and within 90 days both go here
      result.due_within_90_days.push(entry)
    } else if (diffDays <= 365) {
      result.due_within_1_year.push(entry)
    } else {
      result.due_beyond_1_year.push(entry)
    }
  }

  return result
}

/**
 * Generate Turkish narrative for debt service health.
 */
export function generateDebtServiceNarrative(params: {
  dscr: number | null
  dscrHealth: ReturnType<typeof classifyDscrHealth>
  totalDebt: number
  monthlyDebtService: number
  runoffMonths: number | null
}): string {
  const { dscr, dscrHealth, totalDebt, monthlyDebtService, runoffMonths } = params

  const healthLabels: Record<ReturnType<typeof classifyDscrHealth>, string> = {
    strong:            'güçlü',
    adequate:          'yeterli',
    tight:             'sıkışık',
    stressed:          'stresli',
    distressed:        'kritik',
    insufficient_data: 'yetersiz veri',
  }

  const dscrLabel = healthLabels[dscrHealth]
  const dscrText = dscr !== null
    ? `Borç karşılama oranı ${dscr.toFixed(2)}x (${dscrLabel}).`
    : `Borç karşılama oranı hesaplanamadı (yetersiz veri).`

  const debtText = totalDebt > 0
    ? ` Toplam borç bakiyesi ₺${Math.round(totalDebt).toLocaleString('tr-TR')}.`
    : ' Aktif borç bulunmamaktadır.'

  const serviceText = monthlyDebtService > 0
    ? ` Aylık ₺${Math.round(monthlyDebtService).toLocaleString('tr-TR')} borç servisi gerçekleşmektedir.`
    : ''

  const runoffText = runoffMonths !== null
    ? ` Mevcut geri ödeme hızıyla borcun ${runoffMonths} ay içinde kapanması beklenmektedir.`
    : ''

  return `${dscrText}${debtText}${serviceText}${runoffText}`
}

// ── Report interface ──────────────────────────────────────────────────────────

export interface DebtServiceReport {
  dscr: number | null
  dscr_health: ReturnType<typeof classifyDscrHealth>
  interest_coverage_ratio: number | null
  interest_coverage_health: ReturnType<typeof classifyInterestCoverage>
  debt_burden_ratio: number | null
  debt_burden_health: ReturnType<typeof classifyDebtBurden>
  loan_to_equity_ratio: number | null
  total_loan_balance_try: number
  total_monthly_debt_service_try: number
  monthly_dsr_pct: number | null
  monthly_dsr_health: ReturnType<typeof classifyMonthlyDebtServiceRatio>
  weighted_avg_interest_rate_pct: number | null
  debt_concentration_pct: number | null
  maturity_profile: ReturnType<typeof computeMaturityProfile>
  loan_runoff: ReturnType<typeof estimateLoanRunoffDate>
  per_partner_debt: Array<{
    partner_id: string
    partner_name: string
    net_loan_try: number
    monthly_interest_try: number
    share_pct: number
  }>
  narrative: string
}

// ── DB row shapes ─────────────────────────────────────────────────────────────

interface TrancheRow {
  id: string
  partner_id: string
  principal_try: number
  total_repaid_try: number
  interest_rate_annual_pct: number | null
  annual_interest_rate: number | null
  expected_repayment_date: string | null
  status: string | null
  // Supabase returns join as array or object depending on query shape — use unknown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  partners: any
}

interface RepaymentTxRow {
  partner_id: string | null
  amount_try: number
  tx_date: string
  tx_type: string
}

interface SaleRow {
  amount: number
  currency: string | null
  created_at: string
}

interface ExpenseRow {
  amount: number
  expense_date: string
}

interface EquityTxRow {
  partner_id: string | null
  amount_try: number
}

// ── Service Class ─────────────────────────────────────────────────────────────

export class DebtServiceCoverageService {
  constructor(private readonly supabase: AnyClient) {}

  async getReport(companyId: string): Promise<DebtServiceReport> {
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    const sixMonthsAgoStr = sixMonthsAgo.toISOString().substring(0, 10)

    const [tranchesRes, repaymentsRes, salesRes, expensesRes, equityRes] =
      await Promise.allSettled([
        // Active tranches with partner names
        this.supabase
          .from('partner_loan_tranches')
          .select(`
            id,
            partner_id,
            principal_try,
            total_repaid_try,
            interest_rate_annual_pct,
            annual_interest_rate,
            expected_repayment_date,
            status,
            partners(name)
          `)
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .in('status', ['active', 'partially_repaid', 'overdue']),

        // Repayment transactions — last 6 months
        this.supabase
          .from('partner_transactions')
          .select('partner_id, amount_try, tx_date, tx_type')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .in('tx_type', ['repayment', 'loan_repayment', 'loan_out'])
          .gte('tx_date', sixMonthsAgoStr),

        // Sales — last 6 months (not deleted, not proforma)
        this.supabase
          .from('sales')
          .select('amount, currency, created_at')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .is('proforma_id', null)
          .gte('created_at', sixMonthsAgo.toISOString()),

        // Expenses — last 6 months (not deleted)
        this.supabase
          .from('expenses')
          .select('amount, expense_date')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .gte('expense_date', sixMonthsAgoStr),

        // Equity payments — cumulative for loan-to-equity
        this.supabase
          .from('partner_transactions')
          .select('partner_id, amount_try')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .in('tx_type', ['equity_payment', 'capital_contribution']),
      ])

    // ── Extract data gracefully ───────────────────────────────────────────────

    const tranches: TrancheRow[] =
      tranchesRes.status === 'fulfilled' ? (tranchesRes.value.data ?? []) : []

    const repayments: RepaymentTxRow[] =
      repaymentsRes.status === 'fulfilled' ? (repaymentsRes.value.data ?? []) : []

    const sales: SaleRow[] =
      salesRes.status === 'fulfilled' ? (salesRes.value.data ?? []) : []

    const expenses: ExpenseRow[] =
      expensesRes.status === 'fulfilled' ? (expensesRes.value.data ?? []) : []

    const equityTxs: EquityTxRow[] =
      equityRes.status === 'fulfilled' ? (equityRes.value.data ?? []) : []

    // ── Tranche interest rate helper ──────────────────────────────────────────

    function resolveRatePct(row: TrancheRow): number {
      if (row.interest_rate_annual_pct != null && !isNaN(Number(row.interest_rate_annual_pct))) {
        return Number(row.interest_rate_annual_pct)
      }
      if (row.annual_interest_rate != null && !isNaN(Number(row.annual_interest_rate))) {
        const raw = Number(row.annual_interest_rate)
        return raw <= 1 ? raw * 100 : raw
      }
      return 0
    }

    // ── Compute per-tranche net balances ──────────────────────────────────────

    const activeTranches = tranches.map(t => {
      const principal = Math.max(0, Number(t.principal_try) || 0)
      const repaid    = Math.max(0, Number(t.total_repaid_try) || 0)
      const netBalance = Math.max(0, principal - repaid)
      const ratePct    = resolveRatePct(t)
      const partnerName = (t.partners as { name?: string | null } | null | Array<{ name?: string | null }>)
        && !Array.isArray(t.partners)
        ? (t.partners as { name?: string | null })?.name ?? 'Ortak'
        : Array.isArray(t.partners) && t.partners.length > 0
          ? (t.partners[0] as { name?: string | null })?.name ?? 'Ortak'
          : 'Ortak'
      return {
        tranche_id:              t.id,
        partner_id:              t.partner_id,
        partner_name:            partnerName,
        principal:               netBalance,
        annual_rate_pct:         ratePct,
        expected_repayment_date: t.expected_repayment_date ?? null,
      }
    }).filter(t => t.principal > 0)

    // ── Total loan balance ────────────────────────────────────────────────────

    const totalLoanBalance = activeTranches.reduce((s, t) => s + t.principal, 0)

    // ── Per-partner debt aggregation ──────────────────────────────────────────

    const partnerMap = new Map<string, {
      partner_id: string
      partner_name: string
      net_loan_try: number
      monthly_interest_try: number
    }>()

    for (const t of activeTranches) {
      const existing = partnerMap.get(t.partner_id)
      const monthlyInterest = computeMonthlyInterest(t.principal, t.annual_rate_pct)
      if (existing) {
        existing.net_loan_try       += t.principal
        existing.monthly_interest_try += monthlyInterest
      } else {
        partnerMap.set(t.partner_id, {
          partner_id:           t.partner_id,
          partner_name:         t.partner_name,
          net_loan_try:         t.principal,
          monthly_interest_try: monthlyInterest,
        })
      }
    }

    const perPartnerDebt = Array.from(partnerMap.values()).map(p => ({
      ...p,
      share_pct: totalLoanBalance > 0 ? (p.net_loan_try / totalLoanBalance) * 100 : 0,
    }))

    // ── Monthly interest from active tranches ─────────────────────────────────

    const totalMonthlyInterest = activeTranches.reduce(
      (s, t) => s + computeMonthlyInterest(t.principal, t.annual_rate_pct),
      0,
    )
    const annualInterestExpense = totalMonthlyInterest * 12

    // ── Monthly repayment pace (last 6 months avg) ────────────────────────────

    const totalRepaidLast6Months = repayments.reduce(
      (s, r) => s + (Number(r.amount_try) || 0),
      0,
    )
    const monthlyRepaymentPace = totalRepaidLast6Months / 6

    // ── Total monthly debt service ────────────────────────────────────────────

    const totalMonthlyDebtService = computeMonthlyDebtService(
      totalMonthlyInterest,
      monthlyRepaymentPace,
    )
    const annualDebtService = totalMonthlyDebtService * 12

    // ── Revenue and expenses (last 6 months) ─────────────────────────────────

    const totalRevenueLast6M = sales.reduce(
      (s, r) => s + (Number(r.amount) || 0),
      0,
    )
    const totalExpensesLast6M = expenses.reduce(
      (s, e) => s + (Number(e.amount) || 0),
      0,
    )

    // Annualize: × 2
    const annualRevenue = totalRevenueLast6M * 2
    const annualExpenses = totalExpensesLast6M * 2
    const ebitda = annualRevenue - annualExpenses
    // EBIT ≈ EBITDA (simplified: no D&A data)
    const ebit = ebitda

    const avgMonthlyRevenue = totalRevenueLast6M / 6

    // ── Equity capital ────────────────────────────────────────────────────────

    const totalEquityCapital = equityTxs.reduce(
      (s, e) => s + (Number(e.amount_try) || 0),
      0,
    )

    // ── Compute ratios ────────────────────────────────────────────────────────

    const dscr                  = computeDscr(ebitda, annualDebtService)
    const dscrHealth            = classifyDscrHealth(dscr)
    const icr                   = computeInterestCoverageRatio(ebit, annualInterestExpense)
    const icrHealth             = classifyInterestCoverage(icr)
    const debtBurdenRatio       = computeDebtBurdenRatio(totalLoanBalance, annualRevenue)
    const debtBurdenHealth      = classifyDebtBurden(debtBurdenRatio)
    const loanToEquityRatio     = computeLoanToEquityRatio(totalLoanBalance, totalEquityCapital)
    const monthlyDsrPct         = computeMonthlyDebtServiceRatio(totalMonthlyDebtService, avgMonthlyRevenue)
    const monthlyDsrHealth      = classifyMonthlyDebtServiceRatio(monthlyDsrPct)

    const weightedAvgRate = computeWeightedAvgInterestRate(
      activeTranches.map(t => ({ principal: t.principal, annual_rate_pct: t.annual_rate_pct })),
    )

    const debtConcentrationPct = computeDebtConcentration(
      perPartnerDebt.map(p => ({ partner_id: p.partner_id, net_loan_try: p.net_loan_try })),
    )

    const maturityProfile = computeMaturityProfile(activeTranches)

    const loanRunoff = estimateLoanRunoffDate(totalLoanBalance, monthlyRepaymentPace)

    const narrative = generateDebtServiceNarrative({
      dscr,
      dscrHealth,
      totalDebt: totalLoanBalance,
      monthlyDebtService: totalMonthlyDebtService,
      runoffMonths: loanRunoff?.months ?? null,
    })

    return {
      dscr,
      dscr_health:                    dscrHealth,
      interest_coverage_ratio:        icr,
      interest_coverage_health:       icrHealth,
      debt_burden_ratio:              debtBurdenRatio,
      debt_burden_health:             debtBurdenHealth,
      loan_to_equity_ratio:           loanToEquityRatio,
      total_loan_balance_try:         totalLoanBalance,
      total_monthly_debt_service_try: totalMonthlyDebtService,
      monthly_dsr_pct:                monthlyDsrPct,
      monthly_dsr_health:             monthlyDsrHealth,
      weighted_avg_interest_rate_pct: weightedAvgRate,
      debt_concentration_pct:         debtConcentrationPct,
      maturity_profile:               maturityProfile,
      loan_runoff:                    loanRunoff,
      per_partner_debt:               perPartnerDebt,
      narrative,
    }
  }
}

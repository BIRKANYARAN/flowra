// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/pcle/distribution-simulator.service.ts
//
// Partner Distribution Simulator — scenario-based dividend planning
// under Turkish legal constraints (TTK + GVK).
//
// Legal framework:
//   TTK 509 — temettü ancak kâr varsa dağıtılabilir
//   TTK 519 — 5% yasal yedek, ödenmiş sermayenin %20'sine kadar
//   GVK 94  — %10 stopaj vergisi
//   TTK 394 — huzur hakkı genel kurul kararı zorunluluğu
//
// Architecture:
//   Pure exported functions — testable without DB
//   DistributionSimulatorService class — DB-backed orchestration
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Helpers ───────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface DistributionInput {
  net_profit_try: number                  // current period net profit (after tax)
  paid_in_capital_try: number             // paid-in capital (500 account)
  existing_legal_reserves_try: number     // accumulated legal reserves (542 account)
  existing_retained_earnings_try: number  // prior retained earnings (570 account)
  requested_distribution_try: number      // how much the company wants to distribute
  compensation_ytd_try: number            // YTD huzur hakkı paid this period
  outstanding_loans_try: number           // total partner loans outstanding
}

export interface DistributionScenario {
  name: string                    // Turkish scenario name
  description: string
  gross_distribution_try: number  // before withholding
  net_distribution_try: number    // after withholding tax
  withholding_tax_try: number     // 10% GVK 94
  legal_reserve_required_try: number
  legal_reserve_fulfilled: boolean
  is_legally_compliant: boolean
  blocking_reason: string | null  // Turkish error if not compliant
  ttk_509_check: boolean          // enough profit?
  ttk_519_check: boolean          // legal reserve fulfilled?
  retained_earnings_after: number // remaining in retained earnings after distribution
  per_partner_distributions: Array<{
    partner_id: string
    share_pct: number
    gross_try: number
    withholding_try: number
    net_try: number
  }>
}

export interface DistributionSimulationResult {
  input_summary: {
    net_profit_try: number
    max_distributable_try: number
    legal_reserve_required_try: number
  }
  scenarios: DistributionScenario[]
  optimal_scenario: DistributionScenario | null
  compliance_warnings: string[]  // Turkish warnings for any non-compliant requests
}

// ── Pure exported functions ───────────────────────────────────────────────────

/**
 * Compute legal reserve required for this period (TTK 519).
 * = min(net_profit × 5%, max(0, paid_capital × 20% - existing_reserves))
 * Returns 0 if legal reserve is already at/above cap or if net profit <= 0.
 */
export function computeLegalReserveRequired(
  netProfitTry: number,
  paidCapitalTry: number,
  existingReservesTry: number,
): number {
  if (netProfitTry <= 0) return 0
  const cap = round2(paidCapitalTry * 0.20)
  const gap = round2(Math.max(0, cap - existingReservesTry))
  if (gap <= 0) return 0
  const proposed = round2(netProfitTry * 0.05)
  return round2(Math.min(proposed, gap))
}

/**
 * Compute maximum distributable amount (TTK 509 compliant).
 * distributable = net_profit + existing_retained_earnings - legal_reserve_required
 * Clamped at 0 (can't distribute losses).
 */
export function computeMaxDistributable(
  netProfitTry: number,
  existingRetainedEarningsTry: number,
  legalReserveRequired: number,
): number {
  const raw = round2(netProfitTry + existingRetainedEarningsTry - legalReserveRequired)
  return Math.max(0, raw)
}

/**
 * Check TTK 509 compliance — enough distributable profit.
 * Returns true if requested <= maxDistributable.
 */
export function checkTtk509(
  requestedDistribution: number,
  maxDistributable: number,
): boolean {
  return requestedDistribution <= maxDistributable + 0.005
}

/**
 * Check TTK 519 compliance — legal reserve fulfilled for this distribution.
 * true if (net_profit - legal_reserve_required - requested) >= 0
 * (i.e. enough profit remains after setting aside legal reserve and distributing)
 */
export function checkTtk519(
  netProfitTry: number,
  legalReserveRequired: number,
  requestedDistribution: number,
): boolean {
  return round2(netProfitTry - legalReserveRequired - requestedDistribution) >= -0.005
}

/**
 * Compute withholding tax (GVK 94: default 10%).
 */
export function computeWithholdingTax(
  grossDistribution: number,
  withholdingRatePct = 10,
): number {
  if (grossDistribution <= 0) return 0
  return round2(grossDistribution * withholdingRatePct / 100)
}

/**
 * Compute net distribution after withholding.
 */
export function computeNetDistribution(
  grossDistribution: number,
  withholdingRatePct = 10,
): number {
  if (grossDistribution <= 0) return 0
  return round2(grossDistribution - computeWithholdingTax(grossDistribution, withholdingRatePct))
}

/**
 * Distribute gross amount to partners by share ratio (with withholding per partner).
 */
export function distributeToPartners(
  grossAmountTry: number,
  partners: Array<{ partner_id: string; share_pct: number }>,
  withholdingRatePct = 10,
): DistributionScenario['per_partner_distributions'] {
  if (grossAmountTry <= 0) {
    return partners.map(p => ({
      partner_id: p.partner_id,
      share_pct: p.share_pct,
      gross_try: 0,
      withholding_try: 0,
      net_try: 0,
    }))
  }
  return partners.map(p => {
    const gross = round2(grossAmountTry * p.share_pct / 100)
    const withholding = computeWithholdingTax(gross, withholdingRatePct)
    const net = round2(gross - withholding)
    return {
      partner_id: p.partner_id,
      share_pct: p.share_pct,
      gross_try: gross,
      withholding_try: withholding,
      net_try: net,
    }
  })
}

/**
 * Simulate a specific distribution scenario — performs all compliance checks
 * and builds a full DistributionScenario.
 */
export function simulateDistribution(
  input: DistributionInput,
  requestedAmount: number,
  scenarioName: string,
  scenarioDescription: string,
  partners: Array<{ partner_id: string; share_pct: number }>,
): DistributionScenario {
  const legalReserveRequired = computeLegalReserveRequired(
    input.net_profit_try,
    input.paid_in_capital_try,
    input.existing_legal_reserves_try,
  )

  const maxDistributable = computeMaxDistributable(
    input.net_profit_try,
    input.existing_retained_earnings_try,
    legalReserveRequired,
  )

  // Clamp requested amount to non-negative
  const gross = Math.max(0, requestedAmount)

  const ttk509 = checkTtk509(gross, maxDistributable)
  const ttk519 = checkTtk519(input.net_profit_try, legalReserveRequired, gross)

  const legalReserveFulfilled = legalReserveRequired <= 0 ||
    round2(input.net_profit_try - legalReserveRequired) >= -0.005

  const withholdingTax = computeWithholdingTax(gross)
  const netDistribution = computeNetDistribution(gross)

  // Determine blocking reason
  let blockingReason: string | null = null
  if (!ttk509) {
    blockingReason = `TTK 509: Dağıtılabilir kâr yetersiz — Talep ₺${gross.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}, Azami ₺${maxDistributable.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
  } else if (!ttk519) {
    blockingReason = `TTK 519: Yasal yedek karşılandıktan sonra kâr yetersiz — ₺${legalReserveRequired.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} yedek + ₺${gross.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} dağıtım net geliri aşıyor`
  }

  const isLegallyCompliant = ttk509 && ttk519 && legalReserveFulfilled

  // Retained earnings after distribution
  const retainedAfter = round2(
    input.net_profit_try + input.existing_retained_earnings_try - legalReserveRequired - gross,
  )

  const perPartnerDistributions = distributeToPartners(gross, partners)

  return {
    name: scenarioName,
    description: scenarioDescription,
    gross_distribution_try: gross,
    net_distribution_try: netDistribution,
    withholding_tax_try: withholdingTax,
    legal_reserve_required_try: legalReserveRequired,
    legal_reserve_fulfilled: legalReserveFulfilled,
    is_legally_compliant: isLegallyCompliant,
    blocking_reason: blockingReason,
    ttk_509_check: ttk509,
    ttk_519_check: ttk519,
    retained_earnings_after: retainedAfter,
    per_partner_distributions: perPartnerDistributions,
  }
}

/**
 * Generate standard scenarios:
 * 1. "Tam Dağıtım" — distribute all distributable profit
 * 2. "Muhafazakar (%50)" — distribute 50% of distributable
 * 3. "Talep Edilen" — distribute exactly the requested amount (may fail compliance)
 * 4. "Borç Önce" — if outstanding loans > 0, suggests using distribution to repay loans first
 */
export function generateStandardScenarios(
  input: DistributionInput,
  partners: Array<{ partner_id: string; share_pct: number }>,
): DistributionScenario[] {
  const legalReserveRequired = computeLegalReserveRequired(
    input.net_profit_try,
    input.paid_in_capital_try,
    input.existing_legal_reserves_try,
  )
  const maxDistributable = computeMaxDistributable(
    input.net_profit_try,
    input.existing_retained_earnings_try,
    legalReserveRequired,
  )

  const fullScenario = simulateDistribution(
    input,
    maxDistributable,
    'Tam Dağıtım',
    'Dağıtılabilir kârın tamamı ortaklara dağıtılır (TTK 519 yedek sonrası azami tutar)',
    partners,
  )

  const conservativeScenario = simulateDistribution(
    input,
    round2(maxDistributable * 0.5),
    'Muhafazakar (%50)',
    'Dağıtılabilir kârın %50\'si dağıtılır, kalan şirket bünyesinde tutulur',
    partners,
  )

  const requestedScenario = simulateDistribution(
    input,
    input.requested_distribution_try,
    'Talep Edilen',
    `Talep edilen ₺${input.requested_distribution_try.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} tutarında dağıtım simülasyonu`,
    partners,
  )

  // Debt-first scenario: if loans outstanding, cap distribution at (maxDistributable - loans)
  let debtFirstAmount: number
  let debtFirstDescription: string
  if (input.outstanding_loans_try > 0) {
    const repaymentSuggestion = Math.min(input.outstanding_loans_try, maxDistributable)
    debtFirstAmount = Math.max(0, round2(maxDistributable - repaymentSuggestion))
    debtFirstDescription = `Toplam ₺${input.outstanding_loans_try.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ortak borcunun önce kapatılması önerilir — kalan ₺${debtFirstAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} dağıtıma açık`
  } else {
    debtFirstAmount = maxDistributable
    debtFirstDescription = 'Ortak borcu bulunmuyor — tam dağıtım mümkün'
  }

  const debtFirstScenario = simulateDistribution(
    input,
    debtFirstAmount,
    'Borç Önce',
    debtFirstDescription,
    partners,
  )

  return [fullScenario, conservativeScenario, requestedScenario, debtFirstScenario]
}

/**
 * Find the optimal (maximum compliant) distribution scenario.
 * Returns the compliant scenario with highest gross_distribution_try,
 * or null if none is compliant.
 */
export function findOptimalDistribution(scenarios: DistributionScenario[]): DistributionScenario | null {
  const compliant = scenarios.filter(s => s.is_legally_compliant)
  if (compliant.length === 0) return null
  return compliant.reduce((best, s) =>
    s.gross_distribution_try > best.gross_distribution_try ? s : best,
  )
}

/**
 * Compute distribution yield (gross distribution / net_profit).
 * Returns null if net_profit is 0.
 */
export function computeDistributionYield(
  grossDistribution: number,
  netProfit: number,
): number | null {
  if (netProfit === 0) return null
  return round2(grossDistribution / netProfit)
}

// ── Service class ─────────────────────────────────────────────────────────────

export class DistributionSimulatorService {
  constructor(private readonly supabase: AnyClient) {}

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async fetchPartners(
    companyId: string,
  ): Promise<Array<{ partner_id: string; share_pct: number }>> {
    try {
      const { data, error } = await this.supabase
        .from('partners')
        .select('id, share_ratio')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .is('deleted_at', null)

      if (error || !data) return []
      return (data as Array<{ id: string; share_ratio: number }>).map(p => ({
        partner_id: p.id,
        share_pct: round2(Number(p.share_ratio ?? 0) * 100),
      }))
    } catch {
      return []
    }
  }

  private async fetchNetProfit(companyId: string): Promise<number> {
    try {
      const { data: salesData } = await this.supabase
        .from('sale_lines')
        .select('amount_try')
        .eq('company_id', companyId)

      const revenue = ((salesData ?? []) as Array<{ amount_try: unknown }>)
        .reduce((s, r) => s + Number(r.amount_try ?? 0), 0)

      const { data: expenseData } = await this.supabase
        .from('expense_items')
        .select('amount_try')
        .eq('company_id', companyId)

      const expenses = ((expenseData ?? []) as Array<{ amount_try: unknown }>)
        .reduce((s, r) => s + Number(r.amount_try ?? 0), 0)

      return round2(revenue - expenses)
    } catch {
      return 0
    }
  }

  private async fetchPaidInCapital(companyId: string): Promise<number> {
    try {
      const { data, error } = await this.supabase
        .from('partner_capital_commitments')
        .select('paid_try')
        .eq('company_id', companyId)

      if (error || !data) return 0
      return round2(
        (data as Array<{ paid_try: unknown }>)
          .reduce((s, r) => s + Number(r.paid_try ?? 0), 0),
      )
    } catch {
      return 0
    }
  }

  private async fetchLegalReserves(companyId: string): Promise<number> {
    try {
      const { data, error } = await this.supabase
        .from('journal_entry_lines')
        .select('debit_try, credit_try')
        .eq('company_id', companyId)
        .eq('account_code', '542')

      if (error || !data) return 0
      const rows = data as Array<{ debit_try: unknown; credit_try: unknown }>
      const balance = rows.reduce(
        (s, r) => s + Number(r.credit_try ?? 0) - Number(r.debit_try ?? 0),
        0,
      )
      return round2(balance)
    } catch {
      return 0
    }
  }

  private async fetchRetainedEarnings(companyId: string): Promise<number> {
    try {
      const { data, error } = await this.supabase
        .from('journal_entry_lines')
        .select('debit_try, credit_try')
        .eq('company_id', companyId)
        .eq('account_code', '570')

      if (error || !data) return 0
      const rows = data as Array<{ debit_try: unknown; credit_try: unknown }>
      const balance = rows.reduce(
        (s, r) => s + Number(r.credit_try ?? 0) - Number(r.debit_try ?? 0),
        0,
      )
      return round2(balance)
    } catch {
      return 0
    }
  }

  private async fetchOutstandingLoans(companyId: string): Promise<number> {
    try {
      const { data, error } = await this.supabase
        .from('partner_loan_tranches')
        // outstanding is computed (no outstanding_balance_try column): principal_try − total_repaid_try
        .select('principal_try, total_repaid_try')
        .eq('company_id', companyId)

      if (error || !data) return 0
      return round2(
        (data as Array<{ principal_try: unknown; total_repaid_try: unknown }>)
          .reduce((s, r) => s + Math.max(0, Number(r.principal_try ?? 0) - Number(r.total_repaid_try ?? 0)), 0),
      )
    } catch {
      return 0
    }
  }

  private async fetchCompensationYtd(companyId: string): Promise<number> {
    try {
      const { data, error } = await this.supabase
        .from('partner_compensation_payments')
        .select('gross_amount_try')
        .eq('company_id', companyId)
        .neq('payment_status', 'paid')

      if (error || !data) return 0
      return round2(
        (data as Array<{ gross_amount_try: unknown }>)
          .reduce((s, r) => s + Number(r.gross_amount_try ?? 0), 0),
      )
    } catch {
      return 0
    }
  }

  private buildResult(
    input: DistributionInput,
    partners: Array<{ partner_id: string; share_pct: number }>,
  ): DistributionSimulationResult {
    const legalReserveRequired = computeLegalReserveRequired(
      input.net_profit_try,
      input.paid_in_capital_try,
      input.existing_legal_reserves_try,
    )
    const maxDistributable = computeMaxDistributable(
      input.net_profit_try,
      input.existing_retained_earnings_try,
      legalReserveRequired,
    )

    const scenarios = generateStandardScenarios(input, partners)
    const optimalScenario = findOptimalDistribution(scenarios)

    const complianceWarnings: string[] = []
    const nonCompliant = scenarios.filter(s => !s.is_legally_compliant)
    for (const s of nonCompliant) {
      if (s.blocking_reason) {
        complianceWarnings.push(`[${s.name}]: ${s.blocking_reason}`)
      }
    }

    return {
      input_summary: {
        net_profit_try: input.net_profit_try,
        max_distributable_try: maxDistributable,
        legal_reserve_required_try: legalReserveRequired,
      },
      scenarios,
      optimal_scenario: optimalScenario,
      compliance_warnings: complianceWarnings,
    }
  }

  /**
   * Simulate with custom requested distribution amount using DB data.
   */
  async simulate(
    companyId: string,
    requestedDistribution: number,
  ): Promise<DistributionSimulationResult> {
    const [
      netProfit,
      paidInCapital,
      legalReserves,
      retainedEarnings,
      outstandingLoans,
      compensationYtd,
      partners,
    ] = await Promise.all([
      this.fetchNetProfit(companyId),
      this.fetchPaidInCapital(companyId),
      this.fetchLegalReserves(companyId),
      this.fetchRetainedEarnings(companyId),
      this.fetchOutstandingLoans(companyId),
      this.fetchCompensationYtd(companyId),
      this.fetchPartners(companyId),
    ])

    const input: DistributionInput = {
      net_profit_try: netProfit,
      paid_in_capital_try: paidInCapital,
      existing_legal_reserves_try: legalReserves,
      existing_retained_earnings_try: retainedEarnings,
      requested_distribution_try: requestedDistribution,
      compensation_ytd_try: compensationYtd,
      outstanding_loans_try: outstandingLoans,
    }

    return this.buildResult(input, partners)
  }

  /**
   * Get pre-computed standard scenarios using DB data.
   * requested_distribution_try defaults to max distributable.
   */
  async getScenarios(companyId: string): Promise<DistributionSimulationResult> {
    const [
      netProfit,
      paidInCapital,
      legalReserves,
      retainedEarnings,
      outstandingLoans,
      compensationYtd,
      partners,
    ] = await Promise.all([
      this.fetchNetProfit(companyId),
      this.fetchPaidInCapital(companyId),
      this.fetchLegalReserves(companyId),
      this.fetchRetainedEarnings(companyId),
      this.fetchOutstandingLoans(companyId),
      this.fetchCompensationYtd(companyId),
      this.fetchPartners(companyId),
    ])

    const legalReserveRequired = computeLegalReserveRequired(netProfit, paidInCapital, legalReserves)
    const maxDistributable = computeMaxDistributable(netProfit, retainedEarnings, legalReserveRequired)

    const input: DistributionInput = {
      net_profit_try: netProfit,
      paid_in_capital_try: paidInCapital,
      existing_legal_reserves_try: legalReserves,
      existing_retained_earnings_try: retainedEarnings,
      requested_distribution_try: maxDistributable,
      compensation_ytd_try: compensationYtd,
      outstanding_loans_try: outstandingLoans,
    }

    return this.buildResult(input, partners)
  }
}

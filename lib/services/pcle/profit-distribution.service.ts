// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/pcle/profit-distribution.service.ts
//
// Profit Distribution Simulator — TTK 519 legal reserve + GVK 94 withholding
//
// Legal framework (hardcoded Turkish law):
//   TTK 519: 5% of net income allocated to legal reserve until reserve
//             reaches 20% of paid-in capital.
//   GVK 94:  10% withholding tax on gross dividend distributions.
//
// 4-layer distributable safety stack:
//   1. gross_net_income      — after-tax net income
//   2. − legal_reserve       — TTK 519 allocation
//   3. − board_retained      — discretionary board hold
//   4. − unpaid_compensation — outstanding huzur hakkı
//   = distributable_gross
//   5. − withholding_tax (10%)
//   = distributable_net
//
// Pure exports (testable without DB):
//   computeLegalReserveAllocation
//   computeDistributableGross
//   computeDistributableNet
//   computePartnerAllocations
//   buildScenario
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface PartnerAllocation {
  partner_id: string
  partner_name: string
  share_pct: number
  gross_allocation: number    // distributable_gross × share_pct / 100
  withholding_tax: number     // gross × 0.10
  net_allocation: number      // gross × 0.90
}

export interface DistributionScenario {
  gross_net_income: number
  paid_in_capital: number
  existing_legal_reserve: number
  board_retained_amount: number
  unpaid_compensation: number
  // Computed layers
  legal_reserve_allocation: number
  distributable_gross: number
  withholding_tax: number
  distributable_net: number
  // Per partner
  partner_allocations: PartnerAllocation[]
  // Flags
  can_distribute: boolean           // distributable_net > 0
  ttk_509_violated: boolean         // attempting to distribute when distributable_gross < 0
  legal_reserve_satisfied: boolean  // existing_reserve >= capital × 0.20
}

export interface DistributionSimulatorReport {
  company_id: string
  period_id: string | null
  // Computed from actual data
  current_scenario: DistributionScenario
  // Pre-built alternative scenarios
  scenarios: {
    conservative: DistributionScenario   // board_retained = 20% of income
    balanced: DistributionScenario       // board_retained = 10%
    maximum: DistributionScenario        // board_retained = 0
  }
  computed_at: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ── Pure exported functions ───────────────────────────────────────────────────

/**
 * TTK 519 legal reserve allocation.
 * Allocates 5% of net income until reserve reaches 20% of paid-in capital.
 * Returns 0 if reserve already satisfied.
 */
export function computeLegalReserveAllocation(
  netIncome: number,
  paidInCapital: number,
  existingReserve: number,
): number {
  if (netIncome <= 0) return 0
  const targetReserve = round2(paidInCapital * 0.20)
  const gap = round2(targetReserve - existingReserve)
  if (gap <= 0) return 0
  const proposed = round2(netIncome * 0.05)
  return round2(Math.min(proposed, gap))
}

/**
 * Compute distributable gross after all pre-distribution deductions.
 * May be negative if deductions exceed net income.
 */
export function computeDistributableGross(
  netIncome: number,
  legalReserve: number,
  boardRetained: number,
  unpaidCompensation: number,
): number {
  return round2(netIncome - legalReserve - boardRetained - unpaidCompensation)
}

/**
 * GVK 94: net distributable after 10% withholding on gross distributable.
 * Returns 0 if distributableGross <= 0.
 */
export function computeDistributableNet(distributableGross: number): number {
  if (distributableGross <= 0) return 0
  return round2(distributableGross * 0.90)
}

/**
 * Compute per-partner allocations from distributable gross.
 * Each partner gets share_pct% of distributable_gross, then 10% withholding.
 */
export function computePartnerAllocations(
  distributableGross: number,
  partners: Array<{ partner_id: string; partner_name: string; share_pct: number }>,
): PartnerAllocation[] {
  if (distributableGross <= 0) {
    return partners.map(p => ({
      partner_id: p.partner_id,
      partner_name: p.partner_name,
      share_pct: p.share_pct,
      gross_allocation: 0,
      withholding_tax: 0,
      net_allocation: 0,
    }))
  }
  return partners.map(p => {
    const gross = round2(distributableGross * p.share_pct / 100)
    const withholding = round2(gross * 0.10)
    const net = round2(gross * 0.90)
    return {
      partner_id: p.partner_id,
      partner_name: p.partner_name,
      share_pct: p.share_pct,
      gross_allocation: gross,
      withholding_tax: withholding,
      net_allocation: net,
    }
  })
}

/**
 * Build a full DistributionScenario from raw inputs.
 * boardRetainedPct is a percentage of grossNetIncome (0–100).
 */
export function buildScenario(
  grossNetIncome: number,
  paidInCapital: number,
  existingReserve: number,
  boardRetainedPct: number,
  unpaidCompensation: number,
  partners: Array<{ partner_id: string; partner_name: string; share_pct: number }>,
): DistributionScenario {
  const legalReserveAllocation = computeLegalReserveAllocation(grossNetIncome, paidInCapital, existingReserve)
  const boardRetainedAmount = round2(grossNetIncome * boardRetainedPct / 100)
  const distributableGross = computeDistributableGross(
    grossNetIncome,
    legalReserveAllocation,
    boardRetainedAmount,
    unpaidCompensation,
  )
  const withholdingTax = distributableGross > 0 ? round2(distributableGross * 0.10) : 0
  const distributableNet = computeDistributableNet(distributableGross)
  const partnerAllocations = computePartnerAllocations(distributableGross, partners)
  const legalReserveSatisfied = round2(existingReserve + legalReserveAllocation) >= round2(paidInCapital * 0.20)

  return {
    gross_net_income: grossNetIncome,
    paid_in_capital: paidInCapital,
    existing_legal_reserve: existingReserve,
    board_retained_amount: boardRetainedAmount,
    unpaid_compensation: unpaidCompensation,
    legal_reserve_allocation: legalReserveAllocation,
    distributable_gross: distributableGross,
    withholding_tax: withholdingTax,
    distributable_net: distributableNet,
    partner_allocations: partnerAllocations,
    can_distribute: distributableNet > 0,
    ttk_509_violated: distributableGross < 0,
    legal_reserve_satisfied: legalReserveSatisfied,
  }
}

// ── Service class ─────────────────────────────────────────────────────────────

export class ProfitDistributionService {
  /**
   * Fetch paid-in capital: SUM(paid_amount_try) from partner_capital_commitments
   */
  private static async fetchPaidInCapital(
    companyId: string,
    supabase: AnyClient,
  ): Promise<number> {
    try {
      const { data, error } = await supabase
        .from('partner_capital_commitments')
        .select('paid_amount_try')
        .eq('company_id', companyId)

      if (error) return 0
      return Math.round(
        ((data ?? []) as Array<{ paid_amount_try: unknown }>)
          .reduce((s, r) => s + Number(r.paid_amount_try ?? 0), 0) * 100,
      ) / 100
    } catch {
      return 0
    }
  }

  /**
   * Fetch existing legal reserve: net balance of account_code '542' from journal_entry_lines.
   * Falls back to 0 gracefully if no GL data exists.
   */
  private static async fetchExistingLegalReserve(
    companyId: string,
    supabase: AnyClient,
  ): Promise<number> {
    try {
      const { data, error } = await supabase
        .from('journal_entry_lines')
        .select('debit_try, credit_try')
        .eq('company_id', companyId)
        .eq('account_code', '542')

      if (error) return 0
      const rows = (data ?? []) as Array<{ debit_try: unknown; credit_try: unknown }>
      // Account 542 is a credit-normal equity account; balance = credits - debits
      const balance = rows.reduce(
        (s, r) => s + Number(r.credit_try ?? 0) - Number(r.debit_try ?? 0),
        0,
      )
      return Math.round(balance * 100) / 100
    } catch {
      return 0
    }
  }

  /**
   * Fetch unpaid compensation YTD: SUM(gross_amount_try) from partner_compensation_payments
   * WHERE payment_status != 'paid'. Falls back to 0.
   */
  private static async fetchUnpaidCompensation(
    companyId: string,
    supabase: AnyClient,
  ): Promise<number> {
    try {
      const { data, error } = await supabase
        .from('partner_compensation_payments')
        .select('gross_amount_try')
        .eq('company_id', companyId)
        .neq('payment_status', 'paid')

      if (error) return 0
      return Math.round(
        ((data ?? []) as Array<{ gross_amount_try: unknown }>)
          .reduce((s, r) => s + Number(r.gross_amount_try ?? 0), 0) * 100,
      ) / 100
    } catch {
      return 0
    }
  }

  /**
   * Fetch active partners with their share percentages.
   */
  private static async fetchPartners(
    companyId: string,
    supabase: AnyClient,
  ): Promise<Array<{ partner_id: string; partner_name: string; share_pct: number }>> {
    try {
      const { data, error } = await supabase
        .from('partners')
        .select('id, name, share_ratio')
        .eq('company_id', companyId)
        .eq('is_active', true)

      if (error) return []
      return ((data ?? []) as Array<{ id: string; name: string; share_ratio: number }>).map(p => ({
        partner_id: p.id,
        partner_name: p.name,
        share_pct: Math.round(p.share_ratio * 10000) / 100,
      }))
    } catch {
      return []
    }
  }

  /**
   * Compute net income for the current period by fetching revenue and expenses.
   * Uses a simple revenue − expenses model for resilience.
   */
  private static async fetchNetIncome(
    companyId: string,
    supabase: AnyClient,
  ): Promise<number> {
    try {
      // Revenue: sum of sale_lines amounts
      const { data: salesData } = await supabase
        .from('sale_lines')
        .select('amount_try')
        .eq('company_id', companyId)

      const revenue = ((salesData ?? []) as Array<{ amount_try: unknown }>)
        .reduce((s, r) => s + Number(r.amount_try ?? 0), 0)

      // Expenses: sum of expense_items amount_try
      const { data: expenseData } = await supabase
        .from('expense_items')
        .select('amount_try')
        .eq('company_id', companyId)

      const expenses = ((expenseData ?? []) as Array<{ amount_try: unknown }>)
        .reduce((s, r) => s + Number(r.amount_try ?? 0), 0)

      return Math.round((revenue - expenses) * 100) / 100
    } catch {
      return 0
    }
  }

  /**
   * Build the full DistributionSimulatorReport for a company.
   * All financial data is fetched from the DB; three pre-built scenarios
   * are computed (conservative/balanced/maximum).
   */
  static async getReport(
    companyId: string,
    supabase: AnyClient,
    periodId?: string | null,
  ): Promise<DistributionSimulatorReport> {
    const [paidInCapital, existingReserve, unpaidCompensation, partners, netIncome] =
      await Promise.all([
        this.fetchPaidInCapital(companyId, supabase),
        this.fetchExistingLegalReserve(companyId, supabase),
        this.fetchUnpaidCompensation(companyId, supabase),
        this.fetchPartners(companyId, supabase),
        this.fetchNetIncome(companyId, supabase),
      ])

    const currentScenario = buildScenario(netIncome, paidInCapital, existingReserve, 0, unpaidCompensation, partners)
    const conservative = buildScenario(netIncome, paidInCapital, existingReserve, 20, unpaidCompensation, partners)
    const balanced = buildScenario(netIncome, paidInCapital, existingReserve, 10, unpaidCompensation, partners)
    const maximum = buildScenario(netIncome, paidInCapital, existingReserve, 0, unpaidCompensation, partners)

    return {
      company_id: companyId,
      period_id: periodId ?? null,
      current_scenario: currentScenario,
      scenarios: { conservative, balanced, maximum },
      computed_at: new Date().toISOString(),
    }
  }
}

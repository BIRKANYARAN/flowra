// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/pcle/capital-statement.service.ts
//
// Partner Capital Account Statement — PCLE capital ledger
//
// Builds a running capital account for each partner showing equity evolution
// over 12 months (the requested year). Each monthly line shows:
//   opening_equity
//   + equity_contributions  (from partner_capital_commitments.paid_try)
//   + profit_allocation      (partner's share of net income for the month)
//   - dividends_declared     (from workflow_instances dividend_declaration)
//   - compensation_paid      (from partner_compensation_payments.net_amount_try)
//   + other_adjustments      (future use, always 0 for now)
//   = closing_equity
//
// Pure exports (testable without DB):
//   computeNetIncome
//   allocateProfit
//   buildCapitalStatementLine
//   computeYtdSummary
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface CapitalStatementLine {
  period_key: string      // 'YYYY-MM'
  period_label: string    // 'May 2026'
  opening_equity: number
  equity_contributions: number
  profit_allocation: number
  dividends_declared: number
  compensation_paid: number
  other_adjustments: number
  closing_equity: number
}

export interface PartnerCapitalAccount {
  partner_id: string
  partner_name: string
  share_pct: number       // current share percentage (0–100)
  lines: CapitalStatementLine[]
  // Summary
  total_contributions_ytd: number
  total_dividends_ytd: number
  total_compensation_ytd: number
  net_equity_change_ytd: number
  current_equity: number
}

export interface CapitalStatementReport {
  company_id: string
  year: number
  partners: PartnerCapitalAccount[]
  // Company totals
  total_paid_in_capital: number
  total_retained_earnings: number
  total_equity: number
  computed_at: string
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Return YYYY-MM-01 and YYYY-MM-last-day strings for a given period_key.
 */
function periodBounds(periodKey: string): { from: string; to: string } {
  const [y, m] = periodKey.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return {
    from: `${periodKey}-01`,
    to:   `${periodKey}-${String(lastDay).padStart(2, '0')}`,
  }
}

/**
 * Build a human-readable period label from 'YYYY-MM'.
 * Uses en-GB locale for month name, then reformats to Turkish conventions.
 */
const TR_MONTHS: Record<number, string> = {
  1: 'Ocak', 2: 'Şubat', 3: 'Mart', 4: 'Nisan',
  5: 'Mayıs', 6: 'Haziran', 7: 'Temmuz', 8: 'Ağustos',
  9: 'Eylül', 10: 'Ekim', 11: 'Kasım', 12: 'Aralık',
}

function periodLabel(periodKey: string): string {
  const [y, m] = periodKey.split('-').map(Number)
  return `${TR_MONTHS[m] ?? m} ${y}`
}

// ── Pure exported functions ───────────────────────────────────────────────────

/**
 * Compute net income for a period given raw revenue and expense totals.
 * Simplified (no tax, no COGS) for capital-account purposes.
 */
export function computeNetIncome(revenueTry: number, expensesTry: number): number {
  return round2(revenueTry - expensesTry)
}

/**
 * Allocate net income to a partner based on their share percentage (0–100).
 */
export function allocateProfit(netIncomeTry: number, sharePct: number): number {
  return round2(netIncomeTry * sharePct / 100)
}

/**
 * Build a single capital statement line from its inputs.
 * closing_equity = opening + contributions + profit - dividends - compensation + adjustments
 */
export function buildCapitalStatementLine(
  period_key: string,
  opening_equity: number,
  contributions: number,
  profit: number,
  dividends: number,
  compensation: number,
  adjustments: number,
): CapitalStatementLine {
  const closing_equity = round2(
    opening_equity + contributions + profit - dividends - compensation + adjustments,
  )
  return {
    period_key,
    period_label: periodLabel(period_key),
    opening_equity:       round2(opening_equity),
    equity_contributions: round2(contributions),
    profit_allocation:    round2(profit),
    dividends_declared:   round2(dividends),
    compensation_paid:    round2(compensation),
    other_adjustments:    round2(adjustments),
    closing_equity,
  }
}

/**
 * Compute YTD summary totals from a set of capital statement lines.
 */
export function computeYtdSummary(lines: CapitalStatementLine[]): {
  total_contributions_ytd: number
  total_dividends_ytd: number
  total_compensation_ytd: number
  net_equity_change_ytd: number
  current_equity: number
} {
  let contributions = 0, dividends = 0, compensation = 0
  for (const l of lines) {
    contributions += l.equity_contributions
    dividends     += l.dividends_declared
    compensation  += l.compensation_paid
  }
  const opening = lines[0]?.opening_equity ?? 0
  const closing  = lines[lines.length - 1]?.closing_equity ?? 0
  return {
    total_contributions_ytd: round2(contributions),
    total_dividends_ytd:     round2(dividends),
    total_compensation_ytd:  round2(compensation),
    net_equity_change_ytd:   round2(closing - opening),
    current_equity:          round2(closing),
  }
}

// ── DB query helpers ──────────────────────────────────────────────────────────

interface PartnerRow {
  id: string
  name: string
  share_ratio: number   // 0–1 decimal
  is_active: boolean
}

/** Revenue sum for a month */
async function fetchRevenue(
  supabase: AnyClient,
  companyId: string,
  from: string,
  to: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('sales')
    .select('total_try:total')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .gte('sale_date', from)
    .lte('sale_date', to)

  if (error) return 0
  return round2((data ?? []).reduce((s: number, r: { total_try: unknown }) => s + Number(r.total_try ?? 0), 0))
}

/** Expense sum for a month (direct expenses only, simplified) */
async function fetchExpenses(
  supabase: AnyClient,
  companyId: string,
  from: string,
  to: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('expenses')
    .select('amount_try')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .gte('expense_date', from)
    .lte('expense_date', to)

  if (error) return 0
  return round2((data ?? []).reduce((s: number, r: { amount_try: unknown }) => s + Number(r.amount_try ?? 0), 0))
}

/** Capital contributions paid in a given month for a partner */
async function fetchContributions(
  supabase: AnyClient,
  companyId: string,
  partnerId: string,
  from: string,
  to: string,
): Promise<number> {
  // Using commitment_date as the trigger date for when capital was committed/paid
  const { data, error } = await supabase
    .from('partner_capital_commitments')
    .select('paid_try')
    .eq('company_id', companyId)
    .eq('partner_id', partnerId)
    .gte('commitment_date', from)
    .lte('commitment_date', to)

  if (error) return 0
  return round2((data ?? []).reduce((s: number, r: { paid_try: unknown }) => s + Number(r.paid_try ?? 0), 0))
}

/**
 * Dividend amounts declared in a given month for a partner.
 * Reads from workflow_instances where workflow_type = 'dividend_declaration' and status = 'approved' or 'executed'.
 * The payload has partner_allocations array with partner_id and gross_try.
 */
async function fetchDividends(
  supabase: AnyClient,
  companyId: string,
  partnerId: string,
  from: string,
  to: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('workflow_instances')
    .select('payload, resolved_at')
    .eq('company_id', companyId)
    .eq('workflow_type', 'dividend_declaration')
    .in('status', ['approved', 'executed'])
    .gte('resolved_at', from)
    .lte('resolved_at', to + 'T23:59:59.999Z')

  if (error) return 0

  let total = 0
  for (const row of data ?? []) {
    const payload = row.payload as {
      partner_allocations?: Array<{ partner_id: string; gross_try?: number; net_try?: number }>
    } | null
    if (!payload) continue
    const allocs = payload.partner_allocations ?? []
    for (const a of allocs) {
      if (a.partner_id === partnerId) {
        total += Number(a.gross_try ?? a.net_try ?? 0)
      }
    }
  }
  return round2(total)
}

/**
 * Compensation (huzur hakkı) paid in a given month for a partner.
 * Uses net_amount_try. Returns 0 gracefully if table does not exist.
 */
async function fetchCompensation(
  supabase: AnyClient,
  companyId: string,
  partnerId: string,
  from: string,
  to: string,
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('partner_compensation_payments')
      .select('net_amount_try')
      .eq('company_id', companyId)
      .eq('partner_id', partnerId)
      .in('payment_status', ['paid'])
      .gte('payment_period', from)
      .lte('payment_period', to)

    if (error) return 0
    return round2((data ?? []).reduce((s: number, r: { net_amount_try: unknown }) => s + Number(r.net_amount_try ?? 0), 0))
  } catch {
    return 0
  }
}

// ── Main service ──────────────────────────────────────────────────────────────

export class CapitalStatementService {
  /**
   * Build a full capital statement report for a company and year.
   * Months are January–December of the given year.
   */
  static async getReport(
    companyId: string,
    year: number,
    supabase: AnyClient,
  ): Promise<CapitalStatementReport> {
    // 1. Fetch partners
    const { data: partnerRows, error: pErr } = await supabase
      .from('partners')
      .select('id, name, share_ratio, is_active')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (pErr) {
      throw new Error(`Ortak verisi alınamadı: ${pErr.message}`)
    }

    const partners: PartnerRow[] = (partnerRows ?? []).map((p: { id: unknown; name: unknown; share_ratio: unknown; is_active: unknown }) => ({
      id:          String(p.id),
      name:        String(p.name),
      share_ratio: Number(p.share_ratio ?? 0),
      is_active:   Boolean(p.is_active),
    }))

    // 2. Build 12 period keys for the year
    const periodKeys: string[] = []
    for (let m = 1; m <= 12; m++) {
      periodKeys.push(`${year}-${String(m).padStart(2, '0')}`)
    }

    // 3. Pre-fetch monthly revenue + expenses (shared across partners)
    const monthlyNetIncome: Record<string, number> = {}
    for (const pk of periodKeys) {
      const { from, to } = periodBounds(pk)
      const [rev, exp] = await Promise.all([
        fetchRevenue(supabase, companyId, from, to),
        fetchExpenses(supabase, companyId, from, to),
      ])
      monthlyNetIncome[pk] = computeNetIncome(rev, exp)
    }

    // 4. Build per-partner capital accounts
    const partnerAccounts: PartnerCapitalAccount[] = []

    for (const p of partners) {
      const sharePct = round2(p.share_ratio * 100)  // convert 0–1 ratio to 0–100 pct

      let openingEquity = 0
      const lines: CapitalStatementLine[] = []

      // For each month, fetch contributions, dividends, compensation
      for (const pk of periodKeys) {
        const { from, to } = periodBounds(pk)

        const [contributions, dividends, compensation] = await Promise.all([
          fetchContributions(supabase, companyId, p.id, from, to),
          fetchDividends(supabase, companyId, p.id, from, to),
          fetchCompensation(supabase, companyId, p.id, from, to),
        ])

        const profit = allocateProfit(monthlyNetIncome[pk] ?? 0, sharePct)

        const line = buildCapitalStatementLine(
          pk,
          openingEquity,
          contributions,
          profit,
          dividends,
          compensation,
          0, // other_adjustments
        )
        lines.push(line)
        openingEquity = line.closing_equity
      }

      const summary = computeYtdSummary(lines)

      partnerAccounts.push({
        partner_id:   p.id,
        partner_name: p.name,
        share_pct:    sharePct,
        lines,
        ...summary,
      })
    }

    // 5. Company totals
    const totalPaidInCapital = round2(
      partnerAccounts.reduce((s, pa) => s + pa.total_contributions_ytd, 0),
    )
    const totalRetainedEarnings = round2(
      partnerAccounts.reduce((s, pa) => {
        // retained = closing - contributions (simplified)
        return s + (pa.current_equity - pa.total_contributions_ytd)
      }, 0),
    )
    const totalEquity = round2(
      partnerAccounts.reduce((s, pa) => s + pa.current_equity, 0),
    )

    return {
      company_id:              companyId,
      year,
      partners:                partnerAccounts,
      total_paid_in_capital:   totalPaidInCapital,
      total_retained_earnings: totalRetainedEarnings,
      total_equity:            totalEquity,
      computed_at:             new Date().toISOString(),
    }
  }
}

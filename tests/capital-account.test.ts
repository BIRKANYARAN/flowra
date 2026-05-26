/**
 * Tests for lib/services/pcle/capital-account.service.ts
 *
 * Pure computation tests — no DB required. Supabase client is mocked.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  CapitalAccountService,
} from '../lib/services/pcle/capital-account.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal mock Supabase that returns predefined data per table */
function mockSupabase(data: {
  partners?:              Array<{ id: string; name: string; share_ratio: number; is_active: boolean }>
  partner_finance_events?: Array<{ partner_id: string; event_type: string; amount_try: number }>
  partner_loan_tranches?: Array<{ partner_id: string; outstanding_try: number }>
}) {
  const tableData: Record<string, unknown[]> = {
    partners:               data.partners               ?? [],
    partner_finance_events: data.partner_finance_events ?? [],
    partner_loan_tranches:  data.partner_loan_tranches  ?? [],
  }

  // Fluent builder mock — .from(t).select(...).eq(...).is(...).neq(...).order(...)
  const makeFluent = (table: string) => {
    const chain = {
      select:  () => chain,
      eq:      () => chain,
      is:      () => chain,
      neq:     () => chain,
      order:   () => Promise.resolve({ data: tableData[table] ?? [], error: null }),
    }
    // Make sure the last call in the chain resolves the promise.
    // For partner_loan_tranches the chain is: select → eq → is → neq
    // We need each method to also be awaitable (return a thenable).
    const makeAwaitable = (t: string) => {
      const obj: Record<string, unknown> = {}
      const resolve = () => Promise.resolve({ data: tableData[t] ?? [], error: null })
      obj.then = (onFulfilled: (v: { data: unknown[]; error: null }) => unknown) =>
        resolve().then(onFulfilled)
      ;['select', 'eq', 'is', 'neq', 'order'].forEach(m => {
        obj[m] = () => makeAwaitable(t)
      })
      return obj
    }
    return makeAwaitable(table)
  }

  return { from: (table: string) => makeFluent(table) }
}

// ── Sample fixtures ───────────────────────────────────────────────────────────

const PARTNER_A = { id: 'p1', name: 'Ortak A', share_ratio: 0.6, is_active: true }
const PARTNER_B = { id: 'p2', name: 'Ortak B', share_ratio: 0.4, is_active: true }

const BASE_EVENTS = [
  // Partner A — equity contributions
  { partner_id: 'p1', event_type: 'EQUITY_PAYMENT',       amount_try: 100_000 },
  { partner_id: 'p1', event_type: 'EQUITY_PAYMENT',       amount_try:  50_000 },
  // Partner A — distributions received
  { partner_id: 'p1', event_type: 'DIVIDEND_PAID',        amount_try:  20_000 },
  { partner_id: 'p1', event_type: 'COMPENSATION_PAYMENT', amount_try:   5_000 },
  // Partner A — loan repayment received
  { partner_id: 'p1', event_type: 'LOAN_REPAYMENT',       amount_try:  10_000 },
  // Partner A — loan disbursement
  { partner_id: 'p1', event_type: 'LOAN_DISBURSEMENT',    amount_try:  30_000 },

  // Partner B — equity contributions
  { partner_id: 'p2', event_type: 'EQUITY_PAYMENT',       amount_try:  80_000 },
  // Partner B — distributions received
  { partner_id: 'p2', event_type: 'DIVIDEND_PAID',        amount_try:  15_000 },
  // Partner B — loan disbursement
  { partner_id: 'p2', event_type: 'LOAN_DISBURSEMENT',    amount_try:  20_000 },
]

const BASE_TRANCHES = [
  { partner_id: 'p1', outstanding_try: 25_000 },
  { partner_id: 'p2', outstanding_try: 18_000 },
]

const TOTAL_EQUITY = 500_000

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CapitalAccountService.compute', () => {

  it('1 — equity contribution: sums EQUITY_PAYMENT events per partner', async () => {
    const supabase = mockSupabase({
      partners:               [PARTNER_A, PARTNER_B],
      partner_finance_events: BASE_EVENTS,
      partner_loan_tranches:  [],
    })

    const result = await CapitalAccountService.compute('co1', supabase, TOTAL_EQUITY)
    const a = result.accounts.find(x => x.partner_id === 'p1')!

    // 100_000 + 50_000
    expect(a.equity_contributed_try).toBe(150_000)
  })

  it('2 — distributions received: sums DIVIDEND_PAID + COMPENSATION_PAYMENT', async () => {
    const supabase = mockSupabase({
      partners:               [PARTNER_A],
      partner_finance_events: BASE_EVENTS,
      partner_loan_tranches:  [],
    })

    const result = await CapitalAccountService.compute('co1', supabase, TOTAL_EQUITY)
    const a = result.accounts.find(x => x.partner_id === 'p1')!

    // 20_000 + 5_000
    expect(a.distributions_received_try).toBe(25_000)
  })

  it('3 — net invested = equity_contributed − total_received', async () => {
    const supabase = mockSupabase({
      partners:               [PARTNER_A],
      partner_finance_events: BASE_EVENTS,
      partner_loan_tranches:  [],
    })

    const result = await CapitalAccountService.compute('co1', supabase, TOTAL_EQUITY)
    const a = result.accounts.find(x => x.partner_id === 'p1')!

    // equity_contributed = 150_000
    // total_received = distributions(25_000) + loan_repayments(10_000) = 35_000
    // net_invested = 150_000 − 35_000 = 115_000
    expect(a.total_received_try).toBe(35_000)
    expect(a.net_invested_try).toBe(115_000)
  })

  it('4 — book equity = total_equity × share_ratio', async () => {
    const supabase = mockSupabase({
      partners:               [PARTNER_A, PARTNER_B],
      partner_finance_events: [],
      partner_loan_tranches:  [],
    })

    // total_equity = 500_000; partner A share_ratio = 0.6
    const result = await CapitalAccountService.compute('co1', supabase, TOTAL_EQUITY)
    const a = result.accounts.find(x => x.partner_id === 'p1')!
    const b = result.accounts.find(x => x.partner_id === 'p2')!

    expect(a.book_equity_try).toBe(300_000)   // 500_000 × 0.6
    expect(b.book_equity_try).toBe(200_000)   // 500_000 × 0.4
  })

  it('5 — loan balance from outstanding tranches', async () => {
    const supabase = mockSupabase({
      partners:               [PARTNER_A, PARTNER_B],
      partner_finance_events: [],
      partner_loan_tranches:  BASE_TRANCHES,
    })

    const result = await CapitalAccountService.compute('co1', supabase, TOTAL_EQUITY)
    const a = result.accounts.find(x => x.partner_id === 'p1')!
    const b = result.accounts.find(x => x.partner_id === 'p2')!

    expect(a.loan_balance_try).toBe(25_000)
    expect(b.loan_balance_try).toBe(18_000)
  })

  it('6 — net position = book_equity − loan_balance', async () => {
    const supabase = mockSupabase({
      partners:               [PARTNER_A, PARTNER_B],
      partner_finance_events: BASE_EVENTS,
      partner_loan_tranches:  BASE_TRANCHES,
    })

    const result = await CapitalAccountService.compute('co1', supabase, TOTAL_EQUITY)
    const a = result.accounts.find(x => x.partner_id === 'p1')!

    // book_equity_a = 500_000 × 0.6 = 300_000
    // loan_balance_a = 25_000
    // net_position = 275_000
    expect(a.net_position_try).toBe(275_000)
  })

  it('aggregates total_partner_debt across all partners', async () => {
    const supabase = mockSupabase({
      partners:               [PARTNER_A, PARTNER_B],
      partner_finance_events: [],
      partner_loan_tranches:  BASE_TRANCHES,
    })

    const result = await CapitalAccountService.compute('co1', supabase, TOTAL_EQUITY)

    expect(result.total_partner_debt_try).toBe(43_000)   // 25_000 + 18_000
  })

})

describe('CapitalAccountService.computeExitScenario', () => {

  // Build base accounts for exit tests
  const baseAccounts = [
    {
      partner_id:                   'p1',
      partner_name:                 'Ortak A',
      share_ratio:                   0.6,
      is_active:                     true,
      equity_contributed_try:        150_000,
      total_received_try:             35_000,
      distributions_received_try:     25_000,
      loan_repayments_received_try:   10_000,
      net_invested_try:              115_000,
      book_equity_try:               300_000,
      loan_balance_try:               25_000,
      net_position_try:              275_000,
      total_loaned_try:               30_000,
    },
    {
      partner_id:                   'p2',
      partner_name:                 'Ortak B',
      share_ratio:                   0.4,
      is_active:                     true,
      equity_contributed_try:         80_000,
      total_received_try:             15_000,
      distributions_received_try:     15_000,
      loan_repayments_received_try:        0,
      net_invested_try:               65_000,
      book_equity_try:               200_000,
      loan_balance_try:               18_000,
      net_position_try:              182_000,
      total_loaned_try:               20_000,
    },
  ]

  it('7 — exit at 1x multiple: distributable = enterprise_value − senior_claims', () => {
    // total_equity = 500_000, multiple = 1.0
    // enterprise_value = 500_000 × 1.0 = 500_000
    // senior_claims = 43_000 (25_000 + 18_000)
    // distributable = 500_000 − 43_000 = 457_000
    const scenario = CapitalAccountService.computeExitScenario(baseAccounts, 500_000, 43_000, 1.0)

    expect(scenario.valuation_multiple).toBe(1.0)
    expect(scenario.enterprise_value_try).toBe(500_000)
    expect(scenario.senior_claims_try).toBe(43_000)
    expect(scenario.distributable_value_try).toBe(457_000)

    const exitA = scenario.per_partner.find(p => p.partner_id === 'p1')!
    const exitB = scenario.per_partner.find(p => p.partner_id === 'p2')!

    // exitA = 457_000 × 0.6 = 274_200
    expect(exitA.exit_value_try).toBe(274_200)
    // exitB = 457_000 × 0.4 = 182_800
    expect(exitB.exit_value_try).toBe(182_800)
  })

  it('8 — exit at 2.5x multiple: senior claims deducted first', () => {
    // total_equity = 500_000, multiple = 2.5
    // enterprise_value = 1_250_000
    // senior_claims = 43_000
    // distributable = 1_207_000
    const scenario = CapitalAccountService.computeExitScenario(baseAccounts, 500_000, 43_000, 2.5)

    expect(scenario.valuation_multiple).toBe(2.5)
    expect(scenario.enterprise_value_try).toBe(1_250_000)
    expect(scenario.senior_claims_try).toBe(43_000)
    expect(scenario.distributable_value_try).toBe(1_207_000)

    const exitA = scenario.per_partner.find(p => p.partner_id === 'p1')!
    const exitB = scenario.per_partner.find(p => p.partner_id === 'p2')!

    // exitA = 1_207_000 × 0.6 = 724_200
    expect(exitA.exit_value_try).toBe(724_200)
    // net gain = 724_200 − 115_000 = 609_200
    expect(exitA.net_exit_gain_try).toBe(609_200)

    // exitB = 1_207_000 × 0.4 = 482_800
    expect(exitB.exit_value_try).toBe(482_800)
    // net gain = 482_800 − 65_000 = 417_800
    expect(exitB.net_exit_gain_try).toBe(417_800)
  })

  it('exit distributable is clamped at 0 when debt exceeds enterprise value', () => {
    // heavy debt scenario
    const scenario = CapitalAccountService.computeExitScenario(baseAccounts, 10_000, 43_000, 1.0)

    // enterprise = 10_000, claims = 43_000 → distributable = 0 (clamped)
    expect(scenario.distributable_value_try).toBe(0)
    scenario.per_partner.forEach(p => {
      expect(p.exit_value_try).toBe(0)
    })
  })

})

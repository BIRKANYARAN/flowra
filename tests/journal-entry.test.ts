/**
 * GL Journal Entry Service — unit tests
 *
 * Tests all pure computation functions AND the static JournalEntryService methods.
 * No DB or network calls — pure function tests only.
 *
 * Run with: npx vitest run tests/journal-entry.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  // Pure functions (new API)
  ACCOUNT_CODES,
  buildDebitLine,
  buildCreditLine,
  validateJournalEntry,
  buildSaleJournal,
  buildPaymentReceivedJournal,
  buildExpenseJournal,
  buildExpensePaidJournal,
  buildPartnerLoanDisbursementJournal,
  buildPartnerLoanRepaymentJournal,
  buildInterestAccrualJournal,
  buildPeriodCloseJournal,
  mapExpenseTypeToAccount,
  computeNetFromGross,
  canMergeEntries,
  type JournalEntry,
  // Static class + legacy interfaces
  JournalEntryService,
  type JournalLine,
  type CreateJournalEntryParams,
} from '../lib/services/ledger/journal-entry.service'

// ── helpers ───────────────────────────────────────────────────────────────────

function sumDR(lines: JournalLine[]): number {
  return Math.round(lines.reduce((s, l) => s + (l.debit_try ?? 0), 0) * 100) / 100
}
function sumCR(lines: JournalLine[]): number {
  return Math.round(lines.reduce((s, l) => s + (l.credit_try ?? 0), 0) * 100) / 100
}
function isBalanced(lines: JournalLine[]): boolean {
  return Math.abs(sumDR(lines) - sumCR(lines)) < 0.01
}

// ── buildSaleEntry ────────────────────────────────────────────────────────────

describe('JournalEntryService.buildSaleEntry', () => {
  const base = {
    id:             'sale-001',
    sale_date:      '2025-03-15',
    invoice_no:     'INV-001',
    revenue_try:    10_000,
    kdv_amount_try: 2_000,
    total_try:      12_000,
  }

  it('produces balanced DR = CR', () => {
    const { lines } = JournalEntryService.buildSaleEntry(base)
    expect(isBalanced(lines)).toBe(true)
  })

  it('DR 12000 total (120 Alıcılar)', () => {
    const { lines } = JournalEntryService.buildSaleEntry(base)
    const rec = lines.find(l => l.account_code === '120')
    expect(rec?.debit_try).toBe(12_000)
  })

  it('CR 10000 revenue (600) + CR 2000 KDV (391)', () => {
    const { lines } = JournalEntryService.buildSaleEntry(base)
    const rev = lines.find(l => l.account_code === '600')
    const vat = lines.find(l => l.account_code === '391')
    expect(rev?.credit_try).toBe(10_000)
    expect(vat?.credit_try).toBe(2_000)
  })

  it('omits KDV line when kdv_amount_try is 0', () => {
    const { lines } = JournalEntryService.buildSaleEntry({ ...base, kdv_amount_try: 0, total_try: 10_000 })
    const vat = lines.find(l => l.account_code === '391')
    expect(vat).toBeUndefined()
    expect(isBalanced(lines)).toBe(true)
  })

  it('sets source_type = "sale"', () => {
    const entry = JournalEntryService.buildSaleEntry(base)
    expect(entry.source_type).toBe('sale')
  })

  it('handles fractional amounts correctly (no floating-point drift)', () => {
    const { lines } = JournalEntryService.buildSaleEntry({
      ...base,
      revenue_try:    1_234.56,
      kdv_amount_try: 222.22,
      total_try:      1_456.78,
    })
    expect(isBalanced(lines)).toBe(true)
  })
})

// ── buildSalePaymentEntry ─────────────────────────────────────────────────────

describe('JournalEntryService.buildSalePaymentEntry', () => {
  const base = { sale_id: 'sale-001', payment_date: '2025-03-20', amount_try: 12_000 }

  it('produces balanced DR = CR', () => {
    const { lines } = JournalEntryService.buildSalePaymentEntry(base)
    expect(isBalanced(lines)).toBe(true)
  })

  it('DR 102 Bankalar, CR 120 Alıcılar — same amount', () => {
    const { lines } = JournalEntryService.buildSalePaymentEntry(base)
    const bank = lines.find(l => l.account_code === '102')
    const rec  = lines.find(l => l.account_code === '120')
    expect(bank?.debit_try).toBe(12_000)
    expect(rec?.credit_try).toBe(12_000)
  })

  it('sets source_type = "sale_payment"', () => {
    expect(JournalEntryService.buildSalePaymentEntry(base).source_type).toBe('sale_payment')
  })
})

// ── buildExpenseEntry ─────────────────────────────────────────────────────────

describe('JournalEntryService.buildExpenseEntry', () => {
  const base = {
    id:             'exp-001',
    expense_date:   '2025-03-10',
    expense_type:   'rent',
    amount_try:     5_000,
    kdv_amount_try: 900,
    paid_from_bank: true,
    description:    'Mart kirası',
  }

  it('produces balanced DR = CR (with KDV)', () => {
    const { lines } = JournalEntryService.buildExpenseEntry(base)
    expect(isBalanced(lines)).toBe(true)
  })

  it('DR expense account + DR 191 deductible VAT = CR 102 bank (total)', () => {
    const { lines } = JournalEntryService.buildExpenseEntry(base)
    expect(sumDR(lines)).toBe(5_900)
    expect(sumCR(lines)).toBe(5_900)
    const vat  = lines.find(l => l.account_code === '191')
    const bank = lines.find(l => l.account_code === '102')
    expect(vat?.debit_try).toBe(900)
    expect(bank?.credit_try).toBe(5_900)
  })

  it('uses 320 Satıcılar when paid_from_bank = false', () => {
    const { lines } = JournalEntryService.buildExpenseEntry({ ...base, paid_from_bank: false })
    const payable = lines.find(l => l.account_code === '320')
    expect(payable?.credit_try).toBe(5_900)
    expect(isBalanced(lines)).toBe(true)
  })

  it('omits 191 line when no KDV', () => {
    const { lines } = JournalEntryService.buildExpenseEntry({ ...base, kdv_amount_try: 0 })
    const vat = lines.find(l => l.account_code === '191')
    expect(vat).toBeUndefined()
    expect(isBalanced(lines)).toBe(true)
  })

  it('uses correct account for salary (771)', () => {
    const { lines } = JournalEntryService.buildExpenseEntry({ ...base, expense_type: 'salary', kdv_amount_try: 0 })
    const exp = lines.find(l => l.account_code === '771')
    expect(exp).toBeDefined()
    expect(exp?.debit_try).toBe(5_000)
  })

  it('falls back to 770 for unknown expense_type', () => {
    const { lines } = JournalEntryService.buildExpenseEntry({ ...base, expense_type: 'unknown_xyz', kdv_amount_try: 0 })
    const exp = lines.find(l => l.account_code === '770')
    expect(exp).toBeDefined()
    expect(isBalanced(lines)).toBe(true)
  })

  it('sets source_type = "expense"', () => {
    expect(JournalEntryService.buildExpenseEntry(base).source_type).toBe('expense')
  })
})

// ── buildPurchaseEntry ────────────────────────────────────────────────────────

describe('JournalEntryService.buildPurchaseEntry', () => {
  const base = {
    id:             'purch-001',
    received_date:  '2025-03-05',
    cost_try:       8_000,
    paid_from_bank: true,
  }

  it('produces balanced DR = CR', () => {
    const { lines } = JournalEntryService.buildPurchaseEntry(base)
    expect(isBalanced(lines)).toBe(true)
  })

  it('DR 153 Ticari Mallar, CR 102 Bankalar', () => {
    const { lines } = JournalEntryService.buildPurchaseEntry(base)
    const inv  = lines.find(l => l.account_code === '153')
    const bank = lines.find(l => l.account_code === '102')
    expect(inv?.debit_try).toBe(8_000)
    expect(bank?.credit_try).toBe(8_000)
  })

  it('uses 320 Satıcılar when not paid from bank', () => {
    const { lines } = JournalEntryService.buildPurchaseEntry({ ...base, paid_from_bank: false })
    const payable = lines.find(l => l.account_code === '320')
    expect(payable?.credit_try).toBe(8_000)
    expect(isBalanced(lines)).toBe(true)
  })

  it('sets source_type = "purchase"', () => {
    expect(JournalEntryService.buildPurchaseEntry(base).source_type).toBe('purchase')
  })
})

// ── buildCogsEntry ────────────────────────────────────────────────────────────

describe('JournalEntryService.buildCogsEntry', () => {
  const base = { id: 'sale-001', sale_date: '2025-03-15', cogs_try: 4_500 }

  it('produces balanced DR = CR', () => {
    const { lines } = JournalEntryService.buildCogsEntry(base)
    expect(isBalanced(lines)).toBe(true)
  })

  it('DR 620 COGS, CR 153 Ticari Mallar', () => {
    const { lines } = JournalEntryService.buildCogsEntry(base)
    const cogs = lines.find(l => l.account_code === '620')
    const inv  = lines.find(l => l.account_code === '153')
    expect(cogs?.debit_try).toBe(4_500)
    expect(inv?.credit_try).toBe(4_500)
  })

  it('sets source_type = "purchase_cogs"', () => {
    expect(JournalEntryService.buildCogsEntry(base).source_type).toBe('purchase_cogs')
  })
})

// ── buildPartnerLoanEntry ─────────────────────────────────────────────────────

describe('JournalEntryService.buildPartnerLoanEntry', () => {
  const base = {
    partner_transaction_id: 'ptx-001',
    tx_date:                '2025-02-01',
    amount_try:             100_000,
    partner_name:           'Ahmet Yılmaz',
    is_long_term:           false,
  }

  it('produces balanced DR = CR', () => {
    const { lines } = JournalEntryService.buildPartnerLoanEntry(base)
    expect(isBalanced(lines)).toBe(true)
  })

  it('DR 102 Bankalar, CR 321 short-term liability', () => {
    const { lines } = JournalEntryService.buildPartnerLoanEntry(base)
    const bank    = lines.find(l => l.account_code === '102')
    const liab321 = lines.find(l => l.account_code === '321')
    expect(bank?.debit_try).toBe(100_000)
    expect(liab321?.credit_try).toBe(100_000)
  })

  it('uses 421 for long-term loans', () => {
    const { lines } = JournalEntryService.buildPartnerLoanEntry({ ...base, is_long_term: true })
    const liab421 = lines.find(l => l.account_code === '421')
    expect(liab421?.credit_try).toBe(100_000)
    expect(isBalanced(lines)).toBe(true)
  })

  it('sets source_type = "partner_loan"', () => {
    expect(JournalEntryService.buildPartnerLoanEntry(base).source_type).toBe('partner_loan')
  })
})

// ── buildPartnerRepaymentEntry ────────────────────────────────────────────────

describe('JournalEntryService.buildPartnerRepaymentEntry', () => {
  const base = {
    partner_transaction_id: 'ptx-002',
    tx_date:                '2025-04-15',
    amount_try:             25_000,
    partner_name:           'Ahmet Yılmaz',
    is_long_term:           false,
  }

  it('produces balanced DR = CR', () => {
    const { lines } = JournalEntryService.buildPartnerRepaymentEntry(base)
    expect(isBalanced(lines)).toBe(true)
  })

  it('DR 321 liability, CR 102 Bankalar (short-term)', () => {
    const { lines } = JournalEntryService.buildPartnerRepaymentEntry(base)
    const liab321 = lines.find(l => l.account_code === '321')
    const bank    = lines.find(l => l.account_code === '102')
    expect(liab321?.debit_try).toBe(25_000)
    expect(bank?.credit_try).toBe(25_000)
  })

  it('DR 421 liability for long-term repayment', () => {
    const { lines } = JournalEntryService.buildPartnerRepaymentEntry({ ...base, is_long_term: true })
    const liab421 = lines.find(l => l.account_code === '421')
    expect(liab421?.debit_try).toBe(25_000)
    expect(isBalanced(lines)).toBe(true)
  })

  it('sets source_type = "partner_repayment"', () => {
    expect(JournalEntryService.buildPartnerRepaymentEntry(base).source_type).toBe('partner_repayment')
  })

  it('loan entry and repayment entry are mirror images (DR↔CR swap)', () => {
    const loanLines = JournalEntryService.buildPartnerLoanEntry({ ...base, partner_transaction_id: 'ptx-loan' }).lines
    const repLines  = JournalEntryService.buildPartnerRepaymentEntry(base).lines

    // 102: loan DR → repayment CR
    const loanBank = loanLines.find(l => l.account_code === '102')!
    const repBank  = repLines.find(l => l.account_code === '102')!
    expect(loanBank.debit_try).toBe(repBank.credit_try)

    // 321: loan CR → repayment DR
    const loanLiab = loanLines.find(l => l.account_code === '321')!
    const repLiab  = repLines.find(l => l.account_code === '321')!
    expect(loanLiab.credit_try).toBe(repLiab.debit_try)
  })
})

// ── buildDividendDeclaredEntry ────────────────────────────────────────────────

describe('JournalEntryService.buildDividendDeclaredEntry', () => {
  const base = {
    source_id:       'div-001',
    declared_date:   '2025-05-01',
    gross_try:       50_000,
    withholding_try: 5_000,
    net_try:         45_000,
    partner_name:    'Mehmet Kaya',
  }

  it('produces balanced DR = CR', () => {
    const { lines } = JournalEntryService.buildDividendDeclaredEntry(base)
    expect(isBalanced(lines)).toBe(true)
  })

  it('DR 570 Retained Earnings = gross amount', () => {
    const { lines } = JournalEntryService.buildDividendDeclaredEntry(base)
    const retained = lines.find(l => l.account_code === '570')
    expect(retained?.debit_try).toBe(50_000)
  })

  it('CR 360 Tax Payable = withholding, CR 335 Partner Payable = net', () => {
    const { lines } = JournalEntryService.buildDividendDeclaredEntry(base)
    const tax     = lines.find(l => l.account_code === '360')
    const partner = lines.find(l => l.account_code === '335')
    expect(tax?.credit_try).toBe(5_000)
    expect(partner?.credit_try).toBe(45_000)
  })

  it('withholding + net = gross (tax math invariant)', () => {
    const { lines } = JournalEntryService.buildDividendDeclaredEntry(base)
    const tax     = lines.find(l => l.account_code === '360')!
    const partner = lines.find(l => l.account_code === '335')!
    expect((tax.credit_try ?? 0) + (partner.credit_try ?? 0)).toBe(50_000)
  })

  it('sets source_type = "dividend_declared"', () => {
    expect(JournalEntryService.buildDividendDeclaredEntry(base).source_type).toBe('dividend_declared')
  })

  it('handles zero withholding (tax-exempt scenario)', () => {
    const { lines } = JournalEntryService.buildDividendDeclaredEntry({
      ...base, withholding_try: 0, net_try: 50_000,
    })
    expect(isBalanced(lines)).toBe(true)
  })
})

// ── buildPeriodCloseEntry ─────────────────────────────────────────────────────

describe('JournalEntryService.buildPeriodCloseEntry', () => {
  it('produces balanced DR = CR (with legal reserve)', () => {
    const { lines } = JournalEntryService.buildPeriodCloseEntry({
      period_id:             'period-001',
      close_date:            '2025-03-31',
      period_profit_try:     200_000,
      legal_reserve_try:     10_000,
      retained_transfer_try: 190_000,
    })
    expect(isBalanced(lines)).toBe(true)
  })

  it('DR 590 = period_profit_try', () => {
    const { lines } = JournalEntryService.buildPeriodCloseEntry({
      period_id:             'period-001',
      close_date:            '2025-03-31',
      period_profit_try:     200_000,
      legal_reserve_try:     10_000,
      retained_transfer_try: 190_000,
    })
    const profit = lines.find(l => l.account_code === '590')
    expect(profit?.debit_try).toBe(200_000)
  })

  it('CR 570 retained + CR 542 legal reserve = period_profit', () => {
    const { lines } = JournalEntryService.buildPeriodCloseEntry({
      period_id:             'period-001',
      close_date:            '2025-03-31',
      period_profit_try:     200_000,
      legal_reserve_try:     10_000,
      retained_transfer_try: 190_000,
    })
    const retained = lines.find(l => l.account_code === '570')
    const legal    = lines.find(l => l.account_code === '542')
    expect(retained?.credit_try).toBe(190_000)
    expect(legal?.credit_try).toBe(10_000)
  })

  it('omits 542 line when legal_reserve_try = 0', () => {
    const { lines } = JournalEntryService.buildPeriodCloseEntry({
      period_id:             'period-001',
      close_date:            '2025-03-31',
      period_profit_try:     200_000,
      legal_reserve_try:     0,
      retained_transfer_try: 200_000,
    })
    const legal = lines.find(l => l.account_code === '542')
    expect(legal).toBeUndefined()
    expect(isBalanced(lines)).toBe(true)
  })

  it('legal_reserve + retained_transfer must equal period_profit', () => {
    const profit   = 300_000
    const reserve  = 15_000
    const retained = 285_000
    const { lines } = JournalEntryService.buildPeriodCloseEntry({
      period_id:             'period-002',
      close_date:            '2025-12-31',
      period_profit_try:     profit,
      legal_reserve_try:     reserve,
      retained_transfer_try: retained,
    })
    expect(reserve + retained).toBe(profit)
    expect(isBalanced(lines)).toBe(true)
  })

  it('sets source_type = "period_close"', () => {
    const entry = JournalEntryService.buildPeriodCloseEntry({
      period_id: 'p1', close_date: '2025-12-31',
      period_profit_try: 100_000, legal_reserve_try: 5_000, retained_transfer_try: 95_000,
    })
    expect(entry.source_type).toBe('period_close')
  })
})

// ── create() pre-flight balance check ────────────────────────────────────────

describe('JournalEntryService.create — pre-flight balance guard', () => {
  it('throws for unbalanced entry (DR ≠ CR)', async () => {
    const unbalancedParams: CreateJournalEntryParams = {
      company_id:  'company-001',
      source_type: 'test',
      entry_date:  '2025-03-01',
      description: 'Unbalanced test',
      lines: [
        { account_code: '102', account_name: 'Bankalar', debit_try: 1_000 },
        { account_code: '320', account_name: 'Satıcılar', credit_try: 900 }, // intentional mismatch
      ],
    }
    await expect(
      JournalEntryService.create(unbalancedParams, {} /* supabase not reached */),
    ).rejects.toThrow(/Unbalanced journal entry/)
  })

  it('throws and includes DR/CR amounts in error message', async () => {
    const params: CreateJournalEntryParams = {
      company_id:  'company-001',
      source_type: 'test',
      entry_date:  '2025-03-01',
      description: 'Unbalanced test',
      lines: [
        { account_code: '102', account_name: 'Bankalar', debit_try: 500 },
        { account_code: '320', account_name: 'Satıcılar', credit_try: 750 },
      ],
    }
    await expect(
      JournalEntryService.create(params, {}),
    ).rejects.toThrow(/DR=500/)
  })

  it('does not throw for perfectly balanced entry (proceeds to supabase.rpc)', async () => {
    const mockSupabase = {
      rpc: () => Promise.resolve({ data: 'entry-id-123', error: null }),
    }
    const params: CreateJournalEntryParams = {
      company_id:  'company-001',
      source_type: 'test',
      entry_date:  '2025-03-01',
      description: 'Balanced test',
      lines: [
        { account_code: '102', account_name: 'Bankalar', debit_try:  1_000 },
        { account_code: '320', account_name: 'Satıcılar', credit_try: 1_000 },
      ],
    }
    await expect(
      JournalEntryService.create(params, mockSupabase),
    ).resolves.toBe('entry-id-123')
  })

  it('throws when supabase.rpc returns error', async () => {
    const mockSupabase = {
      rpc: () => Promise.resolve({ data: null, error: { message: 'DB constraint violation' } }),
    }
    const params: CreateJournalEntryParams = {
      company_id:  'company-001',
      source_type: 'test',
      entry_date:  '2025-03-01',
      description: 'DB error test',
      lines: [
        { account_code: '102', account_name: 'Bankalar', debit_try:  500 },
        { account_code: '320', account_name: 'Satıcılar', credit_try: 500 },
      ],
    }
    await expect(
      JournalEntryService.create(params, mockSupabase),
    ).rejects.toThrow(/Journal entry creation failed/)
  })
})

// ── Reversal integrity ────────────────────────────────────────────────────────

describe('JournalEntryService — reversal DR↔CR swap', () => {
  it('reversal of a sale entry produces balanced lines with swapped DR/CR', async () => {
    const originalLines: JournalLine[] = [
      { account_code: '120', account_name: 'Alıcılar',        debit_try: 12_000 },
      { account_code: '600', account_name: 'Satışlar',        credit_try: 10_000 },
      { account_code: '391', account_name: 'Hesaplanan KDV',  credit_try: 2_000 },
    ]

    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({
              data: {
                id: 'orig-entry',
                journal_entry_lines: originalLines,
              },
              error: null,
            }),
          }),
        }),
      }),
      rpc: (_fn: string, args: Record<string, unknown>) => {
        // Capture the lines passed to RPC for assertion
        const lines = args.p_lines as JournalLine[]
        const totalDR = lines.reduce((s: number, l: JournalLine) => s + (l.debit_try  ?? 0), 0)
        const totalCR = lines.reduce((s: number, l: JournalLine) => s + (l.credit_try ?? 0), 0)
        expect(Math.abs(totalDR - totalCR)).toBeLessThan(0.01)
        return Promise.resolve({ data: 'reversal-entry-id', error: null })
      },
    }

    const result = await JournalEntryService.createReversal(
      'orig-entry',
      { company_id: 'c1', period_id: 'p1', entry_date: '2025-04-01', created_by: 'user-1' },
      mockSupabase,
    )
    expect(result).toBe('reversal-entry-id')
  })

  it('original DR becomes reversal CR (and vice versa)', async () => {
    const originalLines: JournalLine[] = [
      { account_code: '102', account_name: 'Bankalar',  debit_try:  5_000 },
      { account_code: '321', account_name: 'Ortak Borç', credit_try: 5_000 },
    ]

    let capturedLines: JournalLine[] = []
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({
              data: { id: 'orig', journal_entry_lines: originalLines },
              error: null,
            }),
          }),
        }),
      }),
      rpc: (_fn: string, args: Record<string, unknown>) => {
        capturedLines = args.p_lines as JournalLine[]
        return Promise.resolve({ data: 'rev-id', error: null })
      },
    }

    await JournalEntryService.createReversal(
      'orig',
      { company_id: 'c1', period_id: null, entry_date: '2025-04-01', created_by: null },
      mockSupabase,
    )

    // original 102: debit_try=5000, credit_try=undefined
    // create() maps via round2(x ?? 0) so undefined → 0 in RPC payload
    // reversal swaps → credit_try=5000, debit_try=0
    const bank = capturedLines.find((l: JournalLine) => l.account_code === '102')!
    expect(bank.credit_try).toBe(5_000)
    expect(bank.debit_try).toBe(0)

    // original 321: credit_try=5000 → reversal debit_try=5000, credit_try=0
    const liab = capturedLines.find((l: JournalLine) => l.account_code === '321')!
    expect(liab.debit_try).toBe(5_000)
    expect(liab.credit_try).toBe(0)
  })
})

// ── All build* methods: comprehensive balance sweep ──────────────────────────

describe('balance invariant sweep — all build* methods', () => {
  const cases: Array<[string, JournalLine[]]> = [
    ['buildSaleEntry', JournalEntryService.buildSaleEntry({
      id: 's1', sale_date: '2025-01-01', revenue_try: 5000, kdv_amount_try: 900, total_try: 5900,
    }).lines],
    ['buildSalePaymentEntry', JournalEntryService.buildSalePaymentEntry({
      sale_id: 's1', payment_date: '2025-01-05', amount_try: 5900,
    }).lines],
    ['buildExpenseEntry (bank)', JournalEntryService.buildExpenseEntry({
      id: 'e1', expense_date: '2025-01-02', expense_type: 'rent', amount_try: 3000,
      kdv_amount_try: 540, paid_from_bank: true,
    }).lines],
    ['buildExpenseEntry (payable)', JournalEntryService.buildExpenseEntry({
      id: 'e2', expense_date: '2025-01-02', expense_type: 'marketing', amount_try: 2000,
      kdv_amount_try: 360, paid_from_bank: false,
    }).lines],
    ['buildPurchaseEntry (bank)', JournalEntryService.buildPurchaseEntry({
      id: 'p1', received_date: '2025-01-03', cost_try: 10000, paid_from_bank: true,
    }).lines],
    ['buildPurchaseEntry (payable)', JournalEntryService.buildPurchaseEntry({
      id: 'p2', received_date: '2025-01-03', cost_try: 10000, paid_from_bank: false,
    }).lines],
    ['buildCogsEntry', JournalEntryService.buildCogsEntry({
      id: 's1', sale_date: '2025-01-04', cogs_try: 4000,
    }).lines],
    ['buildPartnerLoanEntry (short)', JournalEntryService.buildPartnerLoanEntry({
      partner_transaction_id: 'pt1', tx_date: '2025-01-10',
      amount_try: 200000, partner_name: 'Ali', is_long_term: false,
    }).lines],
    ['buildPartnerLoanEntry (long)', JournalEntryService.buildPartnerLoanEntry({
      partner_transaction_id: 'pt2', tx_date: '2025-01-10',
      amount_try: 200000, partner_name: 'Ali', is_long_term: true,
    }).lines],
    ['buildPartnerRepaymentEntry (short)', JournalEntryService.buildPartnerRepaymentEntry({
      partner_transaction_id: 'pt3', tx_date: '2025-02-01',
      amount_try: 50000, partner_name: 'Ali', is_long_term: false,
    }).lines],
    ['buildPartnerRepaymentEntry (long)', JournalEntryService.buildPartnerRepaymentEntry({
      partner_transaction_id: 'pt4', tx_date: '2025-02-01',
      amount_try: 50000, partner_name: 'Ali', is_long_term: true,
    }).lines],
    ['buildDividendDeclaredEntry', JournalEntryService.buildDividendDeclaredEntry({
      source_id: 'd1', declared_date: '2025-03-01',
      gross_try: 100000, withholding_try: 10000, net_try: 90000, partner_name: 'Ali',
    }).lines],
    ['buildPeriodCloseEntry (with reserve)', JournalEntryService.buildPeriodCloseEntry({
      period_id: 'per1', close_date: '2025-12-31',
      period_profit_try: 500000, legal_reserve_try: 25000, retained_transfer_try: 475000,
    }).lines],
    ['buildPeriodCloseEntry (no reserve)', JournalEntryService.buildPeriodCloseEntry({
      period_id: 'per2', close_date: '2025-12-31',
      period_profit_try: 500000, legal_reserve_try: 0, retained_transfer_try: 500000,
    }).lines],
  ]

  it.each(cases)('%s — Σ DR = Σ CR', (_name, lines) => {
    expect(isBalanced(lines)).toBe(true)
  })

  it.each(cases)('%s — all lines have exactly one of debit_try or credit_try', (_name, lines) => {
    for (const line of lines) {
      const hasDR = (line.debit_try ?? 0) > 0
      const hasCR = (line.credit_try ?? 0) > 0
      // A line should not have both DR and CR non-zero
      expect(hasDR && hasCR).toBe(false)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// NEW PURE FUNCTION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

// ── Helpers for pure-function tests ──────────────────────────────────────────

function sumDebits(entry: JournalEntry): number {
  return Math.round(entry.lines.reduce((s, l) => s + (l.debit_try ?? 0), 0) * 100) / 100
}
function sumCredits(entry: JournalEntry): number {
  return Math.round(entry.lines.reduce((s, l) => s + (l.credit_try ?? 0), 0) * 100) / 100
}
function isPureBalanced(entry: JournalEntry): boolean {
  return Math.abs(sumDebits(entry) - sumCredits(entry)) <= 0.01
}
function findPureLine(entry: JournalEntry, code: string): JournalLine | undefined {
  return entry.lines.find(l => l.account_code === code)
}

// ── ACCOUNT_CODES constants ───────────────────────────────────────────────────

describe('ACCOUNT_CODES', () => {
  it('P1. KASA is 100', () => {
    expect(ACCOUNT_CODES.KASA).toBe('100')
  })
  it('P2. BANKALAR is 102', () => {
    expect(ACCOUNT_CODES.BANKALAR).toBe('102')
  })
  it('P3. ALICILAR is 120', () => {
    expect(ACCOUNT_CODES.ALICILAR).toBe('120')
  })
  it('P4. HESAPLANAN_KDV is 391', () => {
    expect(ACCOUNT_CODES.HESAPLANAN_KDV).toBe('391')
  })
  it('P5. DONEM_NET_KARI is 590', () => {
    expect(ACCOUNT_CODES.DONEM_NET_KARI).toBe('590')
  })
  it('P6. FINANSMAN_GIDERLERI is 780', () => {
    expect(ACCOUNT_CODES.FINANSMAN_GIDERLERI).toBe('780')
  })
  it('P7. has all 24 required keys', () => {
    const requiredKeys = [
      'KASA', 'BANKALAR', 'ALICILAR', 'TICARI_MALLAR', 'INDIRILECEK_KDV',
      'SATICILAR', 'ORTAKLARA_BORCLAR_KISA', 'ORTAKLARA_BORCLAR_UZUN',
      'PERSONELE_BORCLAR', 'ODENECEK_VERGI', 'HESAPLANAN_KDV', 'SERMAYE',
      'YASAL_YEDEKLER', 'GECMIS_YIL_KARLARI', 'DONEM_NET_KARI',
      'YURT_ICI_SATISLAR', 'SATILAN_MALIN_MALIYETI', 'FINANSMAN_GIDERLERI',
      'PAZARLAMA_GIDERLERI', 'GENEL_YONETIM', 'MAAS_GIDERLERI',
      'KIRA_GIDERLERI', 'YAZILIM_GIDERLERI',
    ]
    for (const key of requiredKeys) {
      expect(ACCOUNT_CODES).toHaveProperty(key)
    }
  })
})

// ── buildDebitLine / buildCreditLine ──────────────────────────────────────────

describe('buildDebitLine / buildCreditLine (pure)', () => {
  it('P8. buildDebitLine sets debit_try, zeroes credit_try', () => {
    const line = buildDebitLine('120', 'Alıcılar', 1000)
    expect(line.debit_try).toBe(1000)
    expect(line.credit_try).toBe(0)
    expect(line.account_code).toBe('120')
  })
  it('P9. buildCreditLine sets credit_try, zeroes debit_try', () => {
    const line = buildCreditLine('391', 'Hesaplanan KDV', 200)
    expect(line.credit_try).toBe(200)
    expect(line.debit_try).toBe(0)
  })
  it('P10. buildDebitLine rounds to 2 decimals', () => {
    const line = buildDebitLine('102', 'Bankalar', 100.005)
    expect(line.debit_try).toBeCloseTo(100.01, 2)
  })
})

// ── validateJournalEntry ──────────────────────────────────────────────────────

describe('validateJournalEntry (pure)', () => {
  it('P11. returns true for balanced entry', () => {
    const entry: JournalEntry = {
      source_type: 'sale', source_id: 'ptest-1', entry_date: '2025-01-15',
      description: 'Test', reference: 'REF-1',
      lines: [buildDebitLine('120', 'Alıcılar', 1000), buildCreditLine('600', 'Satışlar', 1000)],
    }
    expect(validateJournalEntry(entry)).toBe(true)
  })
  it('P12. throws for imbalanced entry (DR > CR)', () => {
    const entry: JournalEntry = {
      source_type: 'sale', source_id: 'ptest-2', entry_date: '2025-01-15',
      description: 'Imbalanced', reference: 'R',
      lines: [buildDebitLine('120', 'Alıcılar', 1200), buildCreditLine('600', 'Satışlar', 1000)],
    }
    expect(() => validateJournalEntry(entry)).toThrow()
  })
  it('P13. throws for imbalanced entry (CR > DR)', () => {
    const entry: JournalEntry = {
      source_type: 'expense', source_id: 'ptest-3', entry_date: '2025-01-15',
      description: 'Imbalanced', reference: 'R',
      lines: [buildDebitLine('770', 'G&A', 500), buildCreditLine('320', 'Satıcılar', 700)],
    }
    expect(() => validateJournalEntry(entry)).toThrow()
  })
})

// ── computeNetFromGross ───────────────────────────────────────────────────────

describe('computeNetFromGross (pure)', () => {
  it('P14. 1200 at 20%: net=1000, kdv=200', () => {
    const { net, kdv } = computeNetFromGross(1200, 0.20)
    expect(net).toBeCloseTo(1000, 2)
    expect(kdv).toBeCloseTo(200, 2)
  })
  it('P15. net + kdv = gross', () => {
    const { net, kdv } = computeNetFromGross(5000, 0.10)
    expect(net + kdv).toBeCloseTo(5000, 2)
  })
  it('P16. zero rate: net=gross, kdv=0', () => {
    const { net, kdv } = computeNetFromGross(1000, 0)
    expect(net).toBe(1000)
    expect(kdv).toBe(0)
  })
  it('P17. 110 at 10%: net=100, kdv=10', () => {
    const { net, kdv } = computeNetFromGross(110, 0.10)
    expect(net).toBeCloseTo(100, 2)
    expect(kdv).toBeCloseTo(10, 2)
  })
})

// ── buildSaleJournal ──────────────────────────────────────────────────────────

describe('buildSaleJournal (pure)', () => {
  const entry = buildSaleJournal('sale-p01', 12000, 0.20, '2025-03-15', 'ABC Ltd')

  it('P18. source_type is sale', () => {
    expect(entry.source_type).toBe('sale')
  })
  it('P19. DR 120 = total_try (gross)', () => {
    expect(findPureLine(entry, '120')?.debit_try).toBeCloseTo(12000, 2)
  })
  it('P20. CR 600 = net (gross / 1.20)', () => {
    expect(findPureLine(entry, '600')?.credit_try).toBeCloseTo(10000, 2)
  })
  it('P21. CR 391 = kdv amount', () => {
    expect(findPureLine(entry, '391')?.credit_try).toBeCloseTo(2000, 2)
  })
  it('P22. balanced Σ debits = Σ credits', () => {
    expect(isPureBalanced(entry)).toBe(true)
  })
  it('P23. entry_date matches saleDate', () => {
    expect(entry.entry_date).toBe('2025-03-15')
  })
  it('P24. description includes customer name', () => {
    expect(entry.description).toContain('ABC Ltd')
  })
  it('P25. has 3 lines', () => {
    expect(entry.lines).toHaveLength(3)
  })
  it('P26. CR 600 + CR 391 = DR 120 (gross)', () => {
    const cr600 = findPureLine(entry, '600')?.credit_try ?? 0
    const cr391 = findPureLine(entry, '391')?.credit_try ?? 0
    expect(cr600 + cr391).toBeCloseTo(12000, 2)
  })
})

// ── buildPaymentReceivedJournal ───────────────────────────────────────────────

describe('buildPaymentReceivedJournal (pure)', () => {
  const entry = buildPaymentReceivedJournal('sale-p01', 12000, '2025-03-20', 'ABC Ltd')

  it('P27. DR 102 Bankalar = amountPaid', () => {
    expect(findPureLine(entry, '102')?.debit_try).toBe(12000)
  })
  it('P28. CR 120 Alıcılar = amountPaid', () => {
    expect(findPureLine(entry, '120')?.credit_try).toBe(12000)
  })
  it('P29. balanced', () => {
    expect(isPureBalanced(entry)).toBe(true)
  })
  it('P30. source_type is payment', () => {
    expect(entry.source_type).toBe('payment')
  })
})

// ── buildExpenseJournal ───────────────────────────────────────────────────────

describe('buildExpenseJournal (pure)', () => {
  it('P31. salary → DR 771 + CR 320, balanced', () => {
    const e = buildExpenseJournal('ep-001', 5000, 'salary', 0, '2025-03-01', 'Maaş')
    expect(findPureLine(e, '771')?.debit_try).toBe(5000)
    expect(findPureLine(e, '320')?.credit_try).toBe(5000)
    expect(isPureBalanced(e)).toBe(true)
  })
  it('P32. rent → DR 772', () => {
    const e = buildExpenseJournal('ep-002', 3000, 'rent', 0, '2025-03-01', 'Kira')
    expect(findPureLine(e, '772')?.debit_try).toBe(3000)
  })
  it('P33. software → DR 773', () => {
    const e = buildExpenseJournal('ep-003', 1000, 'software', 0, '2025-03-01', 'SW')
    expect(findPureLine(e, '773')?.debit_try).toBe(1000)
  })
  it('P34. marketing → DR 760', () => {
    const e = buildExpenseJournal('ep-004', 2000, 'marketing', 0, '2025-03-01', 'Reklam')
    expect(findPureLine(e, '760')?.debit_try).toBe(2000)
  })
  it('P35. unknown → DR 770 (default)', () => {
    const e = buildExpenseJournal('ep-005', 500, 'xyz_unknown', 0, '2025-03-01', 'Diğer')
    expect(findPureLine(e, '770')?.debit_try).toBe(500)
  })
  it('P36. kdvDeductible > 0 → DR 191 included', () => {
    const e = buildExpenseJournal('ep-006', 1000, 'software', 200, '2025-03-01', 'SW+KDV')
    expect(findPureLine(e, '191')?.debit_try).toBe(200)
    expect(findPureLine(e, '320')?.credit_try).toBe(1200)
    expect(isPureBalanced(e)).toBe(true)
  })
  it('P37. kdvDeductible = 0 → no 191 line', () => {
    const e = buildExpenseJournal('ep-007', 1000, 'general', 0, '2025-03-01', 'Genel')
    expect(findPureLine(e, '191')).toBeUndefined()
  })
})

// ── buildExpensePaidJournal ───────────────────────────────────────────────────

describe('buildExpensePaidJournal (pure)', () => {
  it('P38. DR 320 = CR 102 = amount, balanced', () => {
    const e = buildExpensePaidJournal('ep-p01', 3000, '2025-03-10')
    expect(findPureLine(e, '320')?.debit_try).toBe(3000)
    expect(findPureLine(e, '102')?.credit_try).toBe(3000)
    expect(isPureBalanced(e)).toBe(true)
  })
})

// ── buildPartnerLoanDisbursementJournal ───────────────────────────────────────

describe('buildPartnerLoanDisbursementJournal (pure)', () => {
  it('P39. short-term: DR 102, CR 321', () => {
    const e = buildPartnerLoanDisbursementJournal('t-001', 100000, '2025-01-01', 'Ali Bey', false)
    expect(findPureLine(e, '102')?.debit_try).toBe(100000)
    expect(findPureLine(e, '321')?.credit_try).toBe(100000)
    expect(isPureBalanced(e)).toBe(true)
  })
  it('P40. long-term: DR 102, CR 421 (not 321)', () => {
    const e = buildPartnerLoanDisbursementJournal('t-002', 200000, '2025-01-01', 'Veli', true)
    expect(findPureLine(e, '421')?.credit_try).toBe(200000)
    expect(findPureLine(e, '321')).toBeUndefined()
    expect(isPureBalanced(e)).toBe(true)
  })
  it('P41. description includes partner name', () => {
    const e = buildPartnerLoanDisbursementJournal('t-003', 50000, '2025-02-01', 'Fatma Hanım', false)
    expect(e.description).toContain('Fatma Hanım')
  })
})

// ── buildPartnerLoanRepaymentJournal ──────────────────────────────────────────

describe('buildPartnerLoanRepaymentJournal (pure)', () => {
  it('P42. DR 321, CR 102, balanced', () => {
    const e = buildPartnerLoanRepaymentJournal('t-001', 25000, '2025-06-01', 'Ali Bey')
    expect(findPureLine(e, '321')?.debit_try).toBe(25000)
    expect(findPureLine(e, '102')?.credit_try).toBe(25000)
    expect(isPureBalanced(e)).toBe(true)
  })
  it('P43. description includes partner name', () => {
    const e = buildPartnerLoanRepaymentJournal('t-001', 25000, '2025-06-01', 'Zeynep')
    expect(e.description).toContain('Zeynep')
  })
})

// ── buildInterestAccrualJournal ───────────────────────────────────────────────

describe('buildInterestAccrualJournal (pure)', () => {
  it('P44. DR 780 Finansman Giderleri', () => {
    const e = buildInterestAccrualJournal('t-001', 1500, '2025-04-30', 'Ali Bey')
    expect(findPureLine(e, '780')?.debit_try).toBe(1500)
  })
  it('P45. CR 321 Ortaklara Borçlar', () => {
    const e = buildInterestAccrualJournal('t-001', 1500, '2025-04-30', 'Ali Bey')
    expect(findPureLine(e, '321')?.credit_try).toBe(1500)
  })
  it('P46. balanced', () => {
    const e = buildInterestAccrualJournal('t-002', 750, '2025-05-31', 'Veli')
    expect(isPureBalanced(e)).toBe(true)
  })
  it('P47. description includes partner name', () => {
    const e = buildInterestAccrualJournal('t-003', 500, '2025-05-31', 'Ortak A.Ş.')
    expect(e.description).toContain('Ortak A.Ş.')
  })
})

// ── buildPeriodCloseJournal ───────────────────────────────────────────────────

describe('buildPeriodCloseJournal (pure)', () => {
  const entry = buildPeriodCloseJournal('period-2024', 100000, 5000, '2024-12-31')

  it('P48. DR 590 Dönem Net Kârı = netProfit', () => {
    expect(findPureLine(entry, '590')?.debit_try).toBe(100000)
  })
  it('P49. CR 542 Yasal Yedekler = legalReserve', () => {
    expect(findPureLine(entry, '542')?.credit_try).toBe(5000)
  })
  it('P50. CR 570 Geçmiş Yıl = netProfit - legalReserve', () => {
    expect(findPureLine(entry, '570')?.credit_try).toBe(95000)
  })
  it('P51. balanced Σ debits = Σ credits', () => {
    expect(isPureBalanced(entry)).toBe(true)
  })
  it('P52. source_type is period_close', () => {
    expect(entry.source_type).toBe('period_close')
  })
  it('P53. zero legalReserve: all profit to 570', () => {
    const e2 = buildPeriodCloseJournal('period-2023', 50000, 0, '2023-12-31')
    expect(findPureLine(e2, '570')?.credit_try).toBe(50000)
    expect(isPureBalanced(e2)).toBe(true)
  })
  it('P54. CR 542 + CR 570 = DR 590 (sum check)', () => {
    const cr542 = findPureLine(entry, '542')?.credit_try ?? 0
    const cr570 = findPureLine(entry, '570')?.credit_try ?? 0
    expect(cr542 + cr570).toBeCloseTo(100000, 2)
  })
})

// ── mapExpenseTypeToAccount ───────────────────────────────────────────────────

describe('mapExpenseTypeToAccount (pure)', () => {
  it('P55. salary → 771', () => expect(mapExpenseTypeToAccount('salary').code).toBe('771'))
  it('P56. maas → 771 (Turkish)', () => expect(mapExpenseTypeToAccount('maas').code).toBe('771'))
  it('P57. rent → 772', () => expect(mapExpenseTypeToAccount('rent').code).toBe('772'))
  it('P58. kira → 772 (Turkish)', () => expect(mapExpenseTypeToAccount('kira').code).toBe('772'))
  it('P59. software → 773', () => expect(mapExpenseTypeToAccount('software').code).toBe('773'))
  it('P60. marketing → 760', () => expect(mapExpenseTypeToAccount('marketing').code).toBe('760'))
  it('P61. logistics → 760', () => expect(mapExpenseTypeToAccount('logistics').code).toBe('760'))
  it('P62. lojistik → 760 (Turkish)', () => expect(mapExpenseTypeToAccount('lojistik').code).toBe('760'))
  it('P63. general → 770', () => expect(mapExpenseTypeToAccount('general').code).toBe('770'))
  it('P64. utilities → 770', () => expect(mapExpenseTypeToAccount('utilities').code).toBe('770'))
  it('P65. operational → 770', () => expect(mapExpenseTypeToAccount('operational').code).toBe('770'))
  it('P66. partner_loan_interest → 780', () => expect(mapExpenseTypeToAccount('partner_loan_interest').code).toBe('780'))
  it('P67. unknown → 770 (default)', () => expect(mapExpenseTypeToAccount('xyz_unknown').code).toBe('770'))
  it('P68. null → 770 (default)', () => expect(mapExpenseTypeToAccount(null).code).toBe('770'))
  it('P69. returns non-empty account name', () => {
    const r = mapExpenseTypeToAccount('salary')
    expect(r.name).toBeTruthy()
    expect(typeof r.name).toBe('string')
  })
})

// ── canMergeEntries ───────────────────────────────────────────────────────────

describe('canMergeEntries (pure)', () => {
  it('P70. two complementary entries can merge', () => {
    const e1: JournalEntry = {
      source_type: 'sale', source_id: 'a', entry_date: '2025-01-01',
      description: 'A', reference: 'A',
      lines: [buildDebitLine('120', 'Alıcılar', 1200)],
    }
    const e2: JournalEntry = {
      source_type: 'sale', source_id: 'b', entry_date: '2025-01-01',
      description: 'B', reference: 'B',
      lines: [buildCreditLine('600', 'Satışlar', 1000), buildCreditLine('391', 'KDV', 200)],
    }
    expect(canMergeEntries(e1, e2)).toBe(true)
  })
  it('P71. two already-balanced same-size entries also balance when merged', () => {
    const e1 = buildPaymentReceivedJournal('s1', 1000, '2025-01-01', 'X')
    const e2 = buildPaymentReceivedJournal('s2', 1000, '2025-01-01', 'Y')
    expect(canMergeEntries(e1, e2)).toBe(true)
  })
})

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('edge cases (pure)', () => {
  it('P72. buildSaleJournal small amount still balances', () => {
    const e = buildSaleJournal('tiny', 1.20, 0.20, '2025-01-01', 'T')
    expect(isPureBalanced(e)).toBe(true)
  })
  it('P73. buildExpenseJournal partner_loan_interest → 780', () => {
    const e = buildExpenseJournal('e-int', 500, 'partner_loan_interest', 0, '2025-01-31', 'Faiz')
    expect(findPureLine(e, '780')?.debit_try).toBe(500)
    expect(isPureBalanced(e)).toBe(true)
  })
  it('P74. buildPeriodCloseJournal has all 3 account codes', () => {
    const e = buildPeriodCloseJournal('p1', 200000, 10000, '2025-12-31')
    expect(e.lines.map(l => l.account_code)).toContain('590')
    expect(e.lines.map(l => l.account_code)).toContain('542')
    expect(e.lines.map(l => l.account_code)).toContain('570')
  })
  it('P75. buildSaleJournal preserves source_id', () => {
    const e = buildSaleJournal('my-id', 6000, 0.20, '2025-06-01', 'C')
    expect(e.source_id).toBe('my-id')
  })
})

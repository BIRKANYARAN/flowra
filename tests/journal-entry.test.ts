/**
 * Tests for lib/services/ledger/journal-entry.service.ts
 * Verifies double-entry balance invariant: Σ DR = Σ CR for all build* methods.
 * Run with: npx vitest run tests/journal-entry.test.ts
 */
import { describe, it, expect } from 'vitest'
import { JournalEntryService, type JournalLine, type CreateJournalEntryParams } from '../lib/services/ledger/journal-entry.service'

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

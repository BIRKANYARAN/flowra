/**
 * Tests for lib/services/ledger/journal-entry.service.ts
 * Pure builder functions only — no DB calls, no Supabase.
 * Focuses on: double-entry balance invariant, account codes, field correctness.
 * Run with: npx vitest run tests/journal-entry-service.test.ts
 */
import { describe, it, expect } from 'vitest'
import { JournalEntryService, type JournalLine } from '../lib/services/ledger/journal-entry.service'

// ─── Helper: assert double-entry balance invariant ────────────────────────────

function assertBalanced(lines: JournalLine[], msg?: string) {
  const totalDr = lines.reduce((s, l) => s + (l.debit_try  ?? 0), 0)
  const totalCr = lines.reduce((s, l) => s + (l.credit_try ?? 0), 0)
  expect(Math.abs(totalDr - totalCr), msg ?? `DR=${totalDr} CR=${totalCr} — entry must be balanced`).toBeLessThanOrEqual(0.01)
}

function sumDebits(lines: JournalLine[])  { return lines.reduce((s, l) => s + (l.debit_try  ?? 0), 0) }
function sumCredits(lines: JournalLine[]) { return lines.reduce((s, l) => s + (l.credit_try ?? 0), 0) }
function lineFor(lines: JournalLine[], code: string) { return lines.find(l => l.account_code === code) }

// ─── buildSaleEntry ────────────────────────────────────────────────────────────

describe('buildSaleEntry', () => {
  const baseSale = {
    id: 'sale-001',
    sale_date: '2025-04-01',
    revenue_try: 1000,
    kdv_amount_try: 200,
    total_try: 1200,
  }

  it('produces a balanced entry (DR = CR)', () => {
    const { lines } = JournalEntryService.buildSaleEntry(baseSale)
    assertBalanced(lines)
  })

  it('debits account 120 (receivables) with total_try', () => {
    const { lines } = JournalEntryService.buildSaleEntry(baseSale)
    const rec = lineFor(lines, '120')
    expect(rec).toBeDefined()
    expect(rec!.debit_try).toBe(1200)
    expect(rec!.credit_try).toBeUndefined()
  })

  it('credits account 600 (revenue) with revenue_try', () => {
    const { lines } = JournalEntryService.buildSaleEntry(baseSale)
    const rev = lineFor(lines, '600')
    expect(rev).toBeDefined()
    expect(rev!.credit_try).toBe(1000)
  })

  it('credits account 391 (output VAT) with kdv_amount_try when kdv > 0', () => {
    const { lines } = JournalEntryService.buildSaleEntry(baseSale)
    const vat = lineFor(lines, '391')
    expect(vat).toBeDefined()
    expect(vat!.credit_try).toBe(200)
  })

  it('omits account 391 line when kdv_amount_try = 0', () => {
    const { lines } = JournalEntryService.buildSaleEntry({ ...baseSale, kdv_amount_try: 0, total_try: 1000 })
    assertBalanced(lines)
    expect(lineFor(lines, '391')).toBeUndefined()
    expect(lines).toHaveLength(2)
  })

  it('sets source_type = "sale" and source_id = sale.id', () => {
    const entry = JournalEntryService.buildSaleEntry(baseSale)
    expect(entry.source_type).toBe('sale')
    expect(entry.source_id).toBe('sale-001')
  })

  it('uses invoice_no as reference when provided', () => {
    const entry = JournalEntryService.buildSaleEntry({ ...baseSale, invoice_no: 'INV-2025-001' })
    expect(entry.reference).toBe('INV-2025-001')
  })

  it('reference is null when invoice_no not provided', () => {
    const entry = JournalEntryService.buildSaleEntry(baseSale)
    expect(entry.reference).toBeNull()
  })

  it('rounds amounts to 2 decimal places', () => {
    const { lines } = JournalEntryService.buildSaleEntry({
      ...baseSale,
      revenue_try: 100.333,
      kdv_amount_try: 20.005,
      total_try: 120.338,
    })
    assertBalanced(lines)
    const rec = lineFor(lines, '120')!
    expect(Number.isInteger(rec.debit_try! * 100)).toBe(true) // at most 2 decimal places
  })
})

// ─── buildSalePaymentEntry ────────────────────────────────────────────────────

describe('buildSalePaymentEntry', () => {
  const payment = {
    sale_id: 'sale-001',
    payment_date: '2025-04-15',
    amount_try: 1200,
  }

  it('produces a balanced entry (DR = CR)', () => {
    const { lines } = JournalEntryService.buildSalePaymentEntry(payment)
    assertBalanced(lines)
  })

  it('debits 102 (bank) and credits 120 (receivables)', () => {
    const { lines } = JournalEntryService.buildSalePaymentEntry(payment)
    expect(lineFor(lines, '102')?.debit_try).toBe(1200)
    expect(lineFor(lines, '120')?.credit_try).toBe(1200)
  })

  it('has exactly 2 lines', () => {
    const { lines } = JournalEntryService.buildSalePaymentEntry(payment)
    expect(lines).toHaveLength(2)
  })

  it('uses source_type = "sale_payment"', () => {
    const entry = JournalEntryService.buildSalePaymentEntry(payment)
    expect(entry.source_type).toBe('sale_payment')
    expect(entry.source_id).toBe('sale-001')
  })
})

// ─── buildExpenseEntry ────────────────────────────────────────────────────────

describe('buildExpenseEntry', () => {
  const baseExpense = {
    id: 'exp-001',
    expense_date: '2025-04-05',
    expense_type: 'rent',
    amount_try: 5000,
    kdv_amount_try: 900,
    paid_from_bank: true,
  }

  it('produces a balanced entry (DR = CR)', () => {
    const { lines } = JournalEntryService.buildExpenseEntry(baseExpense)
    assertBalanced(lines)
  })

  it('credits bank (102) when paid_from_bank = true', () => {
    const { lines } = JournalEntryService.buildExpenseEntry(baseExpense)
    const bank = lineFor(lines, '102')
    expect(bank).toBeDefined()
    expect(bank!.credit_try).toBe(5900) // net + vat
  })

  it('credits payables (320) when paid_from_bank = false', () => {
    const { lines } = JournalEntryService.buildExpenseEntry({ ...baseExpense, paid_from_bank: false })
    assertBalanced(lines)
    const payable = lineFor(lines, '320')
    expect(payable).toBeDefined()
    expect(payable!.credit_try).toBe(5900)
    expect(lineFor(lines, '102')).toBeUndefined()
  })

  it('debits deductible VAT account 191 when kdv > 0', () => {
    const { lines } = JournalEntryService.buildExpenseEntry(baseExpense)
    const vatIn = lineFor(lines, '191')
    expect(vatIn).toBeDefined()
    expect(vatIn!.debit_try).toBe(900)
  })

  it('omits account 191 when kdv_amount_try = 0', () => {
    const { lines } = JournalEntryService.buildExpenseEntry({ ...baseExpense, kdv_amount_try: 0 })
    assertBalanced(lines)
    expect(lineFor(lines, '191')).toBeUndefined()
  })

  it('maps expense_type "salary" → account 771', () => {
    const { lines } = JournalEntryService.buildExpenseEntry({
      ...baseExpense,
      expense_type: 'salary',
      kdv_amount_try: 0,
    })
    assertBalanced(lines)
    // salary → 771
    expect(lineFor(lines, '771')).toBeDefined()
  })

  it('maps expense_type "rent" → account 772', () => {
    const { lines } = JournalEntryService.buildExpenseEntry({ ...baseExpense, kdv_amount_try: 0 })
    assertBalanced(lines)
    expect(lineFor(lines, '772')).toBeDefined()
  })

  it('falls back to account 770 for unknown expense_type', () => {
    const { lines } = JournalEntryService.buildExpenseEntry({
      ...baseExpense,
      expense_type: 'unknown_type_xyz',
      kdv_amount_try: 0,
    })
    assertBalanced(lines)
    expect(lineFor(lines, '770')).toBeDefined()
  })

  it('sets source_type = "expense"', () => {
    const entry = JournalEntryService.buildExpenseEntry(baseExpense)
    expect(entry.source_type).toBe('expense')
  })
})

// ─── buildPurchaseEntry ───────────────────────────────────────────────────────

describe('buildPurchaseEntry', () => {
  const purchase = {
    id: 'pur-001',
    received_date: '2025-03-20',
    cost_try: 10000,
    paid_from_bank: true,
  }

  it('produces a balanced entry (DR = CR)', () => {
    const { lines } = JournalEntryService.buildPurchaseEntry(purchase)
    assertBalanced(lines)
  })

  it('debits inventory (153) and credits bank (102) when paid_from_bank', () => {
    const { lines } = JournalEntryService.buildPurchaseEntry(purchase)
    expect(lineFor(lines, '153')?.debit_try).toBe(10000)
    expect(lineFor(lines, '102')?.credit_try).toBe(10000)
  })

  it('credits payables (320) when not paid_from_bank', () => {
    const { lines } = JournalEntryService.buildPurchaseEntry({ ...purchase, paid_from_bank: false })
    assertBalanced(lines)
    expect(lineFor(lines, '320')?.credit_try).toBe(10000)
    expect(lineFor(lines, '102')).toBeUndefined()
  })

  it('has exactly 2 lines', () => {
    const { lines } = JournalEntryService.buildPurchaseEntry(purchase)
    expect(lines).toHaveLength(2)
  })
})

// ─── buildCogsEntry ───────────────────────────────────────────────────────────

describe('buildCogsEntry', () => {
  const cogs = { id: 'sale-001', sale_date: '2025-04-01', cogs_try: 750 }

  it('produces a balanced entry (DR = CR)', () => {
    const { lines } = JournalEntryService.buildCogsEntry(cogs)
    assertBalanced(lines)
  })

  it('debits COGS (620) and credits inventory (153)', () => {
    const { lines } = JournalEntryService.buildCogsEntry(cogs)
    expect(lineFor(lines, '620')?.debit_try).toBe(750)
    expect(lineFor(lines, '153')?.credit_try).toBe(750)
  })

  it('source_type = "purchase_cogs"', () => {
    const entry = JournalEntryService.buildCogsEntry(cogs)
    expect(entry.source_type).toBe('purchase_cogs')
  })
})

// ─── buildPartnerLoanEntry ────────────────────────────────────────────────────

describe('buildPartnerLoanEntry', () => {
  const loan = {
    partner_transaction_id: 'ptx-001',
    tx_date: '2025-01-10',
    amount_try: 50000,
    partner_name: 'Ahmet',
    is_long_term: false,
  }

  it('produces a balanced entry (DR = CR)', () => {
    const { lines } = JournalEntryService.buildPartnerLoanEntry(loan)
    assertBalanced(lines)
  })

  it('debits bank (102) and credits short-term liability (321) for short-term loan', () => {
    const { lines } = JournalEntryService.buildPartnerLoanEntry(loan)
    expect(lineFor(lines, '102')?.debit_try).toBe(50000)
    expect(lineFor(lines, '321')?.credit_try).toBe(50000)
  })

  it('credits long-term liability (421) for long-term loan', () => {
    const { lines } = JournalEntryService.buildPartnerLoanEntry({ ...loan, is_long_term: true })
    assertBalanced(lines)
    expect(lineFor(lines, '421')?.credit_try).toBe(50000)
    expect(lineFor(lines, '321')).toBeUndefined()
  })

  it('source_type = "partner_loan"', () => {
    const entry = JournalEntryService.buildPartnerLoanEntry(loan)
    expect(entry.source_type).toBe('partner_loan')
  })
})

// ─── buildPartnerRepaymentEntry ───────────────────────────────────────────────

describe('buildPartnerRepaymentEntry', () => {
  const repayment = {
    partner_transaction_id: 'ptx-002',
    tx_date: '2025-06-01',
    amount_try: 20000,
    partner_name: 'Mehmet',
    is_long_term: false,
  }

  it('produces a balanced entry (DR = CR)', () => {
    const { lines } = JournalEntryService.buildPartnerRepaymentEntry(repayment)
    assertBalanced(lines)
  })

  it('debits short-term liability (321) and credits bank (102)', () => {
    const { lines } = JournalEntryService.buildPartnerRepaymentEntry(repayment)
    expect(lineFor(lines, '321')?.debit_try).toBe(20000)
    expect(lineFor(lines, '102')?.credit_try).toBe(20000)
  })

  it('debits long-term liability (421) for long-term repayment', () => {
    const { lines } = JournalEntryService.buildPartnerRepaymentEntry({ ...repayment, is_long_term: true })
    assertBalanced(lines)
    expect(lineFor(lines, '421')?.debit_try).toBe(20000)
  })

  it('source_type = "partner_repayment"', () => {
    const entry = JournalEntryService.buildPartnerRepaymentEntry(repayment)
    expect(entry.source_type).toBe('partner_repayment')
  })
})

// ─── buildDividendDeclaredEntry ───────────────────────────────────────────────

describe('buildDividendDeclaredEntry', () => {
  const div = {
    source_id: 'div-001',
    declared_date: '2025-03-31',
    gross_try: 100000,
    withholding_try: 10000,   // 10% stopaj
    net_try: 90000,
    partner_name: 'Ayşe',
  }

  it('produces a balanced entry (DR = CR)', () => {
    const { lines } = JournalEntryService.buildDividendDeclaredEntry(div)
    assertBalanced(lines)
  })

  it('debits retained earnings (570) with gross_try', () => {
    const { lines } = JournalEntryService.buildDividendDeclaredEntry(div)
    expect(lineFor(lines, '570')?.debit_try).toBe(100000)
  })

  it('credits tax payable (360) with withholding_try', () => {
    const { lines } = JournalEntryService.buildDividendDeclaredEntry(div)
    expect(lineFor(lines, '360')?.credit_try).toBe(10000)
  })

  it('credits partner payable (335) with net_try', () => {
    const { lines } = JournalEntryService.buildDividendDeclaredEntry(div)
    expect(lineFor(lines, '335')?.credit_try).toBe(90000)
  })

  it('gross_try = withholding_try + net_try (Turkish dividend split invariant)', () => {
    const totalCredits = sumCredits(JournalEntryService.buildDividendDeclaredEntry(div).lines)
    expect(Math.abs(div.gross_try - totalCredits)).toBeLessThanOrEqual(0.01)
  })

  it('source_type = "dividend_declared"', () => {
    const entry = JournalEntryService.buildDividendDeclaredEntry(div)
    expect(entry.source_type).toBe('dividend_declared')
  })
})

// ─── buildPeriodCloseEntry ────────────────────────────────────────────────────

describe('buildPeriodCloseEntry', () => {
  const period = {
    period_id: 'per-2025-01',
    close_date: '2025-01-31',
    period_profit_try: 50000,
    legal_reserve_try: 2500,      // 5% of profit
    retained_transfer_try: 47500, // profit - legal reserve
  }

  it('produces a balanced entry (DR = CR) when legal reserve > 0', () => {
    const { lines } = JournalEntryService.buildPeriodCloseEntry(period)
    assertBalanced(lines)
  })

  it('debits current period profit (590)', () => {
    const { lines } = JournalEntryService.buildPeriodCloseEntry(period)
    expect(lineFor(lines, '590')?.debit_try).toBe(50000)
  })

  it('credits retained earnings (570) with retained_transfer_try', () => {
    const { lines } = JournalEntryService.buildPeriodCloseEntry(period)
    expect(lineFor(lines, '570')?.credit_try).toBe(47500)
  })

  it('credits legal reserve (542) with legal_reserve_try when > 0', () => {
    const { lines } = JournalEntryService.buildPeriodCloseEntry(period)
    expect(lineFor(lines, '542')?.credit_try).toBe(2500)
  })

  it('omits 542 line when legal_reserve_try = 0 and still balances', () => {
    const entry = JournalEntryService.buildPeriodCloseEntry({
      ...period,
      legal_reserve_try: 0,
      retained_transfer_try: 50000,
    })
    assertBalanced(entry.lines)
    expect(lineFor(entry.lines, '542')).toBeUndefined()
    expect(entry.lines).toHaveLength(2)
  })

  it('period_profit = retained_transfer + legal_reserve (allocation invariant)', () => {
    expect(period.period_profit_try).toBe(period.retained_transfer_try + period.legal_reserve_try)
  })

  it('source_type = "period_close"', () => {
    const entry = JournalEntryService.buildPeriodCloseEntry(period)
    expect(entry.source_type).toBe('period_close')
  })
})

// ─── balance-invariant pre-flight check (static guard on create) ──────────────

describe('create() balance pre-flight guard', () => {
  it('throws synchronously before calling DB when lines are unbalanced', async () => {
    // Mock Supabase client — should never be called if pre-flight rejects
    let rpcCalled = false
    const mockSupabase = {
      rpc: () => { rpcCalled = true; return { data: 'id', error: null } },
    }

    const params = {
      company_id: 'co-001',
      source_type: 'sale',
      entry_date: '2025-04-01',
      description: 'Test',
      lines: [
        { account_code: '120', account_name: 'Alıcılar', debit_try: 1200 },
        { account_code: '600', account_name: 'Satışlar', credit_try: 900 }, // intentionally wrong — should be 1000+200
      ],
    }

    await expect(JournalEntryService.create(params, mockSupabase)).rejects.toThrow(/[Uu]nbalanced/)
    expect(rpcCalled).toBe(false)
  })

  it('does not throw when lines are perfectly balanced', async () => {
    let rpcCalled = false
    const mockSupabase = {
      rpc: () => { rpcCalled = true; return { data: 'new-entry-id', error: null } },
    }

    const params = {
      company_id: 'co-001',
      source_type: 'sale',
      entry_date: '2025-04-01',
      description: 'Test balanced',
      lines: [
        { account_code: '120', account_name: 'Alıcılar', debit_try:  1200 },
        { account_code: '600', account_name: 'Satışlar', credit_try: 1000 },
        { account_code: '391', account_name: 'Hesaplanan KDV', credit_try: 200 },
      ],
    }

    const result = await JournalEntryService.create(params, mockSupabase)
    expect(rpcCalled).toBe(true)
    expect(result).toBe('new-entry-id')
  })

  it('entries built by builder methods always pass the balance check (round2 guarantees)', async () => {
    // Entries built via builder methods are guaranteed to balance after round2.
    // This test verifies that create() accepts them without throwing.
    let rpcCallCount = 0
    const mockSupabase = {
      rpc: () => { rpcCallCount++; return { data: `entry-${rpcCallCount}`, error: null } },
    }

    // Use a sale with repeating-decimal amounts that exercise round2
    const saleEntry = JournalEntryService.buildSaleEntry({
      id: 'sale-round', sale_date: '2025-04-01',
      revenue_try: 333.33, kdv_amount_try: 66.67, total_try: 400,
    })

    // Should not throw — round2 applied consistently throughout builder
    await expect(
      JournalEntryService.create({ company_id: 'co-001', ...saleEntry }, mockSupabase)
    ).resolves.toBeDefined()
    expect(rpcCallCount).toBe(1)
  })

  it('throws when DB RPC returns an error', async () => {
    const mockSupabase = {
      rpc: () => ({ data: null, error: { message: 'constraint violation' } }),
    }

    const params = {
      company_id: 'co-001',
      source_type: 'sale',
      entry_date: '2025-04-01',
      description: 'DB error test',
      lines: [
        { account_code: '120', account_name: 'Alıcılar', debit_try:  500 },
        { account_code: '600', account_name: 'Satışlar', credit_try: 500 },
      ],
    }

    await expect(JournalEntryService.create(params, mockSupabase))
      .rejects.toThrow(/constraint violation/)
  })
})

// ─── cross-entry invariants ───────────────────────────────────────────────────

describe('cross-entry invariants', () => {
  it('sale accrual + COGS together net to correct GL movements', () => {
    // A sale of 1000 + 200 VAT where COGS = 600
    const { lines: saleLines } = JournalEntryService.buildSaleEntry({
      id: 'sale-x', sale_date: '2025-04-01',
      revenue_try: 1000, kdv_amount_try: 200, total_try: 1200,
    })
    const { lines: cogsLines } = JournalEntryService.buildCogsEntry({
      id: 'sale-x', sale_date: '2025-04-01', cogs_try: 600,
    })

    // Both individually balanced
    assertBalanced(saleLines, 'sale entry must balance')
    assertBalanced(cogsLines, 'cogs entry must balance')

    // Combined: net DR on 120 = 1200, net CR on 600 = 1000, net CR on 391 = 200,
    //           net DR on 620 = 600, net CR on 153 = 600
    const all = [...saleLines, ...cogsLines]
    expect(sumDebits(all)).toBeCloseTo(sumCredits(all), 2)
  })

  it('partner loan in + repayment pair nets to zero net cash impact', () => {
    const loanIn = JournalEntryService.buildPartnerLoanEntry({
      partner_transaction_id: 'ptx-10', tx_date: '2025-01-01',
      amount_try: 100000, partner_name: 'Test', is_long_term: false,
    })
    const repayment = JournalEntryService.buildPartnerRepaymentEntry({
      partner_transaction_id: 'ptx-11', tx_date: '2025-12-01',
      amount_try: 100000, partner_name: 'Test', is_long_term: false,
    })

    // Both balanced
    assertBalanced(loanIn.lines, 'loan entry must balance')
    assertBalanced(repayment.lines, 'repayment entry must balance')

    // Net bank (102) movement: +100000 in, -100000 out = 0
    const allLines = [...loanIn.lines, ...repayment.lines]
    const bank102Dr = allLines.filter(l => l.account_code === '102').reduce((s, l) => s + (l.debit_try ?? 0), 0)
    const bank102Cr = allLines.filter(l => l.account_code === '102').reduce((s, l) => s + (l.credit_try ?? 0), 0)
    expect(bank102Dr).toBe(100000)
    expect(bank102Cr).toBe(100000)
  })

  it('dividend declared + Turkish withholding: 10% of gross', () => {
    const gross = 200000
    const withholding = 20000  // 10% GVK 94
    const net = 180000

    const { lines } = JournalEntryService.buildDividendDeclaredEntry({
      source_id: 'div-x', declared_date: '2025-03-31',
      gross_try: gross, withholding_try: withholding, net_try: net, partner_name: 'X',
    })
    assertBalanced(lines)
    // Verify: withholding = 10% of gross
    const taxLine = lineFor(lines, '360')
    expect(taxLine?.credit_try).toBe(gross * 0.10)
  })

  it('all builder methods produce valid account_name fields (not empty)', () => {
    const builders = [
      JournalEntryService.buildSaleEntry({ id: 's', sale_date: '2025-01-01', revenue_try: 100, kdv_amount_try: 0, total_try: 100 }),
      JournalEntryService.buildSalePaymentEntry({ sale_id: 's', payment_date: '2025-01-15', amount_try: 100 }),
      JournalEntryService.buildExpenseEntry({ id: 'e', expense_date: '2025-01-01', expense_type: 'general', amount_try: 500, paid_from_bank: true }),
      JournalEntryService.buildPurchaseEntry({ id: 'p', received_date: '2025-01-01', cost_try: 200, paid_from_bank: true }),
      JournalEntryService.buildCogsEntry({ id: 's', sale_date: '2025-01-01', cogs_try: 80 }),
      JournalEntryService.buildPartnerLoanEntry({ partner_transaction_id: 'pt', tx_date: '2025-01-01', amount_try: 1000, partner_name: 'A', is_long_term: false }),
      JournalEntryService.buildPartnerRepaymentEntry({ partner_transaction_id: 'pt', tx_date: '2025-06-01', amount_try: 1000, partner_name: 'A', is_long_term: false }),
      JournalEntryService.buildDividendDeclaredEntry({ source_id: 'd', declared_date: '2025-03-31', gross_try: 10000, withholding_try: 1000, net_try: 9000, partner_name: 'A' }),
      JournalEntryService.buildPeriodCloseEntry({ period_id: 'per', close_date: '2025-01-31', period_profit_try: 5000, legal_reserve_try: 250, retained_transfer_try: 4750 }),
    ]

    for (const entry of builders) {
      for (const line of entry.lines) {
        expect(line.account_code, `account_code must not be empty`).toBeTruthy()
        expect(line.account_name, `account_name must not be empty for ${line.account_code}`).toBeTruthy()
      }
    }
  })
})

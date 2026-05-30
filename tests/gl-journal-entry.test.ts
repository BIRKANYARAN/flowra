/**
 * Tests for GL journal entry pure helpers.
 * Run with: npx vitest run tests/gl-journal-entry.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  buildEntryDescription,
  validateJournalLines,
  mapExpenseTypeToAccount,
  computeKdvAmount,
  buildSaleJournalLines,
} from '../lib/services/ledger/journal-entry.service'

// ─────────────────────────────────────────────────────────────────────────────
// buildEntryDescription
// ─────────────────────────────────────────────────────────────────────────────

describe('buildEntryDescription', () => {
  it('formats sale description in Turkish', () => {
    const desc = buildEntryDescription('sale', 'INV-001', 45000)
    expect(desc).toContain('Satış faturası')
    expect(desc).toContain('INV-001')
    expect(desc).toContain('₺')
    expect(desc).toContain('45')
  })

  it('formats expense description', () => {
    const desc = buildEntryDescription('expense', 'EXP-100', 1200)
    expect(desc).toContain('Masraf')
    expect(desc).toContain('EXP-100')
    expect(desc).toContain('₺')
  })

  it('formats purchase description', () => {
    const desc = buildEntryDescription('purchase', 'PO-55', 8000)
    expect(desc).toContain('Satın alma')
    expect(desc).toContain('PO-55')
  })

  it('formats partner_loan description', () => {
    const desc = buildEntryDescription('partner_loan', 'TRN-007', 100000)
    expect(desc).toContain('Ortak borç girişi')
    expect(desc).toContain('TRN-007')
  })

  it('formats payment description', () => {
    const desc = buildEntryDescription('payment', 'PAY-009', 5500)
    expect(desc).toContain('Tahsilat')
    expect(desc).toContain('PAY-009')
  })

  it('formats period_close description', () => {
    const desc = buildEntryDescription('period_close', 'PER-2024Q4', 200000)
    expect(desc).toContain('Dönem kapanışı')
    expect(desc).toContain('PER-2024Q4')
  })

  it('falls back to generic label for unknown source type', () => {
    const desc = buildEntryDescription('unknown_type', 'REF-X', 999)
    expect(desc).toContain('REF-X')
    expect(desc).toContain('₺')
  })

  it('includes the amount in the description', () => {
    const desc = buildEntryDescription('sale', 'INV-002', 45000)
    expect(desc).toMatch(/45/)
  })

  it('includes reference ID in the description for all types', () => {
    const types = ['sale', 'expense', 'purchase', 'partner_loan', 'payment', 'period_close']
    for (const t of types) {
      const desc = buildEntryDescription(t, 'MY-REF', 1000)
      expect(desc).toContain('MY-REF')
    }
  })

  it('includes lira symbol ₺ in all descriptions', () => {
    const types = ['sale', 'expense', 'purchase', 'partner_loan', 'payment', 'period_close']
    for (const t of types) {
      const desc = buildEntryDescription(t, 'X', 1000)
      expect(desc).toContain('₺')
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// validateJournalLines
// ─────────────────────────────────────────────────────────────────────────────

describe('validateJournalLines', () => {
  it('returns valid=true for perfectly balanced entry', () => {
    const lines = [
      { debit_try: 1000, credit_try: 0 },
      { debit_try: 0,    credit_try: 1000 },
    ]
    const result = validateJournalLines(lines)
    expect(result.valid).toBe(true)
    expect(result.total_debits).toBe(1000)
    expect(result.total_credits).toBe(1000)
    expect(result.discrepancy).toBe(0)
  })

  it('returns valid=false for unbalanced entry', () => {
    const lines = [
      { debit_try: 1000, credit_try: 0 },
      { debit_try: 0,    credit_try: 800 },
    ]
    const result = validateJournalLines(lines)
    expect(result.valid).toBe(false)
    expect(result.discrepancy).toBeCloseTo(200, 1)
  })

  it('discrepancy is absolute value (not signed)', () => {
    const lines = [
      { debit_try: 500,  credit_try: 0 },
      { debit_try: 0,    credit_try: 600 },
    ]
    const result = validateJournalLines(lines)
    expect(result.discrepancy).toBeGreaterThan(0)
    expect(result.discrepancy).toBeCloseTo(100, 1)
  })

  it('handles multi-line balanced entry', () => {
    const lines = [
      { debit_try: 12000, credit_try: 0 },
      { debit_try: 0,     credit_try: 10000 },
      { debit_try: 0,     credit_try: 2000 },
    ]
    const result = validateJournalLines(lines)
    expect(result.valid).toBe(true)
    expect(result.total_debits).toBe(12000)
    expect(result.total_credits).toBe(12000)
  })

  it('accepts discrepancy less than 0.01 (rounding tolerance)', () => {
    const lines = [
      { debit_try: 1000.00, credit_try: 0 },
      { debit_try: 0,       credit_try: 1000.004 },
    ]
    const result = validateJournalLines(lines)
    expect(result.valid).toBe(true)
  })

  it('rejects discrepancy >= 0.01', () => {
    const lines = [
      { debit_try: 1000.00, credit_try: 0 },
      { debit_try: 0,       credit_try: 999.98 },
    ]
    const result = validateJournalLines(lines)
    expect(result.valid).toBe(false)
  })

  it('returns correct total_debits and total_credits', () => {
    const lines = [
      { debit_try: 300, credit_try: 0 },
      { debit_try: 200, credit_try: 0 },
      { debit_try: 0,   credit_try: 500 },
    ]
    const result = validateJournalLines(lines)
    expect(result.total_debits).toBe(500)
    expect(result.total_credits).toBe(500)
    expect(result.valid).toBe(true)
  })

  it('handles empty lines array', () => {
    const result = validateJournalLines([])
    expect(result.valid).toBe(true)
    expect(result.total_debits).toBe(0)
    expect(result.total_credits).toBe(0)
    expect(result.discrepancy).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// mapExpenseTypeToAccount
// ─────────────────────────────────────────────────────────────────────────────

describe('mapExpenseTypeToAccount', () => {
  it("maps 'salary' to account code 771", () => {
    const result = mapExpenseTypeToAccount('salary')
    expect(result.code).toBe('771')
  })

  it("maps 'rent' to account code 772", () => {
    const result = mapExpenseTypeToAccount('rent')
    expect(result.code).toBe('772')
  })

  it("maps 'software' to account code 773", () => {
    const result = mapExpenseTypeToAccount('software')
    expect(result.code).toBe('773')
  })

  it("maps 'marketing' to account code 760", () => {
    const result = mapExpenseTypeToAccount('marketing')
    expect(result.code).toBe('760')
  })

  it("maps 'logistics' to account code 760", () => {
    const result = mapExpenseTypeToAccount('logistics')
    expect(result.code).toBe('760')
  })

  it("maps 'general' to account code 770", () => {
    const result = mapExpenseTypeToAccount('general')
    expect(result.code).toBe('770')
  })

  it("maps 'utilities' to account code 770", () => {
    const result = mapExpenseTypeToAccount('utilities')
    expect(result.code).toBe('770')
  })

  it('maps unknown types to default account 770', () => {
    const result = mapExpenseTypeToAccount('completely_unknown')
    expect(result.code).toBe('770')
  })

  it('returns account name alongside code', () => {
    const result = mapExpenseTypeToAccount('salary')
    expect(result.name).toBeTruthy()
    expect(typeof result.name).toBe('string')
    expect(result.name.length).toBeGreaterThan(0)
  })

  it('handles Turkish variants — maaş maps to 771', () => {
    const result = mapExpenseTypeToAccount('maaş')
    expect(result.code).toBe('771')
  })

  it('handles Turkish variants — kira maps to 772', () => {
    const result = mapExpenseTypeToAccount('kira')
    expect(result.code).toBe('772')
  })

  it('handles null input by defaulting to 770', () => {
    const result = mapExpenseTypeToAccount(null)
    expect(result.code).toBe('770')
  })

  it('handles empty string by defaulting to 770', () => {
    const result = mapExpenseTypeToAccount('')
    expect(result.code).toBe('770')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeKdvAmount
// ─────────────────────────────────────────────────────────────────────────────

describe('computeKdvAmount', () => {
  it('net + kdv equals gross for %20 rate', () => {
    const { net, kdv, gross } = computeKdvAmount(12000, 20)
    expect(net + kdv).toBeCloseTo(gross, 1)
  })

  it('net + kdv equals gross for %10 rate', () => {
    const { net, kdv, gross } = computeKdvAmount(11000, 10)
    expect(net + kdv).toBeCloseTo(gross, 1)
  })

  it('computes correct net for %20 rate (1000 gross → ~833.33 net)', () => {
    const { net } = computeKdvAmount(1000, 20)
    expect(net).toBeCloseTo(833.33, 1)
  })

  it('computes correct kdv for %20 rate (1000 gross → ~166.67 kdv)', () => {
    const { kdv } = computeKdvAmount(1000, 20)
    expect(kdv).toBeCloseTo(166.67, 1)
  })

  it('computes correct net for %10 rate (1100 gross → 1000 net)', () => {
    const { net } = computeKdvAmount(1100, 10)
    expect(net).toBeCloseTo(1000, 1)
  })

  it('computes correct kdv for %10 rate (1100 gross → 100 kdv)', () => {
    const { kdv } = computeKdvAmount(1100, 10)
    expect(kdv).toBeCloseTo(100, 1)
  })

  it('gross field equals the input gross amount', () => {
    const { gross } = computeKdvAmount(5000, 20)
    expect(gross).toBe(5000)
  })

  it('handles %0 rate — net = gross, kdv = 0', () => {
    const { net, kdv, gross } = computeKdvAmount(5000, 0)
    expect(net).toBe(gross)
    expect(kdv).toBe(0)
  })

  it('works for large amounts', () => {
    const { net, kdv, gross } = computeKdvAmount(1_200_000, 20)
    expect(net + kdv).toBeCloseTo(gross, 0)
    expect(net).toBeCloseTo(1_000_000, 0)
    expect(kdv).toBeCloseTo(200_000, 0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildSaleJournalLines
// ─────────────────────────────────────────────────────────────────────────────

describe('buildSaleJournalLines', () => {
  const sampleParams = { grossAmountTry: 12000, kdvRate: 20, cogsTry: 5000 }

  it('returns exactly 5 lines', () => {
    const lines = buildSaleJournalLines(sampleParams)
    expect(lines).toHaveLength(5)
  })

  it('first line is DR 120 (Alıcılar) for gross amount', () => {
    const lines = buildSaleJournalLines(sampleParams)
    const line = lines[0]
    expect(line.account_code).toBe('120')
    expect(line.debit_try).toBe(12000)
    expect(line.credit_try).toBe(0)
  })

  it('second line is CR 600 (Yurt İçi Satışlar) for net amount', () => {
    const lines = buildSaleJournalLines(sampleParams)
    const line = lines[1]
    expect(line.account_code).toBe('600')
    expect(line.debit_try).toBe(0)
    expect(line.credit_try).toBeGreaterThan(0)
    // net = 12000 / 1.20 = 10000
    expect(line.credit_try).toBeCloseTo(10000, 1)
  })

  it('third line is CR 391 (Hesaplanan KDV) for kdv amount', () => {
    const lines = buildSaleJournalLines(sampleParams)
    const line = lines[2]
    expect(line.account_code).toBe('391')
    expect(line.debit_try).toBe(0)
    expect(line.credit_try).toBeGreaterThan(0)
    // kdv = 12000 - 10000 = 2000
    expect(line.credit_try).toBeCloseTo(2000, 1)
  })

  it('fourth line is DR 620 (COGS) for cogs amount', () => {
    const lines = buildSaleJournalLines(sampleParams)
    const line = lines[3]
    expect(line.account_code).toBe('620')
    expect(line.debit_try).toBe(5000)
    expect(line.credit_try).toBe(0)
  })

  it('fifth line is CR 153 (Stoklar) for cogs amount', () => {
    const lines = buildSaleJournalLines(sampleParams)
    const line = lines[4]
    expect(line.account_code).toBe('153')
    expect(line.debit_try).toBe(0)
    expect(line.credit_try).toBe(5000)
  })

  it('total debits equal total credits (entry is balanced)', () => {
    const lines = buildSaleJournalLines(sampleParams)
    const totalDebits  = lines.reduce((s, l) => s + l.debit_try,  0)
    const totalCredits = lines.reduce((s, l) => s + l.credit_try, 0)
    expect(Math.abs(totalDebits - totalCredits)).toBeLessThan(0.01)
  })

  it('all lines have an account_name string', () => {
    const lines = buildSaleJournalLines(sampleParams)
    for (const line of lines) {
      expect(typeof line.account_name).toBe('string')
      expect(line.account_name.length).toBeGreaterThan(0)
    }
  })

  it('works with %10 kdv rate', () => {
    const lines = buildSaleJournalLines({ grossAmountTry: 11000, kdvRate: 10, cogsTry: 3000 })
    const net = lines[1].credit_try
    const kdv = lines[2].credit_try
    expect(net).toBeCloseTo(10000, 1)
    expect(kdv).toBeCloseTo(1000, 1)
    const totalDebits  = lines.reduce((s, l) => s + l.debit_try,  0)
    const totalCredits = lines.reduce((s, l) => s + l.credit_try, 0)
    expect(Math.abs(totalDebits - totalCredits)).toBeLessThan(0.01)
  })

  it('gross on line 0 matches input grossAmountTry', () => {
    const lines = buildSaleJournalLines({ grossAmountTry: 54321, kdvRate: 20, cogsTry: 20000 })
    expect(lines[0].debit_try).toBe(54321)
  })
})

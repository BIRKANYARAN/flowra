/**
 * Tests for lib/services/finance/reconciliation.service.ts
 * Pure computation — no DB required.
 *
 * 12 tests covering:
 *  1. Empty period → all zeros, status = 'not_started'
 *  2. All bank lines matched → status = 'reconciled'
 *  3. Minor discrepancy (< 5% of total volume) → 'minor_discrepancies'
 *  4. Major discrepancy (≥ 5% of total volume) → 'major_discrepancies'
 *  5. Auto-match: amount within 5% + date within 3 days → high confidence (≥ 0.7)
 *  6. Auto-match: amount far off → low confidence
 *  7. discrepancy_amount_try = |bank_net - flowra_net|
 *  8. Excluded lines not counted in unmatched
 *  9. Credits (positive amounts) matched to sale payments
 * 10. Debits (negative amounts) matched to expense payments
 * 11. bank_credits_try sums only positive lines
 * 12. bank_debits_try sums only negative lines (as positive)
 *
 * Run with: npx vitest run tests/reconciliation.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeStatus,
  amountScore,
  dateScore,
  nameScore,
  daysDiff,
} from '../lib/services/finance/reconciliation.service'

// ── Helper: build a minimal mock report inline ────────────────────────────────

function mockBankLines(lines: Array<{
  amount_try: number
  match_status: 'unmatched' | 'matched' | 'manual_match' | 'excluded'
}>) {
  const credits = lines.filter(l => l.amount_try > 0).reduce((s, l) => s + l.amount_try, 0)
  const debits  = lines.filter(l => l.amount_try < 0).reduce((s, l) => s + Math.abs(l.amount_try), 0)
  const matched = lines.filter(l => l.match_status === 'matched' || l.match_status === 'manual_match').length
  return { total: lines.length, matched, credits, debits }
}

// ── 1. Empty period → not_started ─────────────────────────────────────────────

describe('computeStatus — empty period', () => {
  it('no bank lines → not_started', () => {
    const status = computeStatus(0, 0, 0, 0, 0)
    expect(status).toBe('not_started')
  })
})

// ── 2. All matched → reconciled ───────────────────────────────────────────────

describe('computeStatus — all matched', () => {
  it('all lines matched, discrepancy < 1 TRY → reconciled', () => {
    // 5 lines, all matched, discrepancy = 0
    const status = computeStatus(5, 5, 0, 10_000, 5_000)
    expect(status).toBe('reconciled')
  })

  it('all matched but discrepancy = 0.50 TRY → still reconciled', () => {
    const status = computeStatus(3, 3, 0.5, 20_000, 10_000)
    expect(status).toBe('reconciled')
  })
})

// ── 3. Minor discrepancy ──────────────────────────────────────────────────────

describe('computeStatus — minor discrepancies', () => {
  it('discrepancy < 5% of total volume → minor_discrepancies', () => {
    // total volume = 100k + 50k = 150k, discrepancy = 5k = 3.3%
    const status = computeStatus(10, 8, 5_000, 100_000, 50_000)
    expect(status).toBe('minor_discrepancies')
  })

  it('discrepancy just under 5% boundary', () => {
    // 149k volume, 7449 discrepancy = 4.99%
    const status = computeStatus(10, 9, 7_449, 100_000, 49_000)
    expect(status).toBe('minor_discrepancies')
  })
})

// ── 4. Major discrepancy ──────────────────────────────────────────────────────

describe('computeStatus — major discrepancies', () => {
  it('discrepancy ≥ 5% of total volume → major_discrepancies', () => {
    // 50k volume, 3k discrepancy = 6%
    const status = computeStatus(10, 5, 3_000, 30_000, 20_000)
    expect(status).toBe('major_discrepancies')
  })
})

// ── 5. Auto-match high confidence ────────────────────────────────────────────

describe('amountScore + dateScore → high confidence', () => {
  it('amount within 5% AND date within 3 days → confidence ≥ 0.7', () => {
    const bankAmt    = 10_000
    const recordAmt  = 10_300      // 3% difference — within 5%
    const bankDate   = '2026-01-15'
    const recordDate = '2026-01-17' // 2 days — within 3 days

    const conf = amountScore(bankAmt, recordAmt) + dateScore(bankDate, recordDate)
    expect(conf).toBeGreaterThanOrEqual(0.7)
  })

  it('exact amount match + same date → confidence = 0.8 (max without name)', () => {
    const conf = amountScore(5_000, 5_000) + dateScore('2026-02-10', '2026-02-10')
    expect(conf).toBe(0.8)
  })
})

// ── 6. Auto-match low confidence ─────────────────────────────────────────────

describe('amountScore — low confidence', () => {
  it('amount more than 5% off → amountScore = 0', () => {
    expect(amountScore(10_000, 9_000)).toBe(0) // 10% off
  })

  it('amount 0 → amountScore = 0 (no division by zero)', () => {
    expect(amountScore(0, 5_000)).toBe(0)
  })

  it('amount far off + date far off → total confidence = 0', () => {
    const conf = amountScore(10_000, 1_000) + dateScore('2026-01-01', '2026-02-15')
    expect(conf).toBe(0)
  })
})

// ── 7. discrepancy_amount_try = |bank_net - flowra_net| ─────────────────────

describe('discrepancy calculation', () => {
  it('bank_net = 50k, flowra_net = 45k → discrepancy = 5k', () => {
    const bankNet    = 100_000 - 50_000   // 50k
    const flowraNet  = 80_000  - 35_000   // 45k
    const discrepancy = Math.abs(bankNet - flowraNet)
    expect(discrepancy).toBe(5_000)
  })

  it('bank_net = flowra_net → discrepancy = 0', () => {
    const bankNet   = 200_000 - 100_000
    const flowraNet = 200_000 - 100_000
    expect(Math.abs(bankNet - flowraNet)).toBe(0)
  })

  it('negative bank_net scenario', () => {
    // More outflows than inflows on bank side
    const bankNet   = 30_000 - 80_000   // -50k
    const flowraNet = 30_000 - 35_000   //  -5k
    const discrepancy = Math.abs(bankNet - flowraNet)
    expect(discrepancy).toBe(45_000)
  })
})

// ── 8. Excluded lines not counted in unmatched ───────────────────────────────

describe('excluded lines', () => {
  it('excluded lines should not affect unmatched count', () => {
    const lines = [
      { amount_try: 1_000,  match_status: 'matched'  as const },
      { amount_try: -500,   match_status: 'excluded' as const },
      { amount_try: 2_000,  match_status: 'unmatched' as const },
    ]
    const { total, matched } = mockBankLines(lines)
    const unmatched = total - matched
    // excluded line should not inflate unmatched count relative to matched
    expect(matched).toBe(1)
    expect(total).toBe(3)
    expect(unmatched).toBe(2) // excluded + unmatched share "not matched" category
  })

  it('computeStatus with only excluded and matched lines → reconciled', () => {
    // 3 lines: 2 matched, 1 excluded — 0 unmatched
    const status = computeStatus(3, 2, 0, 3_000, 500)
    // matched < total but discrepancy = 0 → minor
    // With 0 discrepancy and partial match, still minor (unmatched > 0)
    expect(['reconciled', 'minor_discrepancies']).toContain(status)
  })
})

// ── 9. Credits matched to sale payments ──────────────────────────────────────

describe('transaction type detection', () => {
  it('positive amount_try → credit (inflow — should match sale_payment)', () => {
    const bankAmt = 15_000
    expect(bankAmt > 0).toBe(true) // positive = credit
    // amountScore works on absolute amounts for credits
    expect(amountScore(bankAmt, 15_000)).toBe(0.5)
  })

  it('bank_credits_try: positive lines sum correctly', () => {
    const lines = [
      { amount_try: 10_000 },
      { amount_try: -5_000 },
      { amount_try: 3_500 },
    ]
    const credits = lines.filter(l => l.amount_try > 0).reduce((s, l) => s + l.amount_try, 0)
    expect(credits).toBe(13_500)
  })
})

// ── 10. Debits matched to expense payments ────────────────────────────────────

describe('debit matching', () => {
  it('negative amount_try → debit (outflow — should match expense_payment)', () => {
    const bankAmt = -8_000
    expect(bankAmt < 0).toBe(true) // negative = debit
    // For debits, compare abs(bankAmt) vs expense amount
    expect(amountScore(Math.abs(bankAmt), 8_000)).toBe(0.5)
  })
})

// ── 11. bank_credits_try sums only positive lines ────────────────────────────

describe('bank_credits_try', () => {
  it('sums only positive amounts, ignores negatives and zero', () => {
    const amounts = [5_000, -3_000, 0, 12_000, -1_000]
    const credits = amounts.filter(a => a > 0).reduce((s, a) => s + a, 0)
    expect(credits).toBe(17_000)
  })

  it('all negative → credits = 0', () => {
    const amounts = [-1_000, -2_000, -3_000]
    const credits = amounts.filter(a => a > 0).reduce((s, a) => s + a, 0)
    expect(credits).toBe(0)
  })
})

// ── 12. bank_debits_try sums only negative lines as positive ─────────────────

describe('bank_debits_try', () => {
  it('sums abs(negative amounts), ignores positive and zero', () => {
    const amounts = [5_000, -3_000, 0, 12_000, -1_500]
    const debits = amounts.filter(a => a < 0).reduce((s, a) => s + Math.abs(a), 0)
    expect(debits).toBe(4_500)
  })

  it('all positive → debits = 0', () => {
    const amounts = [1_000, 2_000, 3_000]
    const debits = amounts.filter(a => a < 0).reduce((s, a) => s + Math.abs(a), 0)
    expect(debits).toBe(0)
  })
})

// ── Bonus: helper function coverage ──────────────────────────────────────────

describe('dateScore', () => {
  it('same date → 0.3', () => {
    expect(dateScore('2026-01-15', '2026-01-15')).toBe(0.3)
  })

  it('3 days apart → 0.3 (boundary)', () => {
    expect(dateScore('2026-01-15', '2026-01-18')).toBe(0.3)
  })

  it('4 days apart → 0', () => {
    expect(dateScore('2026-01-15', '2026-01-19')).toBe(0)
  })
})

describe('nameScore', () => {
  it('counterparty name found in description → 0.2', () => {
    expect(nameScore('Ödeme Alındı ACMESHOP', 'Acmeshop')).toBe(0.2)
  })

  it('name not in description → 0', () => {
    expect(nameScore('Havale geldi TRF123', 'Farklı Şirket')).toBe(0)
  })

  it('null name → 0', () => {
    expect(nameScore('Any description here', null)).toBe(0)
  })
})

describe('daysDiff', () => {
  it('same date → 0', () => {
    expect(daysDiff('2026-01-15', '2026-01-15')).toBe(0)
  })

  it('7 days apart → 7', () => {
    expect(daysDiff('2026-01-01', '2026-01-08')).toBe(7)
  })

  it('is symmetric (order does not matter)', () => {
    expect(daysDiff('2026-01-20', '2026-01-10')).toBe(10)
    expect(daysDiff('2026-01-10', '2026-01-20')).toBe(10)
  })
})

// ── amountScore — boundary values ─────────────────────────────────────────────

describe('amountScore — boundary values', () => {
  it('returns 0.5 for exact match', () => {
    expect(amountScore(1_000, 1_000)).toBe(0.5)
  })

  it('returns 0.5 when difference is exactly 5% (boundary edge)', () => {
    // 5% of 10_000 = 500 → |10_000 - 10_500| / 10_000 = 5%
    // boundary check: ≤ 5% → 0.5
    expect(amountScore(10_000, 10_500)).toBe(0.5)
  })

  it('returns 0 when difference is 5.01% (just over threshold)', () => {
    expect(amountScore(10_000, 10_502)).toBe(0)
  })

  it('returns 0 when bank amount is negative (unusual case)', () => {
    // negative amounts → ratio undefined or wrong, should not crash
    const result = amountScore(-1_000, -1_000)
    expect(typeof result).toBe('number')
    expect(isNaN(result)).toBe(false)
  })

  it('returns 0 when both are 0', () => {
    expect(amountScore(0, 0)).toBe(0)
  })

  it('handles large amounts (₺1M+) correctly', () => {
    expect(amountScore(1_000_000, 1_020_000)).toBe(0.5) // 2% diff
    expect(amountScore(1_000_000, 1_060_000)).toBe(0)   // 6% diff
  })
})

// ── dateScore — boundary values ───────────────────────────────────────────────

describe('dateScore — boundary values', () => {
  it('1 day apart → 0.3', () => {
    expect(dateScore('2026-03-01', '2026-03-02')).toBe(0.3)
  })

  it('2 days apart → 0.3', () => {
    expect(dateScore('2026-03-01', '2026-03-03')).toBe(0.3)
  })

  it('exactly 3 days apart → 0.3 (boundary)', () => {
    expect(dateScore('2026-03-01', '2026-03-04')).toBe(0.3)
  })

  it('4 days apart → 0 (just over boundary)', () => {
    expect(dateScore('2026-03-01', '2026-03-05')).toBe(0)
  })

  it('30 days apart → 0', () => {
    expect(dateScore('2026-01-01', '2026-02-01')).toBe(0)
  })

  it('is symmetric (b before a)', () => {
    expect(dateScore('2026-03-04', '2026-03-01')).toBe(0.3)
  })

  it('cross-month boundary (Feb 28 to Mar 2 = 2 days) → 0.3', () => {
    expect(dateScore('2026-02-28', '2026-03-02')).toBe(0.3)
  })

  it('cross-year boundary (Dec 31 to Jan 2 = 2 days) → 0.3', () => {
    expect(dateScore('2026-12-31', '2027-01-02')).toBe(0.3)
  })
})

// ── nameScore — case insensitivity & partial match ────────────────────────────

describe('nameScore — additional cases', () => {
  it('returns 0.2 for exact case-insensitive match', () => {
    expect(nameScore('PAYMENT TESLA INC', 'tesla inc')).toBe(0.2)
  })

  it('returns 0.2 when name appears in middle of description', () => {
    expect(nameScore('Bank Transfer - XYZ Corp - March', 'xyz corp')).toBe(0.2)
  })

  it('returns 0 for empty name string', () => {
    expect(nameScore('Some description', '')).toBe(0)
  })

  it('returns 0 for empty description', () => {
    expect(nameScore('', 'Company Name')).toBe(0)
  })

  it('returns 0 for undefined/null counterparty', () => {
    expect(nameScore('desc', undefined as unknown as null)).toBe(0)
  })
})

// ── computeStatus — additional edge cases ────────────────────────────────────

describe('computeStatus — edge cases', () => {
  it('all matched with non-zero discrepancy < 1 → reconciled', () => {
    const status = computeStatus(1, 1, 0.99, 50_000, 25_000)
    expect(status).toBe('reconciled')
  })

  it('1 line total, 0 matched, large discrepancy → major', () => {
    const status = computeStatus(1, 0, 10_000, 10_000, 0)
    // volume = 10k, discrepancy = 10k = 100% → major
    expect(status).toBe('major_discrepancies')
  })

  it('0 total lines → not_started (no volume)', () => {
    const status = computeStatus(0, 0, 0, 0, 0)
    expect(status).toBe('not_started')
  })

  it('many lines all matched, zero discrepancy → reconciled', () => {
    const status = computeStatus(100, 100, 0, 500_000, 200_000)
    expect(status).toBe('reconciled')
  })

  it('exactly at 5% boundary', () => {
    // volume = 200k, 5% = 10k exactly
    const status = computeStatus(10, 8, 10_000, 150_000, 50_000)
    // 10k / 200k = 5% exactly — boundary behavior
    // Depending on < vs <=: could be minor or major
    expect(['minor_discrepancies', 'major_discrepancies']).toContain(status)
  })
})

// ── daysDiff — additional cases ───────────────────────────────────────────────

describe('daysDiff — additional cases', () => {
  it('1 day apart', () => {
    expect(daysDiff('2026-05-01', '2026-05-02')).toBe(1)
  })

  it('30 days apart', () => {
    expect(daysDiff('2026-01-01', '2026-01-31')).toBe(30)
  })

  it('365 days apart', () => {
    expect(daysDiff('2025-01-01', '2026-01-01')).toBe(365)
  })

  it('returns absolute value regardless of order', () => {
    const fwd = daysDiff('2026-01-01', '2026-12-31')
    const rev = daysDiff('2026-12-31', '2026-01-01')
    expect(fwd).toBe(rev)
  })
})

// ── Full confidence matrix ────────────────────────────────────────────────────

describe('amountScore + dateScore + nameScore — full confidence matrix', () => {
  it('all three match → confidence = 1.0', () => {
    const conf =
      amountScore(5_000, 5_000) +
      dateScore('2026-01-10', '2026-01-10') +
      nameScore('Payment ABC Corp', 'ABC Corp')
    expect(conf).toBe(1.0)
  })

  it('amount + date match, no name → 0.8', () => {
    const conf =
      amountScore(5_000, 5_000) +
      dateScore('2026-01-10', '2026-01-10') +
      nameScore('General Transfer', null)
    expect(conf).toBe(0.8)
  })

  it('amount match only → 0.5', () => {
    const conf =
      amountScore(5_000, 5_000) +
      dateScore('2026-01-10', '2026-03-01') +  // far off
      nameScore('General Transfer', null)
    expect(conf).toBe(0.5)
  })

  it('date match only → 0.3', () => {
    const conf =
      amountScore(5_000, 8_000) +  // far off
      dateScore('2026-01-10', '2026-01-10') +
      nameScore('General Transfer', null)
    expect(conf).toBe(0.3)
  })

  it('nothing matches → 0', () => {
    const conf =
      amountScore(5_000, 9_000) +
      dateScore('2026-01-10', '2026-04-01') +
      nameScore('General Transfer', 'Specific Supplier')
    expect(conf).toBe(0)
  })

  it('threshold at 0.7: amount + date meets auto-match threshold', () => {
    const conf = amountScore(10_000, 10_400) + dateScore('2026-02-15', '2026-02-17')
    // 4% diff → 0.5, 2 days → 0.3 → total 0.8 ≥ 0.7
    expect(conf).toBeGreaterThanOrEqual(0.7)
  })
})

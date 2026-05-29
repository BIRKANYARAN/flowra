// ─────────────────────────────────────────────────────────────────────────────
// tests/finance-tax-compliance.test.ts
//
// Unit tests for all pure functions in
// lib/services/finance/tax-compliance.service.ts
//
// 40+ tests covering KDV, Geçici Vergi, penalty calculations, and status
// classification.
//
// Run with: npx vitest run tests/finance-tax-compliance.test.ts
// ─────────────────────────────────────────────────────────────────────────────

import { describe, test, expect } from 'vitest'
import {
  computeKdvPayable,
  classifyKdvStatus,
  computeKdvDueDate,
  computeGecikmeFaizi,
  computeGecikmeFaiziAnnualized,
  computeGecikmeCezasi,
  computeGecikmeToplam,
  computeQuarterlyTaxDueDate,
  computeGecikmeTaxEstimate,
  classifyTaxObligationStatus,
} from '../lib/services/finance/tax-compliance.service'

// ── computeKdvPayable ─────────────────────────────────────────────────────────

describe('computeKdvPayable', () => {
  test('positive result when output > input', () => {
    expect(computeKdvPayable(1000, 400)).toBe(600)
  })

  test('negative result when input > output (credit)', () => {
    expect(computeKdvPayable(400, 1000)).toBe(-600)
  })

  test('zero when equal', () => {
    expect(computeKdvPayable(500, 500)).toBe(0)
  })

  test('zero input — full output is payable', () => {
    expect(computeKdvPayable(1800, 0)).toBe(1800)
  })

  test('zero output — full input is credit', () => {
    expect(computeKdvPayable(0, 1800)).toBe(-1800)
  })

  test('both zero → zero', () => {
    expect(computeKdvPayable(0, 0)).toBe(0)
  })

  test('decimal precision maintained', () => {
    expect(computeKdvPayable(1000.50, 400.25)).toBeCloseTo(600.25, 5)
  })
})

// ── classifyKdvStatus ─────────────────────────────────────────────────────────

describe('classifyKdvStatus', () => {
  test('positive amount → payable', () => {
    expect(classifyKdvStatus(600)).toBe('payable')
  })

  test('small positive → payable', () => {
    expect(classifyKdvStatus(0.02)).toBe('payable')
  })

  test('at payable boundary (0.011) → payable', () => {
    expect(classifyKdvStatus(0.011)).toBe('payable')
  })

  test('negative amount → credit', () => {
    expect(classifyKdvStatus(-600)).toBe('credit')
  })

  test('small negative → credit', () => {
    expect(classifyKdvStatus(-0.02)).toBe('credit')
  })

  test('at credit boundary (-0.011) → credit', () => {
    expect(classifyKdvStatus(-0.011)).toBe('credit')
  })

  test('zero → zero', () => {
    expect(classifyKdvStatus(0)).toBe('zero')
  })

  test('within zero band positive (0.005) → zero', () => {
    expect(classifyKdvStatus(0.005)).toBe('zero')
  })

  test('within zero band negative (-0.005) → zero', () => {
    expect(classifyKdvStatus(-0.005)).toBe('zero')
  })
})

// ── computeKdvDueDate ─────────────────────────────────────────────────────────

describe('computeKdvDueDate', () => {
  test('January → February 26', () => {
    expect(computeKdvDueDate(2025, 1)).toBe('2025-02-26')
  })

  test('June → July 26', () => {
    expect(computeKdvDueDate(2025, 6)).toBe('2025-07-26')
  })

  test('November → December 26', () => {
    expect(computeKdvDueDate(2025, 11)).toBe('2025-12-26')
  })

  test('December → January 26 of next year', () => {
    expect(computeKdvDueDate(2025, 12)).toBe('2026-01-26')
  })

  test('format is YYYY-MM-DD', () => {
    const result = computeKdvDueDate(2025, 3)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('December year boundary 2024 → 2025-01-26', () => {
    expect(computeKdvDueDate(2024, 12)).toBe('2025-01-26')
  })

  test('day is always 26', () => {
    for (let m = 1; m <= 12; m++) {
      const result = computeKdvDueDate(2025, m)
      expect(result.slice(-2)).toBe('26')
    }
  })
})

// ── computeGecikmeFaizi ───────────────────────────────────────────────────────

describe('computeGecikmeFaizi', () => {
  test('normal case: 1000 TRY, 30 days, 4.5% monthly = 45.00', () => {
    expect(computeGecikmeFaizi(1000, 30, 4.5)).toBe(45.00)
  })

  test('15 days late — half monthly interest = 22.50', () => {
    expect(computeGecikmeFaizi(1000, 15, 4.5)).toBe(22.50)
  })

  test('zero days → 0', () => {
    expect(computeGecikmeFaizi(1000, 0)).toBe(0)
  })

  test('negative days → 0', () => {
    expect(computeGecikmeFaizi(1000, -5)).toBe(0)
  })

  test('zero amount → 0', () => {
    expect(computeGecikmeFaizi(0, 30)).toBe(0)
  })

  test('negative amount → 0', () => {
    expect(computeGecikmeFaizi(-500, 30)).toBe(0)
  })

  test('default monthly rate is 4.5%', () => {
    expect(computeGecikmeFaizi(1000, 30)).toBe(computeGecikmeFaizi(1000, 30, 4.5))
  })

  test('result rounded to 2 decimal places', () => {
    const result = computeGecikmeFaizi(1000, 10, 4.5)
    expect(result).toBe(15.00)
  })

  test('fractional days compute a positive interest', () => {
    const result = computeGecikmeFaizi(1234.56, 45, 4.5)
    expect(result).toBeGreaterThan(0)
  })
})

// ── computeGecikmeFaiziAnnualized ─────────────────────────────────────────────

describe('computeGecikmeFaiziAnnualized', () => {
  test('4.5% monthly → ~69.59% annualized', () => {
    // (1.045^12 - 1) * 100 = 69.59
    const result = computeGecikmeFaiziAnnualized(4.5)
    expect(result).toBeCloseTo(69.59, 0)
  })

  test('1% monthly → ~12.68% annual', () => {
    const result = computeGecikmeFaiziAnnualized(1)
    expect(result).toBeCloseTo(12.68, 0)
  })

  test('0% monthly → 0% annual', () => {
    expect(computeGecikmeFaiziAnnualized(0)).toBe(0)
  })

  test('result rounded to 2 decimal places', () => {
    const result = computeGecikmeFaiziAnnualized(4.5)
    expect(Number(result.toFixed(2))).toBe(result)
  })
})

// ── computeGecikmeCezasi ──────────────────────────────────────────────────────

describe('computeGecikmeCezasi', () => {
  test('first offense: 50% of amount', () => {
    expect(computeGecikmeCezasi(1000, true)).toBe(500)
  })

  test('repeat offense: 100% of amount', () => {
    expect(computeGecikmeCezasi(1000, false)).toBe(1000)
  })

  test('default is repeat offense (100%)', () => {
    expect(computeGecikmeCezasi(1000)).toBe(1000)
  })

  test('zero amount → 0 regardless of offense type', () => {
    expect(computeGecikmeCezasi(0, true)).toBe(0)
    expect(computeGecikmeCezasi(0, false)).toBe(0)
  })

  test('negative amount → 0', () => {
    expect(computeGecikmeCezasi(-500, true)).toBe(0)
  })

  test('decimal amount: first offense 50%', () => {
    expect(computeGecikmeCezasi(500.50, true)).toBe(250.25)
  })
})

// ── computeGecikmeToplam ──────────────────────────────────────────────────────

describe('computeGecikmeToplam', () => {
  test('full calculation: principal=1000, 30 days late, 4.5%, first offense', () => {
    // interest = 1000 × 0.045 × 1 = 45
    // penalty  = 1000 × 0.5 = 500
    // total    = 1545
    const result = computeGecikmeToplam(1000, 30, 4.5, true)
    expect(result.principal).toBe(1000)
    expect(result.interest).toBe(45)
    expect(result.penalty).toBe(500)
    expect(result.total).toBe(1545)
  })

  test('repeat offense doubles penalty vs first offense', () => {
    const result = computeGecikmeToplam(1000, 30, 4.5, false)
    expect(result.penalty).toBe(1000)
    expect(result.total).toBe(2045)
  })

  test('zero days late — no interest, penalty still applies', () => {
    const result = computeGecikmeToplam(1000, 0, 4.5, true)
    expect(result.interest).toBe(0)
    expect(result.penalty).toBe(500)
    expect(result.total).toBe(1500)
  })

  test('all 4 fields present in result', () => {
    const result = computeGecikmeToplam(500, 15)
    expect(result).toHaveProperty('principal')
    expect(result).toHaveProperty('interest')
    expect(result).toHaveProperty('penalty')
    expect(result).toHaveProperty('total')
  })

  test('total equals sum of components', () => {
    const result = computeGecikmeToplam(750, 20, 3.0, true)
    expect(result.total).toBeCloseTo(result.principal + result.interest + result.penalty, 1)
  })
})

// ── computeQuarterlyTaxDueDate ────────────────────────────────────────────────

describe('computeQuarterlyTaxDueDate', () => {
  test('Q1: May 17', () => {
    expect(computeQuarterlyTaxDueDate(2025, 1)).toBe('2025-05-17')
  })

  test('Q2: Aug 17', () => {
    expect(computeQuarterlyTaxDueDate(2025, 2)).toBe('2025-08-17')
  })

  test('Q3: Nov 17', () => {
    expect(computeQuarterlyTaxDueDate(2025, 3)).toBe('2025-11-17')
  })

  test('Q4: Feb 17 of NEXT year', () => {
    expect(computeQuarterlyTaxDueDate(2025, 4)).toBe('2026-02-17')
  })

  test('Q4 year boundary: 2024 → 2025-02-17', () => {
    expect(computeQuarterlyTaxDueDate(2024, 4)).toBe('2025-02-17')
  })

  test('all quarters produce YYYY-MM-DD format', () => {
    const pattern = /^\d{4}-\d{2}-\d{2}$/;
    ([1, 2, 3, 4] as const).forEach(q => {
      expect(computeQuarterlyTaxDueDate(2025, q)).toMatch(pattern)
    })
  })

  test('day is always 17 for all quarters', () => {
    ([1, 2, 3, 4] as const).forEach(q => {
      const result = computeQuarterlyTaxDueDate(2025, q)
      expect(result.slice(-2)).toBe('17')
    })
  })
})

// ── computeGecikmeTaxEstimate ─────────────────────────────────────────────────

describe('computeGecikmeTaxEstimate', () => {
  test('positive profit at default 25% rate', () => {
    expect(computeGecikmeTaxEstimate(100000)).toBe(25000)
  })

  test('zero profit → zero tax', () => {
    expect(computeGecikmeTaxEstimate(0)).toBe(0)
  })

  test('negative profit → zero tax (never negative)', () => {
    expect(computeGecikmeTaxEstimate(-50000)).toBe(0)
  })

  test('custom tax rate applied correctly (20%)', () => {
    expect(computeGecikmeTaxEstimate(100000, 0.20)).toBe(20000)
  })

  test('default rate is 25%', () => {
    expect(computeGecikmeTaxEstimate(100000)).toBe(computeGecikmeTaxEstimate(100000, 0.25))
  })

  test('large profit', () => {
    expect(computeGecikmeTaxEstimate(1000000)).toBe(250000)
  })

  test('small profit', () => {
    expect(computeGecikmeTaxEstimate(1000, 0.25)).toBe(250)
  })
})

// ── classifyTaxObligationStatus ───────────────────────────────────────────────

describe('classifyTaxObligationStatus', () => {
  test('isPaid = true → paid regardless of date', () => {
    expect(classifyTaxObligationStatus('2025-01-26', '2025-01-01', true)).toBe('paid')
  })

  test('isPaid = true even when overdue date → paid', () => {
    expect(classifyTaxObligationStatus('2025-01-26', '2025-02-10', true)).toBe('paid')
  })

  test('today > dueDate and not paid → overdue', () => {
    expect(classifyTaxObligationStatus('2025-01-26', '2025-02-05', false)).toBe('overdue')
  })

  test('day after due date → overdue', () => {
    expect(classifyTaxObligationStatus('2025-01-26', '2025-01-27', false)).toBe('overdue')
  })

  test('exactly 7 days until due → due_soon', () => {
    expect(classifyTaxObligationStatus('2025-02-07', '2025-01-31', false)).toBe('due_soon')
  })

  test('6 days until due → due_soon', () => {
    expect(classifyTaxObligationStatus('2025-02-06', '2025-01-31', false)).toBe('due_soon')
  })

  test('1 day until due → due_soon', () => {
    expect(classifyTaxObligationStatus('2025-02-01', '2025-01-31', false)).toBe('due_soon')
  })

  test('today equals dueDate → due_soon', () => {
    expect(classifyTaxObligationStatus('2025-01-31', '2025-01-31', false)).toBe('due_soon')
  })

  test('8 days until due → upcoming', () => {
    expect(classifyTaxObligationStatus('2025-02-08', '2025-01-31', false)).toBe('upcoming')
  })

  test('30 days until due → upcoming', () => {
    expect(classifyTaxObligationStatus('2025-03-02', '2025-01-31', false)).toBe('upcoming')
  })
})

// ── computeKdvDueDate — all 12 months ─────────────────────────────────────────

describe('computeKdvDueDate — all 12 months produce correct next-month 26th', () => {
  it('February → March 26', () => {
    expect(computeKdvDueDate(2025, 2)).toBe('2025-03-26')
  })

  it('March → April 26', () => {
    expect(computeKdvDueDate(2025, 3)).toBe('2025-04-26')
  })

  it('April → May 26', () => {
    expect(computeKdvDueDate(2025, 4)).toBe('2025-05-26')
  })

  it('May → June 26', () => {
    expect(computeKdvDueDate(2025, 5)).toBe('2025-06-26')
  })

  it('July → August 26', () => {
    expect(computeKdvDueDate(2025, 7)).toBe('2025-08-26')
  })

  it('August → September 26', () => {
    expect(computeKdvDueDate(2025, 8)).toBe('2025-09-26')
  })

  it('September → October 26', () => {
    expect(computeKdvDueDate(2025, 9)).toBe('2025-10-26')
  })

  it('October → November 26', () => {
    expect(computeKdvDueDate(2025, 10)).toBe('2025-11-26')
  })

  it('month zero pads correctly for single-digit months', () => {
    // March → April: month 04
    const result = computeKdvDueDate(2025, 3)
    expect(result.slice(5, 7)).toBe('04')
  })

  it('year rolls over cleanly from Dec to Jan of new year', () => {
    expect(computeKdvDueDate(2099, 12)).toBe('2100-01-26')
  })
})

// ── computeCorporateTaxProvision — 25% rate ───────────────────────────────────

describe('computeGecikmeTaxEstimate — corporate tax provision at 25%', () => {
  it('profit of 400_000 at 25% = 100_000', () => {
    expect(computeGecikmeTaxEstimate(400_000, 0.25)).toBe(100_000)
  })

  it('profit of 200_000 at 25% = 50_000', () => {
    expect(computeGecikmeTaxEstimate(200_000, 0.25)).toBe(50_000)
  })

  it('profit of 1 TRY at 25% = 0.25', () => {
    expect(computeGecikmeTaxEstimate(1, 0.25)).toBeCloseTo(0.25, 5)
  })

  it('profit of 80_000 at 25% = 20_000', () => {
    expect(computeGecikmeTaxEstimate(80_000)).toBe(20_000)
  })

  it('loss of -100_000 returns 0 — no negative tax', () => {
    expect(computeGecikmeTaxEstimate(-100_000, 0.25)).toBe(0)
  })

  it('tax estimate grows linearly with profit', () => {
    const t1 = computeGecikmeTaxEstimate(100_000)
    const t2 = computeGecikmeTaxEstimate(200_000)
    expect(t2).toBeCloseTo(t1 * 2, 5)
  })
})

// ── computeQuarterlyTaxDueDate — Geçici Vergi all quarters ───────────────────

describe('computeQuarterlyTaxDueDate — quarterly date accuracy', () => {
  it('Q1 for year 2026 = 2026-05-17', () => {
    expect(computeQuarterlyTaxDueDate(2026, 1)).toBe('2026-05-17')
  })

  it('Q2 for year 2026 = 2026-08-17', () => {
    expect(computeQuarterlyTaxDueDate(2026, 2)).toBe('2026-08-17')
  })

  it('Q3 for year 2026 = 2026-11-17', () => {
    expect(computeQuarterlyTaxDueDate(2026, 3)).toBe('2026-11-17')
  })

  it('Q4 for year 2026 = 2027-02-17 (next year)', () => {
    expect(computeQuarterlyTaxDueDate(2026, 4)).toBe('2027-02-17')
  })

  it('Q1 and Q3 are both in the same calendar year', () => {
    const q1 = computeQuarterlyTaxDueDate(2025, 1)
    const q3 = computeQuarterlyTaxDueDate(2025, 3)
    expect(q1.slice(0, 4)).toBe('2025')
    expect(q3.slice(0, 4)).toBe('2025')
  })

  it('Q4 year-rollover: result year is input year + 1', () => {
    const q4 = computeQuarterlyTaxDueDate(2025, 4)
    expect(q4.slice(0, 4)).toBe('2026')
  })

  it('month for Q1 is 05 (May)', () => {
    expect(computeQuarterlyTaxDueDate(2025, 1).slice(5, 7)).toBe('05')
  })

  it('month for Q2 is 08 (August)', () => {
    expect(computeQuarterlyTaxDueDate(2025, 2).slice(5, 7)).toBe('08')
  })

  it('month for Q3 is 11 (November)', () => {
    expect(computeQuarterlyTaxDueDate(2025, 3).slice(5, 7)).toBe('11')
  })

  it('month for Q4 is 02 (February)', () => {
    expect(computeQuarterlyTaxDueDate(2025, 4).slice(5, 7)).toBe('02')
  })
})

// ── computeGecikmeToplam — faiz + ceza composition ───────────────────────────

describe('computeGecikmeToplam — total = faiz + ceza + principal', () => {
  it('total equals principal + interest + penalty (first offense)', () => {
    const r = computeGecikmeToplam(2000, 30, 4.5, true)
    expect(r.total).toBeCloseTo(r.principal + r.interest + r.penalty, 1)
  })

  it('total equals principal + interest + penalty (repeat offense)', () => {
    const r = computeGecikmeToplam(2000, 30, 4.5, false)
    expect(r.total).toBeCloseTo(r.principal + r.interest + r.penalty, 1)
  })

  it('60 days late at 4.5% monthly = 2 months interest', () => {
    // interest = 1000 × 0.045 × (60/30) = 90
    const r = computeGecikmeToplam(1000, 60, 4.5, false)
    expect(r.interest).toBeCloseTo(90, 1)
  })

  it('penalty doubles from first-offense to repeat-offense', () => {
    const first  = computeGecikmeToplam(1000, 10, 4.5, true)
    const repeat = computeGecikmeToplam(1000, 10, 4.5, false)
    expect(repeat.penalty).toBeCloseTo(first.penalty * 2, 1)
  })

  it('zero principal → interest=0, penalty=0, total=0', () => {
    const r = computeGecikmeToplam(0, 30, 4.5, true)
    expect(r.principal).toBe(0)
    expect(r.interest).toBe(0)
    expect(r.penalty).toBe(0)
    expect(r.total).toBe(0)
  })

  it('principal is returned unchanged in result', () => {
    const r = computeGecikmeToplam(1234.56, 20)
    expect(r.principal).toBeCloseTo(1234.56, 2)
  })
})

// ── classifyTaxObligationStatus — all 4 levels ────────────────────────────────

describe('classifyTaxObligationStatus — all four status levels', () => {
  it('paid status takes priority over everything else', () => {
    // Even when overdue, paid wins
    expect(classifyTaxObligationStatus('2020-01-01', '2025-12-31', true)).toBe('paid')
  })

  it('overdue: today one day past due', () => {
    expect(classifyTaxObligationStatus('2025-05-26', '2025-05-27', false)).toBe('overdue')
  })

  it('overdue: today a full month past due', () => {
    expect(classifyTaxObligationStatus('2025-04-26', '2025-05-26', false)).toBe('overdue')
  })

  it('due_soon: exactly 7 days out', () => {
    expect(classifyTaxObligationStatus('2025-06-07', '2025-05-31', false)).toBe('due_soon')
  })

  it('due_soon: today is same as due date (0 days)', () => {
    expect(classifyTaxObligationStatus('2025-05-29', '2025-05-29', false)).toBe('due_soon')
  })

  it('due_soon: 3 days until due', () => {
    expect(classifyTaxObligationStatus('2025-06-03', '2025-05-31', false)).toBe('due_soon')
  })

  it('upcoming: 8 days out is not due_soon', () => {
    expect(classifyTaxObligationStatus('2025-06-08', '2025-05-31', false)).toBe('upcoming')
  })

  it('upcoming: due in 60 days', () => {
    expect(classifyTaxObligationStatus('2025-07-30', '2025-05-31', false)).toBe('upcoming')
  })
})

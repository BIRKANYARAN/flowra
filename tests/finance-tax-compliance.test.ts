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

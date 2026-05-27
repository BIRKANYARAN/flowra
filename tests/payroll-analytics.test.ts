/**
 * Payroll Analytics — unit tests
 *
 * Tests all pure computation functions from payroll-analytics.service.ts.
 * No DB or network calls — all pure function tests.
 */

import { describe, it, expect } from 'vitest'
import {
  computePayrollRatio,
  classifyPayrollRatio,
  computePayrollGrowth,
  computeSalaryExpenseShare,
  estimateSgkContribution,
} from '../lib/services/finance/payroll-analytics.service'

// ── computePayrollRatio ────────────────────────────────────────────────────────

describe('computePayrollRatio', () => {
  it('computes ratio correctly for normal values', () => {
    const result = computePayrollRatio(50_000, 200_000)
    expect(result).toBeCloseTo(25, 5)
  })

  it('returns null when total revenue is zero', () => {
    expect(computePayrollRatio(50_000, 0)).toBeNull()
  })

  it('returns 0 when salary is zero and revenue is positive', () => {
    expect(computePayrollRatio(0, 100_000)).toBe(0)
  })

  it('returns 100 when salary equals revenue', () => {
    const result = computePayrollRatio(100_000, 100_000)
    expect(result).toBeCloseTo(100, 5)
  })

  it('handles high salary exceeding revenue', () => {
    const result = computePayrollRatio(150_000, 100_000)
    expect(result).toBeCloseTo(150, 5)
  })
})

// ── classifyPayrollRatio ──────────────────────────────────────────────────────

describe('classifyPayrollRatio', () => {
  it('returns "unknown" for null input', () => {
    expect(classifyPayrollRatio(null)).toBe('unknown')
  })

  it('returns "lean" for ratio < 20', () => {
    expect(classifyPayrollRatio(0)).toBe('lean')
    expect(classifyPayrollRatio(10)).toBe('lean')
    expect(classifyPayrollRatio(19.9)).toBe('lean')
  })

  it('returns "healthy" at boundary 20', () => {
    expect(classifyPayrollRatio(20)).toBe('healthy')
  })

  it('returns "healthy" for ratio 20–34.9', () => {
    expect(classifyPayrollRatio(25)).toBe('healthy')
    expect(classifyPayrollRatio(34.9)).toBe('healthy')
  })

  it('returns "elevated" at boundary 35', () => {
    expect(classifyPayrollRatio(35)).toBe('elevated')
  })

  it('returns "elevated" for ratio 35–50', () => {
    expect(classifyPayrollRatio(40)).toBe('elevated')
    expect(classifyPayrollRatio(50)).toBe('elevated')
  })

  it('returns "high" at boundary > 50', () => {
    expect(classifyPayrollRatio(50.1)).toBe('high')
  })

  it('returns "high" for ratio > 50', () => {
    expect(classifyPayrollRatio(60)).toBe('high')
    expect(classifyPayrollRatio(100)).toBe('high')
  })
})

// ── computePayrollGrowth ──────────────────────────────────────────────────────

describe('computePayrollGrowth', () => {
  it('returns null when prior is zero', () => {
    expect(computePayrollGrowth(50_000, 0)).toBeNull()
  })

  it('computes positive growth correctly', () => {
    const result = computePayrollGrowth(110_000, 100_000)
    expect(result).toBeCloseTo(10, 5)
  })

  it('computes negative growth (decrease) correctly', () => {
    const result = computePayrollGrowth(90_000, 100_000)
    expect(result).toBeCloseTo(-10, 5)
  })

  it('returns 0 when current equals prior', () => {
    const result = computePayrollGrowth(100_000, 100_000)
    expect(result).toBeCloseTo(0, 5)
  })

  it('handles large growth values', () => {
    const result = computePayrollGrowth(200_000, 100_000)
    expect(result).toBeCloseTo(100, 5)
  })
})

// ── computeSalaryExpenseShare ─────────────────────────────────────────────────

describe('computeSalaryExpenseShare', () => {
  it('returns 0 when total expenses is zero', () => {
    expect(computeSalaryExpenseShare(50_000, 0)).toBe(0)
  })

  it('computes share correctly for normal values', () => {
    const result = computeSalaryExpenseShare(50_000, 200_000)
    expect(result).toBeCloseTo(25, 5)
  })

  it('returns 100 when salary equals total expenses', () => {
    const result = computeSalaryExpenseShare(100_000, 100_000)
    expect(result).toBeCloseTo(100, 5)
  })

  it('returns 0 when salary is zero and expenses are positive', () => {
    expect(computeSalaryExpenseShare(0, 100_000)).toBe(0)
  })

  it('handles partial salary share', () => {
    const result = computeSalaryExpenseShare(30_000, 120_000)
    expect(result).toBeCloseTo(25, 5)
  })
})

// ── estimateSgkContribution ───────────────────────────────────────────────────

describe('estimateSgkContribution', () => {
  it('computes 20.5% employer SGK contribution', () => {
    const result = estimateSgkContribution(100_000)
    expect(result).toBeCloseTo(20_500, 2)
  })

  it('returns 0 for zero gross salary', () => {
    expect(estimateSgkContribution(0)).toBe(0)
  })

  it('scales linearly with salary', () => {
    const base   = estimateSgkContribution(50_000)
    const double = estimateSgkContribution(100_000)
    expect(double).toBeCloseTo(base * 2, 5)
  })

  it('handles fractional salary amounts', () => {
    const result = estimateSgkContribution(10_000)
    expect(result).toBeCloseTo(2_050, 2)
  })

  it('result is exactly salary * 0.205', () => {
    const salary = 75_000
    expect(estimateSgkContribution(salary)).toBe(salary * 0.205)
  })
})

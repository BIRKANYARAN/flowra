// ─────────────────────────────────────────────────────────────────────────────
// tests/payroll-analytics.test.ts
//
// Unit tests for all pure computation functions in:
//   lib/services/finance/payroll-analytics.service.ts
//
// 40+ tests — no DB or network calls.
//
// Run with: npx vitest run tests/payroll-analytics.test.ts
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  // New functions
  computePersonnelCostRatio,
  classifyPersonnelCostEfficiency,
  computeSgkEmployerContribution,
  computeNetSalaryFromGross,
  computeGrossToNetRatio,
  computeTotalEmploymentCostMultiplier,
  computeRevenuePerHeadcount,
  computePersonnelCostPerHead,
  computePersonnelCostTrend,
  classifyPersonnelCostTrend,
  // Legacy functions (backward-compat)
  computePayrollRatio,
  classifyPayrollRatio,
  computePayrollGrowth,
  computeSalaryExpenseShare,
  estimateSgkContribution,
} from '../lib/services/finance/payroll-analytics.service'

// ── computePersonnelCostRatio ─────────────────────────────────────────────────

describe('computePersonnelCostRatio', () => {
  it('computes ratio correctly for normal values', () => {
    const result = computePersonnelCostRatio(50_000, 200_000)
    expect(result).toBeCloseTo(25, 5)
  })

  it('returns null when total revenue is zero', () => {
    expect(computePersonnelCostRatio(50_000, 0)).toBeNull()
  })

  it('returns 0 when personnel cost is zero and revenue is positive', () => {
    expect(computePersonnelCostRatio(0, 100_000)).toBe(0)
  })

  it('returns 100 when personnel cost equals revenue', () => {
    expect(computePersonnelCostRatio(100_000, 100_000)).toBeCloseTo(100, 5)
  })

  it('handles personnel cost exceeding revenue (>100%)', () => {
    expect(computePersonnelCostRatio(150_000, 100_000)).toBeCloseTo(150, 5)
  })

  it('works with fractional amounts', () => {
    expect(computePersonnelCostRatio(1000.5, 10000)).toBeCloseTo(10.005, 5)
  })
})

// ── classifyPersonnelCostEfficiency ──────────────────────────────────────────

describe('classifyPersonnelCostEfficiency', () => {
  it('returns insufficient_data for null', () => {
    expect(classifyPersonnelCostEfficiency(null)).toBe('insufficient_data')
  })

  it('returns excellent for 0%', () => {
    expect(classifyPersonnelCostEfficiency(0)).toBe('excellent')
  })

  it('returns excellent for exactly 15%', () => {
    expect(classifyPersonnelCostEfficiency(15)).toBe('excellent')
  })

  it('returns excellent for 14.9%', () => {
    expect(classifyPersonnelCostEfficiency(14.9)).toBe('excellent')
  })

  it('returns good for 15.1%', () => {
    expect(classifyPersonnelCostEfficiency(15.1)).toBe('good')
  })

  it('returns good for exactly 25%', () => {
    expect(classifyPersonnelCostEfficiency(25)).toBe('good')
  })

  it('returns good for 20% (midpoint)', () => {
    expect(classifyPersonnelCostEfficiency(20)).toBe('good')
  })

  it('returns acceptable for 25.1%', () => {
    expect(classifyPersonnelCostEfficiency(25.1)).toBe('acceptable')
  })

  it('returns acceptable for exactly 35%', () => {
    expect(classifyPersonnelCostEfficiency(35)).toBe('acceptable')
  })

  it('returns acceptable for 30% (midpoint)', () => {
    expect(classifyPersonnelCostEfficiency(30)).toBe('acceptable')
  })

  it('returns high for 35.1%', () => {
    expect(classifyPersonnelCostEfficiency(35.1)).toBe('high')
  })

  it('returns high for exactly 50%', () => {
    expect(classifyPersonnelCostEfficiency(50)).toBe('high')
  })

  it('returns high for 45% (midpoint)', () => {
    expect(classifyPersonnelCostEfficiency(45)).toBe('high')
  })

  it('returns excessive for 50.1%', () => {
    expect(classifyPersonnelCostEfficiency(50.1)).toBe('excessive')
  })

  it('returns excessive for very high ratio (200%)', () => {
    expect(classifyPersonnelCostEfficiency(200)).toBe('excessive')
  })
})

// ── computeSgkEmployerContribution ───────────────────────────────────────────

describe('computeSgkEmployerContribution', () => {
  it('computes default 20.25% rate correctly', () => {
    expect(computeSgkEmployerContribution(100_000)).toBeCloseTo(20_250, 2)
  })

  it('uses custom rate when provided', () => {
    expect(computeSgkEmployerContribution(100_000, 0.15)).toBeCloseTo(15_000, 2)
  })

  it('returns 0 for zero gross salary', () => {
    expect(computeSgkEmployerContribution(0)).toBe(0)
  })

  it('never returns negative value', () => {
    // Negative salary edge case — result clamped to 0
    expect(computeSgkEmployerContribution(-1000)).toBeGreaterThanOrEqual(0)
  })

  it('scales linearly with salary', () => {
    const base   = computeSgkEmployerContribution(50_000)
    const double = computeSgkEmployerContribution(100_000)
    expect(double).toBeCloseTo(base * 2, 5)
  })
})

// ── computeNetSalaryFromGross ─────────────────────────────────────────────────

describe('computeNetSalaryFromGross', () => {
  it('computes net with default rates (15% tax + 14% SGK = 29% deductions)', () => {
    // 100_000 × (1 - 0.15 - 0.14) = 100_000 × 0.71 = 71_000
    expect(computeNetSalaryFromGross(100_000)).toBeCloseTo(71_000, 2)
  })

  it('computes net with custom rates', () => {
    // 100_000 × (1 - 0.20 - 0.10) = 70_000
    expect(computeNetSalaryFromGross(100_000, 0.20, 0.10)).toBeCloseTo(70_000, 2)
  })

  it('clamps to 0 if deductions exceed gross', () => {
    // deductions = 60% + 60% = 120% → net would be negative, clamp to 0
    expect(computeNetSalaryFromGross(100_000, 0.60, 0.60)).toBe(0)
  })

  it('clamps to grossSalary if deductions are 0', () => {
    expect(computeNetSalaryFromGross(100_000, 0, 0)).toBe(100_000)
  })

  it('returns 0 for zero gross salary', () => {
    expect(computeNetSalaryFromGross(0)).toBe(0)
  })

  it('result never exceeds gross salary', () => {
    const result = computeNetSalaryFromGross(50_000)
    expect(result).toBeLessThanOrEqual(50_000)
  })
})

// ── computeGrossToNetRatio ────────────────────────────────────────────────────

describe('computeGrossToNetRatio', () => {
  it('computes ratio correctly', () => {
    expect(computeGrossToNetRatio(71_000, 100_000)).toBeCloseTo(71, 5)
  })

  it('returns null when gross salary is zero', () => {
    expect(computeGrossToNetRatio(0, 0)).toBeNull()
  })

  it('returns 100 when net equals gross', () => {
    expect(computeGrossToNetRatio(100_000, 100_000)).toBeCloseTo(100, 5)
  })

  it('handles minimum wage scenario', () => {
    const gross = 22104
    const net   = computeNetSalaryFromGross(gross)
    const ratio = computeGrossToNetRatio(net, gross)
    expect(ratio).not.toBeNull()
    expect(ratio!).toBeCloseTo(71, 0)
  })
})

// ── computeTotalEmploymentCostMultiplier ──────────────────────────────────────

describe('computeTotalEmploymentCostMultiplier', () => {
  it('returns 1 + default employer rate (1.2025)', () => {
    const result = computeTotalEmploymentCostMultiplier(100_000)
    expect(result).toBeCloseTo(1.2025, 4)
  })

  it('uses custom SGK employer rate', () => {
    const result = computeTotalEmploymentCostMultiplier(100_000, 0.15)
    expect(result).toBeCloseTo(1.15, 4)
  })

  it('always returns >= 1', () => {
    expect(computeTotalEmploymentCostMultiplier(0)).toBeGreaterThanOrEqual(1)
    expect(computeTotalEmploymentCostMultiplier(100_000, 0)).toBeGreaterThanOrEqual(1)
  })

  it('total cost = gross × multiplier', () => {
    const gross      = 50_000
    const multiplier = computeTotalEmploymentCostMultiplier(gross)
    const totalCost  = gross * multiplier
    expect(totalCost).toBeCloseTo(50_000 * 1.2025, 2)
  })
})

// ── computeRevenuePerHeadcount ────────────────────────────────────────────────

describe('computeRevenuePerHeadcount', () => {
  it('computes revenue per employee correctly', () => {
    expect(computeRevenuePerHeadcount(1_000_000, 10)).toBeCloseTo(100_000, 2)
  })

  it('returns null when headcount is zero', () => {
    expect(computeRevenuePerHeadcount(1_000_000, 0)).toBeNull()
  })

  it('returns revenue itself for single employee', () => {
    expect(computeRevenuePerHeadcount(250_000, 1)).toBe(250_000)
  })

  it('handles zero revenue', () => {
    expect(computeRevenuePerHeadcount(0, 5)).toBe(0)
  })
})

// ── computePersonnelCostPerHead ───────────────────────────────────────────────

describe('computePersonnelCostPerHead', () => {
  it('computes cost per employee correctly', () => {
    expect(computePersonnelCostPerHead(500_000, 10)).toBeCloseTo(50_000, 2)
  })

  it('returns null when headcount is zero', () => {
    expect(computePersonnelCostPerHead(500_000, 0)).toBeNull()
  })

  it('returns total cost for single employee', () => {
    expect(computePersonnelCostPerHead(75_000, 1)).toBe(75_000)
  })

  it('handles zero total cost', () => {
    expect(computePersonnelCostPerHead(0, 5)).toBe(0)
  })
})

// ── computePersonnelCostTrend ─────────────────────────────────────────────────

describe('computePersonnelCostTrend', () => {
  it('computes positive trend correctly', () => {
    expect(computePersonnelCostTrend(110_000, 100_000)).toBeCloseTo(10, 5)
  })

  it('computes negative trend correctly', () => {
    expect(computePersonnelCostTrend(90_000, 100_000)).toBeCloseTo(-10, 5)
  })

  it('returns null when prior month cost is zero', () => {
    expect(computePersonnelCostTrend(100_000, 0)).toBeNull()
  })

  it('returns 0 when costs are equal', () => {
    expect(computePersonnelCostTrend(100_000, 100_000)).toBeCloseTo(0, 5)
  })

  it('handles large increase', () => {
    expect(computePersonnelCostTrend(200_000, 100_000)).toBeCloseTo(100, 5)
  })
})

// ── classifyPersonnelCostTrend ────────────────────────────────────────────────

describe('classifyPersonnelCostTrend', () => {
  it('returns insufficient_data for null', () => {
    expect(classifyPersonnelCostTrend(null)).toBe('insufficient_data')
  })

  it('returns decreasing for < -5%', () => {
    expect(classifyPersonnelCostTrend(-6)).toBe('decreasing')
    expect(classifyPersonnelCostTrend(-20)).toBe('decreasing')
  })

  it('returns stable at boundary -5%', () => {
    expect(classifyPersonnelCostTrend(-5)).toBe('stable')
  })

  it('returns stable at 0%', () => {
    expect(classifyPersonnelCostTrend(0)).toBe('stable')
  })

  it('returns stable at boundary +5%', () => {
    expect(classifyPersonnelCostTrend(5)).toBe('stable')
  })

  it('returns growing for > +5%', () => {
    expect(classifyPersonnelCostTrend(5.1)).toBe('growing')
    expect(classifyPersonnelCostTrend(10)).toBe('growing')
  })

  it('returns growing at boundary +15%', () => {
    expect(classifyPersonnelCostTrend(15)).toBe('growing')
  })

  it('returns rapidly_growing for > +15%', () => {
    expect(classifyPersonnelCostTrend(15.1)).toBe('rapidly_growing')
    expect(classifyPersonnelCostTrend(50)).toBe('rapidly_growing')
  })

  it('handles negative edge of stable (-4.9%)', () => {
    expect(classifyPersonnelCostTrend(-4.9)).toBe('stable')
  })
})

// ── Legacy functions (backward-compat) ───────────────────────────────────────

describe('computePayrollRatio (legacy)', () => {
  it('computes ratio correctly', () => {
    expect(computePayrollRatio(50_000, 200_000)).toBeCloseTo(25, 5)
  })

  it('returns null when revenue is zero', () => {
    expect(computePayrollRatio(50_000, 0)).toBeNull()
  })
})

describe('classifyPayrollRatio (legacy)', () => {
  it('returns unknown for null', () => {
    expect(classifyPayrollRatio(null)).toBe('unknown')
  })

  it('returns lean for < 20%', () => {
    expect(classifyPayrollRatio(10)).toBe('lean')
  })

  it('returns healthy for 20–34.9%', () => {
    expect(classifyPayrollRatio(25)).toBe('healthy')
  })

  it('returns elevated for 35–50%', () => {
    expect(classifyPayrollRatio(40)).toBe('elevated')
  })

  it('returns high for > 50%', () => {
    expect(classifyPayrollRatio(60)).toBe('high')
  })
})

describe('computePayrollGrowth (legacy)', () => {
  it('returns null when prior is zero', () => {
    expect(computePayrollGrowth(50_000, 0)).toBeNull()
  })

  it('computes growth correctly', () => {
    expect(computePayrollGrowth(110_000, 100_000)).toBeCloseTo(10, 5)
  })
})

describe('computeSalaryExpenseShare (legacy)', () => {
  it('returns 0 when total expenses is zero', () => {
    expect(computeSalaryExpenseShare(50_000, 0)).toBe(0)
  })

  it('computes share correctly', () => {
    expect(computeSalaryExpenseShare(50_000, 200_000)).toBeCloseTo(25, 5)
  })
})

describe('estimateSgkContribution (legacy)', () => {
  it('computes 20.5% estimate', () => {
    expect(estimateSgkContribution(100_000)).toBeCloseTo(20_500, 2)
  })

  it('returns 0 for zero salary', () => {
    expect(estimateSgkContribution(0)).toBe(0)
  })
})

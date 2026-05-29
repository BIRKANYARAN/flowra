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

// ── computeSgkEmployerContribution — formula: gross × 20.25% ─────────────────

describe('computeSgkEmployerContribution — SGK employer formula', () => {
  it('gross 10_000 at default 20.25% = 2_025', () => {
    expect(computeSgkEmployerContribution(10_000)).toBeCloseTo(2_025, 2)
  })

  it('gross 50_000 × 0.2025 = 10_125', () => {
    expect(computeSgkEmployerContribution(50_000)).toBeCloseTo(10_125, 2)
  })

  it('gross 22_104 (minimum wage) × 0.2025 ≈ 4_476.06', () => {
    expect(computeSgkEmployerContribution(22_104)).toBeCloseTo(22_104 * 0.2025, 2)
  })

  it('custom rate 0.10 → gross × 0.10', () => {
    expect(computeSgkEmployerContribution(80_000, 0.10)).toBeCloseTo(8_000, 2)
  })

  it('result is never negative for zero gross', () => {
    expect(computeSgkEmployerContribution(0)).toBe(0)
  })

  it('result is never negative for negative gross (edge)', () => {
    expect(computeSgkEmployerContribution(-5_000)).toBeGreaterThanOrEqual(0)
  })

  it('scales linearly: doubling gross doubles contribution', () => {
    const c1 = computeSgkEmployerContribution(30_000)
    const c2 = computeSgkEmployerContribution(60_000)
    expect(c2).toBeCloseTo(c1 * 2, 2)
  })
})

// ── computeNetSalaryFromGross — deduction formula ────────────────────────────

describe('computeNetSalaryFromGross — net = gross × (1 - taxRate - sgkRate)', () => {
  it('gross 10_000 with defaults: net = 10_000 × 0.71 = 7_100', () => {
    expect(computeNetSalaryFromGross(10_000)).toBeCloseTo(7_100, 2)
  })

  it('gross 22_104 with defaults: net ≈ 22_104 × 0.71', () => {
    expect(computeNetSalaryFromGross(22_104)).toBeCloseTo(22_104 * 0.71, 1)
  })

  it('gross 100_000, tax=0.20, sgk=0.14 → net = 100_000 × 0.66 = 66_000', () => {
    expect(computeNetSalaryFromGross(100_000, 0.20, 0.14)).toBeCloseTo(66_000, 2)
  })

  it('gross-to-net ratio is < 1 (net < gross)', () => {
    const gross = 50_000
    const net   = computeNetSalaryFromGross(gross)
    expect(net).toBeLessThan(gross)
  })

  it('net clamps to 0 when deductions exceed 100%', () => {
    expect(computeNetSalaryFromGross(50_000, 0.70, 0.50)).toBe(0)
  })

  it('net equals gross when both rates are 0', () => {
    expect(computeNetSalaryFromGross(75_000, 0, 0)).toBe(75_000)
  })
})

// ── computeGrossToNetRatio — ratio < 1 scenarios ─────────────────────────────

describe('computeGrossToNetRatio — always less than 100% under standard deductions', () => {
  it('ratio is < 100 for any nonzero deduction', () => {
    const net   = computeNetSalaryFromGross(100_000)
    const ratio = computeGrossToNetRatio(net, 100_000)
    expect(ratio).not.toBeNull()
    expect(ratio!).toBeLessThan(100)
  })

  it('returns null when grossSalary is 0', () => {
    expect(computeGrossToNetRatio(0, 0)).toBeNull()
  })

  it('returns null when grossSalary is 0 but net > 0', () => {
    expect(computeGrossToNetRatio(5_000, 0)).toBeNull()
  })

  it('50% net-to-gross ratio → returns 50', () => {
    expect(computeGrossToNetRatio(50_000, 100_000)).toBeCloseTo(50, 5)
  })

  it('min-wage typical ratio is around 71%', () => {
    const net   = computeNetSalaryFromGross(22_104)
    const ratio = computeGrossToNetRatio(net, 22_104)
    expect(ratio).not.toBeNull()
    expect(ratio!).toBeCloseTo(71, 0)
  })
})

// ── computeTotalEmploymentCostMultiplier — always > 1 ────────────────────────

describe('computeTotalEmploymentCostMultiplier — must be greater than 1', () => {
  it('default rate returns 1.2025 (greater than 1)', () => {
    const m = computeTotalEmploymentCostMultiplier(100_000)
    expect(m).toBeGreaterThan(1)
    expect(m).toBeCloseTo(1.2025, 4)
  })

  it('custom rate 0.30 → multiplier = 1.30', () => {
    expect(computeTotalEmploymentCostMultiplier(100_000, 0.30)).toBeCloseTo(1.30, 4)
  })

  it('custom rate 0.00 → multiplier = 1.00 (minimum = 1)', () => {
    expect(computeTotalEmploymentCostMultiplier(100_000, 0.00)).toBeCloseTo(1.00, 4)
  })

  it('total cost to company = gross × multiplier > gross', () => {
    const gross      = 40_000
    const multiplier = computeTotalEmploymentCostMultiplier(gross)
    const totalCost  = gross * multiplier
    expect(totalCost).toBeGreaterThan(gross)
  })

  it('employer SGK is the extra cost: totalCost - gross = SGK employer contribution', () => {
    const gross      = 100_000
    const multiplier = computeTotalEmploymentCostMultiplier(gross)
    const totalCost  = gross * multiplier
    const sgk        = computeSgkEmployerContribution(gross)
    expect(totalCost - gross).toBeCloseTo(sgk, 2)
  })
})

// ── computeRevenuePerHeadcount — formula ─────────────────────────────────────

describe('computeRevenuePerHeadcount — revenue / headcount', () => {
  it('500_000 revenue, 5 headcount = 100_000 per head', () => {
    expect(computeRevenuePerHeadcount(500_000, 5)).toBe(100_000)
  })

  it('returns null when headcount = 0', () => {
    expect(computeRevenuePerHeadcount(1_000_000, 0)).toBeNull()
  })

  it('zero revenue, nonzero headcount = 0 per head', () => {
    expect(computeRevenuePerHeadcount(0, 10)).toBe(0)
  })

  it('increasing headcount decreases revenue per head', () => {
    const r1 = computeRevenuePerHeadcount(1_000_000, 5)
    const r2 = computeRevenuePerHeadcount(1_000_000, 10)
    expect(r1!).toBeGreaterThan(r2!)
  })
})

// ── computePersonnelCostPerHead — formula ────────────────────────────────────

describe('computePersonnelCostPerHead — cost / headcount', () => {
  it('300_000 cost, 10 headcount = 30_000 per head', () => {
    expect(computePersonnelCostPerHead(300_000, 10)).toBe(30_000)
  })

  it('returns null when headcount = 0', () => {
    expect(computePersonnelCostPerHead(300_000, 0)).toBeNull()
  })

  it('zero cost, nonzero headcount = 0', () => {
    expect(computePersonnelCostPerHead(0, 5)).toBe(0)
  })
})

// ── classifyPersonnelCostTrend — all levels ───────────────────────────────────

describe('classifyPersonnelCostTrend — all five levels', () => {
  it('null → insufficient_data', () => {
    expect(classifyPersonnelCostTrend(null)).toBe('insufficient_data')
  })

  it('-10% → decreasing', () => {
    expect(classifyPersonnelCostTrend(-10)).toBe('decreasing')
  })

  it('-5.1% → decreasing', () => {
    expect(classifyPersonnelCostTrend(-5.1)).toBe('decreasing')
  })

  it('-5% exactly → stable', () => {
    expect(classifyPersonnelCostTrend(-5)).toBe('stable')
  })

  it('0% → stable', () => {
    expect(classifyPersonnelCostTrend(0)).toBe('stable')
  })

  it('+5% exactly → stable', () => {
    expect(classifyPersonnelCostTrend(5)).toBe('stable')
  })

  it('+5.1% → growing', () => {
    expect(classifyPersonnelCostTrend(5.1)).toBe('growing')
  })

  it('+12% → growing', () => {
    expect(classifyPersonnelCostTrend(12)).toBe('growing')
  })

  it('+15% exactly → growing', () => {
    expect(classifyPersonnelCostTrend(15)).toBe('growing')
  })

  it('+15.1% → rapidly_growing', () => {
    expect(classifyPersonnelCostTrend(15.1)).toBe('rapidly_growing')
  })

  it('+100% → rapidly_growing', () => {
    expect(classifyPersonnelCostTrend(100)).toBe('rapidly_growing')
  })
})

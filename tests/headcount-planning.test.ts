// ─────────────────────────────────────────────────────────────────────────────
// tests/headcount-planning.test.ts
//
// Tests for lib/services/finance/headcount-planning.service.ts
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  computeEmployerSgk,
  computeEmployerUnemploymentInsurance,
  computeTotalEmployerCost,
  computeEmployeeNetSalary,
  buildEmployeeCostBreakdown,
  computeHeadcountCost,
  computeMinViableSalary,
  generateHeadcountScenarios,
  computeRevenuePerHead,
  classifyHeadcountEfficiency,
  computeNewHireCost,
  projectHeadcountCostForward,
  computeBreakevenHeadcount,
} from '@/lib/services/finance/headcount-planning.service'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. computeEmployerSgk
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('computeEmployerSgk', () => {
  it('computes 20.25% of gross salary at default rate', () => {
    const result = computeEmployerSgk(10_000)
    expect(result).toBeCloseTo(2025, 2)
  })

  it('computes zero for zero gross salary', () => {
    expect(computeEmployerSgk(0)).toBe(0)
  })

  it('uses custom rate correctly', () => {
    // 10% of 50,000 = 5,000
    expect(computeEmployerSgk(50_000, 10)).toBeCloseTo(5000, 2)
  })

  it('does not return negative values', () => {
    expect(computeEmployerSgk(-1000)).toBeGreaterThanOrEqual(0)
  })

  it('computes for a typical Turkish SME salary of 30,000 TRY', () => {
    const result = computeEmployerSgk(30_000)
    expect(result).toBeCloseTo(6075, 2)
  })

  it('computes for minimum wage (~22,104 TRY gross)', () => {
    const result = computeEmployerSgk(22_104)
    // 22104 × 0.2025 = 4476.06
    expect(result).toBeCloseTo(4476.06, 1)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. computeEmployerUnemploymentInsurance
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('computeEmployerUnemploymentInsurance', () => {
  it('computes 2.0% of gross salary at default rate', () => {
    const result = computeEmployerUnemploymentInsurance(10_000)
    expect(result).toBeCloseTo(200, 2)
  })

  it('returns 0 for zero gross salary', () => {
    expect(computeEmployerUnemploymentInsurance(0)).toBe(0)
  })

  it('accepts a custom rate', () => {
    // 3% of 20,000 = 600
    expect(computeEmployerUnemploymentInsurance(20_000, 3)).toBeCloseTo(600, 2)
  })

  it('does not return negative values for negative gross', () => {
    expect(computeEmployerUnemploymentInsurance(-5000)).toBeGreaterThanOrEqual(0)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. computeTotalEmployerCost
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('computeTotalEmployerCost', () => {
  it('returns approximately 122.25% of gross at defaults', () => {
    const result = computeTotalEmployerCost(10_000)
    // 10000 + 2025 + 200 = 12225
    expect(result).toBeCloseTo(12_225, 2)
  })

  it('returns just gross salary when rates are 0', () => {
    expect(computeTotalEmployerCost(10_000, 0, 0)).toBeCloseTo(10_000, 2)
  })

  it('returns 0 for 0 gross salary', () => {
    expect(computeTotalEmployerCost(0)).toBe(0)
  })

  it('computes correctly for 50,000 TRY gross', () => {
    // 50000 + 10125 + 1000 = 61125
    expect(computeTotalEmployerCost(50_000)).toBeCloseTo(61_125, 2)
  })

  it('uses custom sgk rate', () => {
    // 10000 + 10000*0.15 + 10000*0.02 = 10000 + 1500 + 200 = 11700
    expect(computeTotalEmployerCost(10_000, 15, 2)).toBeCloseTo(11_700, 2)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. computeEmployeeNetSalary
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('computeEmployeeNetSalary', () => {
  it('computes gross × 0.71 at defaults (14% SGK + 15% tax)', () => {
    const result = computeEmployeeNetSalary(10_000)
    expect(result).toBeCloseTo(7_100, 2)
  })

  it('returns 0 for 0 gross', () => {
    expect(computeEmployeeNetSalary(0)).toBe(0)
  })

  it('handles custom rates correctly', () => {
    // 10000 × (1 - 0.10 - 0.20) = 10000 × 0.70 = 7000
    expect(computeEmployeeNetSalary(10_000, 10, 20)).toBeCloseTo(7_000, 2)
  })

  it('does not exceed gross salary', () => {
    expect(computeEmployeeNetSalary(10_000)).toBeLessThanOrEqual(10_000)
  })

  it('does not go below 0', () => {
    // rates sum to > 100% — should clamp to 0
    expect(computeEmployeeNetSalary(10_000, 60, 60)).toBeGreaterThanOrEqual(0)
  })

  it('computes 30,000 TRY gross correctly', () => {
    // 30000 × 0.71 = 21300
    expect(computeEmployeeNetSalary(30_000)).toBeCloseTo(21_300, 2)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. buildEmployeeCostBreakdown
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('buildEmployeeCostBreakdown', () => {
  it('contains all expected fields', () => {
    const bd = buildEmployeeCostBreakdown(10_000)
    expect(bd).toHaveProperty('gross_salary_try')
    expect(bd).toHaveProperty('employer_sgk_try')
    expect(bd).toHaveProperty('employer_unemployment_try')
    expect(bd).toHaveProperty('total_employer_cost_try')
    expect(bd).toHaveProperty('employee_sgk_try')
    expect(bd).toHaveProperty('income_tax_try')
    expect(bd).toHaveProperty('net_salary_try')
    expect(bd).toHaveProperty('employer_cost_multiplier')
  })

  it('total_employer_cost = gross + employer_sgk + employer_unemployment', () => {
    const bd = buildEmployeeCostBreakdown(10_000)
    const expected = bd.gross_salary_try + bd.employer_sgk_try + bd.employer_unemployment_try
    expect(bd.total_employer_cost_try).toBeCloseTo(expected, 5)
  })

  it('net_salary = gross - employee_sgk - income_tax', () => {
    const bd = buildEmployeeCostBreakdown(10_000)
    const expected = bd.gross_salary_try - bd.employee_sgk_try - bd.income_tax_try
    expect(bd.net_salary_try).toBeCloseTo(expected, 5)
  })

  it('employer_cost_multiplier = total_employer_cost / gross', () => {
    const bd = buildEmployeeCostBreakdown(10_000)
    const expected = bd.total_employer_cost_try / bd.gross_salary_try
    expect(bd.employer_cost_multiplier).toBeCloseTo(expected, 8)
  })

  it('employer_cost_multiplier is approximately 1.2225 at defaults', () => {
    const bd = buildEmployeeCostBreakdown(10_000)
    expect(bd.employer_cost_multiplier).toBeCloseTo(1.2225, 4)
  })

  it('handles zero gross salary without NaN', () => {
    const bd = buildEmployeeCostBreakdown(0)
    expect(bd.employer_sgk_try).toBe(0)
    expect(bd.total_employer_cost_try).toBe(0)
    expect(bd.net_salary_try).toBe(0)
    expect(isNaN(bd.employer_cost_multiplier)).toBe(false)
  })

  it('employee_sgk = 14% of gross at default', () => {
    const bd = buildEmployeeCostBreakdown(20_000)
    expect(bd.employee_sgk_try).toBeCloseTo(2800, 2)
  })

  it('income_tax = 15% of gross at default', () => {
    const bd = buildEmployeeCostBreakdown(20_000)
    expect(bd.income_tax_try).toBeCloseTo(3000, 2)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. computeHeadcountCost
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('computeHeadcountCost', () => {
  it('returns total_employer_cost × headcount for N employees', () => {
    // 10,000 gross → total = 12,225; ×5 = 61,125
    const result = computeHeadcountCost(5, 10_000)
    expect(result).toBeCloseTo(61_125, 2)
  })

  it('returns 0 for 0 headcount', () => {
    expect(computeHeadcountCost(0, 30_000)).toBe(0)
  })

  it('returns 0 for negative headcount', () => {
    expect(computeHeadcountCost(-1, 30_000)).toBe(0)
  })

  it('scales linearly with headcount', () => {
    const one  = computeHeadcountCost(1, 25_000)
    const five = computeHeadcountCost(5, 25_000)
    expect(five).toBeCloseTo(one * 5, 2)
  })

  it('handles large headcount', () => {
    const result = computeHeadcountCost(100, 50_000)
    // 50000 × 1.2225 × 100 = 6,112,500
    expect(result).toBeCloseTo(6_112_500, 0)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. computeMinViableSalary
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('computeMinViableSalary', () => {
  it('back-calculates correctly: revenue × ratio% / headcount / multiplier', () => {
    // revenue = 100,000, ratio = 25%, headcount = 5, multiplier = 1.2225
    // = (100000 × 0.25) / 5 / 1.2225 = 25000 / 5 / 1.2225 ≈ 4089.98
    const result = computeMinViableSalary(100_000, 5, 25)
    expect(result).toBeCloseTo(4089.98, 0)
  })

  it('returns 0 for 0 headcount', () => {
    expect(computeMinViableSalary(100_000, 0, 25)).toBe(0)
  })

  it('returns 0 for negative headcount', () => {
    expect(computeMinViableSalary(100_000, -1, 25)).toBe(0)
  })

  it('scales inversely with headcount', () => {
    const s1 = computeMinViableSalary(100_000, 1, 25)
    const s5 = computeMinViableSalary(100_000, 5, 25)
    expect(s1).toBeCloseTo(s5 * 5, 0)
  })

  it('uses custom employer multiplier', () => {
    // revenue = 100,000, ratio = 30%, headcount = 2, multiplier = 1.5
    // = 30000 / 2 / 1.5 = 10000
    const result = computeMinViableSalary(100_000, 2, 30, 1.5)
    expect(result).toBeCloseTo(10_000, 2)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. generateHeadcountScenarios
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('generateHeadcountScenarios', () => {
  it('generates exactly 5 scenarios (−1, current, +1, +2, +3)', () => {
    const scenarios = generateHeadcountScenarios(5, 30_000, 500_000)
    expect(scenarios).toHaveLength(5)
  })

  it('scenario names include Turkish labels', () => {
    const scenarios = generateHeadcountScenarios(3, 25_000, 200_000)
    const names = scenarios.map(s => s.name)
    expect(names).toContain('Mevcut Kadro')
    expect(names).toContain('+1 İşe Alım')
    expect(names).toContain('+2 İşe Alım')
  })

  it('current scenario headcount matches input', () => {
    const scenarios = generateHeadcountScenarios(5, 30_000, null)
    const current = scenarios.find(s => s.name === 'Mevcut Kadro')
    expect(current?.headcount).toBe(5)
  })

  it('+1 scenario has headcount = current + 1', () => {
    const scenarios = generateHeadcountScenarios(4, 25_000, null)
    const plus1 = scenarios.find(s => s.name === '+1 İşe Alım')
    expect(plus1?.headcount).toBe(5)
  })

  it('annual_cost = monthly_cost × 12', () => {
    const scenarios = generateHeadcountScenarios(3, 30_000, 300_000)
    for (const s of scenarios) {
      if (s.headcount > 0) {
        expect(s.annual_cost_try).toBeCloseTo(s.monthly_cost_try * 12, 2)
      }
    }
  })

  it('is_sustainable is true when cost ratio ≤ 25%', () => {
    // 1 employee at 30,000 gross = ~36,675 monthly cost; revenue = 500,000 → ratio ≈ 7.3%
    const scenarios = generateHeadcountScenarios(1, 30_000, 500_000)
    const current = scenarios.find(s => s.name === 'Mevcut Kadro')
    expect(current?.is_sustainable).toBe(true)
  })

  it('is_sustainable is false when cost ratio > 25%', () => {
    // 10 employees at 30,000 gross = ~366,750 monthly cost; revenue = 100,000 → ratio > 100%
    const scenarios = generateHeadcountScenarios(10, 30_000, 100_000)
    const current = scenarios.find(s => s.name === 'Mevcut Kadro')
    expect(current?.is_sustainable).toBe(false)
  })

  it('revenue_per_head is null when monthly revenue is null', () => {
    const scenarios = generateHeadcountScenarios(3, 25_000, null)
    for (const s of scenarios) {
      expect(s.revenue_per_head_try).toBeNull()
    }
  })

  it('cost_as_pct_revenue is null when monthly revenue is null', () => {
    const scenarios = generateHeadcountScenarios(3, 25_000, null)
    for (const s of scenarios) {
      expect(s.cost_as_pct_revenue).toBeNull()
    }
  })

  it('does not allow headcount below 0 in minus-1 scenario', () => {
    // current headcount = 0; minus-1 should clamp to 0
    const scenarios = generateHeadcountScenarios(0, 25_000, null)
    const minus1 = scenarios[0] // first scenario is -1
    expect(minus1.headcount).toBeGreaterThanOrEqual(0)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 9. computeRevenuePerHead
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('computeRevenuePerHead', () => {
  it('returns null for 0 headcount', () => {
    expect(computeRevenuePerHead(100_000, 0)).toBeNull()
  })

  it('computes revenue / headcount', () => {
    expect(computeRevenuePerHead(100_000, 5)).toBeCloseTo(20_000, 2)
  })

  it('returns full revenue when headcount is 1', () => {
    expect(computeRevenuePerHead(75_000, 1)).toBeCloseTo(75_000, 2)
  })

  it('handles large headcount values', () => {
    expect(computeRevenuePerHead(1_000_000, 100)).toBeCloseTo(10_000, 2)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 10. classifyHeadcountEfficiency
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('classifyHeadcountEfficiency', () => {
  it('returns "excellent" for ratio ≤ 15%', () => {
    expect(classifyHeadcountEfficiency(10)).toBe('excellent')
    expect(classifyHeadcountEfficiency(15)).toBe('excellent')
  })

  it('returns "good" for ratio 15.1%–25%', () => {
    expect(classifyHeadcountEfficiency(20)).toBe('good')
    expect(classifyHeadcountEfficiency(25)).toBe('good')
  })

  it('returns "acceptable" for ratio 25.1%–35%', () => {
    expect(classifyHeadcountEfficiency(30)).toBe('acceptable')
    expect(classifyHeadcountEfficiency(35)).toBe('acceptable')
  })

  it('returns "high" for ratio 35.1%–50%', () => {
    expect(classifyHeadcountEfficiency(40)).toBe('high')
    expect(classifyHeadcountEfficiency(50)).toBe('high')
  })

  it('returns "excessive" for ratio > 50%', () => {
    expect(classifyHeadcountEfficiency(51)).toBe('excessive')
    expect(classifyHeadcountEfficiency(100)).toBe('excessive')
  })

  it('covers the boundary at exactly 25%', () => {
    expect(classifyHeadcountEfficiency(25)).toBe('good')
  })

  it('covers the boundary at exactly 35%', () => {
    expect(classifyHeadcountEfficiency(35)).toBe('acceptable')
  })

  it('classifies near-zero ratio as excellent', () => {
    expect(classifyHeadcountEfficiency(0.1)).toBe('excellent')
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 11. computeNewHireCost
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('computeNewHireCost', () => {
  it('returns total employer cost at default multiplier (1.0)', () => {
    // 10,000 gross → total = 12,225
    const result = computeNewHireCost(10_000)
    expect(result).toBeCloseTo(12_225, 2)
  })

  it('applies hiring cost multiplier correctly', () => {
    // 12,225 × 1.5 = 18,337.5
    const result = computeNewHireCost(10_000, 1.5)
    expect(result).toBeCloseTo(18_337.5, 1)
  })

  it('multiplier of 1.0 produces same as total employer cost', () => {
    const base  = computeTotalEmployerCost(30_000)
    const hired = computeNewHireCost(30_000, 1.0)
    expect(hired).toBeCloseTo(base, 5)
  })

  it('multiplier of 2.0 doubles the cost', () => {
    const base  = computeNewHireCost(20_000, 1.0)
    const doubled = computeNewHireCost(20_000, 2.0)
    expect(doubled).toBeCloseTo(base * 2, 2)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 12. projectHeadcountCostForward
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('projectHeadcountCostForward', () => {
  it('returns exactly N entries for N months', () => {
    const result = projectHeadcountCostForward(5, 30_000, 6)
    expect(result).toHaveLength(6)
  })

  it('month 1 has same headcount as initial', () => {
    const result = projectHeadcountCostForward(5, 30_000, 3)
    expect(result[0].headcount).toBe(5)
  })

  it('month 1 has same avg_gross as initial', () => {
    const result = projectHeadcountCostForward(5, 30_000, 3)
    expect(result[0].avg_gross_try).toBeCloseTo(30_000, 2)
  })

  it('applies salary growth correctly from month 2 onward', () => {
    const result = projectHeadcountCostForward(5, 10_000, 3, 1.0)
    // Month 2: 10000 × 1.01 = 10100
    expect(result[1].avg_gross_try).toBeCloseTo(10_100, 2)
    // Month 3: 10100 × 1.01 = 10201
    expect(result[2].avg_gross_try).toBeCloseTo(10_201, 2)
  })

  it('applies compound growth (not simple)', () => {
    const result = projectHeadcountCostForward(1, 10_000, 4, 10.0)
    // Month 1: 10000, Month 2: 11000, Month 3: 12100, Month 4: 13310
    expect(result[3].avg_gross_try).toBeCloseTo(13_310, 1)
  })

  it('adds planned hires each month from month 2', () => {
    const result = projectHeadcountCostForward(5, 30_000, 3, 0, 1)
    expect(result[0].headcount).toBe(5)
    expect(result[1].headcount).toBe(6)
    expect(result[2].headcount).toBe(7)
  })

  it('does not add hires when plannedHiresPerMonth = 0', () => {
    const result = projectHeadcountCostForward(5, 30_000, 3, 0.5, 0)
    expect(result[0].headcount).toBe(5)
    expect(result[1].headcount).toBe(5)
    expect(result[2].headcount).toBe(5)
  })

  it('monthly_employer_cost = total_employer_cost(avgGross) × headcount', () => {
    const result = projectHeadcountCostForward(3, 20_000, 2, 0)
    const expectedMonth1 = computeTotalEmployerCost(20_000) * 3
    expect(result[0].monthly_employer_cost_try).toBeCloseTo(expectedMonth1, 2)
  })

  it('cost increases each month due to salary growth', () => {
    const result = projectHeadcountCostForward(5, 30_000, 6, 1.0)
    for (let i = 1; i < result.length; i++) {
      expect(result[i].monthly_employer_cost_try).toBeGreaterThan(result[i - 1].monthly_employer_cost_try)
    }
  })

  it('returns correct month numbers in sequence', () => {
    const result = projectHeadcountCostForward(3, 25_000, 6)
    expect(result.map(r => r.month)).toEqual([1, 2, 3, 4, 5, 6])
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 13. computeBreakevenHeadcount
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('computeBreakevenHeadcount', () => {
  it('returns floored integer headcount', () => {
    // revenue = 100,000; avg gross = 30,000; benchmark = 25%
    // max cost = 25000; cost per employee = 36675
    // floor(25000 / 36675) = floor(0.681) = 0
    const result = computeBreakevenHeadcount(100_000, 30_000, 25)
    expect(Number.isInteger(result)).toBe(true)
  })

  it('result is floor-based (truncated, not rounded)', () => {
    // Verify it does NOT round up
    const result = computeBreakevenHeadcount(200_000, 30_000, 25)
    const exact  = (200_000 * 0.25) / computeTotalEmployerCost(30_000)
    expect(result).toBe(Math.floor(exact))
  })

  it('returns 0 for zero avg salary', () => {
    expect(computeBreakevenHeadcount(100_000, 0)).toBe(0)
  })

  it('scales with revenue', () => {
    const low  = computeBreakevenHeadcount(100_000, 25_000)
    const high = computeBreakevenHeadcount(500_000, 25_000)
    expect(high).toBeGreaterThan(low)
  })

  it('uses default 25% benchmark', () => {
    // Explicit 25 should produce same as default
    const defaultResult  = computeBreakevenHeadcount(500_000, 30_000)
    const explicit25     = computeBreakevenHeadcount(500_000, 30_000, 25)
    expect(defaultResult).toBe(explicit25)
  })

  it('higher benchmark allows more headcount', () => {
    const atDefault  = computeBreakevenHeadcount(500_000, 30_000, 25)
    const atHigher   = computeBreakevenHeadcount(500_000, 30_000, 40)
    expect(atHigher).toBeGreaterThan(atDefault)
  })

  it('returns 0 for zero revenue', () => {
    expect(computeBreakevenHeadcount(0, 30_000)).toBe(0)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SGK formula verification
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('computeEmployerSgk — formula verification', () => {
  it('formula: gross × 20.25% at default rate', () => {
    // 20_000 × 0.2025 = 4050
    expect(computeEmployerSgk(20_000)).toBeCloseTo(4050, 2)
  })

  it('formula: gross × 20.25% for 1 TRY gross', () => {
    expect(computeEmployerSgk(1)).toBeCloseTo(0.2025, 4)
  })

  it('proportional: doubling gross doubles SGK', () => {
    const s1 = computeEmployerSgk(10_000)
    const s2 = computeEmployerSgk(20_000)
    expect(s2).toBeCloseTo(s1 * 2, 2)
  })

  it('custom rate of 0% produces 0 SGK', () => {
    expect(computeEmployerSgk(50_000, 0)).toBe(0)
  })

  it('custom rate of 100% produces SGK equal to gross', () => {
    expect(computeEmployerSgk(10_000, 100)).toBeCloseTo(10_000, 2)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Unemployment insurance formula verification
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('computeEmployerUnemploymentInsurance — formula verification', () => {
  it('formula: gross × 2.0% at default rate', () => {
    // 25_000 × 0.02 = 500
    expect(computeEmployerUnemploymentInsurance(25_000)).toBeCloseTo(500, 2)
  })

  it('proportional: 3× gross gives 3× UI', () => {
    const u1 = computeEmployerUnemploymentInsurance(10_000)
    const u3 = computeEmployerUnemploymentInsurance(30_000)
    expect(u3).toBeCloseTo(u1 * 3, 2)
  })

  it('0% rate produces 0 UI regardless of gross', () => {
    expect(computeEmployerUnemploymentInsurance(100_000, 0)).toBe(0)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Total employer cost = gross + SGK + UI
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('computeTotalEmployerCost — gross + SGK + UI identity', () => {
  it('total = gross + SGK + UI for any gross', () => {
    const gross = 15_000
    const sgk = computeEmployerSgk(gross)
    const ui  = computeEmployerUnemploymentInsurance(gross)
    const total = computeTotalEmployerCost(gross)
    expect(total).toBeCloseTo(gross + sgk + ui, 2)
  })

  it('total = gross + SGK + UI for 40,000 TRY', () => {
    const gross = 40_000
    const sgk = computeEmployerSgk(gross)
    const ui  = computeEmployerUnemploymentInsurance(gross)
    const total = computeTotalEmployerCost(gross)
    expect(total).toBeCloseTo(gross + sgk + ui, 2)
  })

  it('total is always >= gross (taxes add to cost)', () => {
    for (const g of [0, 5_000, 25_000, 100_000]) {
      expect(computeTotalEmployerCost(g)).toBeGreaterThanOrEqual(g)
    }
  })

  it('multiplier is approximately 1.2225 (1 + 0.2025 + 0.02)', () => {
    const gross = 10_000
    const total = computeTotalEmployerCost(gross)
    expect(total / gross).toBeCloseTo(1.2225, 4)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// computeMinViableSalary — inverse formula
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('computeMinViableSalary — inverse formula verification', () => {
  it('inverse of total cost: salary × multiplier × headcount = budget', () => {
    const revenue = 200_000
    const headcount = 4
    const ratio = 25
    const salary = computeMinViableSalary(revenue, headcount, ratio)
    // verify: salary × 1.2225 × headcount ≤ revenue × ratio%
    const totalCost = salary * 1.2225 * headcount
    const budget = revenue * (ratio / 100)
    expect(totalCost).toBeCloseTo(budget, 0)
  })

  it('formula: revenue × ratio% / headcount / multiplier', () => {
    // 100_000 × 25% = 25_000; /5 = 5_000; /1.2225 ≈ 4089.98
    const result = computeMinViableSalary(100_000, 5, 25)
    const expected = (100_000 * 0.25) / 5 / 1.2225
    expect(result).toBeCloseTo(expected, 0)
  })

  it('larger revenue → larger min viable salary (proportional)', () => {
    const s1 = computeMinViableSalary(100_000, 5, 25)
    const s2 = computeMinViableSalary(200_000, 5, 25)
    expect(s2).toBeCloseTo(s1 * 2, 0)
  })

  it('higher ratio% → higher min viable salary', () => {
    const s25 = computeMinViableSalary(100_000, 5, 25)
    const s35 = computeMinViableSalary(100_000, 5, 35)
    expect(s35).toBeGreaterThan(s25)
  })

  it('returns 0 for 0% target ratio', () => {
    expect(computeMinViableSalary(100_000, 5, 0)).toBeCloseTo(0, 2)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// computeRevenuePerHead — formula verification
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('computeRevenuePerHead — formula verification', () => {
  it('formula: monthly_revenue / headcount', () => {
    // 300_000 / 6 = 50_000
    expect(computeRevenuePerHead(300_000, 6)).toBeCloseTo(50_000, 2)
  })

  it('returns null for headcount = 0', () => {
    expect(computeRevenuePerHead(500_000, 0)).toBeNull()
  })

  it('returns full revenue for headcount = 1', () => {
    expect(computeRevenuePerHead(123_456, 1)).toBeCloseTo(123_456, 2)
  })

  it('inversely proportional: double headcount halves revenue per head', () => {
    const rph1 = computeRevenuePerHead(120_000, 2)
    const rph2 = computeRevenuePerHead(120_000, 4)
    expect(rph1!).toBeCloseTo((rph2 ?? 0) * 2, 2)
  })

  it('proportional: double revenue doubles revenue per head', () => {
    const rph1 = computeRevenuePerHead(100_000, 5)
    const rph2 = computeRevenuePerHead(200_000, 5)
    expect(rph2!).toBeCloseTo((rph1 ?? 0) * 2, 2)
  })

  it('non-null result is always a positive number for positive revenue', () => {
    const result = computeRevenuePerHead(50_000, 3)
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(0)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// classifyHeadcountEfficiency — all five levels at exact boundaries
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('classifyHeadcountEfficiency — all five levels at exact boundaries', () => {
  // excellent: ≤ 15
  it('exactly 15% → excellent (boundary inclusive)', () => {
    expect(classifyHeadcountEfficiency(15)).toBe('excellent')
  })

  it('0% → excellent', () => {
    expect(classifyHeadcountEfficiency(0)).toBe('excellent')
  })

  it('14.99% → excellent', () => {
    expect(classifyHeadcountEfficiency(14.99)).toBe('excellent')
  })

  // good: 15 < x ≤ 25
  it('15.01% → good (just above excellent boundary)', () => {
    expect(classifyHeadcountEfficiency(15.01)).toBe('good')
  })

  it('exactly 25% → good (boundary inclusive)', () => {
    expect(classifyHeadcountEfficiency(25)).toBe('good')
  })

  it('20% → good (mid-range)', () => {
    expect(classifyHeadcountEfficiency(20)).toBe('good')
  })

  // acceptable: 25 < x ≤ 35
  it('25.01% → acceptable (just above good boundary)', () => {
    expect(classifyHeadcountEfficiency(25.01)).toBe('acceptable')
  })

  it('exactly 35% → acceptable (boundary inclusive)', () => {
    expect(classifyHeadcountEfficiency(35)).toBe('acceptable')
  })

  it('30% → acceptable (mid-range)', () => {
    expect(classifyHeadcountEfficiency(30)).toBe('acceptable')
  })

  // high: 35 < x ≤ 50
  it('35.01% → high (just above acceptable boundary)', () => {
    expect(classifyHeadcountEfficiency(35.01)).toBe('high')
  })

  it('exactly 50% → high (boundary inclusive)', () => {
    expect(classifyHeadcountEfficiency(50)).toBe('high')
  })

  it('45% → high (mid-range)', () => {
    expect(classifyHeadcountEfficiency(45)).toBe('high')
  })

  // excessive: > 50
  it('50.01% → excessive (just above high boundary)', () => {
    expect(classifyHeadcountEfficiency(50.01)).toBe('excessive')
  })

  it('100% → excessive', () => {
    expect(classifyHeadcountEfficiency(100)).toBe('excessive')
  })

  it('always returns one of the five valid values', () => {
    const valid = ['excellent', 'good', 'acceptable', 'high', 'excessive']
    const ratios = [0, 10, 15, 15.01, 20, 25, 25.01, 30, 35, 35.01, 45, 50, 50.01, 75, 100]
    for (const r of ratios) {
      expect(valid).toContain(classifyHeadcountEfficiency(r))
    }
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// generateHeadcountScenarios — structure and values
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('generateHeadcountScenarios — structure and value assertions', () => {
  it('returns exactly 5 scenarios for any valid input', () => {
    expect(generateHeadcountScenarios(3, 20_000, null)).toHaveLength(5)
    expect(generateHeadcountScenarios(0, 10_000, 50_000)).toHaveLength(5)
    expect(generateHeadcountScenarios(10, 50_000, 1_000_000)).toHaveLength(5)
  })

  it('scenario deltas: -1, 0, +1, +2, +3 from current', () => {
    const current = 5
    const scenarios = generateHeadcountScenarios(current, 25_000, null)
    const headcounts = scenarios.map(s => s.headcount)
    expect(headcounts).toContain(4)  // -1
    expect(headcounts).toContain(5)  // current
    expect(headcounts).toContain(6)  // +1
    expect(headcounts).toContain(7)  // +2
    expect(headcounts).toContain(8)  // +3
  })

  it('scenario with delta -1 is named "1 Çıkarma"', () => {
    const scenarios = generateHeadcountScenarios(5, 25_000, null)
    const minus1 = scenarios.find(s => s.headcount === 4)
    expect(minus1?.name).toBe('1 Çıkarma')
  })

  it('scenario with delta +3 name contains the delta', () => {
    const scenarios = generateHeadcountScenarios(5, 25_000, null)
    const plus3 = scenarios.find(s => s.name.includes('+3'))
    expect(plus3).toBeDefined()
  })

  it('monthly_cost = total_employer_cost × headcount', () => {
    const gross = 30_000
    const scenarios = generateHeadcountScenarios(3, gross, 500_000)
    for (const s of scenarios) {
      if (s.headcount > 0) {
        const expected = computeTotalEmployerCost(gross) * s.headcount
        expect(s.monthly_cost_try).toBeCloseTo(expected, 2)
      }
    }
  })

  it('annual_cost = monthly_cost × 12 for all scenarios', () => {
    const scenarios = generateHeadcountScenarios(4, 25_000, 300_000)
    for (const s of scenarios) {
      expect(s.annual_cost_try).toBeCloseTo(s.monthly_cost_try * 12, 2)
    }
  })

  it('revenue_per_head_try is non-null when revenue is provided', () => {
    const scenarios = generateHeadcountScenarios(3, 25_000, 200_000)
    for (const s of scenarios) {
      if (s.headcount > 0) {
        expect(s.revenue_per_head_try).not.toBeNull()
      }
    }
  })

  it('headcount never negative even for headcount=1 with -1 delta', () => {
    const scenarios = generateHeadcountScenarios(1, 25_000, null)
    for (const s of scenarios) {
      expect(s.headcount).toBeGreaterThanOrEqual(0)
    }
  })
})

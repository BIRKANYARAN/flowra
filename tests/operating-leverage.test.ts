// ─────────────────────────────────────────────────────────────────────────────
// tests/operating-leverage.test.ts
//
// Comprehensive tests for operating-leverage.service.ts pure functions.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  computeDol,
  classifyDolLevel,
  computeFixedCostRatio,
  classifyFixedCostProfile,
  computeContributionMargin,
  computeContributionMarginRatio,
  computeBreakEvenRevenue,
  computeMarginOfSafety,
  classifyMarginOfSafety,
  computeOperatingLeverageRatio,
  computeVariableCostRate,
  computeFixedCostRate,
  computeCostSensitivity,
  classifyExpenseNatureByLabel,
  generateOperatingLeverageNarrative,
} from '../lib/services/finance/operating-leverage.service'

// ── 1. computeDol ─────────────────────────────────────────────────────────────

describe('computeDol', () => {
  it('returns null when priorEbit is 0', () => {
    expect(computeDol(10_000, 5_000, 100_000, 0)).toBeNull()
  })

  it('returns null when revenueChange is 0', () => {
    expect(computeDol(0, 5_000, 100_000, 20_000)).toBeNull()
  })

  it('returns null when both priorEbit and revenueChange are 0', () => {
    expect(computeDol(0, 0, 100_000, 0)).toBeNull()
  })

  it('computes positive DOL — revenue up, EBIT up proportionally more', () => {
    // %ΔRevenue = 10_000/100_000 = 0.1; %ΔEBIT = 4_000/20_000 = 0.2 → DOL = 2.0
    const result = computeDol(10_000, 4_000, 100_000, 20_000)
    expect(result).toBeCloseTo(2.0, 5)
  })

  it('computes DOL = 1 when revenue and EBIT change proportionally', () => {
    // %ΔRevenue = 0.1; %ΔEBIT = 0.1 → DOL = 1.0
    const result = computeDol(10_000, 2_000, 100_000, 20_000)
    expect(result).toBeCloseTo(1.0, 5)
  })

  it('computes negative DOL — revenue up, EBIT down', () => {
    // %ΔRevenue = 0.1; %ΔEBIT = -0.2 → DOL = -2.0
    const result = computeDol(10_000, -4_000, 100_000, 20_000)
    expect(result).toBeCloseTo(-2.0, 5)
  })

  it('computes negative DOL — revenue down, EBIT down more', () => {
    // %ΔRevenue = -0.1; %ΔEBIT = -0.3 → DOL = 3.0
    const result = computeDol(-10_000, -6_000, 100_000, 20_000)
    expect(result).toBeCloseTo(3.0, 5)
  })

  it('handles large round numbers', () => {
    // %Δrev = 50_000/1_000_000 = 0.05; %ΔEBIT = 25_000/100_000 = 0.25 → DOL = 5.0
    const result = computeDol(50_000, 25_000, 1_000_000, 100_000)
    expect(result).toBeCloseTo(5.0, 5)
  })

  it('handles decimal revenue/ebit values', () => {
    const result = computeDol(1_500.5, 900.3, 15_000, 5_000)
    expect(result).not.toBeNull()
    expect(typeof result).toBe('number')
  })

  it('negative priorRevenue still computes (degenerate case)', () => {
    // priorEbit != 0, revenueChange != 0, so result should be a number
    const result = computeDol(10_000, 2_000, -50_000, 5_000)
    expect(result).not.toBeNull()
  })
})

// ── 2. classifyDolLevel ───────────────────────────────────────────────────────

describe('classifyDolLevel', () => {
  it('returns insufficient_data for null', () => {
    expect(classifyDolLevel(null)).toBe('insufficient_data')
  })

  it('returns low for |dol| = 1.5 (boundary)', () => {
    expect(classifyDolLevel(1.5)).toBe('low')
    expect(classifyDolLevel(-1.5)).toBe('low')
  })

  it('returns low for |dol| < 1.5', () => {
    expect(classifyDolLevel(1.0)).toBe('low')
    expect(classifyDolLevel(-0.5)).toBe('low')
    expect(classifyDolLevel(0)).toBe('low')
  })

  it('returns moderate for |dol| just above 1.5', () => {
    expect(classifyDolLevel(1.51)).toBe('moderate')
    expect(classifyDolLevel(-1.51)).toBe('moderate')
  })

  it('returns moderate for |dol| = 2.5 (boundary)', () => {
    expect(classifyDolLevel(2.5)).toBe('moderate')
    expect(classifyDolLevel(-2.5)).toBe('moderate')
  })

  it('returns high for |dol| just above 2.5', () => {
    expect(classifyDolLevel(2.51)).toBe('high')
    expect(classifyDolLevel(-2.51)).toBe('high')
  })

  it('returns high for |dol| = 4.0 (boundary)', () => {
    expect(classifyDolLevel(4.0)).toBe('high')
    expect(classifyDolLevel(-4.0)).toBe('high')
  })

  it('returns very_high for |dol| just above 4.0', () => {
    expect(classifyDolLevel(4.01)).toBe('very_high')
    expect(classifyDolLevel(-4.01)).toBe('very_high')
  })

  it('returns very_high for |dol| = 7.0 (boundary)', () => {
    expect(classifyDolLevel(7.0)).toBe('very_high')
    expect(classifyDolLevel(-7.0)).toBe('very_high')
  })

  it('returns extreme for |dol| just above 7.0', () => {
    expect(classifyDolLevel(7.01)).toBe('extreme')
    expect(classifyDolLevel(-7.01)).toBe('extreme')
  })

  it('returns extreme for very large dol', () => {
    expect(classifyDolLevel(100)).toBe('extreme')
    expect(classifyDolLevel(-50)).toBe('extreme')
  })
})

// ── 3. computeFixedCostRatio ──────────────────────────────────────────────────

describe('computeFixedCostRatio', () => {
  it('returns null when totalCosts is 0', () => {
    expect(computeFixedCostRatio(5_000, 0)).toBeNull()
  })

  it('returns 1.0 when all costs are fixed', () => {
    expect(computeFixedCostRatio(10_000, 10_000)).toBe(1.0)
  })

  it('returns 0 when fixedCosts is 0', () => {
    expect(computeFixedCostRatio(0, 10_000)).toBe(0)
  })

  it('returns 0.5 for a 50/50 split', () => {
    expect(computeFixedCostRatio(5_000, 10_000)).toBe(0.5)
  })

  it('returns correct fraction for 30/70 split', () => {
    expect(computeFixedCostRatio(3_000, 10_000)).toBeCloseTo(0.3, 5)
  })

  it('returns fraction, not percentage', () => {
    const result = computeFixedCostRatio(2_000, 8_000)
    expect(result).toBeCloseTo(0.25, 5)
    expect(result).toBeLessThan(1.0)
  })

  it('handles large amounts', () => {
    expect(computeFixedCostRatio(700_000, 1_000_000)).toBeCloseTo(0.7, 5)
  })
})

// ── 4. classifyFixedCostProfile ───────────────────────────────────────────────

describe('classifyFixedCostProfile', () => {
  it('returns insufficient_data for null', () => {
    expect(classifyFixedCostProfile(null)).toBe('insufficient_data')
  })

  it('returns variable_heavy for ratio < 0.20', () => {
    expect(classifyFixedCostProfile(0.0)).toBe('variable_heavy')
    expect(classifyFixedCostProfile(0.10)).toBe('variable_heavy')
    expect(classifyFixedCostProfile(0.19)).toBe('variable_heavy')
  })

  it('returns variable_heavy at exact 0.0', () => {
    expect(classifyFixedCostProfile(0.0)).toBe('variable_heavy')
  })

  it('returns balanced at boundary 0.20', () => {
    expect(classifyFixedCostProfile(0.20)).toBe('balanced')
  })

  it('returns balanced for ratio 0.20–0.39', () => {
    expect(classifyFixedCostProfile(0.30)).toBe('balanced')
    expect(classifyFixedCostProfile(0.39)).toBe('balanced')
  })

  it('returns fixed_heavy at boundary 0.40', () => {
    expect(classifyFixedCostProfile(0.40)).toBe('fixed_heavy')
  })

  it('returns fixed_heavy for ratio 0.40–0.64', () => {
    expect(classifyFixedCostProfile(0.50)).toBe('fixed_heavy')
    expect(classifyFixedCostProfile(0.64)).toBe('fixed_heavy')
  })

  it('returns highly_fixed at boundary 0.65', () => {
    expect(classifyFixedCostProfile(0.65)).toBe('highly_fixed')
  })

  it('returns highly_fixed for ratio >= 0.65', () => {
    expect(classifyFixedCostProfile(0.80)).toBe('highly_fixed')
    expect(classifyFixedCostProfile(1.0)).toBe('highly_fixed')
  })
})

// ── 5. computeContributionMargin ──────────────────────────────────────────────

describe('computeContributionMargin', () => {
  it('returns revenue minus variable costs', () => {
    expect(computeContributionMargin(100_000, 60_000)).toBe(40_000)
  })

  it('returns zero when costs equal revenue', () => {
    expect(computeContributionMargin(50_000, 50_000)).toBe(0)
  })

  it('returns negative when variable costs exceed revenue', () => {
    expect(computeContributionMargin(30_000, 50_000)).toBe(-20_000)
  })

  it('returns revenue when variable costs are 0', () => {
    expect(computeContributionMargin(80_000, 0)).toBe(80_000)
  })

  it('handles zero revenue', () => {
    expect(computeContributionMargin(0, 0)).toBe(0)
  })

  it('handles decimal values', () => {
    expect(computeContributionMargin(1_000.50, 600.25)).toBeCloseTo(400.25, 2)
  })
})

// ── 6. computeContributionMarginRatio ────────────────────────────────────────

describe('computeContributionMarginRatio', () => {
  it('returns null when revenue is 0', () => {
    expect(computeContributionMarginRatio(0, 0)).toBeNull()
    expect(computeContributionMarginRatio(0, 1_000)).toBeNull()
  })

  it('returns correct fraction for normal case', () => {
    expect(computeContributionMarginRatio(100_000, 60_000)).toBeCloseTo(0.4, 5)
  })

  it('returns 1.0 when variable costs are 0', () => {
    expect(computeContributionMarginRatio(100_000, 0)).toBe(1.0)
  })

  it('returns 0 when variable costs equal revenue', () => {
    expect(computeContributionMarginRatio(50_000, 50_000)).toBe(0)
  })

  it('returns negative when variable costs exceed revenue', () => {
    const result = computeContributionMarginRatio(40_000, 60_000)
    expect(result).not.toBeNull()
    expect(result!).toBeLessThan(0)
  })

  it('result is a fraction not percentage', () => {
    const result = computeContributionMarginRatio(100_000, 30_000)
    expect(result).toBeCloseTo(0.7, 5)
    expect(result).toBeLessThanOrEqual(1.0)
  })
})

// ── 7. computeBreakEvenRevenue ───────────────────────────────────────────────

describe('computeBreakEvenRevenue', () => {
  it('returns null when cmr is null', () => {
    expect(computeBreakEvenRevenue(50_000, null)).toBeNull()
  })

  it('returns null when cmr is 0', () => {
    expect(computeBreakEvenRevenue(50_000, 0)).toBeNull()
  })

  it('returns null when cmr is negative', () => {
    expect(computeBreakEvenRevenue(50_000, -0.2)).toBeNull()
  })

  it('computes correct break-even for normal case', () => {
    // fixedCosts=40_000, CMR=0.4 → BE = 100_000
    expect(computeBreakEvenRevenue(40_000, 0.4)).toBeCloseTo(100_000, 2)
  })

  it('computes break-even with CMR=1.0 (pure fixed cost business)', () => {
    expect(computeBreakEvenRevenue(75_000, 1.0)).toBeCloseTo(75_000, 2)
  })

  it('computes break-even with small CMR', () => {
    // fixedCosts=10_000, CMR=0.1 → BE = 100_000
    expect(computeBreakEvenRevenue(10_000, 0.1)).toBeCloseTo(100_000, 2)
  })

  it('handles zero fixed costs', () => {
    expect(computeBreakEvenRevenue(0, 0.5)).toBeCloseTo(0, 5)
  })
})

// ── 8. computeMarginOfSafety ──────────────────────────────────────────────────

describe('computeMarginOfSafety', () => {
  it('returns null when breakEvenRevenue is null', () => {
    expect(computeMarginOfSafety(100_000, null)).toBeNull()
  })

  it('returns null when revenue is 0', () => {
    expect(computeMarginOfSafety(0, 50_000)).toBeNull()
  })

  it('returns null for both 0', () => {
    expect(computeMarginOfSafety(0, null)).toBeNull()
  })

  it('returns correct positive MOS (well above break-even)', () => {
    // revenue=150_000, BE=100_000 → MOS = 50/150 ≈ 0.333
    const result = computeMarginOfSafety(150_000, 100_000)
    expect(result).toBeCloseTo(0.3333, 3)
  })

  it('returns 0 when revenue equals break-even', () => {
    expect(computeMarginOfSafety(100_000, 100_000)).toBe(0)
  })

  it('returns negative MOS when below break-even', () => {
    // revenue=80_000, BE=100_000 → MOS = -20/80 = -0.25
    const result = computeMarginOfSafety(80_000, 100_000)
    expect(result).toBeCloseTo(-0.25, 5)
  })

  it('returns exactly 0.5 for revenue double break-even', () => {
    expect(computeMarginOfSafety(200_000, 100_000)).toBeCloseTo(0.5, 5)
  })
})

// ── 9. classifyMarginOfSafety ─────────────────────────────────────────────────

describe('classifyMarginOfSafety', () => {
  it('returns insufficient_data for null', () => {
    expect(classifyMarginOfSafety(null)).toBe('insufficient_data')
  })

  it('returns very_safe at boundary 0.40', () => {
    expect(classifyMarginOfSafety(0.40)).toBe('very_safe')
  })

  it('returns very_safe for ratio > 0.40', () => {
    expect(classifyMarginOfSafety(0.50)).toBe('very_safe')
    expect(classifyMarginOfSafety(0.80)).toBe('very_safe')
    expect(classifyMarginOfSafety(1.0)).toBe('very_safe')
  })

  it('returns safe for ratio 0.25–0.39', () => {
    expect(classifyMarginOfSafety(0.25)).toBe('safe')
    expect(classifyMarginOfSafety(0.30)).toBe('safe')
    expect(classifyMarginOfSafety(0.39)).toBe('safe')
  })

  it('returns moderate at boundary 0.15', () => {
    expect(classifyMarginOfSafety(0.15)).toBe('moderate')
  })

  it('returns moderate for ratio 0.15–0.24', () => {
    expect(classifyMarginOfSafety(0.20)).toBe('moderate')
    expect(classifyMarginOfSafety(0.24)).toBe('moderate')
  })

  it('returns thin at boundary 0.05', () => {
    expect(classifyMarginOfSafety(0.05)).toBe('thin')
  })

  it('returns thin for ratio 0.05–0.14', () => {
    expect(classifyMarginOfSafety(0.10)).toBe('thin')
    expect(classifyMarginOfSafety(0.14)).toBe('thin')
  })

  it('returns at_risk at boundary 0.0', () => {
    expect(classifyMarginOfSafety(0.0)).toBe('at_risk')
  })

  it('returns at_risk for ratio 0.0–0.04', () => {
    expect(classifyMarginOfSafety(0.01)).toBe('at_risk')
    expect(classifyMarginOfSafety(0.04)).toBe('at_risk')
  })

  it('returns below_breakeven for negative ratio', () => {
    expect(classifyMarginOfSafety(-0.01)).toBe('below_breakeven')
    expect(classifyMarginOfSafety(-0.50)).toBe('below_breakeven')
    expect(classifyMarginOfSafety(-1.0)).toBe('below_breakeven')
  })
})

// ── 10. computeOperatingLeverageRatio ────────────────────────────────────────

describe('computeOperatingLeverageRatio', () => {
  it('returns null when both are 0 (total = 0)', () => {
    expect(computeOperatingLeverageRatio(0, 0)).toBeNull()
  })

  it('returns 1.0 when variable costs are 0 (all fixed)', () => {
    expect(computeOperatingLeverageRatio(50_000, 0)).toBe(1.0)
  })

  it('returns 0 when fixed costs are 0 (all variable)', () => {
    expect(computeOperatingLeverageRatio(0, 50_000)).toBe(0)
  })

  it('returns 0.5 for equal split', () => {
    expect(computeOperatingLeverageRatio(50_000, 50_000)).toBe(0.5)
  })

  it('returns correct ratio for 30/70 fixed/variable split', () => {
    expect(computeOperatingLeverageRatio(30_000, 70_000)).toBeCloseTo(0.3, 5)
  })

  it('uses fixedCosts + variableCosts (not totalCosts from elsewhere)', () => {
    // 40 fixed, 60 variable = 40/100 = 0.4
    const result = computeOperatingLeverageRatio(40_000, 60_000)
    expect(result).toBeCloseTo(0.4, 5)
  })

  it('handles large values', () => {
    expect(computeOperatingLeverageRatio(700_000, 300_000)).toBeCloseTo(0.7, 5)
  })
})

// ── 11. computeVariableCostRate ───────────────────────────────────────────────

describe('computeVariableCostRate', () => {
  it('returns null when revenue is 0', () => {
    expect(computeVariableCostRate(20_000, 0)).toBeNull()
  })

  it('returns 0 when variable costs are 0', () => {
    expect(computeVariableCostRate(0, 100_000)).toBe(0)
  })

  it('returns correct rate for normal case', () => {
    expect(computeVariableCostRate(60_000, 100_000)).toBeCloseTo(0.6, 5)
  })

  it('returns > 1 when variable costs exceed revenue', () => {
    const result = computeVariableCostRate(120_000, 100_000)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(1.2, 5)
  })

  it('returns fraction, not percentage', () => {
    const result = computeVariableCostRate(40_000, 80_000)
    expect(result).toBeCloseTo(0.5, 5)
  })
})

// ── 12. computeFixedCostRate ──────────────────────────────────────────────────

describe('computeFixedCostRate', () => {
  it('returns null when revenue is 0', () => {
    expect(computeFixedCostRate(10_000, 0)).toBeNull()
  })

  it('returns 0 when fixed costs are 0', () => {
    expect(computeFixedCostRate(0, 100_000)).toBe(0)
  })

  it('returns correct rate for normal case', () => {
    expect(computeFixedCostRate(30_000, 100_000)).toBeCloseTo(0.3, 5)
  })

  it('returns 1.0 when fixed costs equal revenue', () => {
    expect(computeFixedCostRate(100_000, 100_000)).toBe(1.0)
  })

  it('returns fraction less than 1 for typical business', () => {
    const result = computeFixedCostRate(25_000, 200_000)
    expect(result).toBeCloseTo(0.125, 5)
    expect(result).toBeLessThan(1.0)
  })
})

// ── 13. computeCostSensitivity ────────────────────────────────────────────────

describe('computeCostSensitivity', () => {
  it('returns null when variableCostRate is null', () => {
    expect(computeCostSensitivity(null)).toBeNull()
    expect(computeCostSensitivity(null, 0.02)).toBeNull()
  })

  it('uses default 1% revenue change', () => {
    // rate=0.6, change=0.01 → 0.6 * 0.01 * 100 = 0.6%
    expect(computeCostSensitivity(0.6)).toBeCloseTo(0.6, 5)
  })

  it('uses custom revenue change pct', () => {
    // rate=0.6, change=0.05 → 0.6 * 0.05 * 100 = 3.0%
    expect(computeCostSensitivity(0.6, 0.05)).toBeCloseTo(3.0, 5)
  })

  it('returns 0 when variable cost rate is 0', () => {
    expect(computeCostSensitivity(0.0)).toBe(0)
  })

  it('returns 100% sensitivity when rate is 1.0 and 100% change', () => {
    expect(computeCostSensitivity(1.0, 1.0)).toBeCloseTo(100, 5)
  })

  it('handles small rates correctly', () => {
    // rate=0.10, change=0.01 → 0.1%
    expect(computeCostSensitivity(0.10)).toBeCloseTo(0.1, 5)
  })

  it('handles 10% revenue change scenario', () => {
    // rate=0.50, change=0.10 → 5.0%
    expect(computeCostSensitivity(0.5, 0.10)).toBeCloseTo(5.0, 5)
  })
})

// ── 14. classifyExpenseNatureByLabel ─────────────────────────────────────────

describe('classifyExpenseNatureByLabel', () => {
  // Fixed labels
  it('classifies rent as fixed', () => {
    expect(classifyExpenseNatureByLabel('rent')).toBe('fixed')
  })

  it('classifies salary as fixed', () => {
    expect(classifyExpenseNatureByLabel('salary')).toBe('fixed')
  })

  it('classifies insurance as fixed', () => {
    expect(classifyExpenseNatureByLabel('insurance')).toBe('fixed')
  })

  it('classifies subscription as fixed', () => {
    expect(classifyExpenseNatureByLabel('subscription')).toBe('fixed')
  })

  it('classifies software as fixed', () => {
    expect(classifyExpenseNatureByLabel('software')).toBe('fixed')
  })

  it('classifies lease as fixed', () => {
    expect(classifyExpenseNatureByLabel('lease')).toBe('fixed')
  })

  it('classifies depreciation as fixed', () => {
    expect(classifyExpenseNatureByLabel('depreciation')).toBe('fixed')
  })

  // Variable labels
  it('classifies logistics as variable', () => {
    expect(classifyExpenseNatureByLabel('logistics')).toBe('variable')
  })

  it('classifies shipping as variable', () => {
    expect(classifyExpenseNatureByLabel('shipping')).toBe('variable')
  })

  it('classifies marketing as variable', () => {
    expect(classifyExpenseNatureByLabel('marketing')).toBe('variable')
  })

  it('classifies sales as variable', () => {
    expect(classifyExpenseNatureByLabel('sales')).toBe('variable')
  })

  it('classifies cogs as variable', () => {
    expect(classifyExpenseNatureByLabel('cogs')).toBe('variable')
  })

  it('classifies materials as variable', () => {
    expect(classifyExpenseNatureByLabel('materials')).toBe('variable')
  })

  it('classifies packaging as variable', () => {
    expect(classifyExpenseNatureByLabel('packaging')).toBe('variable')
  })

  it('classifies commission as variable', () => {
    expect(classifyExpenseNatureByLabel('commission')).toBe('variable')
  })

  // Semi-variable (default)
  it('classifies unknown type as semi_variable', () => {
    expect(classifyExpenseNatureByLabel('other')).toBe('semi_variable')
    expect(classifyExpenseNatureByLabel('general')).toBe('semi_variable')
    expect(classifyExpenseNatureByLabel('utilities')).toBe('semi_variable')
    expect(classifyExpenseNatureByLabel('operational')).toBe('semi_variable')
    expect(classifyExpenseNatureByLabel('tax')).toBe('semi_variable')
    expect(classifyExpenseNatureByLabel('interest')).toBe('semi_variable')
  })

  it('classifies empty string as semi_variable', () => {
    expect(classifyExpenseNatureByLabel('')).toBe('semi_variable')
  })

  // Case handling
  it('handles uppercase input for fixed label', () => {
    expect(classifyExpenseNatureByLabel('RENT')).toBe('fixed')
    expect(classifyExpenseNatureByLabel('SALARY')).toBe('fixed')
  })

  it('handles mixed case input for variable label', () => {
    expect(classifyExpenseNatureByLabel('Marketing')).toBe('variable')
    expect(classifyExpenseNatureByLabel('LOGISTICS')).toBe('variable')
  })

  it('handles leading/trailing whitespace', () => {
    expect(classifyExpenseNatureByLabel('  rent  ')).toBe('fixed')
    expect(classifyExpenseNatureByLabel(' marketing ')).toBe('variable')
  })

  it('handles mixed case for depreciation', () => {
    expect(classifyExpenseNatureByLabel('Depreciation')).toBe('fixed')
    expect(classifyExpenseNatureByLabel('DEPRECIATION')).toBe('fixed')
  })

  it('handles mixed case for commission', () => {
    expect(classifyExpenseNatureByLabel('Commission')).toBe('variable')
    expect(classifyExpenseNatureByLabel('COMMISSION')).toBe('variable')
  })
})

// ── 15. generateOperatingLeverageNarrative ────────────────────────────────────

describe('generateOperatingLeverageNarrative', () => {
  const baseParams = {
    dol: 2.5,
    dolLevel: 'moderate' as const,
    fixedCostRatio: 0.40,
    breakEvenRevenue: 100_000,
    marginOfSafety: 0.30,
    currentRevenue: 143_000,
  }

  it('returns a non-empty string', () => {
    const result = generateOperatingLeverageNarrative(baseParams)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(10)
  })

  it('includes DOL value when dol is not null', () => {
    const result = generateOperatingLeverageNarrative(baseParams)
    expect(result).toMatch(/2\.50x|kaldıraç/i)
  })

  it('handles null dol gracefully', () => {
    const result = generateOperatingLeverageNarrative({
      ...baseParams,
      dol: null,
      dolLevel: 'insufficient_data',
    })
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(5)
  })

  it('handles null breakEvenRevenue', () => {
    const result = generateOperatingLeverageNarrative({
      ...baseParams,
      breakEvenRevenue: null,
    })
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(5)
  })

  it('handles null marginOfSafety', () => {
    const result = generateOperatingLeverageNarrative({
      ...baseParams,
      marginOfSafety: null,
    })
    expect(typeof result).toBe('string')
  })

  it('handles null fixedCostRatio', () => {
    const result = generateOperatingLeverageNarrative({
      ...baseParams,
      fixedCostRatio: null,
    })
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(5)
  })

  it('returns Turkish text containing expected keywords', () => {
    const result = generateOperatingLeverageNarrative(baseParams)
    // Should contain at least one Turkish keyword
    const hasTurkish =
      result.includes('kaldıraç') ||
      result.includes('başabaş') ||
      result.includes('marj') ||
      result.includes('gider') ||
      result.includes('veri')
    expect(hasTurkish).toBe(true)
  })

  it('indicates below break-even in narrative when MOS is negative', () => {
    const result = generateOperatingLeverageNarrative({
      ...baseParams,
      marginOfSafety: -0.15,
    })
    expect(result).toMatch(/altında|below|negatif|-/i)
  })

  it('handles extreme DOL level', () => {
    const result = generateOperatingLeverageNarrative({
      ...baseParams,
      dol: 10,
      dolLevel: 'extreme',
    })
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(5)
  })

  it('handles low DOL level', () => {
    const result = generateOperatingLeverageNarrative({
      ...baseParams,
      dol: 1.2,
      dolLevel: 'low',
    })
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(5)
  })
})

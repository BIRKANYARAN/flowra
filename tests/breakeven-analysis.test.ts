// ─────────────────────────────────────────────────────────────────────────────
// tests/breakeven-analysis.test.ts
//
// Comprehensive tests for breakeven-analysis.service.ts pure functions.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  computeUnitContributionMargin,
  computeContributionMarginRatio,
  computeBreakevenUnits,
  computeBreakevenRevenue,
  computeMarginOfSafety,
  computeMarginOfSafetyPct,
  computeOperatingLeverage,
  computeTargetRevenue,
  classifyMarginOfSafetyHealth,
  computeProductBreakeven,
  computeWeightedAvgCmr,
  computeDaysToBreakeven,
  classifyOperatingLeverageRisk,
} from '../lib/services/finance/breakeven-analysis.service'

// ── 1. computeUnitContributionMargin ─────────────────────────────────────────

describe('computeUnitContributionMargin', () => {
  it('returns selling price minus variable cost', () => {
    expect(computeUnitContributionMargin(100, 60)).toBe(40)
  })

  it('returns zero when price equals cost', () => {
    expect(computeUnitContributionMargin(50, 50)).toBe(0)
  })

  it('returns negative when cost exceeds price', () => {
    expect(computeUnitContributionMargin(40, 60)).toBe(-20)
  })

  it('handles large values', () => {
    expect(computeUnitContributionMargin(10000, 4000)).toBe(6000)
  })

  it('handles decimal values', () => {
    expect(computeUnitContributionMargin(29.99, 15.50)).toBeCloseTo(14.49, 2)
  })
})

// ── 2. computeContributionMarginRatio ────────────────────────────────────────

describe('computeContributionMarginRatio', () => {
  it('returns CM / selling price as decimal', () => {
    expect(computeContributionMarginRatio(40, 100)).toBe(0.4)
  })

  it('returns 0 when selling price is 0 (no NaN)', () => {
    expect(computeContributionMarginRatio(100, 0)).toBe(0)
    expect(Number.isNaN(computeContributionMarginRatio(100, 0))).toBe(false)
  })

  it('returns 1.0 when cost is zero', () => {
    expect(computeContributionMarginRatio(100, 100)).toBe(1.0)
  })

  it('returns negative ratio for negative contribution margin', () => {
    expect(computeContributionMarginRatio(-20, 100)).toBe(-0.2)
  })

  it('handles fractional ratios', () => {
    expect(computeContributionMarginRatio(30, 100)).toBeCloseTo(0.3, 5)
  })

  it('handles decimal selling prices', () => {
    const cm = computeUnitContributionMargin(200, 120)  // 80
    expect(computeContributionMarginRatio(cm, 200)).toBe(0.4)
  })
})

// ── 3. computeBreakevenUnits ──────────────────────────────────────────────────

describe('computeBreakevenUnits', () => {
  it('computes breakeven units correctly', () => {
    expect(computeBreakevenUnits(200000, 40)).toBe(5000)
  })

  it('returns null when unit CM is 0', () => {
    expect(computeBreakevenUnits(200000, 0)).toBeNull()
  })

  it('returns fractional units when not evenly divisible', () => {
    expect(computeBreakevenUnits(10000, 30)).toBeCloseTo(333.33, 1)
  })

  it('returns 0 when fixed costs are 0', () => {
    expect(computeBreakevenUnits(0, 50)).toBe(0)
  })

  it('handles negative unit CM (returns negative result)', () => {
    const result = computeBreakevenUnits(100000, -20)
    expect(result).not.toBeNull()
    expect(result!).toBeLessThan(0)
  })
})

// ── 4. computeBreakevenRevenue ────────────────────────────────────────────────

describe('computeBreakevenRevenue', () => {
  it('computes breakeven revenue = fixed / CMR', () => {
    // CMR 0.6 → BEP = 200000 / 0.6 = 333333.33
    expect(computeBreakevenRevenue(200000, 0.6)).toBeCloseTo(333333.33, 1)
  })

  it('returns null when CMR is 0', () => {
    expect(computeBreakevenRevenue(200000, 0)).toBeNull()
  })

  it('returns 0 when fixed costs are 0', () => {
    expect(computeBreakevenRevenue(0, 0.4)).toBe(0)
  })

  it('handles high CMR (near 1.0)', () => {
    expect(computeBreakevenRevenue(50000, 1.0)).toBe(50000)
  })

  it('handles low CMR', () => {
    // 100000 / 0.1 = 1000000
    expect(computeBreakevenRevenue(100000, 0.1)).toBe(1000000)
  })
})

// ── 5. computeMarginOfSafety ──────────────────────────────────────────────────

describe('computeMarginOfSafety', () => {
  it('returns current minus breakeven when above BEP', () => {
    expect(computeMarginOfSafety(500000, 333333)).toBeCloseTo(166667, 0)
  })

  it('returns 0 when below breakeven (clamped)', () => {
    expect(computeMarginOfSafety(200000, 333333)).toBe(0)
  })

  it('returns 0 when exactly at breakeven', () => {
    expect(computeMarginOfSafety(300000, 300000)).toBe(0)
  })

  it('returns full revenue when breakeven is 0', () => {
    expect(computeMarginOfSafety(500000, 0)).toBe(500000)
  })

  it('returns 0 when both are 0', () => {
    expect(computeMarginOfSafety(0, 0)).toBe(0)
  })
})

// ── 6. computeMarginOfSafetyPct ───────────────────────────────────────────────

describe('computeMarginOfSafetyPct', () => {
  it('computes MOS as % of current revenue', () => {
    expect(computeMarginOfSafetyPct(166667, 500000)).toBeCloseTo(33.33, 1)
  })

  it('returns 0 when revenue is 0 (no division error)', () => {
    expect(computeMarginOfSafetyPct(0, 0)).toBe(0)
    expect(Number.isNaN(computeMarginOfSafetyPct(0, 0))).toBe(false)
  })

  it('returns 0 when MOS is 0', () => {
    expect(computeMarginOfSafetyPct(0, 500000)).toBe(0)
  })

  it('returns 100 when MOS equals revenue (zero fixed costs)', () => {
    expect(computeMarginOfSafetyPct(500000, 500000)).toBe(100)
  })

  it('handles small MOS values', () => {
    expect(computeMarginOfSafetyPct(10000, 500000)).toBe(2)
  })
})

// ── 7. computeOperatingLeverage ───────────────────────────────────────────────

describe('computeOperatingLeverage', () => {
  it('returns CM / EBIT', () => {
    // CM=300000, EBIT=100000 → leverage=3
    expect(computeOperatingLeverage(300000, 100000)).toBe(3)
  })

  it('returns null when EBIT is 0', () => {
    expect(computeOperatingLeverage(300000, 0)).toBeNull()
  })

  it('returns null when EBIT is negative', () => {
    expect(computeOperatingLeverage(300000, -50000)).toBeNull()
  })

  it('returns high value for small EBIT', () => {
    expect(computeOperatingLeverage(200000, 10000)).toBe(20)
  })

  it('returns 1.0 when CM equals EBIT (no fixed costs)', () => {
    expect(computeOperatingLeverage(100000, 100000)).toBe(1)
  })

  it('returns fractional value correctly', () => {
    expect(computeOperatingLeverage(150000, 50000)).toBe(3)
  })
})

// ── 8. computeTargetRevenue ───────────────────────────────────────────────────

describe('computeTargetRevenue', () => {
  it('returns (fixed + target_profit) / CMR', () => {
    // (200000 + 50000) / 0.5 = 500000
    expect(computeTargetRevenue(200000, 50000, 0.5)).toBe(500000)
  })

  it('returns null when CMR is 0', () => {
    expect(computeTargetRevenue(200000, 50000, 0)).toBeNull()
  })

  it('with zero target profit returns breakeven revenue', () => {
    expect(computeTargetRevenue(200000, 0, 0.6)).toBeCloseTo(333333.33, 1)
  })

  it('handles 10% profit target', () => {
    // fixed=200K, target=50K (10% of 500K), CMR=0.6
    expect(computeTargetRevenue(200000, 50000, 0.6)).toBeCloseTo(416666.67, 1)
  })

  it('handles high profit target', () => {
    const result = computeTargetRevenue(100000, 400000, 0.5)
    expect(result).toBe(1000000)
  })
})

// ── 9. classifyMarginOfSafetyHealth ──────────────────────────────────────────

describe('classifyMarginOfSafetyHealth', () => {
  it('classifies excellent when ≥ 40%', () => {
    expect(classifyMarginOfSafetyHealth(40)).toBe('excellent')
    expect(classifyMarginOfSafetyHealth(50)).toBe('excellent')
    expect(classifyMarginOfSafetyHealth(100)).toBe('excellent')
  })

  it('classifies good when ≥ 25% and < 40%', () => {
    expect(classifyMarginOfSafetyHealth(25)).toBe('good')
    expect(classifyMarginOfSafetyHealth(35)).toBe('good')
    expect(classifyMarginOfSafetyHealth(39.9)).toBe('good')
  })

  it('classifies adequate when ≥ 15% and < 25%', () => {
    expect(classifyMarginOfSafetyHealth(15)).toBe('adequate')
    expect(classifyMarginOfSafetyHealth(20)).toBe('adequate')
    expect(classifyMarginOfSafetyHealth(24.9)).toBe('adequate')
  })

  it('classifies thin when ≥ 5% and < 15%', () => {
    expect(classifyMarginOfSafetyHealth(5)).toBe('thin')
    expect(classifyMarginOfSafetyHealth(10)).toBe('thin')
    expect(classifyMarginOfSafetyHealth(14.9)).toBe('thin')
  })

  it('classifies critical when < 5%', () => {
    expect(classifyMarginOfSafetyHealth(0)).toBe('critical')
    expect(classifyMarginOfSafetyHealth(1)).toBe('critical')
    expect(classifyMarginOfSafetyHealth(4.9)).toBe('critical')
  })

  it('classifies below_breakeven when negative', () => {
    expect(classifyMarginOfSafetyHealth(-1)).toBe('below_breakeven')
    expect(classifyMarginOfSafetyHealth(-10)).toBe('below_breakeven')
    expect(classifyMarginOfSafetyHealth(-100)).toBe('below_breakeven')
  })
})

// ── 10. computeProductBreakeven ───────────────────────────────────────────────

describe('computeProductBreakeven', () => {
  it('computes all fields for a profitable product above BEP', () => {
    const p = computeProductBreakeven(
      'prod-1', 'Widget A',
      100,   // selling price
      60,    // variable cost
      100,   // current units sold
      2000,  // allocated fixed cost
    )
    expect(p.product_id).toBe('prod-1')
    expect(p.product_name).toBe('Widget A')
    expect(p.selling_price).toBe(100)
    expect(p.variable_cost).toBe(60)
    expect(p.unit_contribution_margin).toBe(40)
    expect(p.contribution_margin_pct).toBe(40)
    expect(p.breakeven_units).toBe(50)         // 2000/40
    expect(p.breakeven_revenue).toBe(5000)     // 50 × 100
    expect(p.current_units_sold).toBe(100)
    expect(p.current_revenue).toBe(10000)      // 100 × 100
    expect(p.margin_of_safety_units).toBe(50)  // 100 - 50
    expect(p.is_above_breakeven).toBe(true)
    expect(p.allocated_fixed_cost).toBe(2000)
  })

  it('is_above_breakeven is false when below BEP', () => {
    const p = computeProductBreakeven(
      'prod-2', 'Widget B',
      100, 60, 30, 2000,  // only 30 units, BEP=50
    )
    expect(p.breakeven_units).toBe(50)
    expect(p.current_units_sold).toBe(30)
    expect(p.is_above_breakeven).toBe(false)
    expect(p.margin_of_safety_units).toBe(0)  // clamped at 0
  })

  it('returns null breakeven_units when CM is 0', () => {
    const p = computeProductBreakeven(
      'prod-3', 'Zero CM',
      50, 50, 100, 10000,  // price = cost
    )
    expect(p.unit_contribution_margin).toBe(0)
    expect(p.breakeven_units).toBeNull()
    expect(p.breakeven_revenue).toBeNull()
    expect(p.margin_of_safety_units).toBeNull()
  })

  it('computes contribution_margin_pct correctly', () => {
    const p = computeProductBreakeven('p', 'Prod', 200, 80, 50, 4000)
    // CM = 120, price = 200 → CMR = 0.6 → 60%
    expect(p.contribution_margin_pct).toBe(60)
  })

  it('handles zero selling price gracefully', () => {
    const p = computeProductBreakeven('p', 'Free', 0, 0, 100, 1000)
    expect(p.contribution_margin_pct).toBe(0)
  })
})

// ── 11. computeWeightedAvgCmr ─────────────────────────────────────────────────

describe('computeWeightedAvgCmr', () => {
  it('computes revenue-weighted average CMR', () => {
    const products = [
      { revenue: 300000, cm_ratio: 0.6 },  // weight 60%
      { revenue: 200000, cm_ratio: 0.4 },  // weight 40%
    ]
    // weighted = (300000×0.6 + 200000×0.4) / 500000
    //          = (180000 + 80000) / 500000 = 260000/500000 = 0.52
    expect(computeWeightedAvgCmr(products)).toBeCloseTo(0.52, 5)
  })

  it('returns 0 when total revenue is 0', () => {
    expect(computeWeightedAvgCmr([{ revenue: 0, cm_ratio: 0.5 }])).toBe(0)
    expect(Number.isNaN(computeWeightedAvgCmr([{ revenue: 0, cm_ratio: 0.5 }]))).toBe(false)
  })

  it('returns 0 for empty array', () => {
    expect(computeWeightedAvgCmr([])).toBe(0)
  })

  it('returns same CMR when single product', () => {
    expect(computeWeightedAvgCmr([{ revenue: 100000, cm_ratio: 0.35 }])).toBeCloseTo(0.35, 5)
  })

  it('weights correctly when revenues are equal', () => {
    const products = [
      { revenue: 100000, cm_ratio: 0.4 },
      { revenue: 100000, cm_ratio: 0.6 },
    ]
    // equal weight → simple average = 0.5
    expect(computeWeightedAvgCmr(products)).toBeCloseTo(0.5, 5)
  })

  it('handles many products', () => {
    const products = Array.from({ length: 10 }, (_, i) => ({
      revenue:  (i + 1) * 10000,
      cm_ratio: 0.5,
    }))
    // All same CMR → weighted avg = 0.5
    expect(computeWeightedAvgCmr(products)).toBeCloseTo(0.5, 5)
  })
})

// ── 12. computeDaysToBreakeven ────────────────────────────────────────────────

describe('computeDaysToBreakeven', () => {
  it('computes days to breakeven', () => {
    // BEP=333333, revenue=500000, 30 days
    // daily = 500000/30 ≈ 16666.67
    // days = 333333 / 16666.67 ≈ 20
    expect(computeDaysToBreakeven(333333, 500000, 30)).toBeCloseTo(20, 0)
  })

  it('returns null when daily revenue is 0', () => {
    expect(computeDaysToBreakeven(333333, 0, 30)).toBeNull()
  })

  it('returns null when analysisDays is 0', () => {
    expect(computeDaysToBreakeven(333333, 500000, 0)).toBeNull()
  })

  it('returns 30 days when BEP equals monthly revenue', () => {
    const days = computeDaysToBreakeven(500000, 500000, 30)
    expect(days).not.toBeNull()
    expect(days!).toBeCloseTo(30, 5)
  })

  it('returns less than period when above BEP', () => {
    const days = computeDaysToBreakeven(250000, 500000, 30)
    expect(days).not.toBeNull()
    expect(days!).toBeCloseTo(15, 5)
  })

  it('returns more than period when below BEP', () => {
    const days = computeDaysToBreakeven(600000, 500000, 30)
    expect(days).not.toBeNull()
    expect(days!).toBe(36)
  })
})

// ── 13. classifyOperatingLeverageRisk ────────────────────────────────────────

describe('classifyOperatingLeverageRisk', () => {
  it('returns na for null leverage', () => {
    expect(classifyOperatingLeverageRisk(null)).toBe('na')
  })

  it('returns high_risk when leverage > 5', () => {
    expect(classifyOperatingLeverageRisk(5.1)).toBe('high_risk')
    expect(classifyOperatingLeverageRisk(10)).toBe('high_risk')
    expect(classifyOperatingLeverageRisk(100)).toBe('high_risk')
  })

  it('returns elevated when leverage > 3 and ≤ 5', () => {
    expect(classifyOperatingLeverageRisk(3.1)).toBe('elevated')
    expect(classifyOperatingLeverageRisk(4)).toBe('elevated')
    expect(classifyOperatingLeverageRisk(5)).toBe('elevated')
  })

  it('returns moderate when leverage > 2 and ≤ 3', () => {
    expect(classifyOperatingLeverageRisk(2.1)).toBe('moderate')
    expect(classifyOperatingLeverageRisk(2.5)).toBe('moderate')
    expect(classifyOperatingLeverageRisk(3)).toBe('moderate')
  })

  it('returns low when leverage ≤ 2', () => {
    expect(classifyOperatingLeverageRisk(2)).toBe('low')
    expect(classifyOperatingLeverageRisk(1.5)).toBe('low')
    expect(classifyOperatingLeverageRisk(1)).toBe('low')
    expect(classifyOperatingLeverageRisk(0)).toBe('low')
  })
})

// ── 14. Integration: fixed=₺200K, variable=40% of revenue, revenue=₺500K ────

describe('Integration: fixed=200K, variable=40%, revenue=500K', () => {
  const REVENUE   = 500_000
  const FIXED     = 200_000
  const VARIABLE  = REVENUE * 0.4   // 200000
  const CM        = REVENUE - VARIABLE  // 300000
  const CMR       = CM / REVENUE        // 0.6
  const BEP       = FIXED / CMR         // 333333.33
  const MOS       = REVENUE - BEP       // 166666.67
  const MOS_PCT   = (MOS / REVENUE) * 100  // 33.33%
  const EBIT      = CM - FIXED          // 100000
  const LEVERAGE  = CM / EBIT           // 3.0

  it('CMR is 0.6', () => {
    expect(computeContributionMarginRatio(CM, REVENUE)).toBeCloseTo(0.6, 5)
  })

  it('BEP revenue is ₺333K', () => {
    const bep = computeBreakevenRevenue(FIXED, CMR)
    expect(bep).not.toBeNull()
    expect(bep!).toBeCloseTo(333333.33, 1)
  })

  it('Margin of safety is ₺167K', () => {
    const bep = computeBreakevenRevenue(FIXED, CMR)!
    const mos = computeMarginOfSafety(REVENUE, bep)
    expect(mos).toBeCloseTo(166666.67, 1)
  })

  it('Margin of safety % is 33.4%', () => {
    const bep = computeBreakevenRevenue(FIXED, CMR)!
    const mos = computeMarginOfSafety(REVENUE, bep)
    const mosPct = computeMarginOfSafetyPct(mos, REVENUE)
    expect(mosPct).toBeCloseTo(33.33, 1)
  })

  it('Operating leverage is 3.0', () => {
    const leverage = computeOperatingLeverage(CM, EBIT)
    expect(leverage).not.toBeNull()
    expect(leverage!).toBeCloseTo(3.0, 5)
  })

  it('MOS health is good (33%)', () => {
    const bep    = computeBreakevenRevenue(FIXED, CMR)!
    const signed = ((REVENUE - bep) / REVENUE) * 100
    expect(classifyMarginOfSafetyHealth(signed)).toBe('good')
  })

  it('Operating leverage risk is elevated (leverage=3)', () => {
    const leverage = computeOperatingLeverage(CM, EBIT)
    expect(classifyOperatingLeverageRisk(leverage)).toBe('moderate')
  })

  it('Target revenue for 10% profit', () => {
    const target10 = computeTargetRevenue(FIXED, REVENUE * 0.10, CMR)
    // (200000 + 50000) / 0.6 = 416666.67
    expect(target10).not.toBeNull()
    expect(target10!).toBeCloseTo(416666.67, 1)
  })

  it('Target revenue for 20% profit', () => {
    const target20 = computeTargetRevenue(FIXED, REVENUE * 0.20, CMR)
    // (200000 + 100000) / 0.6 = 500000
    expect(target20).not.toBeNull()
    expect(target20!).toBeCloseTo(500000, 1)
  })

  it('Days to breakeven in 30-day period', () => {
    const bep  = computeBreakevenRevenue(FIXED, CMR)!
    const days = computeDaysToBreakeven(bep, REVENUE, 30)
    expect(days).not.toBeNull()
    expect(days!).toBeCloseTo(20, 0)  // 333K / (500K/30) = 20 days
  })

  it('EBIT equals contribution margin minus fixed costs', () => {
    expect(CM - FIXED).toBe(EBIT)
    expect(EBIT).toBe(100_000)
  })

  it('Weighted avg CMR of single product matches direct calculation', () => {
    const weighted = computeWeightedAvgCmr([{ revenue: REVENUE, cm_ratio: CMR }])
    expect(weighted).toBeCloseTo(CMR, 5)
  })
})

// ── 15. Edge cases and boundary conditions ────────────────────────────────────

describe('Edge cases', () => {
  it('computeBreakevenUnits returns 0 when fixedCosts is 0', () => {
    expect(computeBreakevenUnits(0, 50)).toBe(0)
  })

  it('classifyMarginOfSafetyHealth exact boundary at 40%', () => {
    expect(classifyMarginOfSafetyHealth(40)).toBe('excellent')
    expect(classifyMarginOfSafetyHealth(39.99)).toBe('good')
  })

  it('classifyMarginOfSafetyHealth exact boundary at 25%', () => {
    expect(classifyMarginOfSafetyHealth(25)).toBe('good')
    expect(classifyMarginOfSafetyHealth(24.99)).toBe('adequate')
  })

  it('classifyMarginOfSafetyHealth exact boundary at 15%', () => {
    expect(classifyMarginOfSafetyHealth(15)).toBe('adequate')
    expect(classifyMarginOfSafetyHealth(14.99)).toBe('thin')
  })

  it('classifyMarginOfSafetyHealth exact boundary at 5%', () => {
    expect(classifyMarginOfSafetyHealth(5)).toBe('thin')
    expect(classifyMarginOfSafetyHealth(4.99)).toBe('critical')
  })

  it('classifyOperatingLeverageRisk exact boundary at 5', () => {
    expect(classifyOperatingLeverageRisk(5)).toBe('elevated')
    expect(classifyOperatingLeverageRisk(5.01)).toBe('high_risk')
  })

  it('classifyOperatingLeverageRisk exact boundary at 3', () => {
    expect(classifyOperatingLeverageRisk(3)).toBe('moderate')
    expect(classifyOperatingLeverageRisk(3.01)).toBe('elevated')
  })

  it('classifyOperatingLeverageRisk exact boundary at 2', () => {
    expect(classifyOperatingLeverageRisk(2)).toBe('low')
    expect(classifyOperatingLeverageRisk(2.01)).toBe('moderate')
  })

  it('computeProductBreakeven at exact breakeven units', () => {
    const p = computeProductBreakeven('p', 'Exact', 100, 60, 50, 2000)
    // BEP=50, current=50 → exactly at breakeven → is_above_breakeven=true
    expect(p.breakeven_units).toBe(50)
    expect(p.is_above_breakeven).toBe(true)
    expect(p.margin_of_safety_units).toBe(0)
  })

  it('computeWeightedAvgCmr handles zero revenue products', () => {
    const products = [
      { revenue: 0, cm_ratio: 0.8 },
      { revenue: 100000, cm_ratio: 0.4 },
    ]
    // Only second product has weight
    expect(computeWeightedAvgCmr(products)).toBeCloseTo(0.4, 5)
  })

  it('computeMarginOfSafety is 0 when current revenue is 0', () => {
    expect(computeMarginOfSafety(0, 100000)).toBe(0)
  })

  it('computeOperatingLeverage returns large value for tiny EBIT', () => {
    const lev = computeOperatingLeverage(500000, 1)
    expect(lev).not.toBeNull()
    expect(lev!).toBe(500000)
  })
})

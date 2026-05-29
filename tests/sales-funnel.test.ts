/**
 * Sales Funnel Conversion Analytics — unit tests
 *
 * Tests all pure computation functions exported from sales-funnel.service.ts.
 * No DB or network calls — pure function tests only.
 * Run with: npx vitest run tests/sales-funnel.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeConversionRate,
  computeAvgDaysInStage,
  classifyConversionRateHealth,
  computeFunnelLeakage,
  computeFunnelVelocity,
  computeWeightedPipelineValue,
  classifyDealVelocity,
  computeMonthlyFunnelFlow,
  identifyBottleneckStage,
  computePipeline30DayForecast,
  type FunnelStage,
} from '../lib/services/commercial/sales-funnel.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStage(overrides: Partial<FunnelStage> = {}): FunnelStage {
  return {
    stage_id:         overrides.stage_id         ?? 'proforma',
    stage_name:       overrides.stage_name        ?? 'Test Aşaması',
    count:            overrides.count             ?? 10,
    value_try:        overrides.value_try         ?? 100_000,
    avg_days_in_stage: overrides.avg_days_in_stage !== undefined ? overrides.avg_days_in_stage : null,
  }
}

// ── 1. computeConversionRate ──────────────────────────────────────────────────

describe('computeConversionRate', () => {

  it('1. zero from_count → returns 0 (no NaN, no division by zero)', () => {
    expect(computeConversionRate(0, 10)).toBe(0)
  })

  it('2. both zero → returns 0', () => {
    expect(computeConversionRate(0, 0)).toBe(0)
  })

  it('3. 60 of 100 → 60%', () => {
    expect(computeConversionRate(100, 60)).toBe(60)
  })

  it('4. 100% conversion: all converted', () => {
    expect(computeConversionRate(50, 50)).toBe(100)
  })

  it('5. 40 of 100 → 40%', () => {
    expect(computeConversionRate(100, 40)).toBeCloseTo(40)
  })

  it('6. 1 of 3 → ~33.33%', () => {
    expect(computeConversionRate(3, 1)).toBeCloseTo(33.33, 1)
  })

  it('7. to_count > from_count → > 100% (valid math)', () => {
    expect(computeConversionRate(50, 60)).toBeCloseTo(120)
  })

  it('8. result is always a number (not NaN)', () => {
    const result = computeConversionRate(0, 0)
    expect(Number.isNaN(result)).toBe(false)
  })

})

// ── 2. computeAvgDaysInStage ──────────────────────────────────────────────────

describe('computeAvgDaysInStage', () => {

  it('9. empty array → null', () => {
    expect(computeAvgDaysInStage([])).toBeNull()
  })

  it('10. single value → that value', () => {
    expect(computeAvgDaysInStage([10])).toBe(10)
  })

  it('11. multiple values → correct average', () => {
    expect(computeAvgDaysInStage([10, 20, 30])).toBe(20)
  })

  it('12. all zeros → 0', () => {
    expect(computeAvgDaysInStage([0, 0, 0])).toBe(0)
  })

  it('13. large values averaging correctly', () => {
    expect(computeAvgDaysInStage([100, 200])).toBe(150)
  })

  it('14. fractional days included', () => {
    expect(computeAvgDaysInStage([1.5, 2.5])).toBeCloseTo(2.0)
  })

})

// ── 3. classifyConversionRateHealth ──────────────────────────────────────────

describe('classifyConversionRateHealth', () => {

  it('15. 70% → excellent', () => {
    expect(classifyConversionRateHealth(70)).toBe('excellent')
  })

  it('16. 80% → excellent', () => {
    expect(classifyConversionRateHealth(80)).toBe('excellent')
  })

  it('17. 100% → excellent', () => {
    expect(classifyConversionRateHealth(100)).toBe('excellent')
  })

  it('18. 50% → good', () => {
    expect(classifyConversionRateHealth(50)).toBe('good')
  })

  it('19. 65% → good', () => {
    expect(classifyConversionRateHealth(65)).toBe('good')
  })

  it('20. 30% → moderate', () => {
    expect(classifyConversionRateHealth(30)).toBe('moderate')
  })

  it('21. 45% → moderate', () => {
    expect(classifyConversionRateHealth(45)).toBe('moderate')
  })

  it('22. 15% → low', () => {
    expect(classifyConversionRateHealth(15)).toBe('low')
  })

  it('23. 25% → low', () => {
    expect(classifyConversionRateHealth(25)).toBe('low')
  })

  it('24. 14% → poor', () => {
    expect(classifyConversionRateHealth(14)).toBe('poor')
  })

  it('25. 0% → poor', () => {
    expect(classifyConversionRateHealth(0)).toBe('poor')
  })

})

// ── 4. computeFunnelLeakage ───────────────────────────────────────────────────

describe('computeFunnelLeakage', () => {

  it('26. entering > advancing → positive leakage', () => {
    expect(computeFunnelLeakage(1_000_000, 600_000)).toBe(400_000)
  })

  it('27. entering = advancing → zero leakage', () => {
    expect(computeFunnelLeakage(500_000, 500_000)).toBe(0)
  })

  it('28. advancing > entering → leakage clamped to 0 (always >= 0)', () => {
    expect(computeFunnelLeakage(100_000, 200_000)).toBe(0)
  })

  it('29. both zero → 0', () => {
    expect(computeFunnelLeakage(0, 0)).toBe(0)
  })

  it('30. full leakage (nothing advances) → entering value', () => {
    expect(computeFunnelLeakage(750_000, 0)).toBe(750_000)
  })

})

// ── 5. computeFunnelVelocity ──────────────────────────────────────────────────

describe('computeFunnelVelocity', () => {

  it('31. pipeline × rate → expected velocity', () => {
    expect(computeFunnelVelocity(1_000_000, 60)).toBeCloseTo(600_000)
  })

  it('32. 0% conversion → velocity = 0', () => {
    expect(computeFunnelVelocity(1_000_000, 0)).toBe(0)
  })

  it('33. 100% conversion → velocity = pipeline', () => {
    expect(computeFunnelVelocity(500_000, 100)).toBe(500_000)
  })

  it('34. zero pipeline value → velocity = 0', () => {
    expect(computeFunnelVelocity(0, 75)).toBe(0)
  })

  it('35. partial rate (40%) → 400K from 1M pipeline', () => {
    expect(computeFunnelVelocity(1_000_000, 40)).toBeCloseTo(400_000)
  })

})

// ── 6. computeWeightedPipelineValue ──────────────────────────────────────────

describe('computeWeightedPipelineValue', () => {

  it('36. proforma only → 10% weight applied', () => {
    expect(computeWeightedPipelineValue(1_000_000, 0, 0, 0)).toBe(100_000)
  })

  it('37. confirmed only → 40% weight applied', () => {
    expect(computeWeightedPipelineValue(0, 1_000_000, 0, 0)).toBe(400_000)
  })

  it('38. partial only → 70% weight applied', () => {
    expect(computeWeightedPipelineValue(0, 0, 1_000_000, 0)).toBe(700_000)
  })

  it('39. overdue only → 20% weight applied', () => {
    expect(computeWeightedPipelineValue(0, 0, 0, 1_000_000)).toBe(200_000)
  })

  it('40. all equal → sum of weights × value', () => {
    // (10+40+70+20)% = 140% of 100K = 140K
    expect(computeWeightedPipelineValue(100_000, 100_000, 100_000, 100_000)).toBeCloseTo(140_000)
  })

  it('41. all zero → 0', () => {
    expect(computeWeightedPipelineValue(0, 0, 0, 0)).toBe(0)
  })

  it('42. mixed values → correct weighted sum', () => {
    // 200K proforma × 0.10 = 20K
    // 500K confirmed × 0.40 = 200K
    // 100K partial × 0.70 = 70K
    // 300K overdue × 0.20 = 60K
    // Total = 350K
    expect(computeWeightedPipelineValue(200_000, 500_000, 100_000, 300_000)).toBeCloseTo(350_000)
  })

})

// ── 7. classifyDealVelocity ───────────────────────────────────────────────────

describe('classifyDealVelocity', () => {

  it('43. null → stalled', () => {
    expect(classifyDealVelocity(null)).toBe('stalled')
  })

  it('44. 14 days → fast', () => {
    expect(classifyDealVelocity(14)).toBe('fast')
  })

  it('45. 7 days → fast', () => {
    expect(classifyDealVelocity(7)).toBe('fast')
  })

  it('46. 15 days → normal', () => {
    expect(classifyDealVelocity(15)).toBe('normal')
  })

  it('47. 30 days → normal', () => {
    expect(classifyDealVelocity(30)).toBe('normal')
  })

  it('48. 31 days → slow', () => {
    expect(classifyDealVelocity(31)).toBe('slow')
  })

  it('49. 60 days → slow', () => {
    expect(classifyDealVelocity(60)).toBe('slow')
  })

  it('50. 61 days → stalled', () => {
    expect(classifyDealVelocity(61)).toBe('stalled')
  })

  it('51. 365 days → stalled', () => {
    expect(classifyDealVelocity(365)).toBe('stalled')
  })

})

// ── 8. computeMonthlyFunnelFlow ───────────────────────────────────────────────

describe('computeMonthlyFunnelFlow', () => {

  it('52. all zero → all zero', () => {
    const result = computeMonthlyFunnelFlow(0, 0, 0)
    expect(result.won_rate).toBe(0)
    expect(result.lost_rate).toBe(0)
    expect(result.still_open).toBe(0)
  })

  it('53. no outcomes yet → all open', () => {
    const result = computeMonthlyFunnelFlow(10, 0, 0)
    expect(result.won_rate).toBe(0)
    expect(result.lost_rate).toBe(0)
    expect(result.still_open).toBe(10)
  })

  it('54. all won → 100% won rate', () => {
    const result = computeMonthlyFunnelFlow(10, 10, 0)
    expect(result.won_rate).toBeCloseTo(100)
    expect(result.lost_rate).toBe(0)
    expect(result.still_open).toBe(0)
  })

  it('55. all lost → 100% lost rate', () => {
    const result = computeMonthlyFunnelFlow(10, 0, 10)
    expect(result.won_rate).toBe(0)
    expect(result.lost_rate).toBeCloseTo(100)
    expect(result.still_open).toBe(0)
  })

  it('56. split: 6 won + 4 lost out of 10 → rates based on total', () => {
    const result = computeMonthlyFunnelFlow(10, 6, 4)
    expect(result.won_rate).toBeCloseTo(60)
    expect(result.lost_rate).toBeCloseTo(40)
    expect(result.still_open).toBe(0)
  })

  it('57. partially closed: 5 won, 2 lost, 3 still open', () => {
    const result = computeMonthlyFunnelFlow(10, 5, 2)
    expect(result.won_rate).toBeCloseTo(50)
    expect(result.lost_rate).toBeCloseTo(20)
    expect(result.still_open).toBe(3)
  })

  it('58. result properties exist and are numbers', () => {
    const result = computeMonthlyFunnelFlow(20, 8, 4)
    expect(typeof result.won_rate).toBe('number')
    expect(typeof result.lost_rate).toBe('number')
    expect(typeof result.still_open).toBe('number')
  })

})

// ── 9. identifyBottleneckStage ────────────────────────────────────────────────

describe('identifyBottleneckStage', () => {

  it('59. empty stages → null', () => {
    expect(identifyBottleneckStage([])).toBeNull()
  })

  it('60. single stage → null', () => {
    expect(identifyBottleneckStage([makeStage()])).toBeNull()
  })

  it('61. highest leakage at first transition → returns first stage_id', () => {
    const stages: FunnelStage[] = [
      makeStage({ stage_id: 'proforma',  value_try: 1_000_000 }),
      makeStage({ stage_id: 'confirmed', value_try: 200_000 }),  // leakage = 800K
      makeStage({ stage_id: 'paid',      value_try: 150_000 }),  // leakage = 50K
    ]
    expect(identifyBottleneckStage(stages)).toBe('proforma')
  })

  it('62. highest leakage at second transition → returns second stage_id', () => {
    const stages: FunnelStage[] = [
      makeStage({ stage_id: 'proforma',  value_try: 1_000_000 }),
      makeStage({ stage_id: 'confirmed', value_try: 900_000 }),  // leakage = 100K
      makeStage({ stage_id: 'paid',      value_try: 100_000 }),  // leakage = 800K
    ]
    expect(identifyBottleneckStage(stages)).toBe('confirmed')
  })

  it('63. equal leakage → returns first highest', () => {
    const stages: FunnelStage[] = [
      makeStage({ stage_id: 'a', value_try: 500_000 }),
      makeStage({ stage_id: 'b', value_try: 100_000 }),  // leakage 400K
      makeStage({ stage_id: 'c', value_try: 0 }),         // leakage 100K
    ]
    // Max leakage is at 'a' (500K - 100K = 400K)
    expect(identifyBottleneckStage(stages)).toBe('a')
  })

})

// ── 10. computePipeline30DayForecast ─────────────────────────────────────────

describe('computePipeline30DayForecast', () => {

  it('64. null cycle days → null', () => {
    expect(computePipeline30DayForecast(1_000_000, 60, null)).toBeNull()
  })

  it('65. cycle > 30 days → null (deals wont close in 30 days)', () => {
    expect(computePipeline30DayForecast(1_000_000, 60, 45)).toBeNull()
  })

  it('66. cycle = 30 days exactly → forecast for 1 cycle', () => {
    // 1_000_000 × 60% × (30/30) = 600_000
    expect(computePipeline30DayForecast(1_000_000, 60, 30)).toBeCloseTo(600_000)
  })

  it('67. cycle = 15 days → 2 cycles in 30 days', () => {
    // 1_000_000 × 60% × (30/15) = 1_200_000
    expect(computePipeline30DayForecast(1_000_000, 60, 15)).toBeCloseTo(1_200_000)
  })

  it('68. cycle = 10 days → 3 cycles in 30 days', () => {
    // 500_000 × 40% × (30/10) = 600_000
    expect(computePipeline30DayForecast(500_000, 40, 10)).toBeCloseTo(600_000)
  })

  it('69. 0% conversion rate → forecast = 0', () => {
    expect(computePipeline30DayForecast(1_000_000, 0, 7)).toBe(0)
  })

  it('70. zero pipeline → forecast = 0', () => {
    expect(computePipeline30DayForecast(0, 60, 14)).toBe(0)
  })

  it('71. cycle = 31 days → null', () => {
    expect(computePipeline30DayForecast(1_000_000, 60, 31)).toBeNull()
  })

})

// ── 11. Integration: 100 proformas → 60 converted → 40 paid ──────────────────

describe('Integration: funnel rates and values', () => {

  it('72. proforma_to_sale_rate: 100 proformas, 60 converted → 60%', () => {
    expect(computeConversionRate(100, 60)).toBeCloseTo(60)
  })

  it('73. sale_to_paid_rate: 60 sales, 40 paid → ~66.67%', () => {
    expect(computeConversionRate(60, 40)).toBeCloseTo(66.67, 1)
  })

  it('74. overall_conversion_rate: 100 proformas, 40 paid → 40%', () => {
    expect(computeConversionRate(100, 40)).toBeCloseTo(40)
  })

  it('75. proforma value 1M TRY, paid 400K → leakage 600K', () => {
    expect(computeFunnelLeakage(1_000_000, 400_000)).toBe(600_000)
  })

  it('76. conversion health for 40% overall rate → moderate', () => {
    expect(classifyConversionRateHealth(40)).toBe('moderate')
  })

  it('77. weighted pipeline: 1M proforma, 600K confirmed → weighted correctly', () => {
    // proforma 1M × 0.10 = 100K, confirmed 600K × 0.40 = 240K → 340K
    const result = computeWeightedPipelineValue(1_000_000, 600_000, 0, 0)
    expect(result).toBeCloseTo(340_000)
  })

  it('78. funnel velocity on 1M pipeline at 40% conversion → 400K', () => {
    expect(computeFunnelVelocity(1_000_000, 40)).toBeCloseTo(400_000)
  })

  it('79. monthly flow: 100 new, 40 won, 20 lost → correct rates', () => {
    const flow = computeMonthlyFunnelFlow(100, 40, 20)
    expect(flow.won_rate).toBeCloseTo(40)
    expect(flow.lost_rate).toBeCloseTo(20)
    expect(flow.still_open).toBe(40)
  })

  it('80. avg days in stage for a set of durations: 5, 10, 15 → 10', () => {
    expect(computeAvgDaysInStage([5, 10, 15])).toBe(10)
  })

  it('81. bottleneck in full funnel: proforma 1M → confirmed 600K → paid 400K → partial 50K', () => {
    const stages: FunnelStage[] = [
      makeStage({ stage_id: 'proforma',  value_try: 1_000_000 }),
      makeStage({ stage_id: 'confirmed', value_try: 600_000 }),  // leakage 400K
      makeStage({ stage_id: 'paid',      value_try: 400_000 }),  // leakage 200K
      makeStage({ stage_id: 'partial',   value_try: 50_000  }),  // leakage 350K
    ]
    // Leakages: proforma→confirmed=400K, confirmed→paid=200K, paid→partial=350K
    // Max is proforma (400K)
    expect(identifyBottleneckStage(stages)).toBe('proforma')
  })

  it('82. 30-day forecast with 14-day cycles: 1M pipeline at 60% → 1.28M', () => {
    // 1_000_000 × 0.60 × (30/14) ≈ 1_285_714
    const result = computePipeline30DayForecast(1_000_000, 60, 14)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(1_285_714, -2) // within 100
  })

  it('83. deal velocity with 12-day avg cycle → fast', () => {
    expect(classifyDealVelocity(12)).toBe('fast')
  })

  it('84. overall conversion health: 60% confirmed → good', () => {
    expect(classifyConversionRateHealth(60)).toBe('good')
  })

})

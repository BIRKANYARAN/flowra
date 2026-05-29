/**
 * Sales Funnel Conversion Analytics — unit tests
 *
 * Tests all pure computation functions exported from sales-funnel.service.ts.
 * No DB or network calls — pure function tests only.
 * Run with: npx vitest run tests/sales-funnel.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  // ── Original (v1) functions ────────────────────────────────────────────────
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
  // ── New (v2) pure functions ────────────────────────────────────────────────
  computeConversionRateV2,
  computeAvgCycleTime,
  computeMedianCycleTime,
  classifyCycleTimeEfficiency,
  computePipelineValue,
  computeExpectedPipelineValue,
  computePipelineVelocity,
  computeAvgQuoteValue,
  computeQuoteToRevenueRatio,
  computeExpirationRate,
  computeFunnelHealthScore,
  classifyFunnelHealth,
  computeCustomerWinRates,
  generateFunnelNarrative,
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

// ── 1. computeConversionRate (v1) ─────────────────────────────────────────────

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

// ══════════════════════════════════════════════════════════════════════════════
// NEW (v2) PURE FUNCTION TESTS
// ══════════════════════════════════════════════════════════════════════════════

// ── 12. computeConversionRateV2 ───────────────────────────────────────────────

describe('computeConversionRateV2', () => {

  it('85. zero totalProformas → null', () => {
    expect(computeConversionRateV2(0, 0)).toBeNull()
  })

  it('86. zero totalProformas with nonzero converted → null', () => {
    expect(computeConversionRateV2(5, 0)).toBeNull()
  })

  it('87. 50% conversion: 5 of 10', () => {
    expect(computeConversionRateV2(5, 10)).toBe(50)
  })

  it('88. 100% conversion: all converted', () => {
    expect(computeConversionRateV2(10, 10)).toBe(100)
  })

  it('89. 0% conversion: 0 of 10', () => {
    expect(computeConversionRateV2(0, 10)).toBe(0)
  })

  it('90. fractional result: 1 of 3 → ~33.33%', () => {
    expect(computeConversionRateV2(1, 3)).toBeCloseTo(33.33, 1)
  })

})

// ── 13. computeAvgCycleTime ───────────────────────────────────────────────────

describe('computeAvgCycleTime', () => {

  it('91. empty array → null', () => {
    expect(computeAvgCycleTime([])).toBeNull()
  })

  it('92. single value → that value', () => {
    expect(computeAvgCycleTime([5])).toBe(5)
  })

  it('93. multiple values → correct mean', () => {
    expect(computeAvgCycleTime([4, 6, 8])).toBeCloseTo(6)
  })

  it('94. all zeros → 0', () => {
    expect(computeAvgCycleTime([0, 0, 0])).toBe(0)
  })

  it('95. large values', () => {
    expect(computeAvgCycleTime([30, 60, 90])).toBe(60)
  })

  it('96. two values averaging to decimal', () => {
    expect(computeAvgCycleTime([3, 4])).toBe(3.5)
  })

})

// ── 14. computeMedianCycleTime ────────────────────────────────────────────────

describe('computeMedianCycleTime', () => {

  it('97. empty → null', () => {
    expect(computeMedianCycleTime([])).toBeNull()
  })

  it('98. single element → that element', () => {
    expect(computeMedianCycleTime([7])).toBe(7)
  })

  it('99. odd count: [1, 3, 5] → 3 (middle)', () => {
    expect(computeMedianCycleTime([1, 3, 5])).toBe(3)
  })

  it('100. even count: [2, 4] → 3 (average of two middle)', () => {
    expect(computeMedianCycleTime([2, 4])).toBe(3)
  })

  it('101. even count: [1, 2, 3, 4] → 2.5', () => {
    expect(computeMedianCycleTime([1, 2, 3, 4])).toBe(2.5)
  })

  it('102. unsorted input handled correctly: [5, 1, 3] → 3', () => {
    expect(computeMedianCycleTime([5, 1, 3])).toBe(3)
  })

  it('103. even count with large range: [10, 20] → 15', () => {
    expect(computeMedianCycleTime([10, 20])).toBe(15)
  })

  it('104. five elements: [1, 1, 1, 1, 100] → 1', () => {
    expect(computeMedianCycleTime([1, 1, 1, 1, 100])).toBe(1)
  })

})

// ── 15. classifyCycleTimeEfficiency ──────────────────────────────────────────

describe('classifyCycleTimeEfficiency', () => {

  it('105. null → insufficient_data', () => {
    expect(classifyCycleTimeEfficiency(null)).toBe('insufficient_data')
  })

  it('106. 0 days → excellent (≤ 3)', () => {
    expect(classifyCycleTimeEfficiency(0)).toBe('excellent')
  })

  it('107. exactly 3 days → excellent', () => {
    expect(classifyCycleTimeEfficiency(3)).toBe('excellent')
  })

  it('108. 3.5 days → good (> 3, ≤ 7)', () => {
    expect(classifyCycleTimeEfficiency(3.5)).toBe('good')
  })

  it('109. exactly 7 days → good', () => {
    expect(classifyCycleTimeEfficiency(7)).toBe('good')
  })

  it('110. 8 days → moderate (> 7, ≤ 14)', () => {
    expect(classifyCycleTimeEfficiency(8)).toBe('moderate')
  })

  it('111. exactly 14 days → moderate', () => {
    expect(classifyCycleTimeEfficiency(14)).toBe('moderate')
  })

  it('112. 15 days → slow (> 14, ≤ 30)', () => {
    expect(classifyCycleTimeEfficiency(15)).toBe('slow')
  })

  it('113. exactly 30 days → slow', () => {
    expect(classifyCycleTimeEfficiency(30)).toBe('slow')
  })

  it('114. 31 days → stalled (> 30)', () => {
    expect(classifyCycleTimeEfficiency(31)).toBe('stalled')
  })

  it('115. 100 days → stalled', () => {
    expect(classifyCycleTimeEfficiency(100)).toBe('stalled')
  })

})

// ── 16. computePipelineValue ──────────────────────────────────────────────────

describe('computePipelineValue', () => {

  it('116. empty array → 0', () => {
    expect(computePipelineValue([])).toBe(0)
  })

  it('117. single proforma → its total', () => {
    expect(computePipelineValue([{ total: 50_000 }])).toBe(50_000)
  })

  it('118. multiple proformas → sum of totals', () => {
    expect(computePipelineValue([{ total: 10_000 }, { total: 20_000 }, { total: 30_000 }])).toBe(60_000)
  })

  it('119. all zero totals → 0', () => {
    expect(computePipelineValue([{ total: 0 }, { total: 0 }])).toBe(0)
  })

  it('120. large values sum correctly', () => {
    expect(computePipelineValue([{ total: 1_000_000 }, { total: 2_000_000 }])).toBe(3_000_000)
  })

})

// ── 17. computeExpectedPipelineValue ─────────────────────────────────────────

describe('computeExpectedPipelineValue', () => {

  it('121. null conversionRate → null', () => {
    expect(computeExpectedPipelineValue(1_000_000, null)).toBeNull()
  })

  it('122. 50% conversion: 1M pipeline → 500K expected', () => {
    expect(computeExpectedPipelineValue(1_000_000, 50)).toBe(500_000)
  })

  it('123. 100% conversion → full pipeline value', () => {
    expect(computeExpectedPipelineValue(800_000, 100)).toBe(800_000)
  })

  it('124. 0% conversion → 0', () => {
    expect(computeExpectedPipelineValue(1_000_000, 0)).toBe(0)
  })

  it('125. fractional rate: 33.33% of 300K → approx 100K', () => {
    expect(computeExpectedPipelineValue(300_000, 33.33)).toBeCloseTo(100_000, -2)
  })

  it('126. zero pipeline → 0 regardless of rate', () => {
    expect(computeExpectedPipelineValue(0, 75)).toBe(0)
  })

})

// ── 18. computePipelineVelocity ───────────────────────────────────────────────

describe('computePipelineVelocity', () => {

  it('127. null avgCycleTime → null', () => {
    expect(computePipelineVelocity(1_000_000, null)).toBeNull()
  })

  it('128. zero avgCycleTime → null (division by zero guard)', () => {
    expect(computePipelineVelocity(1_000_000, 0)).toBeNull()
  })

  it('129. 1M pipeline / 10 days → 100K per day', () => {
    expect(computePipelineVelocity(1_000_000, 10)).toBe(100_000)
  })

  it('130. zero pipeline / valid days → 0', () => {
    expect(computePipelineVelocity(0, 7)).toBe(0)
  })

  it('131. 500K / 5 days → 100K per day', () => {
    expect(computePipelineVelocity(500_000, 5)).toBe(100_000)
  })

  it('132. fractional result: 100K / 3 days', () => {
    expect(computePipelineVelocity(100_000, 3)).toBeCloseTo(33333.33, 0)
  })

})

// ── 19. computeAvgQuoteValue ──────────────────────────────────────────────────

describe('computeAvgQuoteValue', () => {

  it('133. zero totalProformas → null', () => {
    expect(computeAvgQuoteValue(500_000, 0)).toBeNull()
  })

  it('134. normal case: 300K total / 3 proformas → 100K avg', () => {
    expect(computeAvgQuoteValue(300_000, 3)).toBe(100_000)
  })

  it('135. single proforma: value equals the proforma', () => {
    expect(computeAvgQuoteValue(75_000, 1)).toBe(75_000)
  })

  it('136. zero value / nonzero count → 0', () => {
    expect(computeAvgQuoteValue(0, 5)).toBe(0)
  })

  it('137. large count averaging', () => {
    expect(computeAvgQuoteValue(1_000_000, 4)).toBe(250_000)
  })

})

// ── 20. computeQuoteToRevenueRatio ────────────────────────────────────────────

describe('computeQuoteToRevenueRatio', () => {

  it('138. zero totalInvoicedRevenue → null', () => {
    expect(computeQuoteToRevenueRatio(100_000, 0)).toBeNull()
  })

  it('139. convertedValue = revenue → 100%', () => {
    expect(computeQuoteToRevenueRatio(500_000, 500_000)).toBe(100)
  })

  it('140. 50% of revenue came from converted quotes', () => {
    expect(computeQuoteToRevenueRatio(250_000, 500_000)).toBe(50)
  })

  it('141. converted > revenue → > 100% (valid math)', () => {
    expect(computeQuoteToRevenueRatio(600_000, 500_000)).toBe(120)
  })

  it('142. zero convertedValue → 0%', () => {
    expect(computeQuoteToRevenueRatio(0, 500_000)).toBe(0)
  })

})

// ── 21. computeExpirationRate ─────────────────────────────────────────────────

describe('computeExpirationRate', () => {

  it('143. zero totalProformas → null', () => {
    expect(computeExpirationRate(0, 0)).toBeNull()
  })

  it('144. zero expired / nonzero total → 0%', () => {
    expect(computeExpirationRate(0, 10)).toBe(0)
  })

  it('145. 30% expiration: 3 of 10', () => {
    expect(computeExpirationRate(3, 10)).toBe(30)
  })

  it('146. 100% expiration: all expired', () => {
    expect(computeExpirationRate(5, 5)).toBe(100)
  })

  it('147. fractional: 1 of 3 → ~33.33%', () => {
    expect(computeExpirationRate(1, 3)).toBeCloseTo(33.33, 1)
  })

})

// ── 22. computeFunnelHealthScore ──────────────────────────────────────────────

describe('computeFunnelHealthScore', () => {

  it('148. all null → null', () => {
    expect(computeFunnelHealthScore(null, 'insufficient_data', null)).toBeNull()
  })

  it('149. perfect score: 100% conversion, excellent cycle, 0% expiration', () => {
    // 100*0.5=50 + excellent=30 + (20 - 0*0.20)=20 = 100
    expect(computeFunnelHealthScore(100, 'excellent', 0)).toBe(100)
  })

  it('150. excellent cycle time earns 30 pts', () => {
    const score = computeFunnelHealthScore(0, 'excellent', 0)
    // 0 + 30 + 20 = 50
    expect(score).toBe(50)
  })

  it('151. good cycle time earns 25 pts', () => {
    const score = computeFunnelHealthScore(0, 'good', 0)
    // 0 + 25 + 20 = 45
    expect(score).toBe(45)
  })

  it('152. moderate cycle time earns 20 pts', () => {
    const score = computeFunnelHealthScore(0, 'moderate', 0)
    // 0 + 20 + 20 = 40
    expect(score).toBe(40)
  })

  it('153. slow cycle time earns 10 pts', () => {
    const score = computeFunnelHealthScore(0, 'slow', 0)
    // 0 + 10 + 20 = 30
    expect(score).toBe(30)
  })

  it('154. stalled cycle time earns 5 pts', () => {
    const score = computeFunnelHealthScore(0, 'stalled', 0)
    // 0 + 5 + 20 = 25
    expect(score).toBe(25)
  })

  it('155. insufficient_data cycle time earns 0 pts', () => {
    const score = computeFunnelHealthScore(0, 'insufficient_data', 0)
    // 0 + 0 + 20 = 20  (but not null because conversionRate is 0 and expirationRate is 0)
    expect(score).toBe(20)
  })

  it('156. 100% expiration → 0 pts for expiration (penalised to floor 0)', () => {
    // 20 - 100*0.20 = 20 - 20 = 0
    const score = computeFunnelHealthScore(0, 'stalled', 100)
    expect(score).toBe(5)  // 0 + 5 + 0
  })

  it('157. expiration penalty capped at 0 (not negative)', () => {
    // 200% would give 20 - 200*0.20 = -20 → clamped to 0
    const score = computeFunnelHealthScore(0, 'stalled', 200)
    expect(score).toBe(5)  // 0 + 5 + 0
  })

  it('158. 50% conversion at good cycle, 20% expiration', () => {
    // 50*0.5=25 + 25 + (20-20*0.20)=16 = 66
    expect(computeFunnelHealthScore(50, 'good', 20)).toBe(66)
  })

  it('159. null expiration rate → full 20 pts for expiration', () => {
    const score = computeFunnelHealthScore(0, 'excellent', null)
    // 0 + 30 + 20 = 50
    expect(score).toBe(50)
  })

  it('160. null conversion rate with good cycle → partial score', () => {
    const score = computeFunnelHealthScore(null, 'good', 10)
    // 0 + 25 + (20-10*0.20)=18 = 43
    expect(score).toBe(43)
  })

})

// ── 23. classifyFunnelHealth ──────────────────────────────────────────────────

describe('classifyFunnelHealth', () => {

  it('161. null → insufficient_data', () => {
    expect(classifyFunnelHealth(null)).toBe('insufficient_data')
  })

  it('162. exactly 75 → excellent', () => {
    expect(classifyFunnelHealth(75)).toBe('excellent')
  })

  it('163. 100 → excellent', () => {
    expect(classifyFunnelHealth(100)).toBe('excellent')
  })

  it('164. 80 → excellent', () => {
    expect(classifyFunnelHealth(80)).toBe('excellent')
  })

  it('165. exactly 55 → good', () => {
    expect(classifyFunnelHealth(55)).toBe('good')
  })

  it('166. 70 → good (< 75)', () => {
    expect(classifyFunnelHealth(70)).toBe('good')
  })

  it('167. 74 → good', () => {
    expect(classifyFunnelHealth(74)).toBe('good')
  })

  it('168. exactly 35 → moderate', () => {
    expect(classifyFunnelHealth(35)).toBe('moderate')
  })

  it('169. 50 → moderate (< 55)', () => {
    expect(classifyFunnelHealth(50)).toBe('moderate')
  })

  it('170. 54 → moderate', () => {
    expect(classifyFunnelHealth(54)).toBe('moderate')
  })

  it('171. 34 → poor (< 35)', () => {
    expect(classifyFunnelHealth(34)).toBe('poor')
  })

  it('172. 0 → poor', () => {
    expect(classifyFunnelHealth(0)).toBe('poor')
  })

  it('173. 20 → poor', () => {
    expect(classifyFunnelHealth(20)).toBe('poor')
  })

})

// ── 24. computeCustomerWinRates ───────────────────────────────────────────────

describe('computeCustomerWinRates', () => {

  it('174. empty array → empty result', () => {
    expect(computeCustomerWinRates([])).toEqual([])
  })

  it('175. single customer all converted → 100% win rate', () => {
    const result = computeCustomerWinRates([
      { customer_id: 'c1', customer_name: 'Acme', is_converted: true },
      { customer_id: 'c1', customer_name: 'Acme', is_converted: true },
    ])
    expect(result).toHaveLength(1)
    expect(result[0].win_rate_pct).toBe(100)
    expect(result[0].total_quotes).toBe(2)
  })

  it('176. single customer none converted → 0% win rate', () => {
    const result = computeCustomerWinRates([
      { customer_id: 'c1', customer_name: 'Acme', is_converted: false },
      { customer_id: 'c1', customer_name: 'Acme', is_converted: false },
    ])
    expect(result[0].win_rate_pct).toBe(0)
  })

  it('177. multiple customers sorted by win rate descending', () => {
    const result = computeCustomerWinRates([
      { customer_id: 'c1', customer_name: 'Alpha', is_converted: true },   // 100%
      { customer_id: 'c1', customer_name: 'Alpha', is_converted: true },
      { customer_id: 'c2', customer_name: 'Beta',  is_converted: false },  // 0%
      { customer_id: 'c2', customer_name: 'Beta',  is_converted: false },
      { customer_id: 'c3', customer_name: 'Gamma', is_converted: true },   // 50%
      { customer_id: 'c3', customer_name: 'Gamma', is_converted: false },
    ])
    expect(result[0].customer_id).toBe('c1')  // highest win rate
    expect(result[0].win_rate_pct).toBe(100)
    expect(result[1].customer_id).toBe('c3')
    expect(result[1].win_rate_pct).toBe(50)
    expect(result[2].customer_id).toBe('c2')
    expect(result[2].win_rate_pct).toBe(0)
  })

  it('178. total_quotes counts correctly per customer', () => {
    const result = computeCustomerWinRates([
      { customer_id: 'c1', customer_name: 'X', is_converted: true },
      { customer_id: 'c1', customer_name: 'X', is_converted: false },
      { customer_id: 'c1', customer_name: 'X', is_converted: true },
    ])
    expect(result[0].total_quotes).toBe(3)
    expect(result[0].win_rate_pct).toBeCloseTo(66.67, 1)
  })

  it('179. customer_name preserved in output', () => {
    const result = computeCustomerWinRates([
      { customer_id: 'c1', customer_name: 'Birkan Şirketi', is_converted: true },
    ])
    expect(result[0].customer_name).toBe('Birkan Şirketi')
  })

})

// ── 25. generateFunnelNarrative ───────────────────────────────────────────────

describe('generateFunnelNarrative', () => {

  it('180. excellent health → positive narrative', () => {
    const narrative = generateFunnelNarrative('excellent', 80, 500_000, 3)
    expect(typeof narrative).toBe('string')
    expect(narrative.length).toBeGreaterThan(0)
    expect(narrative).toContain('mükemmel')
  })

  it('181. good health → good narrative', () => {
    const narrative = generateFunnelNarrative('good', 60, 300_000, 7)
    expect(narrative).toContain('iyi')
  })

  it('182. moderate health → moderate narrative', () => {
    const narrative = generateFunnelNarrative('moderate', 40, 200_000, 14)
    expect(narrative).toContain('orta')
  })

  it('183. poor health → warning narrative', () => {
    const narrative = generateFunnelNarrative('poor', 20, 100_000, 30)
    expect(narrative).toContain('zayıf')
  })

  it('184. insufficient_data → data warning narrative', () => {
    const narrative = generateFunnelNarrative('insufficient_data', null, 0, null)
    expect(typeof narrative).toBe('string')
    expect(narrative.length).toBeGreaterThan(0)
  })

  it('185. null conversionRate shows bilinmiyor in narrative', () => {
    const narrative = generateFunnelNarrative('insufficient_data', null, 500_000, null)
    expect(narrative).toContain('bilinmiyor')
  })

  it('186. null avgCycleTime shows bilinmiyor in narrative', () => {
    const narrative = generateFunnelNarrative('good', 50, 200_000, null)
    expect(narrative).toContain('bilinmiyor')
  })

})

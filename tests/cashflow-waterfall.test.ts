/**
 * Cash Flow Waterfall Projection Service — unit tests
 *
 * Tests pure helpers:
 *   - computeNetCash               (positive, negative, zero)
 *   - computeEndingCash            (normal cases)
 *   - classifyCashPosition         (all 4 classes + edge cases)
 *   - applyScenarioMultiplier      (all 3 scenarios, multiplier verification)
 *   - findCashCrisisMonth          (never / first / last / middle / empty)
 *
 * No DB or network calls — all in-memory.
 */

import { describe, it, expect } from 'vitest'
import {
  computeNetCash,
  computeEndingCash,
  classifyCashPosition,
  applyScenarioMultiplier,
  findCashCrisisMonth,
  assignSegmentColor,
  buildWaterfallSegments,
  computeTrendDescription,
} from '../lib/services/finance/cashflow-waterfall.service'
import type { CashWaterfallPeriod } from '../lib/services/finance/cashflow-waterfall.service'

// ── computeNetCash ────────────────────────────────────────────────────────────

describe('computeNetCash', () => {
  it('returns positive net when inflows > outflows', () => {
    expect(computeNetCash(100_000, 60_000)).toBe(40_000)
  })

  it('returns negative net when inflows < outflows', () => {
    expect(computeNetCash(50_000, 80_000)).toBe(-30_000)
  })

  it('returns zero when inflows === outflows', () => {
    expect(computeNetCash(75_000, 75_000)).toBe(0)
  })

  it('handles zero inflows', () => {
    expect(computeNetCash(0, 20_000)).toBe(-20_000)
  })

  it('handles zero outflows', () => {
    expect(computeNetCash(30_000, 0)).toBe(30_000)
  })

  it('rounds to 2 decimal places', () => {
    expect(computeNetCash(100.005, 0)).toBe(100.01)
  })
})

// ── computeEndingCash ─────────────────────────────────────────────────────────

describe('computeEndingCash', () => {
  it('adds positive net cash to opening', () => {
    expect(computeEndingCash(500_000, 40_000)).toBe(540_000)
  })

  it('subtracts negative net cash from opening', () => {
    expect(computeEndingCash(500_000, -30_000)).toBe(470_000)
  })

  it('returns negative when opening + net < 0', () => {
    expect(computeEndingCash(10_000, -50_000)).toBe(-40_000)
  })

  it('handles zero opening', () => {
    expect(computeEndingCash(0, 25_000)).toBe(25_000)
  })

  it('rounds to 2 decimal places', () => {
    expect(computeEndingCash(100.005, 0)).toBe(100.01)
  })
})

// ── classifyCashPosition ──────────────────────────────────────────────────────

describe('classifyCashPosition', () => {
  it('returns "negative" when ending cash is below zero', () => {
    expect(classifyCashPosition(-1, 100_000)).toBe('negative')
  })

  it('returns "negative" when ending cash is exactly negative', () => {
    expect(classifyCashPosition(-100_000, 50_000)).toBe('negative')
  })

  it('returns "tight" when 0 < ending < 1× burn', () => {
    // 50_000 ending, 100_000 burn → 0.5 months → tight
    expect(classifyCashPosition(50_000, 100_000)).toBe('tight')
  })

  it('returns "adequate" when 1× <= ending < 3× burn', () => {
    // 200_000 ending, 100_000 burn → 2 months → adequate
    expect(classifyCashPosition(200_000, 100_000)).toBe('adequate')
  })

  it('returns "adequate" at exactly 1× burn', () => {
    expect(classifyCashPosition(100_000, 100_000)).toBe('adequate')
  })

  it('returns "strong" when ending >= 3× burn', () => {
    // 300_000 ending, 100_000 burn → 3 months → strong
    expect(classifyCashPosition(300_000, 100_000)).toBe('strong')
  })

  it('returns "strong" well above 3× burn', () => {
    expect(classifyCashPosition(1_000_000, 100_000)).toBe('strong')
  })

  it('returns "strong" when avg burn is 0 and cash is positive', () => {
    expect(classifyCashPosition(100_000, 0)).toBe('strong')
  })

  it('returns "negative" when avg burn is 0 and cash is 0', () => {
    // zero cash with zero burn — ending = 0, not > 0
    expect(classifyCashPosition(0, 0)).toBe('negative')
  })

  it('returns "negative" when avg burn is 0 and cash is negative', () => {
    expect(classifyCashPosition(-1, 0)).toBe('negative')
  })
})

// ── applyScenarioMultiplier ───────────────────────────────────────────────────

describe('applyScenarioMultiplier', () => {
  const BASE_INFLOWS  = 200_000
  const BASE_OUTFLOWS = 150_000

  it('base scenario: inflows and outflows unchanged (1.0×)', () => {
    const result = applyScenarioMultiplier(BASE_INFLOWS, BASE_OUTFLOWS, 'base')
    expect(result.inflows).toBe(BASE_INFLOWS)
    expect(result.outflows).toBe(BASE_OUTFLOWS)
  })

  it('conservative scenario: inflows × 0.85', () => {
    const result = applyScenarioMultiplier(BASE_INFLOWS, BASE_OUTFLOWS, 'conservative')
    expect(result.inflows).toBeCloseTo(BASE_INFLOWS * 0.85, 1)
  })

  it('conservative scenario: outflows × 1.10', () => {
    const result = applyScenarioMultiplier(BASE_INFLOWS, BASE_OUTFLOWS, 'conservative')
    expect(result.outflows).toBeCloseTo(BASE_OUTFLOWS * 1.10, 1)
  })

  it('optimistic scenario: inflows × 1.15', () => {
    const result = applyScenarioMultiplier(BASE_INFLOWS, BASE_OUTFLOWS, 'optimistic')
    expect(result.inflows).toBeCloseTo(BASE_INFLOWS * 1.15, 1)
  })

  it('optimistic scenario: outflows × 0.95', () => {
    const result = applyScenarioMultiplier(BASE_INFLOWS, BASE_OUTFLOWS, 'optimistic')
    expect(result.outflows).toBeCloseTo(BASE_OUTFLOWS * 0.95, 1)
  })

  it('conservative reduces net cash vs base', () => {
    const base         = applyScenarioMultiplier(BASE_INFLOWS, BASE_OUTFLOWS, 'base')
    const conservative = applyScenarioMultiplier(BASE_INFLOWS, BASE_OUTFLOWS, 'conservative')
    const baseNet         = base.inflows - base.outflows
    const conservativeNet = conservative.inflows - conservative.outflows
    expect(conservativeNet).toBeLessThan(baseNet)
  })

  it('optimistic increases net cash vs base', () => {
    const base      = applyScenarioMultiplier(BASE_INFLOWS, BASE_OUTFLOWS, 'base')
    const optimistic = applyScenarioMultiplier(BASE_INFLOWS, BASE_OUTFLOWS, 'optimistic')
    const baseNet      = base.inflows - base.outflows
    const optimisticNet = optimistic.inflows - optimistic.outflows
    expect(optimisticNet).toBeGreaterThan(baseNet)
  })

  it('handles zero inflows and outflows', () => {
    const result = applyScenarioMultiplier(0, 0, 'conservative')
    expect(result.inflows).toBe(0)
    expect(result.outflows).toBe(0)
  })
})

// ── findCashCrisisMonth ───────────────────────────────────────────────────────

describe('findCashCrisisMonth', () => {
  it('returns null for empty array', () => {
    expect(findCashCrisisMonth([])).toBeNull()
  })

  it('returns null when cash is always positive', () => {
    expect(findCashCrisisMonth([100_000, 80_000, 90_000, 50_000])).toBeNull()
  })

  it('returns null when all values are exactly zero (not negative)', () => {
    expect(findCashCrisisMonth([0, 0, 0])).toBeNull()
  })

  it('returns 0 when first month is negative', () => {
    expect(findCashCrisisMonth([-10_000, 20_000, 30_000])).toBe(0)
  })

  it('returns last index when only last month is negative', () => {
    const arr = [100_000, 80_000, 50_000, -5_000]
    expect(findCashCrisisMonth(arr)).toBe(3)
  })

  it('returns first negative index when multiple months are negative', () => {
    const arr = [100_000, -10_000, -20_000, 50_000]
    expect(findCashCrisisMonth(arr)).toBe(1)
  })

  it('returns middle index when crisis is in the middle', () => {
    const arr = [200_000, 150_000, -5_000, 30_000, 60_000]
    expect(findCashCrisisMonth(arr)).toBe(2)
  })

  it('returns 0 for single-element array with negative value', () => {
    expect(findCashCrisisMonth([-1])).toBe(0)
  })

  it('returns null for single-element array with positive value', () => {
    expect(findCashCrisisMonth([1])).toBeNull()
  })

  it('correctly handles a 12-month array matching a typical projection', () => {
    // 10 positive months, then 2 negative
    const months = [500_000, 480_000, 460_000, 440_000, 420_000, 400_000, 380_000, 360_000, 340_000, 320_000, -10_000, -50_000]
    expect(findCashCrisisMonth(months)).toBe(10)
  })
})

// ── computeNetCash — additional tests ─────────────────────────────────────────

describe('computeNetCash — additional', () => {
  it('very large inflows and outflows', () => {
    expect(computeNetCash(5_000_000, 4_000_000)).toBe(1_000_000)
  })

  it('fractional amounts rounded correctly', () => {
    // 100.005 - 50.002 = 50.003 → round2 = 50
    expect(computeNetCash(100.005, 50.002)).toBe(50)
  })

  it('inflows and outflows both zero', () => {
    expect(computeNetCash(0, 0)).toBe(0)
  })

  it('large outflows relative to inflows produces large negative', () => {
    expect(computeNetCash(1_000, 1_000_000)).toBe(-999_000)
  })
})

// ── computeEndingCash — additional tests ──────────────────────────────────────

describe('computeEndingCash — additional', () => {
  it('positive opening, zero net → same as opening', () => {
    expect(computeEndingCash(200_000, 0)).toBe(200_000)
  })

  it('negative opening with positive net can become positive', () => {
    expect(computeEndingCash(-10_000, 50_000)).toBe(40_000)
  })

  it('large values handle without overflow', () => {
    expect(computeEndingCash(10_000_000, 500_000)).toBe(10_500_000)
  })

  it('small decimal values round correctly', () => {
    expect(computeEndingCash(100.005, 0.005)).toBe(100.01)
  })
})

// ── classifyCashPosition — additional boundary tests ─────────────────────────

describe('classifyCashPosition — additional', () => {
  it('exactly 3× burn → strong (boundary)', () => {
    expect(classifyCashPosition(300_000, 100_000)).toBe('strong')
  })

  it('just below 3× burn → adequate', () => {
    expect(classifyCashPosition(299_999, 100_000)).toBe('adequate')
  })

  it('exactly 0 ending cash → tight (0 is not negative, burn > 0)', () => {
    // 0 < 1×burn (100_000) → tight
    expect(classifyCashPosition(0, 100_000)).toBe('tight')
  })

  it('just below 1× burn → tight', () => {
    expect(classifyCashPosition(99_999, 100_000)).toBe('tight')
  })

  it('-0.01 ending cash → negative', () => {
    expect(classifyCashPosition(-0.01, 50_000)).toBe('negative')
  })

  it('burn = 1, ending = 3 → strong (exactly 3×)', () => {
    expect(classifyCashPosition(3, 1)).toBe('strong')
  })

  it('burn = 1, ending = 2 → adequate', () => {
    expect(classifyCashPosition(2, 1)).toBe('adequate')
  })

  it('burn = 1, ending = 0 → tight', () => {
    expect(classifyCashPosition(0, 1)).toBe('tight')
  })

  it('very large ending cash with moderate burn → strong', () => {
    expect(classifyCashPosition(100_000_000, 100_000)).toBe('strong')
  })
})

// ── applyScenarioMultiplier — additional tests ────────────────────────────────

describe('applyScenarioMultiplier — additional', () => {
  it('conservative inflows are lower than base inflows', () => {
    const base = applyScenarioMultiplier(100_000, 80_000, 'base')
    const cons = applyScenarioMultiplier(100_000, 80_000, 'conservative')
    expect(cons.inflows).toBeLessThan(base.inflows)
  })

  it('optimistic inflows are higher than base inflows', () => {
    const base = applyScenarioMultiplier(100_000, 80_000, 'base')
    const opt  = applyScenarioMultiplier(100_000, 80_000, 'optimistic')
    expect(opt.inflows).toBeGreaterThan(base.inflows)
  })

  it('conservative outflows are higher than base outflows', () => {
    const base = applyScenarioMultiplier(100_000, 80_000, 'base')
    const cons = applyScenarioMultiplier(100_000, 80_000, 'conservative')
    expect(cons.outflows).toBeGreaterThan(base.outflows)
  })

  it('optimistic outflows are lower than base outflows', () => {
    const base = applyScenarioMultiplier(100_000, 80_000, 'base')
    const opt  = applyScenarioMultiplier(100_000, 80_000, 'optimistic')
    expect(opt.outflows).toBeLessThan(base.outflows)
  })

  it('returns object with both inflows and outflows keys', () => {
    const result = applyScenarioMultiplier(100_000, 50_000, 'base')
    expect(result).toHaveProperty('inflows')
    expect(result).toHaveProperty('outflows')
  })

  it('conservative: exact multiplier check 0.85 inflows', () => {
    const result = applyScenarioMultiplier(100_000, 100_000, 'conservative')
    expect(result.inflows).toBe(85_000)
    expect(result.outflows).toBe(110_000)
  })

  it('optimistic: exact multiplier check 1.15 inflows', () => {
    const result = applyScenarioMultiplier(100_000, 100_000, 'optimistic')
    expect(result.inflows).toBe(115_000)
    expect(result.outflows).toBe(95_000)
  })
})

// ── findCashCrisisMonth — additional tests ────────────────────────────────────

describe('findCashCrisisMonth — additional', () => {
  it('all values are exactly 0 → null (0 is not < 0)', () => {
    expect(findCashCrisisMonth([0, 0, 0, 0])).toBeNull()
  })

  it('-0.01 triggers crisis', () => {
    expect(findCashCrisisMonth([100_000, -0.01])).toBe(1)
  })

  it('crisis in last month of 12-element array', () => {
    const arr = Array.from({ length: 12 }, (_, i) => (i < 11 ? 10_000 : -1))
    expect(findCashCrisisMonth(arr)).toBe(11)
  })

  it('all negative: returns 0 (first one)', () => {
    expect(findCashCrisisMonth([-1, -2, -3])).toBe(0)
  })
})

// ── assignSegmentColor ────────────────────────────────────────────────────────

describe('assignSegmentColor', () => {
  it('operating category with positive amount → green', () => {
    expect(assignSegmentColor('operating', 50_000)).toBe('green')
  })

  it('operating category with negative amount → red', () => {
    expect(assignSegmentColor('operating', -50_000)).toBe('red')
  })

  it('operating category with zero amount → green (>= 0)', () => {
    expect(assignSegmentColor('operating', 0)).toBe('green')
  })

  it('investing category with positive amount → gray', () => {
    expect(assignSegmentColor('investing', 10_000)).toBe('gray')
  })

  it('investing category with negative amount → blue', () => {
    expect(assignSegmentColor('investing', -30_000)).toBe('blue')
  })

  it('financing category with any positive amount → purple', () => {
    expect(assignSegmentColor('financing', 100_000)).toBe('purple')
  })

  it('financing category with negative amount → purple', () => {
    expect(assignSegmentColor('financing', -5_000)).toBe('purple')
  })

  it('result category with positive amount → green', () => {
    expect(assignSegmentColor('result', 20_000)).toBe('green')
  })

  it('result category with negative amount → red', () => {
    expect(assignSegmentColor('result', -10_000)).toBe('red')
  })

  it('result category with zero → green', () => {
    expect(assignSegmentColor('result', 0)).toBe('green')
  })
})

// ── buildWaterfallSegments ────────────────────────────────────────────────────

describe('buildWaterfallSegments', () => {
  const operating  = { collections: 100_000, expensePayments: 60_000 }
  const investing  = { equipmentPurchases: 20_000 }
  const financing  = { loanInflows: 50_000, loanRepayments: 10_000 }
  const openingCash = 200_000

  it('returns exactly 9 segments', () => {
    const segs = buildWaterfallSegments(operating, investing, financing, openingCash)
    expect(segs).toHaveLength(9)
  })

  it('first segment key is "collections"', () => {
    const segs = buildWaterfallSegments(operating, investing, financing, openingCash)
    expect(segs[0].key).toBe('collections')
  })

  it('collections segment has positive amount', () => {
    const segs = buildWaterfallSegments(operating, investing, financing, openingCash)
    expect(segs[0].amount_try).toBeGreaterThanOrEqual(0)
  })

  it('expense_payments segment has negative amount', () => {
    const segs = buildWaterfallSegments(operating, investing, financing, openingCash)
    const expSeg = segs.find(s => s.key === 'expense_payments')!
    expect(expSeg.amount_try).toBeLessThanOrEqual(0)
  })

  it('operating_subtotal is_subtotal = true', () => {
    const segs = buildWaterfallSegments(operating, investing, financing, openingCash)
    const subtotal = segs.find(s => s.key === 'operating_subtotal')!
    expect(subtotal.is_subtotal).toBe(true)
  })

  it('equipment_purchases has negative or zero amount', () => {
    const segs = buildWaterfallSegments(operating, investing, financing, openingCash)
    const equip = segs.find(s => s.key === 'equipment_purchases')!
    expect(equip.amount_try).toBeLessThanOrEqual(0)
  })

  it('net_change segment amount = closing - opening', () => {
    const segs = buildWaterfallSegments(operating, investing, financing, openingCash)
    const netSeg = segs.find(s => s.key === 'net_change')!
    const closingRunning = netSeg.running_total_try
    expect(netSeg.amount_try).toBe(closingRunning - openingCash)
  })

  it('with zero investing and financing only operating changes cash', () => {
    const segs = buildWaterfallSegments(
      { collections: 50_000, expensePayments: 30_000 },
      { equipmentPurchases: 0 },
      { loanInflows: 0, loanRepayments: 0 },
      100_000,
    )
    const netSeg = segs.find(s => s.key === 'net_change')!
    // net = +50k - 30k = +20k
    expect(netSeg.amount_try).toBe(20_000)
  })

  it('loan_inflows is non-negative (forced via Math.max)', () => {
    const segs = buildWaterfallSegments(
      operating,
      investing,
      { loanInflows: -5_000, loanRepayments: 0 }, // negative passed in
      openingCash,
    )
    const loanSeg = segs.find(s => s.key === 'loan_inflows')!
    expect(loanSeg.amount_try).toBeGreaterThanOrEqual(0)
  })

  it('all segments have required keys (key, label, category, amount_try, running_total_try, is_subtotal, color_class)', () => {
    const segs = buildWaterfallSegments(operating, investing, financing, openingCash)
    for (const seg of segs) {
      expect(seg).toHaveProperty('key')
      expect(seg).toHaveProperty('label')
      expect(seg).toHaveProperty('category')
      expect(seg).toHaveProperty('amount_try')
      expect(seg).toHaveProperty('running_total_try')
      expect(seg).toHaveProperty('is_subtotal')
      expect(seg).toHaveProperty('color_class')
    }
  })
})

// ── computeTrendDescription ───────────────────────────────────────────────────

function makePeriod(
  month: string,
  openingCash: number,
  collections: number,
  expensePayments: number,
): CashWaterfallPeriod {
  const segments = buildWaterfallSegments(
    { collections, expensePayments },
    { equipmentPurchases: 0 },
    { loanInflows: 0, loanRepayments: 0 },
    openingCash,
  )
  const netChange = collections - expensePayments
  return {
    month,
    label: month,
    opening_cash_try: openingCash,
    segments,
    closing_cash_try: openingCash + netChange,
    net_change_try: netChange,
  }
}

describe('computeTrendDescription', () => {
  it('returns no-data message for empty periods', () => {
    const result = computeTrendDescription([])
    expect(result).toContain('bulunamadı')
  })

  it('all positive operating → mentions pozitif', () => {
    const periods = [
      makePeriod('2026-03', 200_000, 100_000, 50_000),
      makePeriod('2026-04', 250_000, 120_000, 60_000),
      makePeriod('2026-05', 310_000, 130_000, 70_000),
    ]
    const result = computeTrendDescription(periods)
    expect(result.toLowerCase()).toContain('pozitif')
  })

  it('all negative operating → mentions negatif or gider', () => {
    const periods = [
      makePeriod('2026-03', 500_000, 10_000, 100_000),
      makePeriod('2026-04', 410_000, 5_000, 90_000),
      makePeriod('2026-05', 325_000, 8_000, 80_000),
    ]
    const result = computeTrendDescription(periods)
    expect(result.toLowerCase()).toMatch(/negatif|gider/)
  })

  it('mixed periods → mentions karışık or mix', () => {
    const periods = [
      makePeriod('2026-03', 200_000, 100_000, 50_000),   // positive
      makePeriod('2026-04', 250_000, 10_000, 100_000),   // negative
      makePeriod('2026-05', 160_000, 90_000, 40_000),    // positive
    ]
    const result = computeTrendDescription(periods)
    expect(result.toLowerCase()).toMatch(/karışık|mix/)
  })

  it('single period with positive operating → mentions pozitif', () => {
    const periods = [makePeriod('2026-05', 100_000, 80_000, 40_000)]
    const result = computeTrendDescription(periods)
    expect(result.toLowerCase()).toContain('pozitif')
  })

  it('single period with negative operating → mentions negatif', () => {
    const periods = [makePeriod('2026-05', 100_000, 20_000, 80_000)]
    const result = computeTrendDescription(periods)
    expect(result.toLowerCase()).toContain('negatif')
  })

  it('returns a non-empty string in all cases', () => {
    const cases = [
      [],
      [makePeriod('2026-05', 100_000, 80_000, 40_000)],
    ]
    for (const c of cases) {
      expect(computeTrendDescription(c).length).toBeGreaterThan(0)
    }
  })
})

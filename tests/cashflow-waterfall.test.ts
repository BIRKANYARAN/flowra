/**
 * Cash Flow Waterfall — unit tests
 *
 * Tests pure computation helpers. No DB or network calls.
 */

import { describe, it, expect } from 'vitest'
import {
  buildWaterfallSegments,
  computeTrendDescription,
  assignSegmentColor,
} from '../lib/services/finance/cashflow-waterfall.service'
import type { CashWaterfallPeriod, WaterfallSegment } from '../lib/services/finance/cashflow-waterfall.service'

// ── assignSegmentColor ────────────────────────────────────────────────────────

describe('assignSegmentColor — pure', () => {

  // Test 1: operating + positive → green
  it('1. operating + positive amount → green', () => {
    expect(assignSegmentColor('operating', 10_000)).toBe('green')
  })

  // Test 2: operating + negative → red
  it('2. operating + negative amount → red', () => {
    expect(assignSegmentColor('operating', -5_000)).toBe('red')
  })

  // Test 3: operating + zero → green (zero treated as non-negative)
  it('3. operating + zero → green', () => {
    expect(assignSegmentColor('operating', 0)).toBe('green')
  })

  // Test 4: investing + negative → blue
  it('4. investing + negative amount → blue', () => {
    expect(assignSegmentColor('investing', -20_000)).toBe('blue')
  })

  // Test 5: investing + positive → gray (inflow from asset sale)
  it('5. investing + positive amount → gray', () => {
    expect(assignSegmentColor('investing', 5_000)).toBe('gray')
  })

  // Test 6: financing + positive → purple
  it('6. financing + positive amount → purple', () => {
    expect(assignSegmentColor('financing', 50_000)).toBe('purple')
  })

  // Test 7: financing + negative → purple (still purple for financing)
  it('7. financing + negative amount → purple', () => {
    expect(assignSegmentColor('financing', -10_000)).toBe('purple')
  })

  // Test 8: result + positive → green
  it('8. result + positive → green', () => {
    expect(assignSegmentColor('result', 8_000)).toBe('green')
  })

  // Test 9: result + negative → red
  it('9. result + negative → red', () => {
    expect(assignSegmentColor('result', -3_000)).toBe('red')
  })
})

// ── buildWaterfallSegments ────────────────────────────────────────────────────

describe('buildWaterfallSegments — pure', () => {

  // Test 10: all positive scenario — running total builds correctly
  it('10. all positive inputs: running total accumulates from opening', () => {
    const segs = buildWaterfallSegments(
      { collections: 100_000, expensePayments: 0 },
      { equipmentPurchases: 0 },
      { loanInflows: 50_000, loanRepayments: 0 },
      10_000, // opening cash
    )
    // Opening = 10_000
    // After collections: 10_000 + 100_000 = 110_000
    const collections = segs.find(s => s.key === 'collections')!
    expect(collections.running_total_try).toBe(110_000)
    expect(collections.amount_try).toBe(100_000)
    expect(collections.is_subtotal).toBe(false)
  })

  // Test 11: all negative scenario — running total decreases
  it('11. all negative inputs: running total decreases from opening', () => {
    const segs = buildWaterfallSegments(
      { collections: 0, expensePayments: 30_000 },
      { equipmentPurchases: 20_000 },
      { loanInflows: 0, loanRepayments: 5_000 },
      100_000, // opening cash
    )
    // After expense_payments: 100_000 - 30_000 = 70_000
    const expensePayments = segs.find(s => s.key === 'expense_payments')!
    expect(expensePayments.running_total_try).toBe(70_000)
    expect(expensePayments.amount_try).toBe(-30_000)
  })

  // Test 12: is_subtotal marks are correct
  it('12. is_subtotal correctly marks subtotal segments', () => {
    const segs = buildWaterfallSegments(
      { collections: 50_000, expensePayments: 20_000 },
      { equipmentPurchases: 10_000 },
      { loanInflows: 15_000, loanRepayments: 5_000 },
      0,
    )
    const subtotalKeys = segs.filter(s => s.is_subtotal).map(s => s.key)
    expect(subtotalKeys).toContain('operating_subtotal')
    expect(subtotalKeys).toContain('investing_subtotal')
    expect(subtotalKeys).toContain('financing_subtotal')
    expect(subtotalKeys).toContain('net_change')

    const detailKeys = segs.filter(s => !s.is_subtotal).map(s => s.key)
    expect(detailKeys).toContain('collections')
    expect(detailKeys).toContain('expense_payments')
    expect(detailKeys).toContain('equipment_purchases')
    expect(detailKeys).toContain('loan_inflows')
    expect(detailKeys).toContain('loan_repayments')
  })

  // Test 13: mixed scenario — net_change segment has correct amount_try
  it('13. net_change amount equals closing minus opening', () => {
    const openingCash = 50_000
    const segs = buildWaterfallSegments(
      { collections: 80_000, expensePayments: 40_000 },
      { equipmentPurchases: 10_000 },
      { loanInflows: 20_000, loanRepayments: 5_000 },
      openingCash,
    )
    // net = 80_000 - 40_000 - 10_000 + 20_000 - 5_000 = 45_000
    const netChange = segs.find(s => s.key === 'net_change')!
    expect(netChange.amount_try).toBe(45_000)
    expect(netChange.running_total_try).toBe(openingCash + 45_000)
    expect(netChange.is_subtotal).toBe(true)
    expect(netChange.category).toBe('result')
  })

  // Test 14: expense payments and equipment are stored as negative amounts
  it('14. expense_payments and equipment_purchases are negative amounts', () => {
    const segs = buildWaterfallSegments(
      { collections: 100_000, expensePayments: 30_000 },
      { equipmentPurchases: 15_000 },
      { loanInflows: 0, loanRepayments: 0 },
      0,
    )
    const expPayments = segs.find(s => s.key === 'expense_payments')!
    const equipment   = segs.find(s => s.key === 'equipment_purchases')!
    expect(expPayments.amount_try).toBe(-30_000)
    expect(equipment.amount_try).toBe(-15_000)
  })

  // Test 15: total segment count is always 9
  it('15. always produces exactly 9 segments', () => {
    const segs = buildWaterfallSegments(
      { collections: 10_000, expensePayments: 5_000 },
      { equipmentPurchases: 2_000 },
      { loanInflows: 1_000, loanRepayments: 500 },
      20_000,
    )
    expect(segs).toHaveLength(9)
  })
})

// ── computeTrendDescription ───────────────────────────────────────────────────

/** Build a minimal CashWaterfallPeriod for trend tests. */
function makePeriod(month: string, operatingNet: number, openingCash = 0): CashWaterfallPeriod {
  const segments: WaterfallSegment[] = [
    {
      key: 'collections',
      label: 'Tahsilatlar',
      category: 'operating',
      amount_try: operatingNet > 0 ? operatingNet : 0,
      running_total_try: openingCash + (operatingNet > 0 ? operatingNet : 0),
      is_subtotal: false,
      color_class: 'green',
    },
    {
      key: 'expense_payments',
      label: 'Gider Ödemeleri',
      category: 'operating',
      amount_try: operatingNet < 0 ? operatingNet : 0,
      running_total_try: openingCash + operatingNet,
      is_subtotal: false,
      color_class: operatingNet < 0 ? 'red' : 'green',
    },
    {
      key: 'operating_subtotal',
      label: 'Faaliyet Net',
      category: 'operating',
      amount_try: 0,
      running_total_try: openingCash + operatingNet,
      is_subtotal: true,
      color_class: operatingNet >= 0 ? 'green' : 'red',
    },
  ]
  return {
    month,
    label: month,
    opening_cash_try: openingCash,
    segments,
    closing_cash_try: openingCash + operatingNet,
    net_change_try: operatingNet,
  }
}

describe('computeTrendDescription — pure', () => {

  // Test 16: empty periods → fallback message
  it('16. empty periods → "Nakit akış verisi bulunamadı."', () => {
    const result = computeTrendDescription([])
    expect(result).toBe('Nakit akış verisi bulunamadı.')
  })

  // Test 17: all 3 periods positive operating → 3 aylık pozitif
  it('17. 3 periods all positive operating → 3 aylık pozitif description', () => {
    const periods = [
      makePeriod('2026-05', 50_000),
      makePeriod('2026-04', 30_000),
      makePeriod('2026-03', 20_000),
    ]
    const result = computeTrendDescription(periods)
    expect(result).toContain('3 aylık')
    expect(result).toContain('pozitif')
  })

  // Test 18: all 3 periods negative operating → 3 aylık negatif
  it('18. 3 periods all negative operating → 3 aylık negatif description', () => {
    const periods = [
      makePeriod('2026-05', -50_000),
      makePeriod('2026-04', -30_000),
      makePeriod('2026-03', -20_000),
    ]
    const result = computeTrendDescription(periods)
    expect(result).toContain('negatif')
  })

  // Test 19: mixed 3 periods → karışık description
  it('19. mixed 3 periods (2 positive, 1 negative) → karışık description', () => {
    const periods = [
      makePeriod('2026-05', 50_000),
      makePeriod('2026-04', 30_000),
      makePeriod('2026-03', -10_000),
    ]
    const result = computeTrendDescription(periods)
    expect(result).toContain('karışık')
    expect(result).toContain('2 pozitif')
    expect(result).toContain('1 negatif')
  })

  // Test 20: single period positive
  it('20. single positive period → pozitif single period description', () => {
    const periods = [makePeriod('2026-05', 10_000)]
    const result = computeTrendDescription(periods)
    expect(result).toContain('pozitif')
  })

  // Test 21: single period negative
  it('21. single negative period → negatif single period description', () => {
    const periods = [makePeriod('2026-05', -5_000)]
    const result = computeTrendDescription(periods)
    expect(result).toContain('negatif')
  })
})

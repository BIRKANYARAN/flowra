/**
 * Discount Analysis — unit tests (100+ tests)
 *
 * Tests pure computation helpers of DiscountAnalysisService.
 * No DB or network calls.
 */

import { describe, it, expect } from 'vitest'
import {
  computeDiscountPct,
  computeRevenueImpact,
  computeMarginAtDiscount,
  computeBreakevenDiscountPct,
  classifyDiscountLevel,
  buildDiscountBuckets,
  computeAvgDiscountPct,
  computeDiscountFrequency,
  computeRevenueLeakage,
  computeMarginErosion,
  classifyDiscountHealth,
  findMostDiscountedProduct,
  computeOptimalPricingGap,
  generateDiscountNarrative,
  type ProductDiscountProfile,
} from '../lib/services/commercial/discount-analysis.service'

// ── computeDiscountPct ────────────────────────────────────────────────────────

describe('computeDiscountPct', () => {

  it('1. basic: list 100, selling 80 → 20%', () => {
    expect(computeDiscountPct(100, 80)).toBeCloseTo(20)
  })

  it('2. no discount: list equals selling → 0%', () => {
    expect(computeDiscountPct(100, 100)).toBe(0)
  })

  it('3. zero list price → 0', () => {
    expect(computeDiscountPct(0, 50)).toBe(0)
  })

  it('4. negative effective discount (selling > list) clamped to 0', () => {
    expect(computeDiscountPct(100, 120)).toBe(0)
  })

  it('5. 100% discount (selling = 0) → 100', () => {
    expect(computeDiscountPct(100, 0)).toBe(100)
  })

  it('6. >100% discount scenario clamped to 100', () => {
    // selling = -50 would give (100-(-50))/100 = 150%, clamped to 100
    expect(computeDiscountPct(100, -50)).toBe(100)
  })

  it('7. fractional discount: list 200, selling 150 → 25%', () => {
    expect(computeDiscountPct(200, 150)).toBeCloseTo(25)
  })

  it('8. small discount: list 1000, selling 990 → 1%', () => {
    expect(computeDiscountPct(1000, 990)).toBeCloseTo(1)
  })

  it('9. exactly 5% discount', () => {
    expect(computeDiscountPct(100, 95)).toBeCloseTo(5)
  })

  it('10. exactly 30% discount', () => {
    expect(computeDiscountPct(100, 70)).toBeCloseTo(30)
  })

})

// ── computeRevenueImpact ──────────────────────────────────────────────────────

describe('computeRevenueImpact', () => {

  it('11. basic: list 100, selling 80, qty 10 → 200', () => {
    expect(computeRevenueImpact(100, 80, 10)).toBe(200)
  })

  it('12. zero discount → 0 impact', () => {
    expect(computeRevenueImpact(100, 100, 5)).toBe(0)
  })

  it('13. zero quantity → 0 impact', () => {
    expect(computeRevenueImpact(100, 80, 0)).toBe(0)
  })

  it('14. large values: list 500, selling 400, qty 100 → 10 000', () => {
    expect(computeRevenueImpact(500, 400, 100)).toBe(10_000)
  })

  it('15. selling > list yields negative impact (no clamping at this level)', () => {
    expect(computeRevenueImpact(100, 110, 5)).toBe(-50)
  })

  it('16. fractional quantity: list 200, selling 180, qty 2.5 → 50', () => {
    expect(computeRevenueImpact(200, 180, 2.5)).toBe(50)
  })

})

// ── computeMarginAtDiscount ───────────────────────────────────────────────────

describe('computeMarginAtDiscount', () => {

  it('17. basic: list 100, 0% discount, cost 60 → 40% margin', () => {
    expect(computeMarginAtDiscount(100, 0, 60)).toBeCloseTo(40)
  })

  it('18. 20% discount: list 100, cost 60 → selling 80, margin 25%', () => {
    // (80 - 60) / 80 = 25%
    expect(computeMarginAtDiscount(100, 20, 60)).toBeCloseTo(25)
  })

  it('19. below cost: list 100, 50% discount, cost 60 → selling 50, negative margin', () => {
    // (50 - 60) / 50 = -20%
    expect(computeMarginAtDiscount(100, 50, 60)).toBeCloseTo(-20)
  })

  it('20. 100% discount → selling = 0 → null', () => {
    expect(computeMarginAtDiscount(100, 100, 60)).toBeNull()
  })

  it('21. zero list price → selling = 0 → null', () => {
    expect(computeMarginAtDiscount(0, 0, 60)).toBeNull()
  })

  it('22. zero cost price → 100% margin at 0 discount', () => {
    expect(computeMarginAtDiscount(100, 0, 0)).toBeCloseTo(100)
  })

  it('23. cost equals list price, 0% discount → 0% margin', () => {
    expect(computeMarginAtDiscount(100, 0, 100)).toBeCloseTo(0)
  })

  it('24. 10% discount, cost 50 on list 100 → selling 90, margin (90-50)/90 ≈ 44.44%', () => {
    expect(computeMarginAtDiscount(100, 10, 50)).toBeCloseTo(44.44, 1)
  })

})

// ── computeBreakevenDiscountPct ───────────────────────────────────────────────

describe('computeBreakevenDiscountPct', () => {

  it('25. basic: list 100, cost 60 → 40% breakeven', () => {
    expect(computeBreakevenDiscountPct(100, 60)).toBeCloseTo(40)
  })

  it('26. zero list price → null', () => {
    expect(computeBreakevenDiscountPct(0, 60)).toBeNull()
  })

  it('27. cost > list → negative breakeven (loss at any price)', () => {
    const result = computeBreakevenDiscountPct(100, 120)
    expect(result).not.toBeNull()
    expect(result!).toBeLessThan(0)
  })

  it('28. cost = list → 0% breakeven', () => {
    expect(computeBreakevenDiscountPct(100, 100)).toBeCloseTo(0)
  })

  it('29. cost = 0 → 100% breakeven', () => {
    expect(computeBreakevenDiscountPct(100, 0)).toBeCloseTo(100)
  })

  it('30. list 500, cost 350 → 30%', () => {
    expect(computeBreakevenDiscountPct(500, 350)).toBeCloseTo(30)
  })

})

// ── classifyDiscountLevel ─────────────────────────────────────────────────────

describe('classifyDiscountLevel', () => {

  it('31. exactly 0% → none', () => {
    expect(classifyDiscountLevel(0)).toBe('none')
  })

  it('32. negative value → none (clamped at business level)', () => {
    expect(classifyDiscountLevel(-1)).toBe('none')
  })

  it('33. 0.01% → low', () => {
    expect(classifyDiscountLevel(0.01)).toBe('low')
  })

  it('34. exactly 5% → low (boundary)', () => {
    expect(classifyDiscountLevel(5)).toBe('low')
  })

  it('35. 5.01% → moderate', () => {
    expect(classifyDiscountLevel(5.01)).toBe('moderate')
  })

  it('36. 10% → moderate', () => {
    expect(classifyDiscountLevel(10)).toBe('moderate')
  })

  it('37. exactly 15% → moderate (boundary)', () => {
    expect(classifyDiscountLevel(15)).toBe('moderate')
  })

  it('38. 15.01% → high', () => {
    expect(classifyDiscountLevel(15.01)).toBe('high')
  })

  it('39. 25% → high', () => {
    expect(classifyDiscountLevel(25)).toBe('high')
  })

  it('40. exactly 30% → high (boundary)', () => {
    expect(classifyDiscountLevel(30)).toBe('high')
  })

  it('41. 30.01% → excessive', () => {
    expect(classifyDiscountLevel(30.01)).toBe('excessive')
  })

  it('42. 50% → excessive', () => {
    expect(classifyDiscountLevel(50)).toBe('excessive')
  })

  it('43. 100% → excessive', () => {
    expect(classifyDiscountLevel(100)).toBe('excessive')
  })

})

// ── buildDiscountBuckets ──────────────────────────────────────────────────────

describe('buildDiscountBuckets', () => {

  it('44. returns exactly 5 buckets', () => {
    const buckets = buildDiscountBuckets([], 0)
    expect(buckets).toHaveLength(5)
  })

  it('45. bucket labels are correct', () => {
    const labels = buildDiscountBuckets([], 0).map(b => b.label)
    expect(labels).toEqual(['0-5%', '5-10%', '10-20%', '20-30%', '30%+'])
  })

  it('46. zero-discount deal goes in first bucket', () => {
    const deals = [{ discount_pct: 0, revenue_try: 1000, margin_pct: 40 }]
    const buckets = buildDiscountBuckets(deals, 1000)
    expect(buckets[0].deal_count).toBe(1)
    expect(buckets[1].deal_count).toBe(0)
  })

  it('47. 5% discount goes in first bucket (boundary inclusive)', () => {
    const deals = [{ discount_pct: 5, revenue_try: 500, margin_pct: null }]
    const buckets = buildDiscountBuckets(deals, 500)
    expect(buckets[0].deal_count).toBe(1)
  })

  it('48. 5.1% discount goes in second bucket', () => {
    const deals = [{ discount_pct: 5.1, revenue_try: 500, margin_pct: null }]
    const buckets = buildDiscountBuckets(deals, 500)
    expect(buckets[1].deal_count).toBe(1)
  })

  it('49. 35% deal goes in last bucket (30%+)', () => {
    const deals = [{ discount_pct: 35, revenue_try: 800, margin_pct: 10 }]
    const buckets = buildDiscountBuckets(deals, 800)
    expect(buckets[4].deal_count).toBe(1)
    expect(buckets[4].revenue_try).toBe(800)
  })

  it('50. revenue_share_pct sums close to 100 when all deals included', () => {
    const deals = [
      { discount_pct: 2, revenue_try: 400, margin_pct: 50 },
      { discount_pct: 7, revenue_try: 300, margin_pct: 40 },
      { discount_pct: 15, revenue_try: 200, margin_pct: 30 },
      { discount_pct: 25, revenue_try: 100, margin_pct: 20 },
    ]
    const total = 1000
    const buckets = buildDiscountBuckets(deals, total)
    const shareSum = buckets.reduce((s, b) => s + b.revenue_share_pct, 0)
    expect(shareSum).toBeCloseTo(100, 0)
  })

  it('51. avg_margin_pct is null when no margin data', () => {
    const deals = [{ discount_pct: 2, revenue_try: 500, margin_pct: null }]
    const buckets = buildDiscountBuckets(deals, 500)
    expect(buckets[0].avg_margin_pct).toBeNull()
  })

  it('52. avg_margin_pct averages correctly across multiple deals', () => {
    const deals = [
      { discount_pct: 2, revenue_try: 500, margin_pct: 30 },
      { discount_pct: 4, revenue_try: 500, margin_pct: 50 },
    ]
    const buckets = buildDiscountBuckets(deals, 1000)
    expect(buckets[0].avg_margin_pct).toBeCloseTo(40)
  })

  it('53. empty deals → all buckets have 0 count and 0 revenue', () => {
    const buckets = buildDiscountBuckets([], 0)
    for (const b of buckets) {
      expect(b.deal_count).toBe(0)
      expect(b.revenue_try).toBe(0)
    }
  })

  it('54. revenue_share_pct is 0 when totalRevenue is 0', () => {
    const deals = [{ discount_pct: 5, revenue_try: 0, margin_pct: null }]
    const buckets = buildDiscountBuckets(deals, 0)
    for (const b of buckets) {
      expect(b.revenue_share_pct).toBe(0)
    }
  })

  it('55. 10% discount goes in 5-10% bucket (boundary inclusive)', () => {
    const deals = [{ discount_pct: 10, revenue_try: 500, margin_pct: null }]
    const buckets = buildDiscountBuckets(deals, 500)
    expect(buckets[1].deal_count).toBe(1)
  })

  it('56. 30% discount goes in 20-30% bucket (boundary inclusive)', () => {
    const deals = [{ discount_pct: 30, revenue_try: 500, margin_pct: null }]
    const buckets = buildDiscountBuckets(deals, 500)
    expect(buckets[3].deal_count).toBe(1)
  })

})

// ── computeAvgDiscountPct ─────────────────────────────────────────────────────

describe('computeAvgDiscountPct', () => {

  it('57. empty array → null', () => {
    expect(computeAvgDiscountPct([])).toBeNull()
  })

  it('58. all-zero revenue → null', () => {
    const deals = [
      { discount_pct: 10, revenue_try: 0 },
      { discount_pct: 20, revenue_try: 0 },
    ]
    expect(computeAvgDiscountPct(deals)).toBeNull()
  })

  it('59. single deal → same discount pct', () => {
    expect(computeAvgDiscountPct([{ discount_pct: 15, revenue_try: 1000 }])).toBeCloseTo(15)
  })

  it('60. revenue-weighted: high revenue deal dominates', () => {
    const deals = [
      { discount_pct: 10, revenue_try: 9000 },
      { discount_pct: 50, revenue_try: 1000 },
    ]
    // weighted = (10×9000 + 50×1000) / 10000 = 140000/10000 = 14
    expect(computeAvgDiscountPct(deals)).toBeCloseTo(14)
  })

  it('61. equal revenue → simple average', () => {
    const deals = [
      { discount_pct: 10, revenue_try: 500 },
      { discount_pct: 20, revenue_try: 500 },
    ]
    expect(computeAvgDiscountPct(deals)).toBeCloseTo(15)
  })

  it('62. zero discount deals included in weighted average', () => {
    const deals = [
      { discount_pct: 0, revenue_try: 500 },
      { discount_pct: 20, revenue_try: 500 },
    ]
    expect(computeAvgDiscountPct(deals)).toBeCloseTo(10)
  })

})

// ── computeDiscountFrequency ──────────────────────────────────────────────────

describe('computeDiscountFrequency', () => {

  it('63. empty array → 0', () => {
    expect(computeDiscountFrequency([])).toBe(0)
  })

  it('64. all zero discounts → 0', () => {
    const deals = [{ discount_pct: 0 }, { discount_pct: 0 }, { discount_pct: 0 }]
    expect(computeDiscountFrequency(deals)).toBe(0)
  })

  it('65. all discounted → 1.0', () => {
    const deals = [{ discount_pct: 10 }, { discount_pct: 5 }, { discount_pct: 20 }]
    expect(computeDiscountFrequency(deals)).toBe(1)
  })

  it('66. half discounted → 0.5', () => {
    const deals = [
      { discount_pct: 10 },
      { discount_pct: 0 },
      { discount_pct: 15 },
      { discount_pct: 0 },
    ]
    expect(computeDiscountFrequency(deals)).toBe(0.5)
  })

  it('67. 1 of 3 discounted → ~0.333', () => {
    const deals = [
      { discount_pct: 0 },
      { discount_pct: 0 },
      { discount_pct: 10 },
    ]
    expect(computeDiscountFrequency(deals)).toBeCloseTo(0.333, 2)
  })

  it('68. single discounted deal → 1.0', () => {
    expect(computeDiscountFrequency([{ discount_pct: 5 }])).toBe(1)
  })

  it('69. single non-discounted deal → 0', () => {
    expect(computeDiscountFrequency([{ discount_pct: 0 }])).toBe(0)
  })

})

// ── computeRevenueLeakage ─────────────────────────────────────────────────────

describe('computeRevenueLeakage', () => {

  it('70. basic: two deals with discounts', () => {
    const deals = [
      { list_price: 100, selling_price: 80, quantity: 10 },  // 200
      { list_price: 200, selling_price: 180, quantity: 5 },  // 100
    ]
    expect(computeRevenueLeakage(deals)).toBe(300)
  })

  it('71. no discount deals → 0', () => {
    const deals = [
      { list_price: 100, selling_price: 100, quantity: 10 },
      { list_price: 200, selling_price: 200, quantity: 5 },
    ]
    expect(computeRevenueLeakage(deals)).toBe(0)
  })

  it('72. empty array → 0', () => {
    expect(computeRevenueLeakage([])).toBe(0)
  })

  it('73. negative raw (selling > list) clamped to 0', () => {
    const deals = [{ list_price: 100, selling_price: 110, quantity: 10 }]
    expect(computeRevenueLeakage(deals)).toBe(0)
  })

  it('74. single deal with discount', () => {
    const deals = [{ list_price: 500, selling_price: 450, quantity: 20 }]
    expect(computeRevenueLeakage(deals)).toBe(1000)
  })

  it('75. mixed discounted and full-price deals', () => {
    const deals = [
      { list_price: 100, selling_price: 90, quantity: 10 },  // 100
      { list_price: 100, selling_price: 100, quantity: 10 }, // 0
    ]
    expect(computeRevenueLeakage(deals)).toBe(100)
  })

})

// ── computeMarginErosion ──────────────────────────────────────────────────────

describe('computeMarginErosion', () => {

  it('76. null discounted → null', () => {
    expect(computeMarginErosion(null, 40)).toBeNull()
  })

  it('77. null non-discounted → null', () => {
    expect(computeMarginErosion(30, null)).toBeNull()
  })

  it('78. both null → null', () => {
    expect(computeMarginErosion(null, null)).toBeNull()
  })

  it('79. erosion: discounted margin lower → negative', () => {
    expect(computeMarginErosion(30, 40)).toBe(-10)
  })

  it('80. improvement (positive)', () => {
    // unusual but theoretically possible
    expect(computeMarginErosion(45, 40)).toBe(5)
  })

  it('81. no erosion → 0', () => {
    expect(computeMarginErosion(40, 40)).toBe(0)
  })

  it('82. large erosion', () => {
    expect(computeMarginErosion(10, 50)).toBe(-40)
  })

})

// ── classifyDiscountHealth ────────────────────────────────────────────────────

describe('classifyDiscountHealth', () => {

  it('83. avg discount > 25% → critical', () => {
    expect(classifyDiscountHealth(26, 0.3, null)).toBe('critical')
  })

  it('84. margin erosion < -10 pp → critical', () => {
    expect(classifyDiscountHealth(5, 0.3, -11)).toBe('critical')
  })

  it('85. avg discount exactly 25% → not critical (high_concern)', () => {
    expect(classifyDiscountHealth(25, 0, null)).toBe('high_concern')
  })

  it('86. avg discount > 15% → high_concern', () => {
    expect(classifyDiscountHealth(16, 0.3, null)).toBe('high_concern')
  })

  it('87. margin erosion < -5 pp → high_concern', () => {
    expect(classifyDiscountHealth(5, 0.2, -6)).toBe('high_concern')
  })

  it('88. frequency > 0.7 → high_concern', () => {
    expect(classifyDiscountHealth(5, 0.8, null)).toBe('high_concern')
  })

  it('89. frequency exactly 0.7 → moderate_concern (not high)', () => {
    // 0.7 is NOT > 0.7
    expect(classifyDiscountHealth(5, 0.7, null)).toBe('moderate_concern')
  })

  it('90. avg discount > 8% → moderate_concern', () => {
    expect(classifyDiscountHealth(9, 0.3, null)).toBe('moderate_concern')
  })

  it('91. frequency > 0.5 → moderate_concern', () => {
    expect(classifyDiscountHealth(3, 0.6, null)).toBe('moderate_concern')
  })

  it('92. all null metrics and low frequency → healthy', () => {
    expect(classifyDiscountHealth(null, 0.1, null)).toBe('healthy')
  })

  it('93. zero discount, zero frequency, no erosion → healthy', () => {
    expect(classifyDiscountHealth(0, 0, 0)).toBe('healthy')
  })

  it('94. null avg but high erosion triggers critical', () => {
    expect(classifyDiscountHealth(null, 0, -15)).toBe('critical')
  })

  it('95. exactly 8% avg discount → moderate_concern boundary NOT triggered → healthy', () => {
    // 8 is NOT > 8
    expect(classifyDiscountHealth(8, 0.2, null)).toBe('healthy')
  })

  it('96. all nulls, frequency 0 → healthy', () => {
    expect(classifyDiscountHealth(null, 0, null)).toBe('healthy')
  })

})

// ── findMostDiscountedProduct ─────────────────────────────────────────────────

const makeProfile = (avg_discount_pct: number, product_name = 'P'): ProductDiscountProfile => ({
  product_id: product_name,
  product_name,
  avg_list_price: 100,
  avg_selling_price: 100 - avg_discount_pct,
  avg_discount_pct,
  max_discount_pct: avg_discount_pct,
  min_discount_pct: avg_discount_pct,
  deal_count: 1,
  revenue_try: 1000,
  margin_at_avg_discount: null,
})

describe('findMostDiscountedProduct', () => {

  it('97. empty array → null', () => {
    expect(findMostDiscountedProduct([])).toBeNull()
  })

  it('98. single product → that product', () => {
    const p = makeProfile(10, 'A')
    expect(findMostDiscountedProduct([p])).toBe(p)
  })

  it('99. multiple products → highest avg_discount_pct', () => {
    const a = makeProfile(5, 'A')
    const b = makeProfile(25, 'B')
    const c = makeProfile(10, 'C')
    expect(findMostDiscountedProduct([a, b, c])).toBe(b)
  })

  it('100. tie → first encountered with highest discount wins', () => {
    const a = makeProfile(20, 'A')
    const b = makeProfile(20, 'B')
    // reduce keeps first if equal (not strictly greater)
    const result = findMostDiscountedProduct([a, b])
    expect(result?.avg_discount_pct).toBe(20)
  })

  it('101. all zero discounts → first one returned', () => {
    const a = makeProfile(0, 'A')
    const b = makeProfile(0, 'B')
    expect(findMostDiscountedProduct([a, b])).toBe(a)
  })

})

// ── computeOptimalPricingGap ──────────────────────────────────────────────────

describe('computeOptimalPricingGap', () => {

  it('102. null avgDiscount → null', () => {
    expect(computeOptimalPricingGap(null, 40)).toBeNull()
  })

  it('103. null breakeven → null', () => {
    expect(computeOptimalPricingGap(10, null)).toBeNull()
  })

  it('104. both null → null', () => {
    expect(computeOptimalPricingGap(null, null)).toBeNull()
  })

  it('105. healthy gap: breakeven 40%, avg 10% → headroom 30pp', () => {
    expect(computeOptimalPricingGap(10, 40)).toBeCloseTo(30)
  })

  it('106. negative headroom: avg > breakeven', () => {
    expect(computeOptimalPricingGap(45, 40)).toBeCloseTo(-5)
  })

  it('107. zero gap: avg equals breakeven', () => {
    expect(computeOptimalPricingGap(30, 30)).toBeCloseTo(0)
  })

})

// ── generateDiscountNarrative ─────────────────────────────────────────────────

describe('generateDiscountNarrative', () => {

  it('108. healthy → Turkish healthy message', () => {
    const msg = generateDiscountNarrative('healthy', 3, 5000, 0.2)
    expect(msg.length).toBeGreaterThan(0)
    expect(msg).toContain('sağlıklı')
  })

  it('109. moderate_concern → includes avg discount value', () => {
    const msg = generateDiscountNarrative('moderate_concern', 9, 10000, 0.6)
    expect(msg.length).toBeGreaterThan(0)
    expect(msg).toContain('9.0')
  })

  it('110. high_concern → Turkish high concern message', () => {
    const msg = generateDiscountNarrative('high_concern', 18, 50000, 0.8)
    expect(msg.length).toBeGreaterThan(0)
    expect(msg).toContain('yüksek')
  })

  it('111. critical → Turkish critical message', () => {
    const msg = generateDiscountNarrative('critical', 30, 100000, 0.9)
    expect(msg.length).toBeGreaterThan(0)
    expect(msg).toContain('Kritik')
  })

  it('112. moderate_concern with null avg → shows ? placeholder', () => {
    const msg = generateDiscountNarrative('moderate_concern', null, 0, 0.6)
    expect(msg).toContain('?')
  })

  it('113. all 4 health levels produce distinct messages', () => {
    const messages = [
      generateDiscountNarrative('healthy', 2, 0, 0.1),
      generateDiscountNarrative('moderate_concern', 9, 5000, 0.5),
      generateDiscountNarrative('high_concern', 18, 20000, 0.75),
      generateDiscountNarrative('critical', 30, 100000, 0.9),
    ]
    const unique = new Set(messages)
    expect(unique.size).toBe(4)
  })

  it('114. healthy message contains fiyat disiplini', () => {
    const msg = generateDiscountNarrative('healthy', 0, 0, 0)
    expect(msg).toContain('fiyat disiplini')
  })

  it('115. critical message contains karlılığı', () => {
    const msg = generateDiscountNarrative('critical', 28, 80000, 0.85)
    expect(msg).toContain('karlılığı')
  })

})

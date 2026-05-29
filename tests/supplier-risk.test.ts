// ── supplier-risk.test.ts ─────────────────────────────────────────────────────
// Unit tests for all pure helpers in supplier-risk.service.ts.
// Target: 110+ tests covering all exported pure functions.

import { describe, it, expect } from 'vitest'
import {
  computeSupplierHhi,
  classifySupplierConcentration,
  computeTopSupplierShare,
  countSingleSourceDependencies,
  computeSupplierPaymentDelayRate,
  computeSupplyChainExposure,
  computePaymentTermsCompliance,
  computeSupplierRiskScore,
  classifySupplierRisk,
  computeCategorySpendShare,
  getTopSuppliersBySpend,
  computeSupplierSpendChange,
  generateSupplierRiskNarrative,
} from '../lib/services/commercial/supplier-risk.service'

// ── computeSupplierHhi ────────────────────────────────────────────────────────

describe('computeSupplierHhi', () => {
  it('1. single supplier → HHI = 1.0', () => {
    expect(computeSupplierHhi([{ spend: 1000 }], 1000)).toBeCloseTo(1.0)
  })

  it('2. two equal suppliers → HHI = 0.5', () => {
    expect(computeSupplierHhi([{ spend: 500 }, { spend: 500 }], 1000)).toBeCloseTo(0.5)
  })

  it('3. three equal suppliers → HHI ≈ 0.333', () => {
    const suppliers = [{ spend: 333 }, { spend: 333 }, { spend: 334 }]
    const hhi = computeSupplierHhi(suppliers, 1000)
    expect(hhi).not.toBeNull()
    expect(hhi!).toBeCloseTo(0.333, 1)
  })

  it('4. five equal suppliers → HHI = 0.2', () => {
    const suppliers = Array(5).fill({ spend: 200 })
    expect(computeSupplierHhi(suppliers, 1000)).toBeCloseTo(0.2)
  })

  it('5. ten equal suppliers → HHI = 0.1', () => {
    const suppliers = Array(10).fill({ spend: 100 })
    expect(computeSupplierHhi(suppliers, 1000)).toBeCloseTo(0.1)
  })

  it('6. zero totalSpend → null', () => {
    expect(computeSupplierHhi([{ spend: 0 }], 0)).toBeNull()
  })

  it('7. empty suppliers array with zero totalSpend → null', () => {
    expect(computeSupplierHhi([], 0)).toBeNull()
  })

  it('8. empty suppliers array with nonzero totalSpend → null', () => {
    expect(computeSupplierHhi([], 1000)).toBeNull()
  })

  it('9. dominant supplier 80/20 split → HHI > 0.5', () => {
    const hhi = computeSupplierHhi([{ spend: 800 }, { spend: 200 }], 1000)
    expect(hhi).not.toBeNull()
    expect(hhi!).toBeCloseTo(0.68)
  })

  it('10. HHI is symmetric — order does not matter', () => {
    const h1 = computeSupplierHhi([{ spend: 700 }, { spend: 300 }], 1000)
    const h2 = computeSupplierHhi([{ spend: 300 }, { spend: 700 }], 1000)
    expect(h1).toBeCloseTo(h2!)
  })

  it('11. single supplier with zero spend and nonzero total → HHI = 0', () => {
    expect(computeSupplierHhi([{ spend: 0 }], 1000)).toBeCloseTo(0)
  })
})

// ── classifySupplierConcentration ─────────────────────────────────────────────

describe('classifySupplierConcentration', () => {
  it('12. null → insufficient_data', () => {
    expect(classifySupplierConcentration(null)).toBe('insufficient_data')
  })

  it('13. HHI = 0 → diversified', () => {
    expect(classifySupplierConcentration(0)).toBe('diversified')
  })

  it('14. HHI = 0.05 → diversified', () => {
    expect(classifySupplierConcentration(0.05)).toBe('diversified')
  })

  it('15. HHI = 0.09 → diversified (just below 0.10 boundary)', () => {
    expect(classifySupplierConcentration(0.09)).toBe('diversified')
  })

  it('16. HHI = 0.10 → moderate (exactly at 0.10 boundary)', () => {
    expect(classifySupplierConcentration(0.10)).toBe('moderate')
  })

  it('17. HHI = 0.15 → moderate', () => {
    expect(classifySupplierConcentration(0.15)).toBe('moderate')
  })

  it('18. HHI = 0.24 → moderate (just below 0.25 boundary)', () => {
    expect(classifySupplierConcentration(0.24)).toBe('moderate')
  })

  it('19. HHI = 0.25 → concentrated (exactly at 0.25 boundary)', () => {
    expect(classifySupplierConcentration(0.25)).toBe('concentrated')
  })

  it('20. HHI = 0.35 → concentrated', () => {
    expect(classifySupplierConcentration(0.35)).toBe('concentrated')
  })

  it('21. HHI = 0.49 → concentrated (just below 0.50 boundary)', () => {
    expect(classifySupplierConcentration(0.49)).toBe('concentrated')
  })

  it('22. HHI = 0.50 → highly_concentrated (exactly at 0.50 boundary)', () => {
    expect(classifySupplierConcentration(0.50)).toBe('highly_concentrated')
  })

  it('23. HHI = 0.75 → highly_concentrated', () => {
    expect(classifySupplierConcentration(0.75)).toBe('highly_concentrated')
  })

  it('24. HHI = 0.94 → highly_concentrated (just below 0.95 boundary)', () => {
    expect(classifySupplierConcentration(0.94)).toBe('highly_concentrated')
  })

  it('25. HHI = 0.95 → single_source (exactly at 0.95 boundary)', () => {
    expect(classifySupplierConcentration(0.95)).toBe('single_source')
  })

  it('26. HHI = 1.0 → single_source', () => {
    expect(classifySupplierConcentration(1.0)).toBe('single_source')
  })
})

// ── computeTopSupplierShare ───────────────────────────────────────────────────

describe('computeTopSupplierShare', () => {
  it('27. single supplier → 100%', () => {
    expect(computeTopSupplierShare([{ spend: 1000 }], 1000)).toBeCloseTo(100)
  })

  it('28. dominant supplier 80/20 → 80%', () => {
    expect(computeTopSupplierShare([{ spend: 800 }, { spend: 200 }], 1000)).toBeCloseTo(80)
  })

  it('29. equal split 2 suppliers → 50%', () => {
    expect(computeTopSupplierShare([{ spend: 500 }, { spend: 500 }], 1000)).toBeCloseTo(50)
  })

  it('30. equal split 5 suppliers → 20%', () => {
    const suppliers = Array(5).fill({ spend: 200 })
    expect(computeTopSupplierShare(suppliers, 1000)).toBeCloseTo(20)
  })

  it('31. empty array → null', () => {
    expect(computeTopSupplierShare([], 1000)).toBeNull()
  })

  it('32. zero totalSpend → null', () => {
    expect(computeTopSupplierShare([{ spend: 0 }], 0)).toBeNull()
  })

  it('33. top supplier is largest regardless of order', () => {
    const suppliers = [{ spend: 100 }, { spend: 600 }, { spend: 300 }]
    expect(computeTopSupplierShare(suppliers, 1000)).toBeCloseTo(60)
  })
})

// ── countSingleSourceDependencies ─────────────────────────────────────────────

describe('countSingleSourceDependencies', () => {
  it('34. no supplier exceeds threshold → 0', () => {
    const suppliers = [{ spend: 200 }, { spend: 200 }, { spend: 200 }]
    expect(countSingleSourceDependencies(suppliers, 1000)).toBe(0)
  })

  it('35. one supplier exceeds 30% default → 1', () => {
    const suppliers = [{ spend: 400 }, { spend: 300 }, { spend: 300 }]
    expect(countSingleSourceDependencies(suppliers, 1000)).toBe(1)
  })

  it('36. two suppliers exceed 30% → 2', () => {
    const suppliers = [{ spend: 400 }, { spend: 350 }, { spend: 250 }]
    expect(countSingleSourceDependencies(suppliers, 1000)).toBe(2)
  })

  it('37. single supplier = 100% → 1', () => {
    expect(countSingleSourceDependencies([{ spend: 1000 }], 1000)).toBe(1)
  })

  it('38. custom threshold 50% — one above → 1', () => {
    const suppliers = [{ spend: 600 }, { spend: 400 }]
    expect(countSingleSourceDependencies(suppliers, 1000, 50)).toBe(1)
  })

  it('39. custom threshold 50% — none above → 0', () => {
    const suppliers = [{ spend: 500 }, { spend: 500 }]
    expect(countSingleSourceDependencies(suppliers, 1000, 50)).toBe(0)
  })

  it('40. zero totalSpend → 0', () => {
    expect(countSingleSourceDependencies([{ spend: 0 }], 0)).toBe(0)
  })

  it('41. empty suppliers → 0', () => {
    expect(countSingleSourceDependencies([], 1000)).toBe(0)
  })

  it('42. exactly at threshold (not greater) → not counted', () => {
    const suppliers = [{ spend: 300 }, { spend: 700 }]
    // 30% exactly: 300/1000 = 30%, threshold is > 30 (strict), so not counted
    expect(countSingleSourceDependencies(suppliers, 1000, 30)).toBe(1) // 700 > 30% → 1
  })
})

// ── computeSupplierPaymentDelayRate ───────────────────────────────────────────

describe('computeSupplierPaymentDelayRate', () => {
  it('43. 0 delayed, 10 total → 0%', () => {
    expect(computeSupplierPaymentDelayRate(0, 10)).toBeCloseTo(0)
  })

  it('44. 5 delayed, 10 total → 50%', () => {
    expect(computeSupplierPaymentDelayRate(5, 10)).toBeCloseTo(50)
  })

  it('45. 10 delayed, 10 total → 100%', () => {
    expect(computeSupplierPaymentDelayRate(10, 10)).toBeCloseTo(100)
  })

  it('46. 3 delayed, 4 total → 75%', () => {
    expect(computeSupplierPaymentDelayRate(3, 4)).toBeCloseTo(75)
  })

  it('47. zero total → null', () => {
    expect(computeSupplierPaymentDelayRate(0, 0)).toBeNull()
  })

  it('48. 1 delayed, 100 total → 1%', () => {
    expect(computeSupplierPaymentDelayRate(1, 100)).toBeCloseTo(1)
  })
})

// ── computeSupplyChainExposure ────────────────────────────────────────────────

describe('computeSupplyChainExposure', () => {
  it('49. empty array → 0', () => {
    expect(computeSupplyChainExposure([])).toBe(0)
  })

  it('50. single payable → that amount', () => {
    expect(computeSupplyChainExposure([{ outstanding: 5000 }])).toBe(5000)
  })

  it('51. multiple payables → sum', () => {
    expect(computeSupplyChainExposure([
      { outstanding: 1000 },
      { outstanding: 2000 },
      { outstanding: 3000 },
    ])).toBe(6000)
  })

  it('52. all zero payables → 0', () => {
    expect(computeSupplyChainExposure([{ outstanding: 0 }, { outstanding: 0 }])).toBe(0)
  })

  it('53. mix of zero and nonzero → correct sum', () => {
    expect(computeSupplyChainExposure([{ outstanding: 0 }, { outstanding: 500 }])).toBe(500)
  })
})

// ── computePaymentTermsCompliance ─────────────────────────────────────────────

describe('computePaymentTermsCompliance', () => {
  it('54. 100 on time, 100 total → 100%', () => {
    expect(computePaymentTermsCompliance(100, 100)).toBeCloseTo(100)
  })

  it('55. 0 on time, 100 total → 0%', () => {
    expect(computePaymentTermsCompliance(0, 100)).toBeCloseTo(0)
  })

  it('56. 75 on time, 100 total → 75%', () => {
    expect(computePaymentTermsCompliance(75, 100)).toBeCloseTo(75)
  })

  it('57. zero total → null', () => {
    expect(computePaymentTermsCompliance(0, 0)).toBeNull()
  })

  it('58. 1 on time, 4 total → 25%', () => {
    expect(computePaymentTermsCompliance(1, 4)).toBeCloseTo(25)
  })

  it('59. 3 on time, 3 total → 100%', () => {
    expect(computePaymentTermsCompliance(3, 3)).toBeCloseTo(100)
  })
})

// ── computeSupplierRiskScore ──────────────────────────────────────────────────

describe('computeSupplierRiskScore', () => {
  it('60. all nulls, 0 suppliers → 0 (clamped)', () => {
    expect(computeSupplierRiskScore(null, null, null, 0)).toBe(0)
  })

  it('61. HHI=1.0, topShare=100%, delayRate=100%, supplierCount=1 → 100 (clamped)', () => {
    // 1.0*40 + 20 (>50%) + 100*0.25 = 40 + 20 + 25 = 85, no bonus
    expect(computeSupplierRiskScore(1.0, 100, 100, 1)).toBe(85)
  })

  it('62. HHI only — no penalties or bonuses', () => {
    // HHI=0.5: 0.5*40 = 20, topShare=null, delayRate=null, count=3
    expect(computeSupplierRiskScore(0.5, null, null, 3)).toBeCloseTo(20)
  })

  it('63. topShare > 50% adds 20 pts', () => {
    const base = computeSupplierRiskScore(0, null, null, 1)
    const withPenalty = computeSupplierRiskScore(0, 60, null, 1)
    expect(withPenalty - base).toBe(20)
  })

  it('64. topShare > 30% but <= 50% adds 10 pts', () => {
    const base = computeSupplierRiskScore(0, null, null, 1)
    const withPenalty = computeSupplierRiskScore(0, 40, null, 1)
    expect(withPenalty - base).toBe(10)
  })

  it('65. topShare exactly 50% → 10 pts (not >50)', () => {
    const base = computeSupplierRiskScore(0, null, null, 1)
    const with50 = computeSupplierRiskScore(0, 50, null, 1)
    expect(with50 - base).toBe(10)
  })

  it('66. topShare exactly 30% → 0 pts (not >30)', () => {
    const base = computeSupplierRiskScore(0, null, null, 1)
    const with30 = computeSupplierRiskScore(0, 30, null, 1)
    expect(with30 - base).toBe(0)
  })

  it('67. delayRate = 100% → +25 pts', () => {
    const base = computeSupplierRiskScore(0, null, null, 1)
    const withDelay = computeSupplierRiskScore(0, null, 100, 1)
    expect(withDelay - base).toBeCloseTo(25)
  })

  it('68. delayRate = 40% → +10 pts', () => {
    const base = computeSupplierRiskScore(0, null, null, 1)
    const withDelay = computeSupplierRiskScore(0, null, 40, 1)
    expect(withDelay - base).toBeCloseTo(10)
  })

  it('69. supplierCount = 5 → -10 pts diversification bonus', () => {
    const without = computeSupplierRiskScore(0.5, null, null, 1)
    const with5 = computeSupplierRiskScore(0.5, null, null, 5)
    expect(without - with5).toBeCloseTo(10)
  })

  it('70. supplierCount = 10 → -15 pts diversification bonus', () => {
    const without = computeSupplierRiskScore(0.5, null, null, 1)
    const with10 = computeSupplierRiskScore(0.5, null, null, 10)
    expect(without - with10).toBeCloseTo(15)
  })

  it('71. supplierCount = 4 → no bonus (< 5)', () => {
    const with4 = computeSupplierRiskScore(0.5, null, null, 4)
    const with1 = computeSupplierRiskScore(0.5, null, null, 1)
    expect(with4).toBe(with1)
  })

  it('72. score clamped at 0 minimum — negative inputs', () => {
    expect(computeSupplierRiskScore(0, null, null, 10)).toBeGreaterThanOrEqual(0)
  })

  it('73. score clamped at 100 maximum', () => {
    expect(computeSupplierRiskScore(1.0, 100, 100, 0)).toBeLessThanOrEqual(100)
  })

  it('74. all null payment metrics → no delay contribution', () => {
    const s1 = computeSupplierRiskScore(0.3, null, null, 2)
    const s2 = computeSupplierRiskScore(0.3, null, 0, 2)
    expect(s1).toBe(s2)
  })

  it('75. HHI null → 0 concentration contribution', () => {
    const withNull = computeSupplierRiskScore(null, null, null, 3)
    const withZero = computeSupplierRiskScore(0, null, null, 3)
    expect(withNull).toBe(withZero)
  })

  it('76. full scenario: HHI=0.25, topShare=40%, delayRate=20%, count=5', () => {
    // 0.25*40=10, +10 (>30% but <=50%), 20*0.25=5, -10 (count>=5) → 15
    const score = computeSupplierRiskScore(0.25, 40, 20, 5)
    expect(score).toBeCloseTo(15)
  })
})

// ── classifySupplierRisk ──────────────────────────────────────────────────────

describe('classifySupplierRisk', () => {
  it('77. score = 0 → low', () => {
    expect(classifySupplierRisk(0)).toBe('low')
  })

  it('78. score = 19 → low (just below 20)', () => {
    expect(classifySupplierRisk(19)).toBe('low')
  })

  it('79. score = 20 → moderate (exactly at boundary)', () => {
    expect(classifySupplierRisk(20)).toBe('moderate')
  })

  it('80. score = 25 → moderate', () => {
    expect(classifySupplierRisk(25)).toBe('moderate')
  })

  it('81. score = 39 → moderate (just below 40)', () => {
    expect(classifySupplierRisk(39)).toBe('moderate')
  })

  it('82. score = 40 → elevated (exactly at boundary)', () => {
    expect(classifySupplierRisk(40)).toBe('elevated')
  })

  it('83. score = 50 → elevated', () => {
    expect(classifySupplierRisk(50)).toBe('elevated')
  })

  it('84. score = 59 → elevated (just below 60)', () => {
    expect(classifySupplierRisk(59)).toBe('elevated')
  })

  it('85. score = 60 → high (exactly at boundary)', () => {
    expect(classifySupplierRisk(60)).toBe('high')
  })

  it('86. score = 70 → high', () => {
    expect(classifySupplierRisk(70)).toBe('high')
  })

  it('87. score = 79 → high (just below 80)', () => {
    expect(classifySupplierRisk(79)).toBe('high')
  })

  it('88. score = 80 → critical (exactly at boundary)', () => {
    expect(classifySupplierRisk(80)).toBe('critical')
  })

  it('89. score = 100 → critical', () => {
    expect(classifySupplierRisk(100)).toBe('critical')
  })
})

// ── computeCategorySpendShare ─────────────────────────────────────────────────

describe('computeCategorySpendShare', () => {
  it('90. categorySpend = 0, total = 1000 → 0%', () => {
    expect(computeCategorySpendShare(0, 1000)).toBeCloseTo(0)
  })

  it('91. categorySpend = 500, total = 1000 → 50%', () => {
    expect(computeCategorySpendShare(500, 1000)).toBeCloseTo(50)
  })

  it('92. categorySpend = 1000, total = 1000 → 100%', () => {
    expect(computeCategorySpendShare(1000, 1000)).toBeCloseTo(100)
  })

  it('93. zero totalSpend → null', () => {
    expect(computeCategorySpendShare(500, 0)).toBeNull()
  })

  it('94. small fraction → correct pct', () => {
    expect(computeCategorySpendShare(10, 1000)).toBeCloseTo(1)
  })
})

// ── getTopSuppliersBySpend ────────────────────────────────────────────────────

describe('getTopSuppliersBySpend', () => {
  const suppliers = [
    { name: 'Supplier A', spend: 100 },
    { name: 'Supplier B', spend: 500 },
    { name: 'Supplier C', spend: 300 },
    { name: 'Supplier D', spend: 200 },
    { name: 'Supplier E', spend: 400 },
    { name: 'Supplier F', spend: 150 },
  ]

  it('95. default n=5 → returns top 5', () => {
    const top = getTopSuppliersBySpend(suppliers)
    expect(top).toHaveLength(5)
  })

  it('96. default → sorted by spend descending', () => {
    const top = getTopSuppliersBySpend(suppliers)
    expect(top[0].name).toBe('Supplier B')
    expect(top[1].name).toBe('Supplier E')
  })

  it('97. n=3 → returns top 3', () => {
    const top = getTopSuppliersBySpend(suppliers, 3)
    expect(top).toHaveLength(3)
    expect(top[0].spend).toBe(500)
  })

  it('98. n larger than array → returns all', () => {
    const top = getTopSuppliersBySpend(suppliers, 20)
    expect(top).toHaveLength(suppliers.length)
  })

  it('99. empty array → empty array', () => {
    expect(getTopSuppliersBySpend([], 5)).toHaveLength(0)
  })

  it('100. does not mutate original array', () => {
    const original = [...suppliers]
    getTopSuppliersBySpend(suppliers, 3)
    expect(suppliers[0].name).toBe(original[0].name)
  })

  it('101. n=1 → single top supplier', () => {
    const top = getTopSuppliersBySpend(suppliers, 1)
    expect(top).toHaveLength(1)
    expect(top[0].spend).toBe(500)
  })
})

// ── computeSupplierSpendChange ────────────────────────────────────────────────

describe('computeSupplierSpendChange', () => {
  it('102. positive growth → positive %', () => {
    expect(computeSupplierSpendChange(1200, 1000)).toBeCloseTo(20)
  })

  it('103. negative change → negative %', () => {
    expect(computeSupplierSpendChange(800, 1000)).toBeCloseTo(-20)
  })

  it('104. no change → 0%', () => {
    expect(computeSupplierSpendChange(1000, 1000)).toBeCloseTo(0)
  })

  it('105. zero prior month → null', () => {
    expect(computeSupplierSpendChange(1000, 0)).toBeNull()
  })

  it('106. 100% increase', () => {
    expect(computeSupplierSpendChange(2000, 1000)).toBeCloseTo(100)
  })

  it('107. 100% decrease (to zero)', () => {
    expect(computeSupplierSpendChange(0, 1000)).toBeCloseTo(-100)
  })

  it('108. partial increase 50%', () => {
    expect(computeSupplierSpendChange(1500, 1000)).toBeCloseTo(50)
  })
})

// ── generateSupplierRiskNarrative ─────────────────────────────────────────────

describe('generateSupplierRiskNarrative', () => {
  it('109. critical + single_source → acil çeşitlendirme narrative', () => {
    const narrative = generateSupplierRiskNarrative('critical', 'single_source', 1, 100)
    expect(narrative).toContain('KRİTİK')
    expect(narrative.length).toBeGreaterThan(20)
  })

  it('110. critical + highly_concentrated → critical narrative', () => {
    const narrative = generateSupplierRiskNarrative('critical', 'highly_concentrated', 2, 80)
    expect(narrative).toContain('KRİTİK')
  })

  it('111. high + highly_concentrated → high risk narrative', () => {
    const narrative = generateSupplierRiskNarrative('high', 'highly_concentrated', 3, 70)
    expect(narrative).toContain('Yüksek')
  })

  it('112. high + concentrated → high risk narrative', () => {
    const narrative = generateSupplierRiskNarrative('high', 'concentrated', 4, 60)
    expect(narrative).toContain('Yüksek')
  })

  it('113. elevated + concentrated → orta-yüksek narrative', () => {
    const narrative = generateSupplierRiskNarrative('elevated', 'concentrated', 5, 40)
    expect(narrative).toContain('Orta')
  })

  it('114. elevated + moderate → orta-yüksek narrative', () => {
    const narrative = generateSupplierRiskNarrative('elevated', 'moderate', 6, 30)
    expect(narrative).toContain('Orta')
  })

  it('115. moderate + any → orta düzey narrative', () => {
    const narrative = generateSupplierRiskNarrative('moderate', 'moderate', 8, 20)
    expect(narrative).toContain('Orta')
  })

  it('116. low + diversified → düşük risk narrative', () => {
    const narrative = generateSupplierRiskNarrative('low', 'diversified', 12, 10)
    expect(narrative).toContain('Düşük')
  })

  it('117. low + moderate → düşük risk narrative', () => {
    const narrative = generateSupplierRiskNarrative('low', 'moderate', 10, 15)
    expect(narrative).toContain('Düşük')
  })

  it('118. topSupplierSharePct null → still returns string narrative', () => {
    const narrative = generateSupplierRiskNarrative('critical', 'insufficient_data', 1, null)
    expect(typeof narrative).toBe('string')
    expect(narrative.length).toBeGreaterThan(10)
  })

  it('119. supplier count reflected in narrative for moderate risk', () => {
    const narrative = generateSupplierRiskNarrative('moderate', 'moderate', 7, 20)
    expect(narrative).toContain('7')
  })

  it('120. supplier count reflected in narrative for low risk diversified', () => {
    const narrative = generateSupplierRiskNarrative('low', 'diversified', 15, 8)
    expect(narrative).toContain('15')
  })
})

/**
 * Risk-Adjusted Revenue — unit tests
 *
 * Tests all pure computation functions exported from risk-adjusted-revenue.service.ts
 * No DB or network calls — pure function tests only.
 *
 * Target: 110+ tests covering all exported functions.
 */

import { describe, it, expect } from 'vitest'
import {
  computeCollectionProbability,
  computeRiskAdjustedValue,
  computeAtRiskAmount,
  computeWeightedCollectionProbability,
  computeRevenueQualityRatio,
  classifyRevenueQuality,
  computeEffectiveRevenue,
  computeRevenueRealizationGap,
  classifyCustomerPaymentRisk,
  computeReceivablesConcentration,
  computeCollectionScenarios,
  generateRarNarrative,
} from '../lib/services/commercial/risk-adjusted-revenue.service'

// ── computeCollectionProbability ─────────────────────────────────────────────

describe('computeCollectionProbability', () => {
  it('1. negative days → 0.95 (not yet due)', () => {
    expect(computeCollectionProbability(-10)).toBe(0.95)
  })

  it('2. -1 day → 0.95 (one day before due)', () => {
    expect(computeCollectionProbability(-1)).toBe(0.95)
  })

  it('3. 0 days → 0.95 (due today)', () => {
    expect(computeCollectionProbability(0)).toBe(0.95)
  })

  it('4. 1 day overdue → 0.85', () => {
    expect(computeCollectionProbability(1)).toBe(0.85)
  })

  it('5. 15 days overdue → 0.85 (1-30 bucket)', () => {
    expect(computeCollectionProbability(15)).toBe(0.85)
  })

  it('6. 30 days overdue → 0.85 (boundary of 1-30 bucket)', () => {
    expect(computeCollectionProbability(30)).toBe(0.85)
  })

  it('7. 31 days overdue → 0.70 (31-60 bucket)', () => {
    expect(computeCollectionProbability(31)).toBe(0.70)
  })

  it('8. 45 days overdue → 0.70 (31-60 bucket)', () => {
    expect(computeCollectionProbability(45)).toBe(0.70)
  })

  it('9. 60 days overdue → 0.70 (boundary of 31-60 bucket)', () => {
    expect(computeCollectionProbability(60)).toBe(0.70)
  })

  it('10. 61 days overdue → 0.50 (61-90 bucket)', () => {
    expect(computeCollectionProbability(61)).toBe(0.50)
  })

  it('11. 75 days overdue → 0.50 (61-90 bucket)', () => {
    expect(computeCollectionProbability(75)).toBe(0.50)
  })

  it('12. 90 days overdue → 0.50 (boundary of 61-90 bucket)', () => {
    expect(computeCollectionProbability(90)).toBe(0.50)
  })

  it('13. 91 days overdue → 0.30 (91-180 bucket)', () => {
    expect(computeCollectionProbability(91)).toBe(0.30)
  })

  it('14. 120 days overdue → 0.30 (91-180 bucket)', () => {
    expect(computeCollectionProbability(120)).toBe(0.30)
  })

  it('15. 180 days overdue → 0.30 (boundary of 91-180 bucket)', () => {
    expect(computeCollectionProbability(180)).toBe(0.30)
  })

  it('16. 181 days overdue → 0.10 (181+ bucket)', () => {
    expect(computeCollectionProbability(181)).toBe(0.10)
  })

  it('17. 200 days overdue → 0.10 (181+ bucket)', () => {
    expect(computeCollectionProbability(200)).toBe(0.10)
  })

  it('18. 365 days overdue → 0.10 (very old)', () => {
    expect(computeCollectionProbability(365)).toBe(0.10)
  })

  it('19. large negative → 0.95 (well before due)', () => {
    expect(computeCollectionProbability(-100)).toBe(0.95)
  })
})

// ── computeRiskAdjustedValue ──────────────────────────────────────────────────

describe('computeRiskAdjustedValue', () => {
  it('20. 1000 × 0.95 = 950', () => {
    expect(computeRiskAdjustedValue(1000, 0.95)).toBeCloseTo(950)
  })

  it('21. 1000 × 0.85 = 850', () => {
    expect(computeRiskAdjustedValue(1000, 0.85)).toBeCloseTo(850)
  })

  it('22. 1000 × 0.10 = 100', () => {
    expect(computeRiskAdjustedValue(1000, 0.10)).toBeCloseTo(100)
  })

  it('23. 0 outstanding × any probability = 0', () => {
    expect(computeRiskAdjustedValue(0, 0.85)).toBe(0)
  })

  it('24. 5000 × 0.50 = 2500', () => {
    expect(computeRiskAdjustedValue(5000, 0.50)).toBeCloseTo(2500)
  })

  it('25. 1234.56 × 0.70 ≈ 864.19', () => {
    expect(computeRiskAdjustedValue(1234.56, 0.70)).toBeCloseTo(864.19, 1)
  })
})

// ── computeAtRiskAmount ───────────────────────────────────────────────────────

describe('computeAtRiskAmount', () => {
  it('26. 1000 × (1 - 0.95) = 50', () => {
    expect(computeAtRiskAmount(1000, 0.95)).toBeCloseTo(50)
  })

  it('27. 1000 × (1 - 0.85) = 150', () => {
    expect(computeAtRiskAmount(1000, 0.85)).toBeCloseTo(150)
  })

  it('28. 1000 × (1 - 0.10) = 900', () => {
    expect(computeAtRiskAmount(1000, 0.10)).toBeCloseTo(900)
  })

  it('29. riskAdjusted + atRisk = outstanding', () => {
    const outstanding = 3000
    const prob = 0.70
    const ra  = computeRiskAdjustedValue(outstanding, prob)
    const ar  = computeAtRiskAmount(outstanding, prob)
    expect(ra + ar).toBeCloseTo(outstanding)
  })

  it('30. riskAdjusted + atRisk = outstanding for 0.30 probability', () => {
    const outstanding = 7500
    const prob = 0.30
    expect(computeRiskAdjustedValue(outstanding, prob) + computeAtRiskAmount(outstanding, prob))
      .toBeCloseTo(outstanding)
  })

  it('31. 0 outstanding → 0 at risk', () => {
    expect(computeAtRiskAmount(0, 0.5)).toBe(0)
  })
})

// ── computeWeightedCollectionProbability ─────────────────────────────────────

describe('computeWeightedCollectionProbability', () => {
  it('32. empty array → null', () => {
    expect(computeWeightedCollectionProbability([])).toBeNull()
  })

  it('33. all zero outstanding → null', () => {
    expect(
      computeWeightedCollectionProbability([
        { outstanding: 0, collection_probability: 0.95 },
        { outstanding: 0, collection_probability: 0.50 },
      ]),
    ).toBeNull()
  })

  it('34. single item returns its probability', () => {
    expect(
      computeWeightedCollectionProbability([
        { outstanding: 1000, collection_probability: 0.85 },
      ]),
    ).toBeCloseTo(0.85)
  })

  it('35. equal outstanding → simple average', () => {
    const result = computeWeightedCollectionProbability([
      { outstanding: 1000, collection_probability: 0.90 },
      { outstanding: 1000, collection_probability: 0.50 },
    ])
    expect(result).toBeCloseTo(0.70)
  })

  it('36. revenue-weighted: larger balance dominates', () => {
    // 9000 × 0.95 + 1000 × 0.10 = 8550 + 100 = 8650 / 10000 = 0.865
    const result = computeWeightedCollectionProbability([
      { outstanding: 9000, collection_probability: 0.95 },
      { outstanding: 1000, collection_probability: 0.10 },
    ])
    expect(result).toBeCloseTo(0.865)
  })

  it('37. three items revenue-weighted', () => {
    // 5000×0.95 + 3000×0.70 + 2000×0.30 = 4750 + 2100 + 600 = 7450 / 10000 = 0.745
    const result = computeWeightedCollectionProbability([
      { outstanding: 5000, collection_probability: 0.95 },
      { outstanding: 3000, collection_probability: 0.70 },
      { outstanding: 2000, collection_probability: 0.30 },
    ])
    expect(result).toBeCloseTo(0.745)
  })

  it('38. one item with zero, one with value → only non-zero contributes', () => {
    const result = computeWeightedCollectionProbability([
      { outstanding: 0, collection_probability: 0.10 },
      { outstanding: 2000, collection_probability: 0.85 },
    ])
    expect(result).toBeCloseTo(0.85)
  })
})

// ── computeRevenueQualityRatio ────────────────────────────────────────────────

describe('computeRevenueQualityRatio', () => {
  it('39. zero total invoiced → null', () => {
    expect(computeRevenueQualityRatio(0, 0)).toBeNull()
  })

  it('40. fully paid → 100', () => {
    expect(computeRevenueQualityRatio(10000, 10000)).toBeCloseTo(100)
  })

  it('41. half paid → 50', () => {
    expect(computeRevenueQualityRatio(5000, 10000)).toBeCloseTo(50)
  })

  it('42. 0 collected, nonzero invoiced → 0', () => {
    expect(computeRevenueQualityRatio(0, 10000)).toBeCloseTo(0)
  })

  it('43. 9500 / 10000 = 95', () => {
    expect(computeRevenueQualityRatio(9500, 10000)).toBeCloseTo(95)
  })

  it('44. 8750 / 10000 = 87.5', () => {
    expect(computeRevenueQualityRatio(8750, 10000)).toBeCloseTo(87.5)
  })

  it('45. 7000 / 10000 = 70', () => {
    expect(computeRevenueQualityRatio(7000, 10000)).toBeCloseTo(70)
  })

  it('46. 4999 / 10000 ≈ 49.99', () => {
    expect(computeRevenueQualityRatio(4999, 10000)).toBeCloseTo(49.99)
  })
})

// ── classifyRevenueQuality ────────────────────────────────────────────────────

describe('classifyRevenueQuality', () => {
  it('47. null → insufficient_data', () => {
    expect(classifyRevenueQuality(null)).toBe('insufficient_data')
  })

  it('48. 100 → excellent', () => {
    expect(classifyRevenueQuality(100)).toBe('excellent')
  })

  it('49. 95 → excellent (exact boundary)', () => {
    expect(classifyRevenueQuality(95)).toBe('excellent')
  })

  it('50. 94.9 → good (just below excellent boundary)', () => {
    expect(classifyRevenueQuality(94.9)).toBe('good')
  })

  it('51. 90 → good', () => {
    expect(classifyRevenueQuality(90)).toBe('good')
  })

  it('52. 85 → good (exact boundary)', () => {
    expect(classifyRevenueQuality(85)).toBe('good')
  })

  it('53. 84.9 → moderate (just below good boundary)', () => {
    expect(classifyRevenueQuality(84.9)).toBe('moderate')
  })

  it('54. 75 → moderate', () => {
    expect(classifyRevenueQuality(75)).toBe('moderate')
  })

  it('55. 70 → moderate (exact boundary)', () => {
    expect(classifyRevenueQuality(70)).toBe('moderate')
  })

  it('56. 69.9 → poor (just below moderate boundary)', () => {
    expect(classifyRevenueQuality(69.9)).toBe('poor')
  })

  it('57. 60 → poor', () => {
    expect(classifyRevenueQuality(60)).toBe('poor')
  })

  it('58. 50 → poor (exact boundary)', () => {
    expect(classifyRevenueQuality(50)).toBe('poor')
  })

  it('59. 49.9 → critical (just below poor boundary)', () => {
    expect(classifyRevenueQuality(49.9)).toBe('critical')
  })

  it('60. 0 → critical', () => {
    expect(classifyRevenueQuality(0)).toBe('critical')
  })

  it('61. 25 → critical', () => {
    expect(classifyRevenueQuality(25)).toBe('critical')
  })
})

// ── computeEffectiveRevenue ───────────────────────────────────────────────────

describe('computeEffectiveRevenue', () => {
  it('62. collected + risk_adjusted_outstanding', () => {
    expect(computeEffectiveRevenue(8000, 1700)).toBeCloseTo(9700)
  })

  it('63. no outstanding → effective = collected', () => {
    expect(computeEffectiveRevenue(10000, 0)).toBeCloseTo(10000)
  })

  it('64. no collected → effective = risk_adjusted_outstanding', () => {
    expect(computeEffectiveRevenue(0, 5000)).toBeCloseTo(5000)
  })

  it('65. both zero → 0', () => {
    expect(computeEffectiveRevenue(0, 0)).toBe(0)
  })

  it('66. large values correct', () => {
    expect(computeEffectiveRevenue(500000, 95000)).toBeCloseTo(595000)
  })
})

// ── computeRevenueRealizationGap ──────────────────────────────────────────────

describe('computeRevenueRealizationGap', () => {
  it('67. gap when effective < invoiced', () => {
    expect(computeRevenueRealizationGap(10000, 9700)).toBeCloseTo(300)
  })

  it('68. zero gap when effective = invoiced', () => {
    expect(computeRevenueRealizationGap(10000, 10000)).toBeCloseTo(0)
  })

  it('69. large gap', () => {
    expect(computeRevenueRealizationGap(100000, 60000)).toBeCloseTo(40000)
  })

  it('70. negative gap (would imply over-collection — edge case)', () => {
    expect(computeRevenueRealizationGap(9000, 9500)).toBeCloseTo(-500)
  })

  it('71. both zero → 0', () => {
    expect(computeRevenueRealizationGap(0, 0)).toBe(0)
  })
})

// ── classifyCustomerPaymentRisk ───────────────────────────────────────────────

describe('classifyCustomerPaymentRisk', () => {
  it('72. outstanding = 0 → no_outstanding regardless of probability', () => {
    expect(classifyCustomerPaymentRisk(0.10, 0)).toBe('no_outstanding')
  })

  it('73. outstanding = 0 with null probability → no_outstanding', () => {
    expect(classifyCustomerPaymentRisk(null, 0)).toBe('no_outstanding')
  })

  it('74. null probability with outstanding > 0 → no_outstanding', () => {
    expect(classifyCustomerPaymentRisk(null, 1000)).toBe('no_outstanding')
  })

  it('75. probability = 0.95, outstanding > 0 → safe', () => {
    expect(classifyCustomerPaymentRisk(0.95, 5000)).toBe('safe')
  })

  it('76. probability = 0.90, outstanding > 0 → safe (boundary)', () => {
    expect(classifyCustomerPaymentRisk(0.90, 5000)).toBe('safe')
  })

  it('77. probability = 0.89, outstanding > 0 → watch', () => {
    expect(classifyCustomerPaymentRisk(0.89, 5000)).toBe('watch')
  })

  it('78. probability = 0.80, outstanding > 0 → watch', () => {
    expect(classifyCustomerPaymentRisk(0.80, 5000)).toBe('watch')
  })

  it('79. probability = 0.75, outstanding > 0 → watch (boundary)', () => {
    expect(classifyCustomerPaymentRisk(0.75, 5000)).toBe('watch')
  })

  it('80. probability = 0.74, outstanding > 0 → concerned', () => {
    expect(classifyCustomerPaymentRisk(0.74, 5000)).toBe('concerned')
  })

  it('81. probability = 0.60, outstanding > 0 → concerned', () => {
    expect(classifyCustomerPaymentRisk(0.60, 5000)).toBe('concerned')
  })

  it('82. probability = 0.50, outstanding > 0 → concerned (boundary)', () => {
    expect(classifyCustomerPaymentRisk(0.50, 5000)).toBe('concerned')
  })

  it('83. probability = 0.49, outstanding > 0 → at_risk', () => {
    expect(classifyCustomerPaymentRisk(0.49, 5000)).toBe('at_risk')
  })

  it('84. probability = 0.10, outstanding > 0 → at_risk', () => {
    expect(classifyCustomerPaymentRisk(0.10, 5000)).toBe('at_risk')
  })

  it('85. probability = 0.30, outstanding > 0 → at_risk', () => {
    expect(classifyCustomerPaymentRisk(0.30, 1000)).toBe('at_risk')
  })
})

// ── computeReceivablesConcentration ───────────────────────────────────────────

describe('computeReceivablesConcentration', () => {
  it('86. empty array → null', () => {
    expect(computeReceivablesConcentration([])).toBeNull()
  })

  it('87. all zero outstanding → null', () => {
    expect(
      computeReceivablesConcentration([
        { outstanding: 0 },
        { outstanding: 0 },
      ]),
    ).toBeNull()
  })

  it('88. single customer → 1.0 (100%)', () => {
    expect(computeReceivablesConcentration([{ outstanding: 5000 }])).toBeCloseTo(1.0)
  })

  it('89. 50/50 split → 0.5', () => {
    expect(
      computeReceivablesConcentration([
        { outstanding: 5000 },
        { outstanding: 5000 },
      ]),
    ).toBeCloseTo(0.5)
  })

  it('90. one customer has all → 1.0', () => {
    expect(
      computeReceivablesConcentration([
        { outstanding: 10000 },
        { outstanding: 0 },
        { outstanding: 0 },
      ]),
    ).toBeCloseTo(1.0)
  })

  it('91. 70/30 split → largest is 0.70', () => {
    expect(
      computeReceivablesConcentration([
        { outstanding: 7000 },
        { outstanding: 3000 },
      ]),
    ).toBeCloseTo(0.70)
  })

  it('92. three customers equal → 0.333', () => {
    expect(
      computeReceivablesConcentration([
        { outstanding: 1000 },
        { outstanding: 1000 },
        { outstanding: 1000 },
      ]),
    ).toBeCloseTo(0.333, 2)
  })

  it('93. one zero among nonzero does not inflate concentration', () => {
    // 8000 / (8000 + 2000 + 0) = 0.80
    expect(
      computeReceivablesConcentration([
        { outstanding: 8000 },
        { outstanding: 2000 },
        { outstanding: 0 },
      ]),
    ).toBeCloseTo(0.80)
  })
})

// ── computeCollectionScenarios ────────────────────────────────────────────────

describe('computeCollectionScenarios', () => {
  it('94. empty → all zeros', () => {
    const result = computeCollectionScenarios([])
    expect(result.best).toBe(0)
    expect(result.base).toBe(0)
    expect(result.worst).toBe(0)
  })

  it('95. base = outstanding × probability', () => {
    const result = computeCollectionScenarios([
      { outstanding: 1000, collection_probability: 0.80 },
    ])
    expect(result.base).toBeCloseTo(800)
  })

  it('96. best = outstanding × min(prob × 1.15, 0.99)', () => {
    // 0.80 × 1.15 = 0.92; 0.92 < 0.99 so use 0.92 × 1000 = 920
    const result = computeCollectionScenarios([
      { outstanding: 1000, collection_probability: 0.80 },
    ])
    expect(result.best).toBeCloseTo(920)
  })

  it('97. best probability capped at 0.99', () => {
    // 0.95 × 1.15 = 1.0925 > 0.99; cap at 0.99 × 1000 = 990
    const result = computeCollectionScenarios([
      { outstanding: 1000, collection_probability: 0.95 },
    ])
    expect(result.best).toBeCloseTo(990)
  })

  it('98. worst = outstanding × max(prob × 0.75, 0.05)', () => {
    // 0.80 × 0.75 = 0.60; 0.60 > 0.05 so use 0.60 × 1000 = 600
    const result = computeCollectionScenarios([
      { outstanding: 1000, collection_probability: 0.80 },
    ])
    expect(result.worst).toBeCloseTo(600)
  })

  it('99. worst probability floored at 0.05', () => {
    // 0.10 × 0.75 = 0.075 > 0.05 so use 0.075 × 1000 = 75
    const result = computeCollectionScenarios([
      { outstanding: 1000, collection_probability: 0.10 },
    ])
    expect(result.worst).toBeCloseTo(75)
  })

  it('100. worst probability floor 0.05 applied for very low probability', () => {
    // Create a scenario where prob × 0.75 < 0.05
    // Probability would need to be < 0.0667; since minimum from our tiers is 0.10
    // Let's use 0.06 directly: 0.06 × 0.75 = 0.045 < 0.05; use 0.05 × 1000 = 50
    const result = computeCollectionScenarios([
      { outstanding: 1000, collection_probability: 0.06 },
    ])
    expect(result.worst).toBeCloseTo(50)
  })

  it('101. best > base > worst for typical item', () => {
    const result = computeCollectionScenarios([
      { outstanding: 10000, collection_probability: 0.70 },
    ])
    expect(result.best).toBeGreaterThan(result.base)
    expect(result.base).toBeGreaterThan(result.worst)
  })

  it('102. multiple items — all three scenarios are correct sums', () => {
    const items = [
      { outstanding: 5000, collection_probability: 0.95 },
      { outstanding: 3000, collection_probability: 0.70 },
      { outstanding: 2000, collection_probability: 0.30 },
    ]
    const result = computeCollectionScenarios(items)

    // base: 5000×0.95 + 3000×0.70 + 2000×0.30 = 4750+2100+600 = 7450
    expect(result.base).toBeCloseTo(7450)

    // best: 5000×min(0.95×1.15,0.99) + 3000×min(0.70×1.15,0.99) + 2000×min(0.30×1.15,0.99)
    //     = 5000×0.99 + 3000×0.805 + 2000×0.345
    //     = 4950 + 2415 + 690 = 8055
    expect(result.best).toBeCloseTo(8055)

    // worst: 5000×max(0.95×0.75,0.05) + 3000×max(0.70×0.75,0.05) + 2000×max(0.30×0.75,0.05)
    //      = 5000×0.7125 + 3000×0.525 + 2000×0.225
    //      = 3562.5 + 1575 + 450 = 5587.5
    expect(result.worst).toBeCloseTo(5587.5)
  })

  it('103. single high-probability item best cap at 0.99', () => {
    // 0.99 × 1.15 = 1.1385 → capped at 0.99; 0.99 × 2000 = 1980
    const result = computeCollectionScenarios([
      { outstanding: 2000, collection_probability: 0.99 },
    ])
    expect(result.best).toBeCloseTo(1980)
  })
})

// ── generateRarNarrative ──────────────────────────────────────────────────────

describe('generateRarNarrative', () => {
  it('104. excellent quality → mentions mükemmel', () => {
    const text = generateRarNarrative('excellent', 950000, 50000, 10000)
    expect(text).toContain('mükemmel')
  })

  it('105. excellent quality → mentions etkin gelir amount', () => {
    const text = generateRarNarrative('excellent', 950000, 50000, 10000)
    expect(text).toContain('950')
  })

  it('106. good quality → mentions iyi', () => {
    const text = generateRarNarrative('good', 870000, 130000, 30000)
    expect(text).toContain('iyi')
  })

  it('107. good quality → mentions at-risk amount', () => {
    const text = generateRarNarrative('good', 870000, 130000, 30000)
    expect(text).toContain('30')
  })

  it('108. moderate quality → mentions orta', () => {
    const text = generateRarNarrative('moderate', 750000, 250000, 75000)
    expect(text).toContain('orta')
  })

  it('109. moderate quality → mentions risk altındaki', () => {
    const text = generateRarNarrative('moderate', 750000, 250000, 75000)
    expect(text.toLowerCase()).toContain('risk')
  })

  it('110. poor quality → mentions zayıf', () => {
    const text = generateRarNarrative('poor', 600000, 400000, 150000)
    expect(text).toContain('zayıf')
  })

  it('111. poor quality → mentions acil', () => {
    const text = generateRarNarrative('poor', 600000, 400000, 150000)
    expect(text).toContain('acil')
  })

  it('112. critical quality → mentions KRİTİK', () => {
    const text = generateRarNarrative('critical', 400000, 600000, 400000)
    expect(text).toContain('KRİTİK')
  })

  it('113. critical quality → mentions acilen', () => {
    const text = generateRarNarrative('critical', 400000, 600000, 400000)
    expect(text).toContain('acilen')
  })

  it('114. insufficient_data → mentions Yeterli fatura', () => {
    const text = generateRarNarrative('insufficient_data', 0, 0, 0)
    expect(text).toContain('Yeterli')
  })

  it('115. returns a non-empty string for all quality levels', () => {
    const levels: Array<Parameters<typeof generateRarNarrative>[0]> = [
      'excellent', 'good', 'moderate', 'poor', 'critical', 'insufficient_data',
    ]
    for (const level of levels) {
      const text = generateRarNarrative(level, 100000, 10000, 5000)
      expect(typeof text).toBe('string')
      expect(text.length).toBeGreaterThan(0)
    }
  })

  it('116. excellent narrative includes realization gap figure', () => {
    const text = generateRarNarrative('excellent', 900000, 100000, 5000)
    // 100,000 formatted as 100.000 in tr-TR
    expect(text).toMatch(/100/)
  })

  it('117. critical narrative includes at-risk total', () => {
    const text = generateRarNarrative('critical', 300000, 700000, 500000)
    expect(text).toMatch(/500/)
  })
})

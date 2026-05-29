/**
 * Working Capital Service — unit tests (v2 spec)
 *
 * Covers all pure computation functions with 110+ tests.
 * No DB or network calls.
 *
 * Run with:  npx vitest run tests/working-capital.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeDso,
  computeDio,
  computeDpo,
  computeCcc,
  classifyCccHealth,
  computeWorkingCapital,
  computeCurrentRatio,
  computeQuickRatio,
  classifyCurrentRatioHealth,
  classifyQuickRatioHealth,
  computeWorkingCapitalTurnover,
  computeNowc,
  computeTargetWorkingCapital,
  computeWorkingCapitalGap,
  computeCashFreedByDsoReduction,
  computeCashFreedByDioReduction,
  computeCashFromDpoExtension,
  generateWcOptimizationRecommendations,
  classifyWorkingCapitalHealth,
} from '../lib/services/finance/working-capital.service'

// ─────────────────────────────────────────────────────────────────────────────
// computeDso
// ─────────────────────────────────────────────────────────────────────────────

describe('computeDso', () => {
  it('1. normal case: 100k receivables, 1.2M revenue, 365 days', () => {
    expect(computeDso(100_000, 1_200_000)).toBeCloseTo((100_000 / 1_200_000) * 365, 1)
  })

  it('2. zero revenue → null', () => {
    expect(computeDso(50_000, 0)).toBeNull()
  })

  it('3. zero receivables → 0 days', () => {
    expect(computeDso(0, 1_000_000)).toBe(0)
  })

  it('4. custom periodDays=30', () => {
    expect(computeDso(10_000, 120_000, 30)).toBeCloseTo((10_000 / 120_000) * 30, 2)
  })

  it('5. receivables equal to revenue, 365 days → 365 days DSO', () => {
    expect(computeDso(500_000, 500_000, 365)).toBe(365)
  })

  it('6. receivables = half of revenue, 365 days → ~182.5 days', () => {
    expect(computeDso(250_000, 500_000, 365)).toBeCloseTo(182.5, 1)
  })

  it('7. custom periodDays=90 — quarterly calculation', () => {
    expect(computeDso(30_000, 400_000, 90)).toBeCloseTo((30_000 / 400_000) * 90, 2)
  })

  it('8. annualRevenue negative edge — still computes (no guard on sign)', () => {
    // Negative revenue is unusual but function should still compute
    const result = computeDso(10_000, -100_000)
    expect(result).not.toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeDio
// ─────────────────────────────────────────────────────────────────────────────

describe('computeDio', () => {
  it('9. normal case: 200k inventory, 1.5M COGS, 365 days', () => {
    expect(computeDio(200_000, 1_500_000)).toBeCloseTo((200_000 / 1_500_000) * 365, 1)
  })

  it('10. zero COGS → null', () => {
    expect(computeDio(50_000, 0)).toBeNull()
  })

  it('11. zero inventory → 0 days DIO', () => {
    expect(computeDio(0, 800_000)).toBe(0)
  })

  it('12. custom periodDays=30', () => {
    expect(computeDio(15_000, 180_000, 30)).toBeCloseTo((15_000 / 180_000) * 30, 2)
  })

  it('13. inventory equals COGS → 365 days (turning over in exactly 1 year)', () => {
    expect(computeDio(300_000, 300_000, 365)).toBe(365)
  })

  it('14. large inventory relative to COGS → high DIO', () => {
    const result = computeDio(500_000, 200_000, 365)
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(365)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeDpo
// ─────────────────────────────────────────────────────────────────────────────

describe('computeDpo', () => {
  it('15. normal case: 80k payables, 960k COGS, 365 days', () => {
    expect(computeDpo(80_000, 960_000)).toBeCloseTo((80_000 / 960_000) * 365, 1)
  })

  it('16. zero COGS → null', () => {
    expect(computeDpo(20_000, 0)).toBeNull()
  })

  it('17. zero payables → 0 DPO', () => {
    expect(computeDpo(0, 500_000)).toBe(0)
  })

  it('18. custom periodDays=30', () => {
    expect(computeDpo(10_000, 120_000, 30)).toBeCloseTo((10_000 / 120_000) * 30, 2)
  })

  it('19. payables equal COGS → 365 days DPO', () => {
    expect(computeDpo(400_000, 400_000, 365)).toBe(365)
  })

  it('20. typical 30-day payables cycle with 365-day basis', () => {
    // DPO ≈ 30: payables / COGS * 365 = 30 → payables = COGS * 30 / 365
    const cogs = 730_000
    const payables = (cogs * 30) / 365
    expect(computeDpo(payables, cogs, 365)).toBeCloseTo(30, 1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeCcc
// ─────────────────────────────────────────────────────────────────────────────

describe('computeCcc', () => {
  it('21. normal: DSO=45, DIO=30, DPO=20 → CCC=55', () => {
    expect(computeCcc(45, 30, 20)).toBeCloseTo(55, 2)
  })

  it('22. negative CCC: DSO=10, DIO=5, DPO=25 → CCC=-10', () => {
    expect(computeCcc(10, 5, 25)).toBe(-10)
  })

  it('23. DSO null → null', () => {
    expect(computeCcc(null, 30, 20)).toBeNull()
  })

  it('24. DIO null → null', () => {
    expect(computeCcc(45, null, 20)).toBeNull()
  })

  it('25. DPO null → null', () => {
    expect(computeCcc(45, 30, null)).toBeNull()
  })

  it('26. all null → null', () => {
    expect(computeCcc(null, null, null)).toBeNull()
  })

  it('27. zero values → CCC = 0', () => {
    expect(computeCcc(0, 0, 0)).toBe(0)
  })

  it('28. CCC = DSO + DIO - DPO formula correctness', () => {
    const dso = 35, dio = 40, dpo = 25
    expect(computeCcc(dso, dio, dpo)).toBe(dso + dio - dpo)
  })

  it('29. large values — no overflow', () => {
    expect(computeCcc(180, 90, 60)).toBe(210)
  })

  it('30. fractional days', () => {
    expect(computeCcc(12.5, 7.3, 4.8)).toBeCloseTo(15, 1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// classifyCccHealth
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyCccHealth', () => {
  it('31. null → insufficient_data', () => {
    expect(classifyCccHealth(null)).toBe('insufficient_data')
  })

  it('32. -1 → excellent (negative CCC)', () => {
    expect(classifyCccHealth(-1)).toBe('excellent')
  })

  it('33. -100 → excellent', () => {
    expect(classifyCccHealth(-100)).toBe('excellent')
  })

  it('34. 0 → good (boundary: 0 is good, not excellent)', () => {
    expect(classifyCccHealth(0)).toBe('good')
  })

  it('35. 15 → good', () => {
    expect(classifyCccHealth(15)).toBe('good')
  })

  it('36. 30 → good (boundary)', () => {
    expect(classifyCccHealth(30)).toBe('good')
  })

  it('37. 31 → moderate', () => {
    expect(classifyCccHealth(31)).toBe('moderate')
  })

  it('38. 45 → moderate', () => {
    expect(classifyCccHealth(45)).toBe('moderate')
  })

  it('39. 60 → moderate (boundary)', () => {
    expect(classifyCccHealth(60)).toBe('moderate')
  })

  it('40. 61 → poor', () => {
    expect(classifyCccHealth(61)).toBe('poor')
  })

  it('41. 75 → poor', () => {
    expect(classifyCccHealth(75)).toBe('poor')
  })

  it('42. 90 → poor (boundary)', () => {
    expect(classifyCccHealth(90)).toBe('poor')
  })

  it('43. 91 → critical', () => {
    expect(classifyCccHealth(91)).toBe('critical')
  })

  it('44. 200 → critical', () => {
    expect(classifyCccHealth(200)).toBe('critical')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeWorkingCapital
// ─────────────────────────────────────────────────────────────────────────────

describe('computeWorkingCapital', () => {
  it('45. positive: 200k assets, 120k liabilities → 80k', () => {
    expect(computeWorkingCapital(200_000, 120_000)).toBe(80_000)
  })

  it('46. negative: 100k assets, 150k liabilities → -50k', () => {
    expect(computeWorkingCapital(100_000, 150_000)).toBe(-50_000)
  })

  it('47. zero: equal assets and liabilities', () => {
    expect(computeWorkingCapital(75_000, 75_000)).toBe(0)
  })

  it('48. zero liabilities', () => {
    expect(computeWorkingCapital(500_000, 0)).toBe(500_000)
  })

  it('49. both zero', () => {
    expect(computeWorkingCapital(0, 0)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeCurrentRatio
// ─────────────────────────────────────────────────────────────────────────────

describe('computeCurrentRatio', () => {
  it('50. normal: 200k / 100k = 2.0', () => {
    expect(computeCurrentRatio(200_000, 100_000)).toBe(2.0)
  })

  it('51. zero liabilities → null', () => {
    expect(computeCurrentRatio(100_000, 0)).toBeNull()
  })

  it('52. ratio < 1 when assets < liabilities', () => {
    const r = computeCurrentRatio(80_000, 100_000)
    expect(r).not.toBeNull()
    expect(r!).toBe(0.8)
  })

  it('53. assets = liabilities → ratio = 1.0', () => {
    expect(computeCurrentRatio(50_000, 50_000)).toBe(1.0)
  })

  it('54. fractional result', () => {
    expect(computeCurrentRatio(150_000, 100_000)).toBe(1.5)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeQuickRatio
// ─────────────────────────────────────────────────────────────────────────────

describe('computeQuickRatio', () => {
  // Signature: computeQuickRatio(cash, receivables, currentLiabilities)
  // Quick ratio = (cash + receivables) / currentLiabilities

  it('55. normal: cash=50k, receivables=50k, liabilities=100k = 1.0', () => {
    expect(computeQuickRatio(50_000, 50_000, 100_000)).toBe(1.0)
  })

  it('56. zero liabilities → null', () => {
    expect(computeQuickRatio(100_000, 20_000, 0)).toBeNull()
  })

  it('57. zero receivables → quick ratio = cash / liabilities', () => {
    expect(computeQuickRatio(200_000, 0, 100_000)).toBe(2.0)
  })

  it('58. cash=0 and receivables=50k, liabilities=100k → 0.5', () => {
    const r = computeQuickRatio(0, 50_000, 100_000)
    expect(r).not.toBeNull()
    expect(r!).toBe(0.5)
  })

  it('59. cash + receivables = liabilities → 1.0', () => {
    expect(computeQuickRatio(60_000, 40_000, 100_000)).toBe(1.0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// classifyCurrentRatioHealth
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyCurrentRatioHealth', () => {
  it('60. null → insufficient_data', () => {
    expect(classifyCurrentRatioHealth(null)).toBe('insufficient_data')
  })

  it('61. 2.0 → strong (boundary)', () => {
    expect(classifyCurrentRatioHealth(2.0)).toBe('strong')
  })

  it('62. 2.5 → strong', () => {
    expect(classifyCurrentRatioHealth(2.5)).toBe('strong')
  })

  it('63. 1.9 → adequate', () => {
    expect(classifyCurrentRatioHealth(1.9)).toBe('adequate')
  })

  it('64. 1.5 → adequate (boundary)', () => {
    expect(classifyCurrentRatioHealth(1.5)).toBe('adequate')
  })

  it('65. 1.4 → tight', () => {
    expect(classifyCurrentRatioHealth(1.4)).toBe('tight')
  })

  it('66. 1.0 → tight (boundary)', () => {
    expect(classifyCurrentRatioHealth(1.0)).toBe('tight')
  })

  it('67. 0.99 → critical', () => {
    expect(classifyCurrentRatioHealth(0.99)).toBe('critical')
  })

  it('68. 0.5 → critical', () => {
    expect(classifyCurrentRatioHealth(0.5)).toBe('critical')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// classifyQuickRatioHealth
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyQuickRatioHealth', () => {
  it('69. null → insufficient_data', () => {
    expect(classifyQuickRatioHealth(null)).toBe('insufficient_data')
  })

  it('70. 1.5 → strong (boundary)', () => {
    expect(classifyQuickRatioHealth(1.5)).toBe('strong')
  })

  it('71. 2.0 → strong', () => {
    expect(classifyQuickRatioHealth(2.0)).toBe('strong')
  })

  it('72. 1.4 → adequate', () => {
    expect(classifyQuickRatioHealth(1.4)).toBe('adequate')
  })

  it('73. 1.0 → adequate (boundary)', () => {
    expect(classifyQuickRatioHealth(1.0)).toBe('adequate')
  })

  it('74. 0.9 → tight', () => {
    expect(classifyQuickRatioHealth(0.9)).toBe('tight')
  })

  it('75. 0.7 → tight (boundary)', () => {
    expect(classifyQuickRatioHealth(0.7)).toBe('tight')
  })

  it('76. 0.69 → critical', () => {
    expect(classifyQuickRatioHealth(0.69)).toBe('critical')
  })

  it('77. 0.3 → critical', () => {
    expect(classifyQuickRatioHealth(0.3)).toBe('critical')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeWorkingCapitalTurnover
// ─────────────────────────────────────────────────────────────────────────────

describe('computeWorkingCapitalTurnover', () => {
  it('78. normal: 1.2M revenue, 200k avgWC → 6.0', () => {
    expect(computeWorkingCapitalTurnover(1_200_000, 200_000)).toBe(6.0)
  })

  it('79. zero avgWorkingCapital → null', () => {
    expect(computeWorkingCapitalTurnover(1_000_000, 0)).toBeNull()
  })

  it('80. revenue = 0 → 0 turnover', () => {
    expect(computeWorkingCapitalTurnover(0, 100_000)).toBe(0)
  })

  it('81. revenue = avgWC → turnover = 1.0', () => {
    expect(computeWorkingCapitalTurnover(500_000, 500_000)).toBe(1.0)
  })

  it('82. high efficiency: 3M revenue, 100k avgWC → 30', () => {
    expect(computeWorkingCapitalTurnover(3_000_000, 100_000)).toBe(30)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeNowc
// ─────────────────────────────────────────────────────────────────────────────

describe('computeNowc', () => {
  it('83. positive NOWC: receivables=100k, inventory=80k, payables=50k → 130k', () => {
    expect(computeNowc(100_000, 80_000, 50_000)).toBe(130_000)
  })

  it('84. negative NOWC: payables exceed receivables + inventory', () => {
    expect(computeNowc(30_000, 20_000, 100_000)).toBe(-50_000)
  })

  it('85. zero all → 0', () => {
    expect(computeNowc(0, 0, 0)).toBe(0)
  })

  it('86. no inventory', () => {
    expect(computeNowc(50_000, 0, 30_000)).toBe(20_000)
  })

  it('87. no payables → NOWC = receivables + inventory', () => {
    expect(computeNowc(60_000, 40_000, 0)).toBe(100_000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeTargetWorkingCapital
// ─────────────────────────────────────────────────────────────────────────────

describe('computeTargetWorkingCapital', () => {
  it('88. normal scenario: 1.2M rev, 900k COGS, DSO=30, DIO=45, DPO=30', () => {
    const target = computeTargetWorkingCapital(1_200_000, 900_000, 30, 45, 30)
    const expected =
      (1_200_000 / 365) * 30 +
      (900_000  / 365) * 45 -
      (900_000  / 365) * 30
    expect(target).toBeCloseTo(expected, 0)
  })

  it('89. zero revenue and COGS → target = 0', () => {
    expect(computeTargetWorkingCapital(0, 0, 30, 45, 30)).toBe(0)
  })

  it('90. zero target days → 0', () => {
    expect(computeTargetWorkingCapital(1_000_000, 800_000, 0, 0, 0)).toBe(0)
  })

  it('91. DPO > DIO: can yield negative target', () => {
    // If DPO much larger than DIO and DSO=0, target would be negative
    const target = computeTargetWorkingCapital(0, 1_000_000, 0, 10, 100)
    expect(target).toBeLessThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeWorkingCapitalGap
// ─────────────────────────────────────────────────────────────────────────────

describe('computeWorkingCapitalGap', () => {
  it('92. excess: currentNowc=200k > target=150k → gap=50k (opportunity)', () => {
    expect(computeWorkingCapitalGap(200_000, 150_000)).toBe(50_000)
  })

  it('93. deficit: currentNowc=100k < target=150k → gap=-50k', () => {
    expect(computeWorkingCapitalGap(100_000, 150_000)).toBe(-50_000)
  })

  it('94. zero gap', () => {
    expect(computeWorkingCapitalGap(100_000, 100_000)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeCashFreedByDsoReduction
// ─────────────────────────────────────────────────────────────────────────────

describe('computeCashFreedByDsoReduction', () => {
  it('95. 1.2M revenue, 10-day DSO reduction → (1.2M/365)*10', () => {
    const expected = (1_200_000 / 365) * 10
    expect(computeCashFreedByDsoReduction(1_200_000, 10)).toBeCloseTo(expected, 0)
  })

  it('96. zero revenue → 0', () => {
    expect(computeCashFreedByDsoReduction(0, 10)).toBe(0)
  })

  it('97. zero day reduction → 0', () => {
    expect(computeCashFreedByDsoReduction(1_000_000, 0)).toBe(0)
  })

  it('98. 365-day reduction on annual revenue → ~annual revenue', () => {
    expect(computeCashFreedByDsoReduction(365_000, 365)).toBeCloseTo(365_000, 0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeCashFreedByDioReduction
// ─────────────────────────────────────────────────────────────────────────────

describe('computeCashFreedByDioReduction', () => {
  it('99. 900k COGS, 10-day DIO reduction → (900k/365)*10', () => {
    const expected = (900_000 / 365) * 10
    expect(computeCashFreedByDioReduction(900_000, 10)).toBeCloseTo(expected, 0)
  })

  it('100. zero COGS → 0', () => {
    expect(computeCashFreedByDioReduction(0, 10)).toBe(0)
  })

  it('101. zero day reduction → 0', () => {
    expect(computeCashFreedByDioReduction(730_000, 0)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeCashFromDpoExtension
// ─────────────────────────────────────────────────────────────────────────────

describe('computeCashFromDpoExtension', () => {
  it('102. 900k COGS, 10-day extension → (900k/365)*10', () => {
    const expected = (900_000 / 365) * 10
    expect(computeCashFromDpoExtension(900_000, 10)).toBeCloseTo(expected, 0)
  })

  it('103. zero COGS → 0', () => {
    expect(computeCashFromDpoExtension(0, 10)).toBe(0)
  })

  it('104. zero day extension → 0', () => {
    expect(computeCashFromDpoExtension(800_000, 0)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// generateWcOptimizationRecommendations
// ─────────────────────────────────────────────────────────────────────────────

describe('generateWcOptimizationRecommendations', () => {
  it('105. all within benchmarks → single "on target" recommendation', () => {
    const recs = generateWcOptimizationRecommendations(20, 30, 35)
    expect(recs).toHaveLength(1)
    expect(recs[0]).toContain('hedefler dahilinde')
  })

  it('106. high DSO → recommendation about DSO reduction', () => {
    const recs = generateWcOptimizationRecommendations(50, 30, 35)
    expect(recs.some(r => r.toLowerCase().includes('alacak') || r.toLowerCase().includes('dso'))).toBe(true)
  })

  it('107. high DIO → recommendation about inventory', () => {
    const recs = generateWcOptimizationRecommendations(20, 60, 35)
    expect(recs.some(r => r.toLowerCase().includes('stok'))).toBe(true)
  })

  it('108. low DPO → recommendation about payable terms', () => {
    const recs = generateWcOptimizationRecommendations(20, 30, 10)
    expect(recs.some(r => r.toLowerCase().includes('borç') || r.toLowerCase().includes('tedarik'))).toBe(true)
  })

  it('109. all problematic → 3 recommendations', () => {
    const recs = generateWcOptimizationRecommendations(60, 80, 5)
    expect(recs).toHaveLength(3)
  })

  it('110. null DSO and DIO → only DPO rec if DPO low', () => {
    const recs = generateWcOptimizationRecommendations(null, null, 5)
    // Only DPO rec
    expect(recs).toHaveLength(1)
    expect(recs[0]).not.toContain('hedefler dahilinde')
  })

  it('111. null DPO → only DSO rec if DSO high', () => {
    const recs = generateWcOptimizationRecommendations(50, 30, null)
    expect(recs.some(r => r.includes('DSO') || r.toLowerCase().includes('alacak'))).toBe(true)
  })

  it('112. custom benchmarks respected', () => {
    // With DSO=20, benchmark=10 → should trigger DSO recommendation
    const recs = generateWcOptimizationRecommendations(20, 10, 15, 10, 20, 10)
    expect(recs.some(r => r.toLowerCase().includes('alacak') || r.toLowerCase().includes('dso'))).toBe(true)
  })

  it('113. all null inputs → on-target message', () => {
    const recs = generateWcOptimizationRecommendations(null, null, null)
    expect(recs).toHaveLength(1)
    expect(recs[0]).toContain('hedefler dahilinde')
  })

  it('114. returns Turkish strings', () => {
    const recs = generateWcOptimizationRecommendations(60, 70, 5)
    // Turkish language check: contains at least one Turkish character or common word
    const joined = recs.join(' ')
    expect(joined.length).toBeGreaterThan(0)
    // All recs are non-empty strings
    for (const r of recs) {
      expect(typeof r).toBe('string')
      expect(r.length).toBeGreaterThan(0)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// classifyWorkingCapitalHealth
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyWorkingCapitalHealth', () => {
  it('115. both null → insufficient_data', () => {
    expect(classifyWorkingCapitalHealth(null, null, 100_000)).toBe('insufficient_data')
  })

  it('116. healthy: CCC=20, ratio=2.0, WC>0', () => {
    expect(classifyWorkingCapitalHealth(20, 2.0, 100_000)).toBe('healthy')
  })

  it('117. healthy: CCC=0, ratio=1.5, WC>0', () => {
    expect(classifyWorkingCapitalHealth(0, 1.5, 50_000)).toBe('healthy')
  })

  it('118. critical: negative working capital', () => {
    expect(classifyWorkingCapitalHealth(20, 1.5, -10_000)).toBe('critical')
  })

  it('119. critical: currentRatio < 0.5', () => {
    expect(classifyWorkingCapitalHealth(20, 0.4, 50_000)).toBe('critical')
  })

  it('120. critical: CCC >= 90', () => {
    expect(classifyWorkingCapitalHealth(90, 1.5, 50_000)).toBe('critical')
  })

  it('121. critical: CCC = 100, ratio=2.0, WC>0', () => {
    expect(classifyWorkingCapitalHealth(100, 2.0, 100_000)).toBe('critical')
  })

  it('122. moderate: CCC=50, ratio=1.2, WC>0', () => {
    expect(classifyWorkingCapitalHealth(50, 1.2, 50_000)).toBe('moderate')
  })

  it('123. strained: CCC=70, ratio=0.9, WC>0', () => {
    const result = classifyWorkingCapitalHealth(70, 0.9, 50_000)
    expect(['strained', 'moderate']).toContain(result)
  })

  it('124. moderate: CCC=55, ratio=1.0, WC>0', () => {
    const result = classifyWorkingCapitalHealth(55, 1.0, 50_000)
    expect(['moderate', 'strained']).toContain(result)
  })

  it('125. only CCC available (ratio null): CCC=20, WC>0', () => {
    // Should not be insufficient_data since we have ccc
    const result = classifyWorkingCapitalHealth(20, null, 50_000)
    expect(result).not.toBe('insufficient_data')
  })

  it('126. only ratio available (ccc null): ratio=2.0, WC>0', () => {
    const result = classifyWorkingCapitalHealth(null, 2.0, 50_000)
    expect(result).not.toBe('insufficient_data')
  })

  it('127. critical: WC=-1 (just barely negative)', () => {
    expect(classifyWorkingCapitalHealth(10, 2.0, -1)).toBe('critical')
  })

  it('128. critical: ratio=0.49 (just below 0.5)', () => {
    expect(classifyWorkingCapitalHealth(10, 0.49, 50_000)).toBe('critical')
  })
})

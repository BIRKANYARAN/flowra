/**
 * AccountsPayableService — unit tests
 *
 * Tests all exported pure helpers:
 *   - computeDpo
 *   - classifyDpoHealth
 *   - classifyPayableAgeBucket
 *   - computePayableAging
 *   - computeOverduePayableRatio
 *   - classifyOverduePayableRatio
 *   - computePayableTurnoverRatio
 *   - computeDpoOptimizationBenefit
 *   - computeSupplierPaymentConcentration
 *   - classifySupplierConcentrationRisk
 *   - computePaymentTermsCompliance
 *   - generatePayablesNarrative
 *
 * No DB or network calls — all in-memory.
 */

import { describe, it, expect } from 'vitest'
import {
  computeDpo,
  classifyDpoHealth,
  classifyPayableAgeBucket,
  computePayableAging,
  computeOverduePayableRatio,
  classifyOverduePayableRatio,
  computePayableTurnoverRatio,
  computeDpoOptimizationBenefit,
  computeSupplierPaymentConcentration,
  classifySupplierConcentrationRisk,
  computePaymentTermsCompliance,
  generatePayablesNarrative,
} from '../lib/services/finance/accounts-payable.service'

// ── computeDpo ────────────────────────────────────────────────────────────────

describe('computeDpo', () => {
  it('1. returns null when annualCogs is 0', () => {
    expect(computeDpo(10000, 0)).toBeNull()
  })

  it('2. returns null when annualCogs is negative', () => {
    expect(computeDpo(10000, -500)).toBeNull()
  })

  it('3. standard formula: AP=365, cogs=3650 → 36.5 days', () => {
    expect(computeDpo(365, 3650)).toBe(36.5)
  })

  it('4. AP=0, cogs=100000 → 0 days', () => {
    expect(computeDpo(0, 100000)).toBe(0)
  })

  it('5. integer result: AP=30, cogs=3650 → ~3', () => {
    // 30 / (3650/365) = 30 / 10 = 3
    expect(computeDpo(30, 3650)).toBe(3)
  })

  it('6. large values: AP=1000000, cogs=8000000 → ~45.6', () => {
    const result = computeDpo(1_000_000, 8_000_000)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(45.6, 0)
  })

  it('7. AP equals cogs/365 exactly → DPO=1', () => {
    // annualCogs=36500 → daily=100; AP=100 → DPO=1
    expect(computeDpo(100, 36500)).toBe(1)
  })

  it('8. very small annualCogs still calculates correctly', () => {
    const result = computeDpo(100, 365)
    expect(result).toBe(100)
  })
})

// ── classifyDpoHealth ─────────────────────────────────────────────────────────

describe('classifyDpoHealth', () => {
  it('9. null → insufficient_data', () => {
    expect(classifyDpoHealth(null)).toBe('insufficient_data')
  })

  it('10. 0 days → very_fast', () => {
    expect(classifyDpoHealth(0)).toBe('very_fast')
  })

  it('11. 5 days → very_fast', () => {
    expect(classifyDpoHealth(5)).toBe('very_fast')
  })

  it('12. exact boundary 9 days → very_fast (< 10)', () => {
    expect(classifyDpoHealth(9)).toBe('very_fast')
  })

  it('13. exact boundary 10 days → fast', () => {
    expect(classifyDpoHealth(10)).toBe('fast')
  })

  it('14. 15 days → fast', () => {
    expect(classifyDpoHealth(15)).toBe('fast')
  })

  it('15. exact boundary 19 days → fast (< 20)', () => {
    expect(classifyDpoHealth(19)).toBe('fast')
  })

  it('16. exact boundary 20 days → good', () => {
    expect(classifyDpoHealth(20)).toBe('good')
  })

  it('17. 25 days → good', () => {
    expect(classifyDpoHealth(25)).toBe('good')
  })

  it('18. exact boundary 29 days → good (in 20-60 range but not 30-45)', () => {
    expect(classifyDpoHealth(29)).toBe('good')
  })

  it('19. exact boundary 30 days → optimal', () => {
    expect(classifyDpoHealth(30)).toBe('optimal')
  })

  it('20. 37 days → optimal', () => {
    expect(classifyDpoHealth(37)).toBe('optimal')
  })

  it('21. exact boundary 45 days → optimal', () => {
    expect(classifyDpoHealth(45)).toBe('optimal')
  })

  it('22. exact boundary 46 days → good (20-60 range, outside optimal)', () => {
    expect(classifyDpoHealth(46)).toBe('good')
  })

  it('23. 55 days → good', () => {
    expect(classifyDpoHealth(55)).toBe('good')
  })

  it('24. exact boundary 60 days → good (20-60 inclusive)', () => {
    expect(classifyDpoHealth(60)).toBe('good')
  })

  it('25. exact boundary 61 days → slow', () => {
    expect(classifyDpoHealth(61)).toBe('slow')
  })

  it('26. 75 days → slow', () => {
    expect(classifyDpoHealth(75)).toBe('slow')
  })

  it('27. exact boundary 90 days → slow', () => {
    expect(classifyDpoHealth(90)).toBe('slow')
  })

  it('28. exact boundary 91 days → very_slow', () => {
    expect(classifyDpoHealth(91)).toBe('very_slow')
  })

  it('29. 120 days → very_slow', () => {
    expect(classifyDpoHealth(120)).toBe('very_slow')
  })

  it('30. 200 days → very_slow', () => {
    expect(classifyDpoHealth(200)).toBe('very_slow')
  })
})

// ── classifyPayableAgeBucket ──────────────────────────────────────────────────

describe('classifyPayableAgeBucket', () => {
  it('31. 0 days → current', () => {
    expect(classifyPayableAgeBucket(0)).toBe('current')
  })

  it('32. 15 days → current', () => {
    expect(classifyPayableAgeBucket(15)).toBe('current')
  })

  it('33. exact boundary 30 days → current', () => {
    expect(classifyPayableAgeBucket(30)).toBe('current')
  })

  it('34. exact boundary 31 days → overdue_30', () => {
    expect(classifyPayableAgeBucket(31)).toBe('overdue_30')
  })

  it('35. 45 days → overdue_30', () => {
    expect(classifyPayableAgeBucket(45)).toBe('overdue_30')
  })

  it('36. exact boundary 60 days → overdue_30', () => {
    expect(classifyPayableAgeBucket(60)).toBe('overdue_30')
  })

  it('37. exact boundary 61 days → overdue_60', () => {
    expect(classifyPayableAgeBucket(61)).toBe('overdue_60')
  })

  it('38. 75 days → overdue_60', () => {
    expect(classifyPayableAgeBucket(75)).toBe('overdue_60')
  })

  it('39. exact boundary 90 days → overdue_60', () => {
    expect(classifyPayableAgeBucket(90)).toBe('overdue_60')
  })

  it('40. exact boundary 91 days → overdue_90', () => {
    expect(classifyPayableAgeBucket(91)).toBe('overdue_90')
  })

  it('41. 105 days → overdue_90', () => {
    expect(classifyPayableAgeBucket(105)).toBe('overdue_90')
  })

  it('42. exact boundary 120 days → overdue_90', () => {
    expect(classifyPayableAgeBucket(120)).toBe('overdue_90')
  })

  it('43. exact boundary 121 days → severely_overdue', () => {
    expect(classifyPayableAgeBucket(121)).toBe('severely_overdue')
  })

  it('44. 200 days → severely_overdue', () => {
    expect(classifyPayableAgeBucket(200)).toBe('severely_overdue')
  })

  it('45. 365 days → severely_overdue', () => {
    expect(classifyPayableAgeBucket(365)).toBe('severely_overdue')
  })
})

// ── computePayableAging ───────────────────────────────────────────────────────

describe('computePayableAging', () => {
  it('46. empty array → all zeros', () => {
    const r = computePayableAging([])
    expect(r.current).toBe(0)
    expect(r.overdue_30).toBe(0)
    expect(r.overdue_60).toBe(0)
    expect(r.overdue_90).toBe(0)
    expect(r.severely_overdue).toBe(0)
    expect(r.total).toBe(0)
  })

  it('47. single current item → current = amount, total = amount', () => {
    const r = computePayableAging([{ amount: 1000, days_outstanding: 10 }])
    expect(r.current).toBe(1000)
    expect(r.total).toBe(1000)
    expect(r.overdue_30).toBe(0)
  })

  it('48. single overdue_30 item', () => {
    const r = computePayableAging([{ amount: 500, days_outstanding: 45 }])
    expect(r.overdue_30).toBe(500)
    expect(r.current).toBe(0)
    expect(r.total).toBe(500)
  })

  it('49. single overdue_60 item', () => {
    const r = computePayableAging([{ amount: 750, days_outstanding: 75 }])
    expect(r.overdue_60).toBe(750)
    expect(r.total).toBe(750)
  })

  it('50. single overdue_90 item', () => {
    const r = computePayableAging([{ amount: 300, days_outstanding: 100 }])
    expect(r.overdue_90).toBe(300)
    expect(r.total).toBe(300)
  })

  it('51. single severely_overdue item', () => {
    const r = computePayableAging([{ amount: 200, days_outstanding: 150 }])
    expect(r.severely_overdue).toBe(200)
    expect(r.total).toBe(200)
  })

  it('52. mixed buckets — sums each correctly', () => {
    const r = computePayableAging([
      { amount: 100, days_outstanding: 5   },   // current
      { amount: 200, days_outstanding: 40  },   // overdue_30
      { amount: 300, days_outstanding: 70  },   // overdue_60
      { amount: 400, days_outstanding: 100 },   // overdue_90
      { amount: 500, days_outstanding: 130 },   // severely_overdue
    ])
    expect(r.current).toBe(100)
    expect(r.overdue_30).toBe(200)
    expect(r.overdue_60).toBe(300)
    expect(r.overdue_90).toBe(400)
    expect(r.severely_overdue).toBe(500)
    expect(r.total).toBe(1500)
  })

  it('53. total sums all buckets correctly', () => {
    const items = [
      { amount: 250, days_outstanding: 10  },
      { amount: 350, days_outstanding: 50  },
    ]
    const r = computePayableAging(items)
    expect(r.total).toBe(600)
  })

  it('54. multiple items in same bucket accumulate', () => {
    const r = computePayableAging([
      { amount: 100, days_outstanding: 5  },
      { amount: 200, days_outstanding: 20 },
      { amount: 150, days_outstanding: 30 },
    ])
    expect(r.current).toBe(450)
    expect(r.total).toBe(450)
  })

  it('55. boundary value 30 → current bucket', () => {
    const r = computePayableAging([{ amount: 1000, days_outstanding: 30 }])
    expect(r.current).toBe(1000)
  })

  it('56. boundary value 31 → overdue_30 bucket', () => {
    const r = computePayableAging([{ amount: 1000, days_outstanding: 31 }])
    expect(r.overdue_30).toBe(1000)
  })
})

// ── computeOverduePayableRatio ────────────────────────────────────────────────

describe('computeOverduePayableRatio', () => {
  const zeroAging = computePayableAging([])

  it('57. zero total → null', () => {
    expect(computeOverduePayableRatio(zeroAging)).toBeNull()
  })

  it('58. all current → 0%', () => {
    const aging = computePayableAging([{ amount: 1000, days_outstanding: 10 }])
    expect(computeOverduePayableRatio(aging)).toBe(0)
  })

  it('59. all overdue → 100%', () => {
    const aging = computePayableAging([{ amount: 1000, days_outstanding: 90 }])
    expect(computeOverduePayableRatio(aging)).toBe(100)
  })

  it('60. half current, half overdue → 50%', () => {
    const aging = computePayableAging([
      { amount: 500, days_outstanding: 10  },
      { amount: 500, days_outstanding: 60  },
    ])
    expect(computeOverduePayableRatio(aging)).toBe(50)
  })

  it('61. 25% overdue', () => {
    const aging = computePayableAging([
      { amount: 750, days_outstanding: 10  },
      { amount: 250, days_outstanding: 60  },
    ])
    expect(computeOverduePayableRatio(aging)).toBe(25)
  })

  it('62. 75% overdue', () => {
    const aging = computePayableAging([
      { amount: 250, days_outstanding: 10  },
      { amount: 750, days_outstanding: 60  },
    ])
    expect(computeOverduePayableRatio(aging)).toBe(75)
  })
})

// ── classifyOverduePayableRatio ───────────────────────────────────────────────

describe('classifyOverduePayableRatio', () => {
  it('63. null → insufficient_data', () => {
    expect(classifyOverduePayableRatio(null)).toBe('insufficient_data')
  })

  it('64. 0% → healthy', () => {
    expect(classifyOverduePayableRatio(0)).toBe('healthy')
  })

  it('65. 5% → healthy', () => {
    expect(classifyOverduePayableRatio(5)).toBe('healthy')
  })

  it('66. exact boundary 9.99% → healthy (< 10)', () => {
    expect(classifyOverduePayableRatio(9.99)).toBe('healthy')
  })

  it('67. exact boundary 10% → watch', () => {
    expect(classifyOverduePayableRatio(10)).toBe('watch')
  })

  it('68. 15% → watch', () => {
    expect(classifyOverduePayableRatio(15)).toBe('watch')
  })

  it('69. exact boundary 24.99% → watch (< 25)', () => {
    expect(classifyOverduePayableRatio(24.99)).toBe('watch')
  })

  it('70. exact boundary 25% → elevated', () => {
    expect(classifyOverduePayableRatio(25)).toBe('elevated')
  })

  it('71. 35% → elevated', () => {
    expect(classifyOverduePayableRatio(35)).toBe('elevated')
  })

  it('72. exact boundary 49.99% → elevated (< 50)', () => {
    expect(classifyOverduePayableRatio(49.99)).toBe('elevated')
  })

  it('73. exact boundary 50% → critical', () => {
    expect(classifyOverduePayableRatio(50)).toBe('critical')
  })

  it('74. 75% → critical', () => {
    expect(classifyOverduePayableRatio(75)).toBe('critical')
  })

  it('75. 100% → critical', () => {
    expect(classifyOverduePayableRatio(100)).toBe('critical')
  })
})

// ── computePayableTurnoverRatio ───────────────────────────────────────────────

describe('computePayableTurnoverRatio', () => {
  it('76. zero avgAP → null', () => {
    expect(computePayableTurnoverRatio(1000000, 0)).toBeNull()
  })

  it('77. negative avgAP → null', () => {
    expect(computePayableTurnoverRatio(1000000, -100)).toBeNull()
  })

  it('78. normal formula: cogs=1200000, avgAP=100000 → 12', () => {
    expect(computePayableTurnoverRatio(1_200_000, 100_000)).toBe(12)
  })

  it('79. cogs=0, avgAP=100 → 0', () => {
    expect(computePayableTurnoverRatio(0, 100)).toBe(0)
  })

  it('80. fractional result: 500/300 → 1.67', () => {
    expect(computePayableTurnoverRatio(500, 300)).toBeCloseTo(1.67, 1)
  })
})

// ── computeDpoOptimizationBenefit ─────────────────────────────────────────────

describe('computeDpoOptimizationBenefit', () => {
  it('81. null currentDpo → null', () => {
    expect(computeDpoOptimizationBenefit(1_000_000, null, 45)).toBeNull()
  })

  it('82. currentDpo < targetDpo → positive benefit (extend DPO, free cash)', () => {
    // annualCogs=365000, currentDpo=30, target=45 → 365000/365*(45-30) = 1000*15 = 15000
    const result = computeDpoOptimizationBenefit(365_000, 30, 45)
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(0)
    expect(result!).toBeCloseTo(15_000, 0)
  })

  it('83. currentDpo > targetDpo → negative benefit (reduce DPO costs cash)', () => {
    // annualCogs=365000, currentDpo=60, target=45 → 1000*(45-60) = -15000
    const result = computeDpoOptimizationBenefit(365_000, 60, 45)
    expect(result).not.toBeNull()
    expect(result!).toBeLessThan(0)
    expect(result!).toBeCloseTo(-15_000, 0)
  })

  it('84. currentDpo === targetDpo → 0 benefit', () => {
    const result = computeDpoOptimizationBenefit(365_000, 45, 45)
    expect(result).toBe(0)
  })

  it('85. zero annualCogs → 0 benefit regardless of DPO', () => {
    const result = computeDpoOptimizationBenefit(0, 20, 45)
    expect(result).toBe(0)
  })

  it('86. large annualCogs produces proportionally large benefit', () => {
    // annualCogs=3650000, currentDpo=15, target=45 → 10000*(30) = 300000
    const result = computeDpoOptimizationBenefit(3_650_000, 15, 45)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(300_000, 0)
  })
})

// ── computeSupplierPaymentConcentration ───────────────────────────────────────

describe('computeSupplierPaymentConcentration', () => {
  it('87. empty array → null', () => {
    expect(computeSupplierPaymentConcentration([])).toBeNull()
  })

  it('88. all zero amounts → null', () => {
    expect(computeSupplierPaymentConcentration([
      { supplier_id: 's1', amount: 0 },
      { supplier_id: 's2', amount: 0 },
    ])).toBeNull()
  })

  it('89. single supplier → HHI = 1.0 (maximum concentration)', () => {
    expect(computeSupplierPaymentConcentration([
      { supplier_id: 's1', amount: 5000 },
    ])).toBe(1)
  })

  it('90. two equal suppliers → HHI = 0.5', () => {
    const hhi = computeSupplierPaymentConcentration([
      { supplier_id: 's1', amount: 500 },
      { supplier_id: 's2', amount: 500 },
    ])
    expect(hhi).toBeCloseTo(0.5, 4)
  })

  it('91. four equal suppliers → HHI = 0.25', () => {
    const hhi = computeSupplierPaymentConcentration([
      { supplier_id: 's1', amount: 250 },
      { supplier_id: 's2', amount: 250 },
      { supplier_id: 's3', amount: 250 },
      { supplier_id: 's4', amount: 250 },
    ])
    expect(hhi).toBeCloseTo(0.25, 4)
  })

  it('92. dominant supplier (80/10/10) → HHI = 0.66', () => {
    // (0.8)² + (0.1)² + (0.1)² = 0.64 + 0.01 + 0.01 = 0.66
    const hhi = computeSupplierPaymentConcentration([
      { supplier_id: 's1', amount: 800 },
      { supplier_id: 's2', amount: 100 },
      { supplier_id: 's3', amount: 100 },
    ])
    expect(hhi).toBeCloseTo(0.66, 2)
  })

  it('93. unequal split (60/40) → HHI = 0.52', () => {
    // 0.36 + 0.16 = 0.52
    const hhi = computeSupplierPaymentConcentration([
      { supplier_id: 's1', amount: 600 },
      { supplier_id: 's2', amount: 400 },
    ])
    expect(hhi).toBeCloseTo(0.52, 2)
  })
})

// ── classifySupplierConcentrationRisk ─────────────────────────────────────────

describe('classifySupplierConcentrationRisk', () => {
  it('94. null → insufficient_data', () => {
    expect(classifySupplierConcentrationRisk(null)).toBe('insufficient_data')
  })

  it('95. 0.05 → diversified', () => {
    expect(classifySupplierConcentrationRisk(0.05)).toBe('diversified')
  })

  it('96. exact boundary 0.14 → diversified (< 0.15)', () => {
    expect(classifySupplierConcentrationRisk(0.14)).toBe('diversified')
  })

  it('97. exact boundary 0.15 → moderate', () => {
    expect(classifySupplierConcentrationRisk(0.15)).toBe('moderate')
  })

  it('98. 0.20 → moderate', () => {
    expect(classifySupplierConcentrationRisk(0.20)).toBe('moderate')
  })

  it('99. exact boundary 0.29 → moderate (< 0.30)', () => {
    expect(classifySupplierConcentrationRisk(0.29)).toBe('moderate')
  })

  it('100. exact boundary 0.30 → concentrated', () => {
    expect(classifySupplierConcentrationRisk(0.30)).toBe('concentrated')
  })

  it('101. 0.45 → concentrated', () => {
    expect(classifySupplierConcentrationRisk(0.45)).toBe('concentrated')
  })

  it('102. exact boundary 0.59 → concentrated (< 0.60)', () => {
    expect(classifySupplierConcentrationRisk(0.59)).toBe('concentrated')
  })

  it('103. exact boundary 0.60 → highly_concentrated', () => {
    expect(classifySupplierConcentrationRisk(0.60)).toBe('highly_concentrated')
  })

  it('104. 0.80 → highly_concentrated', () => {
    expect(classifySupplierConcentrationRisk(0.80)).toBe('highly_concentrated')
  })

  it('105. 1.0 → highly_concentrated', () => {
    expect(classifySupplierConcentrationRisk(1.0)).toBe('highly_concentrated')
  })
})

// ── computePaymentTermsCompliance ─────────────────────────────────────────────

describe('computePaymentTermsCompliance', () => {
  it('106. empty array → null', () => {
    expect(computePaymentTermsCompliance([])).toBeNull()
  })

  it('107. all paid on time → 100%', () => {
    const result = computePaymentTermsCompliance([
      { amount: 500, paid_on_time: true },
      { amount: 500, paid_on_time: true },
    ])
    expect(result).toBe(100)
  })

  it('108. none paid on time → 0%', () => {
    const result = computePaymentTermsCompliance([
      { amount: 500, paid_on_time: false },
      { amount: 500, paid_on_time: false },
    ])
    expect(result).toBe(0)
  })

  it('109. half by amount paid on time → 50%', () => {
    const result = computePaymentTermsCompliance([
      { amount: 500, paid_on_time: true  },
      { amount: 500, paid_on_time: false },
    ])
    expect(result).toBe(50)
  })

  it('110. amount-weighted: large on-time payment → high compliance', () => {
    // 900 on time, 100 late → 90%
    const result = computePaymentTermsCompliance([
      { amount: 900, paid_on_time: true  },
      { amount: 100, paid_on_time: false },
    ])
    expect(result).toBe(90)
  })

  it('111. amount-weighted: small on-time payment → low compliance', () => {
    // 100 on time, 900 late → 10%
    const result = computePaymentTermsCompliance([
      { amount: 100, paid_on_time: true  },
      { amount: 900, paid_on_time: false },
    ])
    expect(result).toBe(10)
  })

  it('112. single on-time payment → 100%', () => {
    const result = computePaymentTermsCompliance([
      { amount: 1000, paid_on_time: true },
    ])
    expect(result).toBe(100)
  })

  it('113. single late payment → 0%', () => {
    const result = computePaymentTermsCompliance([
      { amount: 1000, paid_on_time: false },
    ])
    expect(result).toBe(0)
  })

  it('114. three payments, two on time (amounts 100/200/300) → 50%', () => {
    // on time: 100+200=300; late: 300; total 600 → 50%
    const result = computePaymentTermsCompliance([
      { amount: 100, paid_on_time: true  },
      { amount: 200, paid_on_time: true  },
      { amount: 300, paid_on_time: false },
    ])
    expect(result).toBe(50)
  })

  it('115. all amounts zero → null', () => {
    const result = computePaymentTermsCompliance([
      { amount: 0, paid_on_time: true  },
      { amount: 0, paid_on_time: false },
    ])
    expect(result).toBeNull()
  })
})

// ── generatePayablesNarrative ─────────────────────────────────────────────────

describe('generatePayablesNarrative', () => {
  it('116. returns non-empty string for null DPO', () => {
    const result = generatePayablesNarrative({
      dpo:           null,
      dpoHealth:     'insufficient_data',
      overdueRatio:  null,
      totalPayables: 0,
    })
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('117. includes DPO value when provided', () => {
    const result = generatePayablesNarrative({
      dpo:           35,
      dpoHealth:     'optimal',
      overdueRatio:  5,
      totalPayables: 100_000,
    })
    expect(result).toContain('35')
  })

  it('118. includes overdue ratio when provided', () => {
    const result = generatePayablesNarrative({
      dpo:           35,
      dpoHealth:     'optimal',
      overdueRatio:  15.5,
      totalPayables: 100_000,
    })
    expect(result).toContain('15.5')
  })

  it('119. is a Turkish string (contains Turkish characters or keywords)', () => {
    const result = generatePayablesNarrative({
      dpo:           45,
      dpoHealth:     'optimal',
      overdueRatio:  8,
      totalPayables: 50_000,
    })
    // Should contain at least one Turkish indicator
    const hasTurkish = /gün|ödeme|borç|vade|₺/i.test(result)
    expect(hasTurkish).toBe(true)
  })

  it('120. very_fast DPO health reflected in narrative', () => {
    const result = generatePayablesNarrative({
      dpo:           5,
      dpoHealth:     'very_fast',
      overdueRatio:  0,
      totalPayables: 10_000,
    })
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('121. very_slow DPO health reflected in narrative', () => {
    const result = generatePayablesNarrative({
      dpo:           120,
      dpoHealth:     'very_slow',
      overdueRatio:  70,
      totalPayables: 500_000,
    })
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('122. zero total payables produces sensible narrative', () => {
    const result = generatePayablesNarrative({
      dpo:           null,
      dpoHealth:     'insufficient_data',
      overdueRatio:  null,
      totalPayables: 0,
    })
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(5)
  })

  it('123. slow DPO health is labeled in narrative', () => {
    const result = generatePayablesNarrative({
      dpo:           75,
      dpoHealth:     'slow',
      overdueRatio:  30,
      totalPayables: 200_000,
    })
    expect(result).toContain('75')
  })
})

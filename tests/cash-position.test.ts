/**
 * Cash Position Service — unit tests
 *
 * Tests all pure computation functions from CashPositionService.
 * No DB or network calls — pure function tests only.
 *
 * Target: 110+ tests covering all exported functions.
 */

import { describe, it, expect } from 'vitest'
import {
  computeMinCashReserve,
  computeIdleCash,
  computeCashAdequacyRatio,
  classifyCashAdequacy,
  projectCashPosition,
  findCashRunway,
  computeIdleCashReturn,
  computeFloatGap,
  classifyFloatPosition,
  computeCashConversionEfficiency,
  computeDaysCashOnHand,
  classifyDaysCashOnHand,
  generateCashPositionNarrative,
} from '../lib/services/finance/cash-position.service'

// ── computeMinCashReserve ─────────────────────────────────────────────────────

describe('computeMinCashReserve', () => {
  it('1. default reserve is 2× monthly expenses', () => {
    expect(computeMinCashReserve(50_000)).toBe(100_000)
  })

  it('2. custom reserveMonths = 3', () => {
    expect(computeMinCashReserve(50_000, 3)).toBe(150_000)
  })

  it('3. reserveMonths = 1', () => {
    expect(computeMinCashReserve(30_000, 1)).toBe(30_000)
  })

  it('4. zero expenses → zero reserve', () => {
    expect(computeMinCashReserve(0)).toBe(0)
  })

  it('5. large values rounded to 2 dp', () => {
    expect(computeMinCashReserve(33_333.33, 2)).toBe(66_666.66)
  })

  it('6. fractional monthly expenses', () => {
    expect(computeMinCashReserve(10_000.50, 2)).toBe(20_001)
  })

  it('7. reserveMonths = 0 → zero reserve', () => {
    expect(computeMinCashReserve(50_000, 0)).toBe(0)
  })

  it('8. negative expenses (edge) → negative reserve', () => {
    expect(computeMinCashReserve(-10_000, 2)).toBe(-20_000)
  })
})

// ── computeIdleCash ───────────────────────────────────────────────────────────

describe('computeIdleCash', () => {
  it('9. positive idle cash when balance > reserve', () => {
    expect(computeIdleCash(200_000, 100_000)).toBe(100_000)
  })

  it('10. negative idle cash when balance < reserve', () => {
    expect(computeIdleCash(50_000, 100_000)).toBe(-50_000)
  })

  it('11. zero idle cash when balance = reserve', () => {
    expect(computeIdleCash(100_000, 100_000)).toBe(0)
  })

  it('12. large positive idle cash', () => {
    expect(computeIdleCash(1_000_000, 100_000)).toBe(900_000)
  })

  it('13. zero balance → negative idle cash equal to reserve', () => {
    expect(computeIdleCash(0, 80_000)).toBe(-80_000)
  })

  it('14. both zero → zero', () => {
    expect(computeIdleCash(0, 0)).toBe(0)
  })
})

// ── computeCashAdequacyRatio ──────────────────────────────────────────────────

describe('computeCashAdequacyRatio', () => {
  it('15. normal ratio: 300k / 100k = 3 months', () => {
    expect(computeCashAdequacyRatio(300_000, 100_000)).toBe(3)
  })

  it('16. zero expenses → null', () => {
    expect(computeCashAdequacyRatio(500_000, 0)).toBeNull()
  })

  it('17. zero cash → 0 months', () => {
    expect(computeCashAdequacyRatio(0, 100_000)).toBe(0)
  })

  it('18. fractional ratio rounded to 2 dp', () => {
    expect(computeCashAdequacyRatio(100_000, 30_000)).toBe(3.33)
  })

  it('19. negative cash → negative ratio', () => {
    expect(computeCashAdequacyRatio(-50_000, 100_000)).toBe(-0.5)
  })

  it('20. ratio exactly 2', () => {
    expect(computeCashAdequacyRatio(200_000, 100_000)).toBe(2)
  })

  it('21. ratio exactly 6', () => {
    expect(computeCashAdequacyRatio(600_000, 100_000)).toBe(6)
  })
})

// ── classifyCashAdequacy ──────────────────────────────────────────────────────

describe('classifyCashAdequacy', () => {
  it('22. null → insufficient_data', () => {
    expect(classifyCashAdequacy(null)).toBe('insufficient_data')
  })

  it('23. 0 months → critical', () => {
    expect(classifyCashAdequacy(0)).toBe('critical')
  })

  it('24. 0.5 months → critical', () => {
    expect(classifyCashAdequacy(0.5)).toBe('critical')
  })

  it('25. exactly 1 month → low (boundary: < 1 is critical, 1 is low)', () => {
    expect(classifyCashAdequacy(1)).toBe('low')
  })

  it('26. 1.5 months → low', () => {
    expect(classifyCashAdequacy(1.5)).toBe('low')
  })

  it('27. exactly 2 months → adequate (boundary: < 2 is low)', () => {
    expect(classifyCashAdequacy(2)).toBe('adequate')
  })

  it('28. 3 months → adequate', () => {
    expect(classifyCashAdequacy(3)).toBe('adequate')
  })

  it('29. just under 4 → adequate', () => {
    expect(classifyCashAdequacy(3.99)).toBe('adequate')
  })

  it('30. exactly 4 months → comfortable (boundary: < 4 is adequate)', () => {
    expect(classifyCashAdequacy(4)).toBe('comfortable')
  })

  it('31. 5 months → comfortable', () => {
    expect(classifyCashAdequacy(5)).toBe('comfortable')
  })

  it('32. exactly 6 months → comfortable (boundary: <= 6)', () => {
    expect(classifyCashAdequacy(6)).toBe('comfortable')
  })

  it('33. 6.01 months → excess', () => {
    expect(classifyCashAdequacy(6.01)).toBe('excess')
  })

  it('34. 12 months → excess', () => {
    expect(classifyCashAdequacy(12)).toBe('excess')
  })

  it('35. negative months → critical', () => {
    expect(classifyCashAdequacy(-1)).toBe('critical')
  })
})

// ── projectCashPosition ───────────────────────────────────────────────────────

describe('projectCashPosition', () => {
  it('36. positive burn depletes cash over N months', () => {
    const result = projectCashPosition(90_000, 30_000, 3)
    expect(result).toHaveLength(3)
    expect(result[0]).toMatchObject({ monthOffset: 1, projectedCash: 60_000, isRunOut: false })
    expect(result[1]).toMatchObject({ monthOffset: 2, projectedCash: 30_000, isRunOut: false })
    expect(result[2]).toMatchObject({ monthOffset: 3, projectedCash: 0, isRunOut: false })
  })

  it('37. cash runs out in month 2 of 6 (50k start, 30k burn)', () => {
    // month 1: 50k - 30k = 20k → ok
    // month 2: 20k - 30k = -10k → runOut
    const result = projectCashPosition(50_000, 30_000, 6)
    expect(result[0].isRunOut).toBe(false)
    expect(result[1].isRunOut).toBe(true)
    expect(result[1].projectedCash).toBeLessThan(0)
  })

  it('38. months after runOut are also marked isRunOut=true', () => {
    const result = projectCashPosition(40_000, 30_000, 4)
    expect(result[1].isRunOut).toBe(true)
    expect(result[2].isRunOut).toBe(true)
    expect(result[3].isRunOut).toBe(true)
  })

  it('39. zero burn — cash stays constant', () => {
    const result = projectCashPosition(100_000, 0, 3)
    result.forEach(p => {
      expect(p.projectedCash).toBe(100_000)
      expect(p.isRunOut).toBe(false)
    })
  })

  it('40. negative burn (revenue > expenses) — cash grows', () => {
    const result = projectCashPosition(100_000, -10_000, 3)
    expect(result[0].projectedCash).toBe(110_000)
    expect(result[1].projectedCash).toBe(120_000)
    expect(result[2].projectedCash).toBe(130_000)
  })

  it('41. scheduledInflows increase cash', () => {
    const result = projectCashPosition(100_000, 20_000, 2, [50_000, 0])
    // month 1: 100k - 20k + 50k = 130k
    expect(result[0].projectedCash).toBe(130_000)
    // month 2: 130k - 20k + 0 = 110k
    expect(result[1].projectedCash).toBe(110_000)
  })

  it('42. scheduledOutflows reduce cash', () => {
    const result = projectCashPosition(100_000, 0, 2, undefined, [30_000, 0])
    expect(result[0].projectedCash).toBe(70_000)
    expect(result[1].projectedCash).toBe(70_000)
  })

  it('43. both inflows and outflows applied correctly', () => {
    // month 1: 100k - 10k(burn) + 20k(in) - 5k(out) = 105k
    const result = projectCashPosition(100_000, 10_000, 1, [20_000], [5_000])
    expect(result[0].projectedCash).toBe(105_000)
  })

  it('44. N=6 returns exactly 6 entries', () => {
    const result = projectCashPosition(500_000, 10_000, 6)
    expect(result).toHaveLength(6)
    expect(result[5].monthOffset).toBe(6)
  })

  it('45. N=0 returns empty array', () => {
    expect(projectCashPosition(100_000, 10_000, 0)).toHaveLength(0)
  })

  it('46. starting cash = 0 with positive burn immediately runs out', () => {
    const result = projectCashPosition(0, 10_000, 3)
    expect(result[0].isRunOut).toBe(true)
  })

  it('47. scheduledInflows prevent runOut', () => {
    // burn 30k/month, start 20k, inflow 50k on month 1
    const result = projectCashPosition(20_000, 30_000, 3, [50_000])
    // month 1: 20k - 30k + 50k = 40k → no runOut
    expect(result[0].isRunOut).toBe(false)
    expect(result[0].projectedCash).toBe(40_000)
  })
})

// ── findCashRunway ────────────────────────────────────────────────────────────

describe('findCashRunway', () => {
  it('48. runOut in month 3 → returns 3', () => {
    const projections = [
      { monthOffset: 1, projectedCash: 70_000, isRunOut: false },
      { monthOffset: 2, projectedCash: 40_000, isRunOut: false },
      { monthOffset: 3, projectedCash: -10_000, isRunOut: true },
      { monthOffset: 4, projectedCash: -40_000, isRunOut: true },
    ]
    expect(findCashRunway(projections)).toBe(3)
  })

  it('49. never runs out → null', () => {
    const projections = [
      { monthOffset: 1, projectedCash: 90_000, isRunOut: false },
      { monthOffset: 2, projectedCash: 80_000, isRunOut: false },
      { monthOffset: 3, projectedCash: 70_000, isRunOut: false },
    ]
    expect(findCashRunway(projections)).toBeNull()
  })

  it('50. empty array → null', () => {
    expect(findCashRunway([])).toBeNull()
  })

  it('51. runOut in month 1 → returns 1', () => {
    const projections = [
      { monthOffset: 1, projectedCash: -5_000, isRunOut: true },
    ]
    expect(findCashRunway(projections)).toBe(1)
  })

  it('52. runOut in last month of 6', () => {
    const projections = Array.from({ length: 6 }, (_, i) => ({
      monthOffset: i + 1,
      projectedCash: (5 - i) * 10_000,
      isRunOut: i === 5,
    }))
    expect(findCashRunway(projections)).toBe(6)
  })

  it('53. first runOut wins even if later entries are also runOut', () => {
    const projections = [
      { monthOffset: 1, projectedCash: 50_000, isRunOut: false },
      { monthOffset: 2, projectedCash: -10_000, isRunOut: true },
      { monthOffset: 3, projectedCash: -40_000, isRunOut: true },
    ]
    expect(findCashRunway(projections)).toBe(2)
  })
})

// ── computeIdleCashReturn ─────────────────────────────────────────────────────

describe('computeIdleCashReturn', () => {
  it('54. 8% annual on 120k idle → 800 monthly', () => {
    // 120_000 * (0.08 / 12) = 800
    expect(computeIdleCashReturn(120_000, 0.08)).toBe(800)
  })

  it('55. negative idle cash → null', () => {
    expect(computeIdleCashReturn(-50_000, 0.08)).toBeNull()
  })

  it('56. zero idle cash → null', () => {
    expect(computeIdleCashReturn(0, 0.08)).toBeNull()
  })

  it('57. 12% annual on 600k idle → 6000 monthly', () => {
    expect(computeIdleCashReturn(600_000, 0.12)).toBe(6_000)
  })

  it('58. any annual rate / 12 is the monthly rate', () => {
    const result = computeIdleCashReturn(100_000, 0.24)
    expect(result).toBe(2_000) // 100k * 0.02
  })

  it('59. very small idle cash rounds correctly', () => {
    // 1000 * (0.08/12) = 6.666... → rounds to 6.67
    expect(computeIdleCashReturn(1_000, 0.08)).toBe(6.67)
  })

  it('60. zero rate → zero return', () => {
    expect(computeIdleCashReturn(100_000, 0)).toBe(0)
  })
})

// ── computeFloatGap ───────────────────────────────────────────────────────────

describe('computeFloatGap', () => {
  it('61. DSO > DPO → positive float gap (company finances customers)', () => {
    // avgDailyRevenue * (DSO - DPO) = 10_000 * (45 - 30) = 150_000
    expect(computeFloatGap(45, 30, 10_000)).toBe(150_000)
  })

  it('62. DSO < DPO → negative float gap (suppliers finance company)', () => {
    // 10_000 * (20 - 45) = -250_000
    expect(computeFloatGap(20, 45, 10_000)).toBe(-250_000)
  })

  it('63. DSO = DPO → zero float gap', () => {
    expect(computeFloatGap(30, 30, 10_000)).toBe(0)
  })

  it('64. null DSO → null', () => {
    expect(computeFloatGap(null, 30, 10_000)).toBeNull()
  })

  it('65. null DPO → null', () => {
    expect(computeFloatGap(30, null, 10_000)).toBeNull()
  })

  it('66. null avgDailyRevenue → null', () => {
    expect(computeFloatGap(30, 45, null)).toBeNull()
  })

  it('67. all null → null', () => {
    expect(computeFloatGap(null, null, null)).toBeNull()
  })

  it('68. zero daily revenue → zero gap', () => {
    expect(computeFloatGap(40, 20, 0)).toBe(0)
  })
})

// ── classifyFloatPosition ─────────────────────────────────────────────────────

describe('classifyFloatPosition', () => {
  it('69. null DSO → no_data', () => {
    expect(classifyFloatPosition(null, 30)).toBe('no_data')
  })

  it('70. null DPO → no_data', () => {
    expect(classifyFloatPosition(30, null)).toBe('no_data')
  })

  it('71. both null → no_data', () => {
    expect(classifyFloatPosition(null, null)).toBe('no_data')
  })

  it('72. DPO > DSO by more than 5 → positive_float', () => {
    expect(classifyFloatPosition(20, 30)).toBe('positive_float')
  })

  it('73. DPO > DSO by exactly 6 → positive_float', () => {
    expect(classifyFloatPosition(20, 26)).toBe('positive_float')
  })

  it('74. DPO = DSO → neutral', () => {
    expect(classifyFloatPosition(30, 30)).toBe('neutral')
  })

  it('75. DPO > DSO by exactly 5 days → neutral', () => {
    expect(classifyFloatPosition(25, 30)).toBe('neutral')
  })

  it('76. DSO > DPO by exactly 5 days → neutral', () => {
    expect(classifyFloatPosition(35, 30)).toBe('neutral')
  })

  it('77. DSO > DPO by more than 5 → negative_float', () => {
    expect(classifyFloatPosition(40, 30)).toBe('negative_float')
  })

  it('78. DSO > DPO by exactly 6 days → negative_float', () => {
    expect(classifyFloatPosition(36, 30)).toBe('negative_float')
  })

  it('79. very large DSO vs low DPO → negative_float', () => {
    expect(classifyFloatPosition(90, 15)).toBe('negative_float')
  })

  it('80. DPO = 0, DSO = 0 → neutral', () => {
    expect(classifyFloatPosition(0, 0)).toBe('neutral')
  })
})

// ── computeCashConversionEfficiency ──────────────────────────────────────────

describe('computeCashConversionEfficiency', () => {
  it('81. normal positive: 120k OCF / 100k NI = 1.2', () => {
    expect(computeCashConversionEfficiency(120_000, 100_000)).toBe(1.2)
  })

  it('82. zero net income → null', () => {
    expect(computeCashConversionEfficiency(100_000, 0)).toBeNull()
  })

  it('83. negative net income allowed', () => {
    expect(computeCashConversionEfficiency(50_000, -100_000)).toBe(-0.5)
  })

  it('84. OCF < NI → ratio < 1', () => {
    expect(computeCashConversionEfficiency(80_000, 100_000)).toBe(0.8)
  })

  it('85. OCF = NI → ratio = 1', () => {
    expect(computeCashConversionEfficiency(100_000, 100_000)).toBe(1)
  })

  it('86. both negative → positive ratio', () => {
    expect(computeCashConversionEfficiency(-80_000, -100_000)).toBe(0.8)
  })

  it('87. large values rounded to 2 dp', () => {
    expect(computeCashConversionEfficiency(1_000_000, 300_000)).toBe(3.33)
  })
})

// ── computeDaysCashOnHand ─────────────────────────────────────────────────────

describe('computeDaysCashOnHand', () => {
  it('88. 365k cash / 365k annual expenses = 365 days', () => {
    expect(computeDaysCashOnHand(365_000, 365_000)).toBe(365)
  })

  it('89. zero annual expenses → null', () => {
    expect(computeDaysCashOnHand(100_000, 0)).toBeNull()
  })

  it('90. 100k cash / 1.2M annual expenses ≈ 30.42 days', () => {
    const result = computeDaysCashOnHand(100_000, 1_200_000)
    expect(result).toBe(30.42)
  })

  it('91. zero cash → 0 days', () => {
    expect(computeDaysCashOnHand(0, 365_000)).toBe(0)
  })

  it('92. 90 days of cash', () => {
    // 90k / (365k/365) = 90
    expect(computeDaysCashOnHand(90_000, 365_000)).toBe(90)
  })

  it('93. small cash → small days value', () => {
    // 10k / (365k/365) = 10
    expect(computeDaysCashOnHand(10_000, 365_000)).toBe(10)
  })
})

// ── classifyDaysCashOnHand ────────────────────────────────────────────────────

describe('classifyDaysCashOnHand', () => {
  it('94. null → insufficient_data', () => {
    expect(classifyDaysCashOnHand(null)).toBe('insufficient_data')
  })

  it('95. 0 days → critical', () => {
    expect(classifyDaysCashOnHand(0)).toBe('critical')
  })

  it('96. 10 days → critical', () => {
    expect(classifyDaysCashOnHand(10)).toBe('critical')
  })

  it('97. exactly 15 days → low (boundary: < 15 is critical)', () => {
    expect(classifyDaysCashOnHand(15)).toBe('low')
  })

  it('98. 20 days → low', () => {
    expect(classifyDaysCashOnHand(20)).toBe('low')
  })

  it('99. just under 30 → low', () => {
    expect(classifyDaysCashOnHand(29.99)).toBe('low')
  })

  it('100. exactly 30 days → adequate (boundary: < 30 is low)', () => {
    expect(classifyDaysCashOnHand(30)).toBe('adequate')
  })

  it('101. 45 days → adequate', () => {
    expect(classifyDaysCashOnHand(45)).toBe('adequate')
  })

  it('102. just under 60 → adequate', () => {
    expect(classifyDaysCashOnHand(59.9)).toBe('adequate')
  })

  it('103. exactly 60 days → strong (boundary: < 60 is adequate)', () => {
    expect(classifyDaysCashOnHand(60)).toBe('strong')
  })

  it('104. 75 days → strong', () => {
    expect(classifyDaysCashOnHand(75)).toBe('strong')
  })

  it('105. exactly 90 days → strong (boundary: <= 90)', () => {
    expect(classifyDaysCashOnHand(90)).toBe('strong')
  })

  it('106. 90.01 days → very_strong', () => {
    expect(classifyDaysCashOnHand(90.01)).toBe('very_strong')
  })

  it('107. 180 days → very_strong', () => {
    expect(classifyDaysCashOnHand(180)).toBe('very_strong')
  })
})

// ── generateCashPositionNarrative ────────────────────────────────────────────

describe('generateCashPositionNarrative', () => {
  it('108. critical adequacy → includes kritik warning', () => {
    const n = generateCashPositionNarrative('critical', 10, -50_000, 'no_data')
    expect(n.toLowerCase()).toContain('kritik')
  })

  it('109. low adequacy → includes düşük', () => {
    const n = generateCashPositionNarrative('low', 25, -20_000, 'no_data')
    expect(n.toLowerCase()).toContain('düşük')
  })

  it('110. adequate adequacy → includes yeterli', () => {
    const n = generateCashPositionNarrative('adequate', 45, 10_000, 'neutral')
    expect(n.toLowerCase()).toContain('yeterli')
  })

  it('111. comfortable adequacy → includes rahat', () => {
    const n = generateCashPositionNarrative('comfortable', 75, 50_000, 'positive_float')
    expect(n.toLowerCase()).toContain('rahat')
  })

  it('112. excess adequacy → mentions getiri or fazlası', () => {
    const n = generateCashPositionNarrative('excess', 200, 500_000, 'positive_float')
    expect(n.toLowerCase()).toMatch(/fazla|getiri/)
  })

  it('113. insufficient_data adequacy → mentions veri', () => {
    const n = generateCashPositionNarrative('insufficient_data', null, 0, 'no_data')
    expect(n.toLowerCase()).toContain('veri')
  })

  it('114. positive float → mentions avantajlı or tedarikçi', () => {
    const n = generateCashPositionNarrative('adequate', 45, 10_000, 'positive_float')
    expect(n.toLowerCase()).toMatch(/avantajl|tedarikçi/)
  })

  it('115. negative float → mentions tahsilat or negatif', () => {
    const n = generateCashPositionNarrative('adequate', 45, 10_000, 'negative_float')
    expect(n.toLowerCase()).toMatch(/tahsilat|negatif/)
  })

  it('116. neutral float → mentions dengeli or nötr', () => {
    const n = generateCashPositionNarrative('adequate', 45, 10_000, 'neutral')
    expect(n.toLowerCase()).toMatch(/densel|dengeli|nötr/)
  })

  it('117. positive idle cash → mentions atıl or yatırım', () => {
    const n = generateCashPositionNarrative('excess', 200, 300_000, 'no_data')
    expect(n.toLowerCase()).toMatch(/atıl|yatırım/)
  })

  it('118. negative idle cash → mentions rezerv açığı or altında', () => {
    const n = generateCashPositionNarrative('critical', 5, -100_000, 'no_data')
    expect(n.toLowerCase()).toMatch(/rezerv|altında/)
  })

  it('119. daysCash included in narrative when not null', () => {
    const n = generateCashPositionNarrative('adequate', 45, 0, 'no_data')
    expect(n).toContain('45')
  })

  it('120. daysCash null → no day count reference in narrative', () => {
    const n = generateCashPositionNarrative('insufficient_data', null, 0, 'no_data')
    // Should not include a number referring to days cash
    expect(n).not.toContain('günlük')
  })

  it('121. returns non-empty string for all inputs', () => {
    const n = generateCashPositionNarrative('adequate', 50, 20_000, 'neutral')
    expect(n.length).toBeGreaterThan(10)
  })

  it('122. critical + negative_float → contains both warning messages', () => {
    const n = generateCashPositionNarrative('critical', 8, -10_000, 'negative_float')
    expect(n.toLowerCase()).toContain('kritik')
    expect(n.toLowerCase()).toMatch(/tahsilat|negatif/)
  })
})

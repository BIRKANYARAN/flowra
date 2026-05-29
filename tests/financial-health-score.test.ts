/**
 * Financial Health Score — unit tests
 *
 * Tests all pure computation functions for the Altman Z"-Score
 * adapted for Turkish SMEs (private company 4-factor model).
 *
 * 42+ tests — no DB or network calls.
 */

import { describe, it, expect } from 'vitest'
import {
  computeX1WorkingCapital,
  computeX2RetainedEarnings,
  computeX3Ebit,
  computeX4EquityToDebt,
  computeAltmanZPrime,
  classifyAltmanZone,
  computeAltmanPercentile,
  computeFlowraHealthScore,
  classifyFlowraHealth,
  computeKeyRiskIndicators,
} from '../lib/services/intelligence/financial-health-score.service'

// ── computeX1WorkingCapital ───────────────────────────────────────────────────

describe('computeX1WorkingCapital', () => {

  it('1. positive working capital returns correct ratio', () => {
    // WC = 800 - 200 = 600; X1 = 600/1000 = 0.6
    const result = computeX1WorkingCapital(800, 200, 1000)
    expect(result).toBeCloseTo(0.6, 6)
  })

  it('2. negative working capital returns negative ratio', () => {
    // WC = 200 - 800 = -600; X1 = -600/1000 = -0.6
    const result = computeX1WorkingCapital(200, 800, 1000)
    expect(result).toBeCloseTo(-0.6, 6)
  })

  it('3. zero total assets returns null', () => {
    const result = computeX1WorkingCapital(500, 200, 0)
    expect(result).toBeNull()
  })

  it('4. equal current assets and liabilities → X1 = 0', () => {
    const result = computeX1WorkingCapital(500, 500, 1000)
    expect(result).toBe(0)
  })

  it('5. total assets equals working capital → X1 = 1', () => {
    // WC = 1000 - 0 = 1000; X1 = 1000/1000 = 1
    const result = computeX1WorkingCapital(1000, 0, 1000)
    expect(result).toBeCloseTo(1.0, 6)
  })

})

// ── computeX2RetainedEarnings ─────────────────────────────────────────────────

describe('computeX2RetainedEarnings', () => {

  it('6. positive retained earnings → positive ratio', () => {
    // X2 = 300/1000 = 0.3
    const result = computeX2RetainedEarnings(300, 1000)
    expect(result).toBeCloseTo(0.3, 6)
  })

  it('7. negative retained earnings (accumulated loss) → negative ratio', () => {
    // X2 = -200/1000 = -0.2
    const result = computeX2RetainedEarnings(-200, 1000)
    expect(result).toBeCloseTo(-0.2, 6)
  })

  it('8. zero total assets → null', () => {
    const result = computeX2RetainedEarnings(300, 0)
    expect(result).toBeNull()
  })

  it('9. zero retained earnings → X2 = 0', () => {
    const result = computeX2RetainedEarnings(0, 1000)
    expect(result).toBe(0)
  })

})

// ── computeX3Ebit ─────────────────────────────────────────────────────────────

describe('computeX3Ebit', () => {

  it('10. positive EBIT → positive ratio', () => {
    // X3 = 150/1000 = 0.15
    const result = computeX3Ebit(150, 1000)
    expect(result).toBeCloseTo(0.15, 6)
  })

  it('11. negative EBIT → negative ratio', () => {
    // X3 = -50/1000 = -0.05
    const result = computeX3Ebit(-50, 1000)
    expect(result).toBeCloseTo(-0.05, 6)
  })

  it('12. zero total assets → null', () => {
    const result = computeX3Ebit(150, 0)
    expect(result).toBeNull()
  })

  it('13. zero EBIT → X3 = 0', () => {
    const result = computeX3Ebit(0, 1000)
    expect(result).toBe(0)
  })

})

// ── computeX4EquityToDebt ─────────────────────────────────────────────────────

describe('computeX4EquityToDebt', () => {

  it('14. normal equity and debt → correct ratio', () => {
    // X4 = 500/1000 = 0.5
    const result = computeX4EquityToDebt(500, 1000)
    expect(result).toBeCloseTo(0.5, 6)
  })

  it('15. zero liabilities (debt-free) → returns 10.0 cap', () => {
    const result = computeX4EquityToDebt(1000, 0)
    expect(result).toBe(10.0)
  })

  it('16. negative equity → negative ratio', () => {
    // X4 = -200/1000 = -0.2
    const result = computeX4EquityToDebt(-200, 1000)
    expect(result).toBeCloseTo(-0.2, 6)
  })

  it('17. equity equals debt → X4 = 1', () => {
    const result = computeX4EquityToDebt(1000, 1000)
    expect(result).toBeCloseTo(1.0, 6)
  })

  it('18. large equity relative to small debt → high ratio', () => {
    // X4 = 9000/1000 = 9
    const result = computeX4EquityToDebt(9000, 1000)
    expect(result).toBeCloseTo(9.0, 6)
  })

})

// ── computeAltmanZPrime ───────────────────────────────────────────────────────

describe('computeAltmanZPrime', () => {

  it('19. known values produce correct Z" score', () => {
    // Z" = 6.56×0.4 + 3.26×0.2 + 6.72×0.1 + 1.05×0.5
    // = 2.624 + 0.652 + 0.672 + 0.525 = 4.473
    const result = computeAltmanZPrime(0.4, 0.2, 0.1, 0.5)
    expect(result).toBeCloseTo(4.473, 3)
  })

  it('20. all zeros → Z" = 0', () => {
    const result = computeAltmanZPrime(0, 0, 0, 0)
    expect(result).toBe(0)
  })

  it('21. x1 null → returns null', () => {
    const result = computeAltmanZPrime(null, 0.2, 0.1, 0.5)
    expect(result).toBeNull()
  })

  it('22. x2 null → returns null', () => {
    const result = computeAltmanZPrime(0.4, null, 0.1, 0.5)
    expect(result).toBeNull()
  })

  it('23. x3 null → returns null', () => {
    const result = computeAltmanZPrime(0.4, 0.2, null, 0.5)
    expect(result).toBeNull()
  })

  it('24. x4 null → returns null', () => {
    const result = computeAltmanZPrime(0.4, 0.2, 0.1, null)
    expect(result).toBeNull()
  })

  it('25. verifies weight for x1 (6.56)', () => {
    // Only x1=1, rest 0 → Z" = 6.56
    const result = computeAltmanZPrime(1, 0, 0, 0)
    expect(result).toBeCloseTo(6.56, 6)
  })

  it('26. verifies weight for x2 (3.26)', () => {
    const result = computeAltmanZPrime(0, 1, 0, 0)
    expect(result).toBeCloseTo(3.26, 6)
  })

  it('27. verifies weight for x3 (6.72)', () => {
    const result = computeAltmanZPrime(0, 0, 1, 0)
    expect(result).toBeCloseTo(6.72, 6)
  })

  it('28. verifies weight for x4 (1.05)', () => {
    const result = computeAltmanZPrime(0, 0, 0, 1)
    expect(result).toBeCloseTo(1.05, 6)
  })

})

// ── classifyAltmanZone ────────────────────────────────────────────────────────

describe('classifyAltmanZone', () => {

  it('29. z = 2.6 → safe (boundary)', () => {
    expect(classifyAltmanZone(2.6)).toBe('safe')
  })

  it('30. z = 3.5 → safe', () => {
    expect(classifyAltmanZone(3.5)).toBe('safe')
  })

  it('31. z = 1.1 → grey (boundary)', () => {
    expect(classifyAltmanZone(1.1)).toBe('grey')
  })

  it('32. z = 2.0 → grey', () => {
    expect(classifyAltmanZone(2.0)).toBe('grey')
  })

  it('33. z = 2.599 → grey (just below safe)', () => {
    expect(classifyAltmanZone(2.599)).toBe('grey')
  })

  it('34. z = 0.5 → distress', () => {
    expect(classifyAltmanZone(0.5)).toBe('distress')
  })

  it('35. z = 1.099 → distress (just below grey)', () => {
    expect(classifyAltmanZone(1.099)).toBe('distress')
  })

  it('36. z = 0 → distress', () => {
    expect(classifyAltmanZone(0)).toBe('distress')
  })

  it('37. z = -1 → distress', () => {
    expect(classifyAltmanZone(-1)).toBe('distress')
  })

  it('38. z = null → insufficient_data', () => {
    expect(classifyAltmanZone(null)).toBe('insufficient_data')
  })

})

// ── computeAltmanPercentile ───────────────────────────────────────────────────

describe('computeAltmanPercentile', () => {

  it('39. z = 1.85 → approximately 50%', () => {
    const result = computeAltmanPercentile(1.85)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(50, 0)
  })

  it('40. very high z-score → close to 100', () => {
    const result = computeAltmanPercentile(10)
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(95)
  })

  it('41. very low z-score → close to 0', () => {
    const result = computeAltmanPercentile(-5)
    expect(result).not.toBeNull()
    expect(result!).toBeLessThan(5)
  })

  it('42. null z-score → null', () => {
    const result = computeAltmanPercentile(null)
    expect(result).toBeNull()
  })

  it('43. result is clamped to [0, 100]', () => {
    const high = computeAltmanPercentile(100)
    const low  = computeAltmanPercentile(-100)
    expect(high).not.toBeNull()
    expect(low).not.toBeNull()
    expect(high!).toBeLessThanOrEqual(100)
    expect(low!).toBeGreaterThanOrEqual(0)
  })

  it('44. z above breakeven → percentile > 50', () => {
    const result = computeAltmanPercentile(2.5)
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(50)
  })

})

// ── computeFlowraHealthScore ──────────────────────────────────────────────────

describe('computeFlowraHealthScore', () => {

  it('45. all components null → result = 50 (neutral default)', () => {
    // 50×0.40 + 50×0.25 + 50×0.20 + 50×0.15 = 20+12.5+10+7.5 = 50
    const result = computeFlowraHealthScore(null, null, null, null)
    expect(result).toBe(50)
  })

  it('46. all components at maximum → score = 100', () => {
    // High altmanZ → percentile ≈100 → 100×0.40=40
    // grossMarginPct=50 → 100×0.25=25
    // currentRatio=3.03 → ~100×0.20=20
    // runwayMonths=12 → 100×0.15=15 → total=100
    const result = computeFlowraHealthScore(10, 50, 3.1, 12)
    expect(result).toBeCloseTo(100, 0)
  })

  it('47. only altman component null → uses neutral 50 for altman', () => {
    // altman: 50×0.40=20; rest all at 50 → 20 + 50×0.25 + 50×0.20 + 50×0.15 = 50
    const result = computeFlowraHealthScore(null, null, null, null)
    expect(result).toBe(50)
  })

  it('48. gross margin 50% → margin component at max (50×2=100)', () => {
    // altman null=50×0.40=20; margin=100×0.25=25; liq null=50×0.20=10; run null=50×0.15=7.5 → 62.5
    const result = computeFlowraHealthScore(null, 50, null, null)
    expect(result).toBeCloseTo(62.5, 1)
  })

  it('49. gross margin 0% → margin component at 0', () => {
    // altman null=20; margin=0×0.25=0; liq null=10; run null=7.5 → 37.5
    const result = computeFlowraHealthScore(null, 0, null, null)
    expect(result).toBeCloseTo(37.5, 1)
  })

  it('50. current ratio 3 → liquidity ≈ 99×0.20', () => {
    // altman null=20; margin null=12.5; liq=min(100,3×33)×0.20=99×0.20=19.8; run null=7.5
    const result = computeFlowraHealthScore(null, null, 3, null)
    expect(result).toBeCloseTo(59.8, 1)
  })

  it('51. runway 12 months → runway component at max (100×0.15=15)', () => {
    // altman null=20; margin null=12.5; liq null=10; run=100×0.15=15 → 57.5
    const result = computeFlowraHealthScore(null, null, null, 12)
    expect(result).toBeCloseTo(57.5, 1)
  })

  it('52. result is rounded to 1 decimal', () => {
    const result = computeFlowraHealthScore(1.5, 25, 1.5, 6)
    const str = result.toString()
    const decimalPlaces = str.includes('.') ? str.split('.')[1].length : 0
    expect(decimalPlaces).toBeLessThanOrEqual(1)
  })

  it('53. negative components are clamped to 0', () => {
    // grossMarginPct = -50 → clamped to 0
    const withNegative = computeFlowraHealthScore(null, -50, null, null)
    const withZero     = computeFlowraHealthScore(null, 0, null, null)
    expect(withNegative).toBe(withZero)
  })

})

// ── classifyFlowraHealth ──────────────────────────────────────────────────────

describe('classifyFlowraHealth', () => {

  it('54. score = 80 → excellent (boundary)', () => {
    expect(classifyFlowraHealth(80)).toBe('excellent')
  })

  it('55. score = 100 → excellent', () => {
    expect(classifyFlowraHealth(100)).toBe('excellent')
  })

  it('56. score = 65 → strong (boundary)', () => {
    expect(classifyFlowraHealth(65)).toBe('strong')
  })

  it('57. score = 75 → strong', () => {
    expect(classifyFlowraHealth(75)).toBe('strong')
  })

  it('58. score = 79.9 → strong (just below excellent)', () => {
    expect(classifyFlowraHealth(79.9)).toBe('strong')
  })

  it('59. score = 50 → adequate (boundary)', () => {
    expect(classifyFlowraHealth(50)).toBe('adequate')
  })

  it('60. score = 60 → adequate', () => {
    expect(classifyFlowraHealth(60)).toBe('adequate')
  })

  it('61. score = 35 → weak (boundary)', () => {
    expect(classifyFlowraHealth(35)).toBe('weak')
  })

  it('62. score = 45 → weak', () => {
    expect(classifyFlowraHealth(45)).toBe('weak')
  })

  it('63. score = 34 → critical', () => {
    expect(classifyFlowraHealth(34)).toBe('critical')
  })

  it('64. score = 0 → critical', () => {
    expect(classifyFlowraHealth(0)).toBe('critical')
  })

})

// ── computeKeyRiskIndicators ──────────────────────────────────────────────────

describe('computeKeyRiskIndicators', () => {

  it('65. all null inputs → empty array', () => {
    const result = computeKeyRiskIndicators(null, null, null, null, null)
    expect(result).toEqual([])
  })

  it('66. all healthy values → empty array', () => {
    const result = computeKeyRiskIndicators(0.5, 0.3, 0.1, 1.5, 12)
    expect(result).toEqual([])
  })

  it('67. x1 < 0 → fires negative working capital indicator', () => {
    const result = computeKeyRiskIndicators(-0.1, null, null, null, null)
    expect(result).toContain('Negatif işletme sermayesi')
  })

  it('68. x1 = 0 → does NOT fire working capital indicator', () => {
    const result = computeKeyRiskIndicators(0, null, null, null, null)
    expect(result).not.toContain('Negatif işletme sermayesi')
  })

  it('69. x2 < 0 → fires accumulated loss indicator', () => {
    const result = computeKeyRiskIndicators(null, -0.2, null, null, null)
    expect(result).toContain('Birikmiş zarar mevcut')
  })

  it('70. x3 < 0 → fires negative EBIT indicator', () => {
    const result = computeKeyRiskIndicators(null, null, -0.05, null, null)
    expect(result).toContain('Negatif faaliyet kârı (EBIT)')
  })

  it('71. x4 < 0.5 → fires high leverage indicator', () => {
    const result = computeKeyRiskIndicators(null, null, null, 0.4, null)
    expect(result).toContain('Yüksek finansal kaldıraç riski')
  })

  it('72. x4 = 0.5 → does NOT fire high leverage indicator', () => {
    const result = computeKeyRiskIndicators(null, null, null, 0.5, null)
    expect(result).not.toContain('Yüksek finansal kaldıraç riski')
  })

  it('73. x4 = 0.0 (zero equity) → fires high leverage indicator', () => {
    const result = computeKeyRiskIndicators(null, null, null, 0, null)
    expect(result).toContain('Yüksek finansal kaldıraç riski')
  })

  it('74. runway < 3 months → fires critical cash flow indicator', () => {
    const result = computeKeyRiskIndicators(null, null, null, null, 2)
    expect(result).toContain('Kritik nakit akışı — 3 aydan az')
    expect(result).not.toContain('Nakit rezervi azalıyor')
  })

  it('75. runway = 0 → fires critical cash flow indicator', () => {
    const result = computeKeyRiskIndicators(null, null, null, null, 0)
    expect(result).toContain('Kritik nakit akışı — 3 aydan az')
  })

  it('76. runway between 3 and 6 → fires declining cash reserve indicator', () => {
    const result = computeKeyRiskIndicators(null, null, null, null, 4)
    expect(result).toContain('Nakit rezervi azalıyor')
    expect(result).not.toContain('Kritik nakit akışı — 3 aydan az')
  })

  it('77. runway = 3 → fires declining cash reserve (NOT critical)', () => {
    const result = computeKeyRiskIndicators(null, null, null, null, 3)
    expect(result).toContain('Nakit rezervi azalıyor')
    expect(result).not.toContain('Kritik nakit akışı — 3 aydan az')
  })

  it('78. runway = 6 → no cash indicators fire', () => {
    const result = computeKeyRiskIndicators(null, null, null, null, 6)
    expect(result).not.toContain('Nakit rezervi azalıyor')
    expect(result).not.toContain('Kritik nakit akışı — 3 aydan az')
  })

  it('79. multiple indicators fire simultaneously', () => {
    // x1 < 0, x2 < 0, x3 < 0, x4 < 0.5, runway < 3
    const result = computeKeyRiskIndicators(-0.2, -0.1, -0.05, 0.3, 1)
    expect(result).toContain('Negatif işletme sermayesi')
    expect(result).toContain('Birikmiş zarar mevcut')
    expect(result).toContain('Negatif faaliyet kârı (EBIT)')
    expect(result).toContain('Yüksek finansal kaldıraç riski')
    expect(result).toContain('Kritik nakit akışı — 3 aydan az')
    expect(result.length).toBe(5)
  })

  it('80. x4 null → leverage indicator does not fire', () => {
    const result = computeKeyRiskIndicators(null, null, null, null, null)
    expect(result).not.toContain('Yüksek finansal kaldıraç riski')
  })

})

// ── computeX1WorkingCapital – additional ─────────────────────────────────────

describe('computeX1WorkingCapital – additional', () => {

  it('81. very large assets reduce X1 proportionally', () => {
    // WC = 200 - 100 = 100; X1 = 100/1_000_000 ≈ 0.0001
    const result = computeX1WorkingCapital(200, 100, 1_000_000)
    expect(result).toBeCloseTo(0.0001, 6)
  })

  it('82. negative current liabilities (unusual, credit balance) → higher X1', () => {
    // WC = 500 - (-100) = 600; X1 = 600/1000 = 0.6
    const result = computeX1WorkingCapital(500, -100, 1000)
    expect(result).toBeCloseTo(0.6, 6)
  })

  it('83. currentAssets = 0, currentLiabilities = 0 → X1 = 0', () => {
    const result = computeX1WorkingCapital(0, 0, 1000)
    expect(result).toBe(0)
  })

})

// ── computeX2RetainedEarnings – additional ────────────────────────────────────

describe('computeX2RetainedEarnings – additional', () => {

  it('84. retained earnings equal to assets → X2 = 1.0', () => {
    const result = computeX2RetainedEarnings(1000, 1000)
    expect(result).toBeCloseTo(1.0, 6)
  })

  it('85. retained earnings more than total assets → X2 > 1 (unusual)', () => {
    const result = computeX2RetainedEarnings(1500, 1000)
    expect(result).toBeCloseTo(1.5, 6)
  })

  it('86. very negative retained earnings → very negative X2', () => {
    const result = computeX2RetainedEarnings(-5000, 1000)
    expect(result).toBeCloseTo(-5.0, 6)
  })

})

// ── computeX3Ebit – additional ────────────────────────────────────────────────

describe('computeX3Ebit – additional', () => {

  it('87. positive EBIT → positive X3', () => {
    const result = computeX3Ebit(200, 1000)
    expect(result).toBeCloseTo(0.2, 6)
  })

  it('88. zero EBIT → X3 = 0', () => {
    const result = computeX3Ebit(0, 1000)
    expect(result).toBe(0)
  })

  it('89. zero assets → null', () => {
    const result = computeX3Ebit(200, 0)
    expect(result).toBeNull()
  })

  it('90. EBIT equals assets → X3 = 1.0', () => {
    const result = computeX3Ebit(1000, 1000)
    expect(result).toBeCloseTo(1.0, 6)
  })

  it('91. negative EBIT → negative X3', () => {
    const result = computeX3Ebit(-300, 1000)
    expect(result).toBeCloseTo(-0.3, 6)
  })

})

// ── computeX4EquityToDebt – additional ───────────────────────────────────────

describe('computeX4EquityToDebt – additional', () => {

  it('92. zero liabilities → returns 10.0 (debt-free cap)', () => {
    expect(computeX4EquityToDebt(1000, 0)).toBe(10.0)
  })

  it('93. equity equals liabilities → X4 = 1.0', () => {
    expect(computeX4EquityToDebt(500, 500)).toBeCloseTo(1.0, 6)
  })

  it('94. negative equity (deeply distressed) → negative X4', () => {
    // -200 / 500 = -0.4
    expect(computeX4EquityToDebt(-200, 500)).toBeCloseTo(-0.4, 6)
  })

  it('95. high equity relative to debt → high X4', () => {
    // 5000 / 100 = 50
    expect(computeX4EquityToDebt(5000, 100)).toBeCloseTo(50.0, 6)
  })

})

// ── computeAltmanZPrime – additional ─────────────────────────────────────────

describe('computeAltmanZPrime – additional', () => {

  it('96. known calculation: Z" = 6.56×0.2 + 3.26×0.1 + 6.72×0.05 + 1.05×1.0', () => {
    // = 1.312 + 0.326 + 0.336 + 1.05 = 3.024
    const result = computeAltmanZPrime(0.2, 0.1, 0.05, 1.0)
    expect(result).toBeCloseTo(3.024, 3)
  })

  it('97. all zero components → Z" = 0', () => {
    expect(computeAltmanZPrime(0, 0, 0, 0)).toBe(0)
  })

  it('98. negative components → negative Z"', () => {
    const result = computeAltmanZPrime(-0.5, -0.5, -0.1, -0.1)
    expect(result).toBeLessThan(0)
  })

  it('99. one null → null', () => {
    expect(computeAltmanZPrime(0.2, null, 0.05, 1.0)).toBeNull()
  })

  it('100. all nulls → null', () => {
    expect(computeAltmanZPrime(null, null, null, null)).toBeNull()
  })

})

// ── classifyAltmanZone – additional ──────────────────────────────────────────

describe('classifyAltmanZone – additional', () => {

  it('101. exactly 2.6 → safe (boundary)', () => {
    expect(classifyAltmanZone(2.6)).toBe('safe')
  })

  it('102. 2.599 → grey (just below safe)', () => {
    expect(classifyAltmanZone(2.599)).toBe('grey')
  })

  it('103. exactly 1.1 → grey (boundary)', () => {
    expect(classifyAltmanZone(1.1)).toBe('grey')
  })

  it('104. 1.099 → distress (just below grey)', () => {
    expect(classifyAltmanZone(1.099)).toBe('distress')
  })

  it('105. very high Z" → safe', () => {
    expect(classifyAltmanZone(10.0)).toBe('safe')
  })

  it('106. very negative Z" → distress', () => {
    expect(classifyAltmanZone(-5.0)).toBe('distress')
  })

  it('107. Z" = 0 → distress', () => {
    expect(classifyAltmanZone(0)).toBe('distress')
  })

  it('108. Z" = 1.85 (midpoint of grey) → grey', () => {
    expect(classifyAltmanZone(1.85)).toBe('grey')
  })

})

// ── computeAltmanPercentile – additional ─────────────────────────────────────

describe('computeAltmanPercentile – additional', () => {

  it('109. null → null', () => {
    expect(computeAltmanPercentile(null)).toBeNull()
  })

  it('110. Z" = 1.85 → ~50th percentile (sigmoid center)', () => {
    // 100 / (1 + exp(0)) = 50
    const result = computeAltmanPercentile(1.85)
    expect(result).toBeCloseTo(50, 1)
  })

  it('111. very high Z" → approaches 100', () => {
    const result = computeAltmanPercentile(10)
    expect(result).toBeGreaterThan(99)
  })

  it('112. very negative Z" → approaches 0', () => {
    const result = computeAltmanPercentile(-10)
    expect(result).toBeLessThan(1)
  })

  it('113. Z" = 2.6 (safe boundary) → above 70th percentile', () => {
    const result = computeAltmanPercentile(2.6)
    expect(result).toBeGreaterThan(70)
  })

  it('114. result is clamped to [0, 100]', () => {
    const high = computeAltmanPercentile(100)!
    const low = computeAltmanPercentile(-100)!
    expect(high).toBeLessThanOrEqual(100)
    expect(low).toBeGreaterThanOrEqual(0)
  })

})

// ── computeFlowraHealthScore – additional ────────────────────────────────────

describe('computeFlowraHealthScore – additional', () => {

  it('115. all null → 50 (neutral)', () => {
    expect(computeFlowraHealthScore(null, null, null, null)).toBeCloseTo(50, 1)
  })

  it('116. only altmanZ provided = 0 → below 50', () => {
    const result = computeFlowraHealthScore(0, null, null, null)
    expect(result).toBeLessThan(50)
  })

  it('117. grossMarginPct = 50 → margin component saturated', () => {
    // margin 50 → 50×2 = 100 → 100×0.25 = 25; rest null → 0.40×50 + 0.20×50 + 0.15×50 = 37.5; total=62.5
    const result = computeFlowraHealthScore(null, 50, null, null)
    expect(result).toBeCloseTo(62.5, 1)
  })

  it('118. grossMarginPct = 0 → margin component = 0', () => {
    // 0×2 = 0 → 0×0.25 = 0; rest null → 40×0.40 ... wait: null altman → 50×0.40=20; 50×0.20=10; 50×0.15=7.5; total=37.5
    const result = computeFlowraHealthScore(null, 0, null, null)
    expect(result).toBeCloseTo(37.5, 1)
  })

  it('119. currentRatio = 3 → liquidity component saturated', () => {
    // 3×33 = 99 → min(100,99)=99 → 99×0.20=19.8; rest null → 50×0.40+50×0.25+50×0.15=40; total=59.8
    const result = computeFlowraHealthScore(null, null, 3, null)
    expect(result).toBeCloseTo(59.8, 1)
  })

  it('120. runwayMonths = 12 → runway component = 15', () => {
    // 12×100/12=100 → 100×0.15=15; rest null → 50×0.40+50×0.25+50×0.20=42.5; total=57.5
    const result = computeFlowraHealthScore(null, null, null, 12)
    expect(result).toBeCloseTo(57.5, 1)
  })

  it('121. runwayMonths = 0 → runway component = 0', () => {
    // 0×100/12=0 → 0×0.15=0; rest null → 50×0.40+50×0.25+50×0.20=42.5
    const result = computeFlowraHealthScore(null, null, null, 0)
    expect(result).toBeCloseTo(42.5, 1)
  })

  it('122. runwayMonths = 6 → runway component = 7.5', () => {
    // 6×100/12=50 → 50×0.15=7.5; rest null → 42.5; total=50
    const result = computeFlowraHealthScore(null, null, null, 6)
    expect(result).toBeCloseTo(50, 1)
  })

  it('123. negative grossMarginPct → margin clamped to 0', () => {
    // -20×2=-40 → max(0,-40)=0 → 0×0.25=0; rest null → 20+10+7.5=37.5
    const result = computeFlowraHealthScore(null, -20, null, null)
    expect(result).toBeCloseTo(37.5, 1)
  })

  it('124. currentRatio = 0 → liquidity component = 0', () => {
    // 0×33=0 → 0×0.20=0; rest null → 20+12.5+7.5=40
    const result = computeFlowraHealthScore(null, null, 0, null)
    expect(result).toBeCloseTo(40, 1)
  })

  it('125. result rounded to 1 decimal place', () => {
    const result = computeFlowraHealthScore(1.5, 25, 1.5, 8)
    const str = result.toString()
    const dp = str.includes('.') ? str.split('.')[1].length : 0
    expect(dp).toBeLessThanOrEqual(1)
  })

})

// ── classifyFlowraHealth – additional ────────────────────────────────────────

describe('classifyFlowraHealth – additional', () => {

  it('126. exactly 80 → excellent', () => {
    expect(classifyFlowraHealth(80)).toBe('excellent')
  })

  it('127. 79.9 → strong', () => {
    expect(classifyFlowraHealth(79.9)).toBe('strong')
  })

  it('128. exactly 65 → strong', () => {
    expect(classifyFlowraHealth(65)).toBe('strong')
  })

  it('129. 64.9 → adequate', () => {
    expect(classifyFlowraHealth(64.9)).toBe('adequate')
  })

  it('130. exactly 50 → adequate', () => {
    expect(classifyFlowraHealth(50)).toBe('adequate')
  })

  it('131. 49.9 → weak', () => {
    expect(classifyFlowraHealth(49.9)).toBe('weak')
  })

  it('132. exactly 35 → weak', () => {
    expect(classifyFlowraHealth(35)).toBe('weak')
  })

  it('133. 34.9 → critical', () => {
    expect(classifyFlowraHealth(34.9)).toBe('critical')
  })

  it('134. 100 → excellent', () => {
    expect(classifyFlowraHealth(100)).toBe('excellent')
  })

  it('135. negative value → critical', () => {
    expect(classifyFlowraHealth(-1)).toBe('critical')
  })

})

// ── computeKeyRiskIndicators – additional ────────────────────────────────────

describe('computeKeyRiskIndicators – additional', () => {

  it('136. x1 = 0 exactly → no negative working capital indicator', () => {
    const result = computeKeyRiskIndicators(0, null, null, null, null)
    expect(result).not.toContain('Negatif işletme sermayesi')
  })

  it('137. x2 = 0 exactly → no accumulated loss indicator', () => {
    const result = computeKeyRiskIndicators(null, 0, null, null, null)
    expect(result).not.toContain('Birikmiş zarar mevcut')
  })

  it('138. x3 = 0 exactly → no negative EBIT indicator', () => {
    const result = computeKeyRiskIndicators(null, null, 0, null, null)
    expect(result).not.toContain('Negatif faaliyet kârı (EBIT)')
  })

  it('139. x4 = 0.49 → fires high leverage', () => {
    const result = computeKeyRiskIndicators(null, null, null, 0.49, null)
    expect(result).toContain('Yüksek finansal kaldıraç riski')
  })

  it('140. x4 = 0.5 exactly → no high leverage (boundary not crossed)', () => {
    const result = computeKeyRiskIndicators(null, null, null, 0.5, null)
    expect(result).not.toContain('Yüksek finansal kaldıraç riski')
  })

  it('141. runway = 2.99 → fires critical indicator', () => {
    const result = computeKeyRiskIndicators(null, null, null, null, 2.99)
    expect(result).toContain('Kritik nakit akışı — 3 aydan az')
  })

  it('142. runway = 3.0 exactly → fires declining (not critical)', () => {
    const result = computeKeyRiskIndicators(null, null, null, null, 3.0)
    expect(result).toContain('Nakit rezervi azalıyor')
    expect(result).not.toContain('Kritik nakit akışı — 3 aydan az')
  })

  it('143. runway = 5.99 → fires declining cash reserve', () => {
    const result = computeKeyRiskIndicators(null, null, null, null, 5.99)
    expect(result).toContain('Nakit rezervi azalıyor')
  })

  it('144. runway = 6.0 exactly → no cash indicator fires', () => {
    const result = computeKeyRiskIndicators(null, null, null, null, 6.0)
    expect(result).not.toContain('Nakit rezervi azalıyor')
    expect(result).not.toContain('Kritik nakit akışı — 3 aydan az')
  })

  it('145. x1 and x4 both trigger, others null', () => {
    const result = computeKeyRiskIndicators(-0.1, null, null, 0.3, null)
    expect(result).toContain('Negatif işletme sermayesi')
    expect(result).toContain('Yüksek finansal kaldıraç riski')
    expect(result).toHaveLength(2)
  })

  it('146. only x2 negative → exactly one indicator', () => {
    const result = computeKeyRiskIndicators(0.1, -0.2, 0.05, 1.0, 12)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe('Birikmiş zarar mevcut')
  })

  it('147. large positive values → no indicators', () => {
    const result = computeKeyRiskIndicators(0.5, 0.4, 0.3, 5.0, 24)
    expect(result).toHaveLength(0)
  })

  it('148. x4 negative (very distressed) → fires high leverage', () => {
    const result = computeKeyRiskIndicators(null, null, null, -1.0, null)
    expect(result).toContain('Yüksek finansal kaldıraç riski')
  })

})

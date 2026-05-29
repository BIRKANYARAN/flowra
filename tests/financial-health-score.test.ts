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

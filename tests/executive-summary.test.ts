/**
 * Executive Summary Report Aggregator — unit tests
 *
 * Tests all 4 pure computation functions.
 * No DB or network calls — pure function tests only.
 */

import { describe, it, expect } from 'vitest'
import {
  computeOverallHealthScore,
  classifyOverallHealth,
  computeFinanceScore,
  buildExecutiveStatusLine,
} from '../lib/services/intelligence/executive-summary.service'

// ── computeOverallHealthScore ─────────────────────────────────────────────────

describe('computeOverallHealthScore', () => {

  // Test 1: equal inputs → weighted average equals the input value
  it('1. equal inputs (80 each) → 80', () => {
    const result = computeOverallHealthScore(80, 80, 80, 80)
    expect(result).toBe(80)
  })

  // Test 2: weights sum to 1 with known values
  it('2. checks finance weight at 35%', () => {
    // finance=100, all others=0 → result = 100×0.35 = 35
    const result = computeOverallHealthScore(100, 0, 0, 0)
    expect(result).toBe(35)
  })

  // Test 3: commercial weight at 25%
  it('3. checks commercial weight at 25%', () => {
    // commercial=100, all others=0 → result = 100×0.25 = 25
    const result = computeOverallHealthScore(0, 100, 0, 0)
    expect(result).toBe(25)
  })

  // Test 4: operations weight at 20%
  it('4. checks operations weight at 20%', () => {
    const result = computeOverallHealthScore(0, 0, 100, 0)
    expect(result).toBe(20)
  })

  // Test 5: partners weight at 20%
  it('5. checks partners weight at 20%', () => {
    const result = computeOverallHealthScore(0, 0, 0, 100)
    expect(result).toBe(20)
  })

  // Test 6: weights sum to 100 (35+25+20+20=100)
  it('6. all 100 → overall 100 (weights sum to 100%)', () => {
    const result = computeOverallHealthScore(100, 100, 100, 100)
    expect(result).toBe(100)
  })

  // Test 7: all zeros → 0
  it('7. all zeros → 0', () => {
    const result = computeOverallHealthScore(0, 0, 0, 0)
    expect(result).toBe(0)
  })

  // Test 8: mixed realistic values
  it('8. mixed realistic values → weighted correctly', () => {
    // finance=80×0.35=28, commercial=70×0.25=17.5, ops=90×0.20=18, partners=60×0.20=12
    // total = 28+17.5+18+12 = 75.5
    const result = computeOverallHealthScore(80, 70, 90, 60)
    expect(result).toBe(75.5)
  })

})

// ── classifyOverallHealth ─────────────────────────────────────────────────────

describe('classifyOverallHealth', () => {

  // Test 9: ≥80 → excellent
  it('9. 80 → excellent (boundary)', () => {
    expect(classifyOverallHealth(80)).toBe('excellent')
  })

  // Test 10: 100 → excellent
  it('10. 100 → excellent', () => {
    expect(classifyOverallHealth(100)).toBe('excellent')
  })

  // Test 11: 79 → good
  it('11. 79 → good', () => {
    expect(classifyOverallHealth(79)).toBe('good')
  })

  // Test 12: 65 → good (boundary)
  it('12. 65 → good (boundary)', () => {
    expect(classifyOverallHealth(65)).toBe('good')
  })

  // Test 13: 64 → fair
  it('13. 64 → fair', () => {
    expect(classifyOverallHealth(64)).toBe('fair')
  })

  // Test 14: 50 → fair (boundary)
  it('14. 50 → fair (boundary)', () => {
    expect(classifyOverallHealth(50)).toBe('fair')
  })

  // Test 15: 49 → poor
  it('15. 49 → poor', () => {
    expect(classifyOverallHealth(49)).toBe('poor')
  })

  // Test 16: 35 → poor (boundary)
  it('16. 35 → poor (boundary)', () => {
    expect(classifyOverallHealth(35)).toBe('poor')
  })

  // Test 17: 34 → critical
  it('17. 34 → critical', () => {
    expect(classifyOverallHealth(34)).toBe('critical')
  })

  // Test 18: 0 → critical
  it('18. 0 → critical', () => {
    expect(classifyOverallHealth(0)).toBe('critical')
  })

})

// ── computeFinanceScore ────────────────────────────────────────────────────────

describe('computeFinanceScore', () => {

  // Test 19: all zeros → 0
  it('19. all zero inputs → 0', () => {
    const result = computeFinanceScore(0, 0, 0)
    expect(result).toBe(0)
  })

  // Test 20: gross margin at 30% → normalized to 60
  it('20. 30% gross margin normalizes to 60', () => {
    // normGross=60, normRunway=0, normNet=0 → avg = 60/3 = 20
    const result = computeFinanceScore(30, 0, 0)
    expect(result).toBeCloseTo(20, 1)
  })

  // Test 21: gross margin at 50% → normalized to 100
  it('21. 50% gross margin normalizes to 100', () => {
    // normGross=100, normRunway=0, normNet=0 → 100/3 ≈ 33.33
    const result = computeFinanceScore(50, 0, 0)
    expect(result).toBeCloseTo(33.33, 1)
  })

  // Test 22: runway at 3 months → normalized to 30
  it('22. 3-month runway normalizes to 30', () => {
    // normGross=0, normRunway=30, normNet=0 → 30/3 = 10
    const result = computeFinanceScore(0, 3, 0)
    expect(result).toBeCloseTo(10, 1)
  })

  // Test 23: runway at 12 months → normalized to 100 (cap)
  it('23. 12-month runway (cap) normalizes to 100', () => {
    // normGross=0, normRunway=100, normNet=0 → 100/3 ≈ 33.33
    const result = computeFinanceScore(0, 12, 0)
    expect(result).toBeCloseTo(33.33, 1)
  })

  // Test 24: runway beyond 12 months → capped at 100
  it('24. 24-month runway also normalizes to 100 (capped)', () => {
    const at12 = computeFinanceScore(0, 12, 0)
    const at24 = computeFinanceScore(0, 24, 0)
    expect(at12).toBe(at24)
  })

  // Test 25: net margin at 10% → normalized to 50
  it('25. 10% net margin normalizes to 50', () => {
    // normGross=0, normRunway=0, normNet=50 → 50/3 ≈ 16.67
    const result = computeFinanceScore(0, 0, 10)
    expect(result).toBeCloseTo(16.67, 1)
  })

  // Test 26: net margin at 20% → normalized to 100
  it('26. 20% net margin normalizes to 100', () => {
    // normGross=0, normRunway=0, normNet=100 → 100/3 ≈ 33.33
    const result = computeFinanceScore(0, 0, 20)
    expect(result).toBeCloseTo(33.33, 1)
  })

  // Test 27: all perfect inputs → 100
  it('27. 50% gross, 12mo runway, 20% net → 100', () => {
    // normGross=100, normRunway=100, normNet=100 → avg = 100
    const result = computeFinanceScore(50, 12, 20)
    expect(result).toBe(100)
  })

})

// ── buildExecutiveStatusLine ───────────────────────────────────────────────────

describe('buildExecutiveStatusLine', () => {

  // Test 28: excellent with both concern and positive
  it('28. excellent, concern + positive → line contains both', () => {
    const line = buildExecutiveStatusLine('excellent', 'nakit akışı güçlü', 'büyüme devam ediyor')
    expect(line).toContain('mükemmel durumda')
    expect(line).toContain('büyüme devam ediyor')
    expect(line).toContain('nakit akışı güçlü')
  })

  // Test 29: excellent with null concern → fallback positive only
  it('29. excellent, null concern → uses positive only', () => {
    const line = buildExecutiveStatusLine('excellent', null, 'nakit akışı güçlü')
    expect(line).toContain('mükemmel durumda')
    expect(line).toContain('nakit akışı güçlü')
  })

  // Test 30: excellent with null positive → uses concern only
  it('30. excellent, null positive → uses concern only', () => {
    const line = buildExecutiveStatusLine('excellent', 'stok azalıyor', null)
    expect(line).toContain('mükemmel durumda')
    expect(line).toContain('stok azalıyor')
  })

  // Test 31: excellent with both null → generic fallback
  it('31. excellent, both null → generic fallback line', () => {
    const line = buildExecutiveStatusLine('excellent', null, null)
    expect(line).toContain('mükemmel durumda')
    expect(line.length).toBeGreaterThan(10)
  })

  // Test 32: poor health level
  it('32. poor → status line contains "dikkat gerektiriyor"', () => {
    const line = buildExecutiveStatusLine('poor', null, null)
    expect(line).toContain('dikkat gerektiriyor')
  })

  // Test 33: critical health level
  it('33. critical → status line contains "kritik durumda"', () => {
    const line = buildExecutiveStatusLine('critical', null, null)
    expect(line).toContain('kritik durumda')
  })

  // Test 34: fair health level
  it('34. fair → status line contains "orta düzeyde"', () => {
    const line = buildExecutiveStatusLine('fair', null, null)
    expect(line).toContain('orta düzeyde')
  })

  // Test 35: good health level
  it('35. good → status line contains "iyi durumda"', () => {
    const line = buildExecutiveStatusLine('good', null, null)
    expect(line).toContain('iyi durumda')
  })

  // Test 36: always starts with "Şirket"
  it('36. result always starts with "Şirket"', () => {
    const levels = ['excellent', 'good', 'fair', 'poor', 'critical'] as const
    for (const h of levels) {
      const line = buildExecutiveStatusLine(h, null, null)
      expect(line.startsWith('Şirket')).toBe(true)
    }
  })

  // Test 37: ends with a period
  it('37. result always ends with a period', () => {
    const line = buildExecutiveStatusLine('good', 'tahsilat süresi uzuyor', 'stok azalıyor')
    expect(line.endsWith('.')).toBe(true)
  })

  // Test 38: null concern + null positive for poor → not empty
  it('38. poor, both null → non-empty fallback', () => {
    const line = buildExecutiveStatusLine('poor', null, null)
    expect(line.length).toBeGreaterThan(20)
  })

})

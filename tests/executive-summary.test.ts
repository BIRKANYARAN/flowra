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

// ── computeOverallHealthScore — boundary & edge cases ────────────────────────

describe('computeOverallHealthScore — boundary & edge cases', () => {

  it('fractional inputs sum correctly', () => {
    // finance=50×0.35=17.5, commercial=50×0.25=12.5, ops=50×0.20=10, partners=50×0.20=10 → 50
    expect(computeOverallHealthScore(50, 50, 50, 50)).toBe(50)
  })

  it('only finance score at 100 gives 35', () => {
    expect(computeOverallHealthScore(100, 0, 0, 0)).toBe(35)
  })

  it('only commercial score at 100 gives 25', () => {
    expect(computeOverallHealthScore(0, 100, 0, 0)).toBe(25)
  })

  it('only operations score at 100 gives 20', () => {
    expect(computeOverallHealthScore(0, 0, 100, 0)).toBe(20)
  })

  it('only partners score at 100 gives 20', () => {
    expect(computeOverallHealthScore(0, 0, 0, 100)).toBe(20)
  })

  it('weights sum check: all-100 gives 100', () => {
    expect(computeOverallHealthScore(100, 100, 100, 100)).toBe(100)
  })

  it('result is rounded to 2 decimals', () => {
    // finance=33×0.35=11.55, comm=33×0.25=8.25, ops=33×0.20=6.6, partners=33×0.20=6.6 → 33
    const result = computeOverallHealthScore(33, 33, 33, 33)
    expect(result).toBe(33)
  })

  it('ops+partners = 40% combined', () => {
    // ops=100, partners=100, others=0 → 20+20=40
    expect(computeOverallHealthScore(0, 0, 100, 100)).toBe(40)
  })

  it('finance+commercial = 60% combined', () => {
    expect(computeOverallHealthScore(100, 100, 0, 0)).toBe(60)
  })

  it('decimal precision: 1/3 each of three weights adds up', () => {
    // Verify no rounding drift: finance=10, commercial=10, ops=10, partners=10
    const result = computeOverallHealthScore(10, 10, 10, 10)
    expect(result).toBe(10)
  })
})

// ── classifyOverallHealth — exhaustive boundaries ────────────────────────────

describe('classifyOverallHealth — all boundaries', () => {

  it('80 is exactly the excellent boundary', () => {
    expect(classifyOverallHealth(80)).toBe('excellent')
    expect(classifyOverallHealth(79.99)).toBe('good')
  })

  it('65 is exactly the good boundary', () => {
    expect(classifyOverallHealth(65)).toBe('good')
    expect(classifyOverallHealth(64.99)).toBe('fair')
  })

  it('50 is exactly the fair boundary', () => {
    expect(classifyOverallHealth(50)).toBe('fair')
    expect(classifyOverallHealth(49.99)).toBe('poor')
  })

  it('35 is exactly the poor boundary', () => {
    expect(classifyOverallHealth(35)).toBe('poor')
    expect(classifyOverallHealth(34.99)).toBe('critical')
  })

  it('0 is critical', () => {
    expect(classifyOverallHealth(0)).toBe('critical')
  })

  it('100 is excellent', () => {
    expect(classifyOverallHealth(100)).toBe('excellent')
  })

  it('midpoint 72 is good', () => {
    expect(classifyOverallHealth(72)).toBe('good')
  })

  it('midpoint 57 is fair', () => {
    expect(classifyOverallHealth(57)).toBe('fair')
  })

  it('midpoint 42 is poor', () => {
    expect(classifyOverallHealth(42)).toBe('poor')
  })

  it('midpoint 17 is critical', () => {
    expect(classifyOverallHealth(17)).toBe('critical')
  })
})

// ── computeFinanceScore — detailed normalization tests ────────────────────────

describe('computeFinanceScore — gross margin normalization', () => {

  it('negative gross margin treated as 0', () => {
    const neg = computeFinanceScore(-10, 0, 0)
    const zero = computeFinanceScore(0, 0, 0)
    expect(neg).toBe(zero)
  })

  it('gross 15% → normGross=30 → score=30/3=10', () => {
    // normGross = (15/30)*60 = 30; /3 = 10
    expect(computeFinanceScore(15, 0, 0)).toBeCloseTo(10, 1)
  })

  it('gross 40% → normGross=80 → score=80/3≈26.67', () => {
    // In range [30,50]: 60 + ((40-30)/20)*40 = 60+20 = 80; /3 ≈ 26.67
    expect(computeFinanceScore(40, 0, 0)).toBeCloseTo(26.67, 1)
  })

  it('gross above 50% caps at 100', () => {
    const at50 = computeFinanceScore(50, 0, 0)
    const at80 = computeFinanceScore(80, 0, 0)
    expect(at50).toBe(at80)
  })
})

describe('computeFinanceScore — runway normalization', () => {

  it('negative runway treated as 0', () => {
    const neg = computeFinanceScore(0, -5, 0)
    const zero = computeFinanceScore(0, 0, 0)
    expect(neg).toBe(zero)
  })

  it('runway 1.5 months → normRunway=(1.5/3)*30=15 → score=15/3=5', () => {
    expect(computeFinanceScore(0, 1.5, 0)).toBeCloseTo(5, 1)
  })

  it('runway 6 months → normRunway=30+((6-3)/9)*70=53.33 → score≈17.78', () => {
    const normRunway = 30 + ((6 - 3) / 9) * 70
    expect(computeFinanceScore(0, 6, 0)).toBeCloseTo(normRunway / 3, 1)
  })

  it('runway 9 months → in upper segment', () => {
    const normRunway = 30 + ((9 - 3) / 9) * 70  // = 30 + 46.67 = 76.67
    expect(computeFinanceScore(0, 9, 0)).toBeCloseTo(normRunway / 3, 1)
  })

  it('runway 15 months caps same as 12', () => {
    expect(computeFinanceScore(0, 15, 0)).toBe(computeFinanceScore(0, 12, 0))
  })
})

describe('computeFinanceScore — net margin normalization', () => {

  it('negative net margin treated as 0', () => {
    const neg = computeFinanceScore(0, 0, -5)
    const zero = computeFinanceScore(0, 0, 0)
    expect(neg).toBe(zero)
  })

  it('net 5% → normNet=(5/10)*50=25 → score=25/3≈8.33', () => {
    expect(computeFinanceScore(0, 0, 5)).toBeCloseTo(8.33, 1)
  })

  it('net 15% → normNet=50+((15-10)/10)*50=75 → score=75/3=25', () => {
    expect(computeFinanceScore(0, 0, 15)).toBeCloseTo(25, 1)
  })

  it('net above 20% caps at 100 contribution', () => {
    const at20 = computeFinanceScore(0, 0, 20)
    const at30 = computeFinanceScore(0, 0, 30)
    expect(at20).toBe(at30)
  })
})

// ── buildExecutiveStatusLine — additional detail tests ───────────────────────

describe('buildExecutiveStatusLine — fallback content', () => {

  it('excellent fallback contains "nakit akışı güçlü"', () => {
    const line = buildExecutiveStatusLine('excellent', null, null)
    expect(line).toContain('nakit akışı güçlü')
  })

  it('good fallback contains "temel göstergeler"', () => {
    const line = buildExecutiveStatusLine('good', null, null)
    expect(line).toContain('temel göstergeler')
  })

  it('fair fallback contains "bazı alanlarda"', () => {
    const line = buildExecutiveStatusLine('fair', null, null)
    expect(line).toContain('bazı alanlarda')
  })

  it('poor fallback contains "birden fazla"', () => {
    const line = buildExecutiveStatusLine('poor', null, null)
    expect(line).toContain('birden fazla')
  })

  it('critical fallback contains "acil aksiyon"', () => {
    const line = buildExecutiveStatusLine('critical', null, null)
    expect(line).toContain('acil aksiyon')
  })

  it('concern and positive are separated by a comma when both provided', () => {
    const line = buildExecutiveStatusLine('good', 'concern text', 'positive text')
    // Format: "Şirket iyi durumda — positive text, concern text."
    expect(line).toContain(',')
  })

  it('only concern → no trailing comma', () => {
    const line = buildExecutiveStatusLine('fair', 'tahsilat süresi uzuyor', null)
    // Should end with "." and not have the concern duplicated
    expect(line.endsWith('.')).toBe(true)
    expect(line).toContain('tahsilat süresi uzuyor')
  })

  it('only positive → no trailing comma', () => {
    const line = buildExecutiveStatusLine('fair', null, 'gelir artıyor')
    expect(line.endsWith('.')).toBe(true)
    expect(line).toContain('gelir artıyor')
  })

  it('all five health levels produce non-empty strings', () => {
    const levels = ['excellent', 'good', 'fair', 'poor', 'critical'] as const
    for (const h of levels) {
      const line = buildExecutiveStatusLine(h, null, null)
      expect(typeof line).toBe('string')
      expect(line.length).toBeGreaterThan(0)
    }
  })

  it('em dash separator is present when concern or positive provided', () => {
    const line = buildExecutiveStatusLine('good', 'sorun var', null)
    expect(line).toContain('—')
  })

  it('em dash separator is present in fallback lines', () => {
    const line = buildExecutiveStatusLine('excellent', null, null)
    expect(line).toContain('—')
  })
})

// ── computeOverallHealthScore — additional formula verification ───────────────

describe('computeOverallHealthScore — precise formula checks', () => {

  it('finance=100 commercial=0 ops=0 partners=0 → 35', () => {
    expect(computeOverallHealthScore(100, 0, 0, 0)).toBe(35)
  })

  it('finance=0 commercial=100 ops=0 partners=0 → 25', () => {
    expect(computeOverallHealthScore(0, 100, 0, 0)).toBe(25)
  })

  it('finance=0 commercial=0 ops=100 partners=0 → 20', () => {
    expect(computeOverallHealthScore(0, 0, 100, 0)).toBe(20)
  })

  it('finance=0 commercial=0 ops=0 partners=100 → 20', () => {
    expect(computeOverallHealthScore(0, 0, 0, 100)).toBe(20)
  })

  it('all inputs 100 → 100 (weights sum to 1)', () => {
    expect(computeOverallHealthScore(100, 100, 100, 100)).toBe(100)
  })

  it('all inputs 0 → 0', () => {
    expect(computeOverallHealthScore(0, 0, 0, 0)).toBe(0)
  })

  it('finance=60 commercial=60 ops=60 partners=60 → 60', () => {
    expect(computeOverallHealthScore(60, 60, 60, 60)).toBe(60)
  })

  it('mixed: finance=90 commercial=50 ops=70 partners=80 → computed value', () => {
    // 90*0.35 + 50*0.25 + 70*0.20 + 80*0.20
    // = 31.5 + 12.5 + 14 + 16 = 74
    expect(computeOverallHealthScore(90, 50, 70, 80)).toBe(74)
  })

  it('mixed: finance=40 commercial=60 ops=80 partners=20 → computed value', () => {
    // 40*0.35 + 60*0.25 + 80*0.20 + 20*0.20
    // = 14 + 15 + 16 + 4 = 49
    expect(computeOverallHealthScore(40, 60, 80, 20)).toBe(49)
  })

  it('result is a number type', () => {
    const result = computeOverallHealthScore(50, 50, 50, 50)
    expect(typeof result).toBe('number')
  })

  it('finance=1 commercial=1 ops=1 partners=1 → 1', () => {
    expect(computeOverallHealthScore(1, 1, 1, 1)).toBe(1)
  })

  it('only ops=100, partners=100 → 40 (ops+partners = 40%)', () => {
    expect(computeOverallHealthScore(0, 0, 100, 100)).toBe(40)
  })

  it('only finance=100, commercial=100 → 60 (finance+commercial = 60%)', () => {
    expect(computeOverallHealthScore(100, 100, 0, 0)).toBe(60)
  })
})

// ── classifyOverallHealth — classification ladder verification ────────────────

describe('classifyOverallHealth — classification ladder', () => {

  it('score 81 → excellent', () => {
    expect(classifyOverallHealth(81)).toBe('excellent')
  })

  it('score 90 → excellent', () => {
    expect(classifyOverallHealth(90)).toBe('excellent')
  })

  it('score 70 → good', () => {
    expect(classifyOverallHealth(70)).toBe('good')
  })

  it('score 66 → good', () => {
    expect(classifyOverallHealth(66)).toBe('good')
  })

  it('score 55 → fair', () => {
    expect(classifyOverallHealth(55)).toBe('fair')
  })

  it('score 51 → fair', () => {
    expect(classifyOverallHealth(51)).toBe('fair')
  })

  it('score 45 → poor', () => {
    expect(classifyOverallHealth(45)).toBe('poor')
  })

  it('score 36 → poor', () => {
    expect(classifyOverallHealth(36)).toBe('poor')
  })

  it('score 20 → critical', () => {
    expect(classifyOverallHealth(20)).toBe('critical')
  })

  it('score 1 → critical', () => {
    expect(classifyOverallHealth(1)).toBe('critical')
  })

  it('result is always a string', () => {
    const levels = [0, 10, 35, 50, 65, 80, 100]
    for (const s of levels) {
      expect(typeof classifyOverallHealth(s)).toBe('string')
    }
  })
})

// ── computeFinanceScore — combined positive/negative net margin ───────────────

describe('computeFinanceScore — net margin positive and negative cases', () => {

  it('positive net margin 8% → score above 0', () => {
    const score = computeFinanceScore(0, 0, 8)
    expect(score).toBeGreaterThan(0)
  })

  it('negative net margin -5% → treated as 0 → same as 0% net', () => {
    const negScore = computeFinanceScore(0, 0, -5)
    const zeroScore = computeFinanceScore(0, 0, 0)
    expect(negScore).toBe(zeroScore)
  })

  it('net margin exactly 10% → normNet=50 → contribution = 50/3 ≈ 16.67', () => {
    expect(computeFinanceScore(0, 0, 10)).toBeCloseTo(16.67, 1)
  })

  it('net margin exactly 20% → normNet=100 → contribution = 100/3 ≈ 33.33', () => {
    expect(computeFinanceScore(0, 0, 20)).toBeCloseTo(33.33, 1)
  })

  it('net margin 25% (above cap) → same score as 20%', () => {
    expect(computeFinanceScore(0, 0, 25)).toBe(computeFinanceScore(0, 0, 20))
  })

  it('all three at perfect values (gross=50, runway=12, net=20) → 100', () => {
    expect(computeFinanceScore(50, 12, 20)).toBe(100)
  })

  it('all three at zero → 0', () => {
    expect(computeFinanceScore(0, 0, 0)).toBe(0)
  })

  it('gross=30 → normGross=60, runway=0, net=0 → score = 60/3 = 20', () => {
    expect(computeFinanceScore(30, 0, 0)).toBeCloseTo(20, 1)
  })
})

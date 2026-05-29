/**
 * Company Financial Health Report — unit tests for pure helpers
 *
 * Tests: gradeToScore, scoreToGrade, computeWeightedScore, buildExecutiveSummary
 * No DB or network calls — all pure function tests.
 */

import { describe, it, expect } from 'vitest'
import {
  gradeToScore,
  scoreToGrade,
  computeWeightedScore,
  buildExecutiveSummary,
} from '../lib/services/reports/health-report.service'
import type { CompanyHealthReport } from '../lib/services/reports/health-report.service'

// ── Helper: build a minimal sections object ───────────────────────────────────

function makeSection(grade: 'A' | 'B' | 'C' | 'D' | 'F' | null) {
  return {
    title:       'Test',
    grade,
    score:       grade ? gradeToScore(grade) : null,
    key_metrics: [],
    insight:     '',
  }
}

function makeSections(
  liq:  'A' | 'B' | 'C' | 'D' | 'F' | null = 'A',
  prof: 'A' | 'B' | 'C' | 'D' | 'F' | null = 'A',
  rec:  'A' | 'B' | 'C' | 'D' | 'F' | null = 'A',
  part: 'A' | 'B' | 'C' | 'D' | 'F' | null = 'A',
  op:   'A' | 'B' | 'C' | 'D' | 'F' | null = 'A',
): CompanyHealthReport['sections'] {
  return {
    liquidity:            makeSection(liq),
    profitability:        makeSection(prof),
    receivables:          makeSection(rec),
    partner_obligations:  makeSection(part),
    operational:          makeSection(op),
  }
}

// ── gradeToScore ──────────────────────────────────────────────────────────────

describe('gradeToScore — pure', () => {
  it('1. A → 100', () => {
    expect(gradeToScore('A')).toBe(100)
  })

  it('2. B → 80', () => {
    expect(gradeToScore('B')).toBe(80)
  })

  it('3. C → 60', () => {
    expect(gradeToScore('C')).toBe(60)
  })

  it('4. D → 40', () => {
    expect(gradeToScore('D')).toBe(40)
  })

  it('5. F → 20', () => {
    expect(gradeToScore('F')).toBe(20)
  })

  it('6. all grades produce distinct scores', () => {
    const scores = (['A', 'B', 'C', 'D', 'F'] as const).map(gradeToScore)
    const unique = new Set(scores)
    expect(unique.size).toBe(5)
  })

  it('7. A has the highest score', () => {
    const grades = (['A', 'B', 'C', 'D', 'F'] as const)
    const scores = grades.map(gradeToScore)
    expect(Math.max(...scores)).toBe(gradeToScore('A'))
  })

  it('8. F has the lowest score', () => {
    const grades = (['A', 'B', 'C', 'D', 'F'] as const)
    const scores = grades.map(gradeToScore)
    expect(Math.min(...scores)).toBe(gradeToScore('F'))
  })

  it('9. scores are in descending order A > B > C > D > F', () => {
    expect(gradeToScore('A')).toBeGreaterThan(gradeToScore('B'))
    expect(gradeToScore('B')).toBeGreaterThan(gradeToScore('C'))
    expect(gradeToScore('C')).toBeGreaterThan(gradeToScore('D'))
    expect(gradeToScore('D')).toBeGreaterThan(gradeToScore('F'))
  })

  it('10. all scores are between 0 and 100 inclusive', () => {
    for (const grade of ['A', 'B', 'C', 'D', 'F'] as const) {
      const score = gradeToScore(grade)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
    }
  })
})

// ── scoreToGrade ──────────────────────────────────────────────────────────────

describe('scoreToGrade — boundary values', () => {
  it('11. 90 → A (boundary)', () => {
    expect(scoreToGrade(90)).toBe('A')
  })

  it('12. 75 → B (boundary)', () => {
    expect(scoreToGrade(75)).toBe('B')
  })

  it('13. 60 → C (boundary)', () => {
    expect(scoreToGrade(60)).toBe('C')
  })

  it('14. 45 → D (boundary)', () => {
    expect(scoreToGrade(45)).toBe('D')
  })

  it('15. 44 → F (just below D boundary)', () => {
    expect(scoreToGrade(44)).toBe('F')
  })

  it('16. 100 → A', () => {
    expect(scoreToGrade(100)).toBe('A')
  })

  it('17. 0 → F', () => {
    expect(scoreToGrade(0)).toBe('F')
  })

  it('18. 89 → B (just below A boundary)', () => {
    expect(scoreToGrade(89)).toBe('B')
  })

  it('19. 74 → C (just below B boundary)', () => {
    expect(scoreToGrade(74)).toBe('C')
  })

  it('20. 59 → D (just below C boundary)', () => {
    expect(scoreToGrade(59)).toBe('D')
  })

  it('21. gradeToScore and scoreToGrade are approximate inverses (A, B, C only)', () => {
    // gradeToScore values: A=100, B=80, C=60 all map back correctly.
    // D=40 < threshold 45 so scoreToGrade(40)='F'; F=20 < 45 so scoreToGrade(20)='F'.
    // Only A, B, C are perfectly round-trippable.
    for (const grade of ['A', 'B', 'C'] as const) {
      const score = gradeToScore(grade)
      expect(scoreToGrade(score)).toBe(grade)
    }
    // D score (40) is below the 45 threshold, so it maps to F
    expect(scoreToGrade(gradeToScore('D'))).toBe('F')
  })

  it('22. midpoint of A range (95) → A', () => {
    expect(scoreToGrade(95)).toBe('A')
  })

  it('23. midpoint of B range (82) → B', () => {
    expect(scoreToGrade(82)).toBe('B')
  })

  it('24. midpoint of C range (67) → C', () => {
    expect(scoreToGrade(67)).toBe('C')
  })

  it('25. midpoint of D range (52) → D', () => {
    expect(scoreToGrade(52)).toBe('D')
  })

  it('26. midpoint of F range (10) → F', () => {
    expect(scoreToGrade(10)).toBe('F')
  })
})

// ── computeWeightedScore ──────────────────────────────────────────────────────

describe('computeWeightedScore — weighted average', () => {
  it('27. all null scores → 0', () => {
    const result = computeWeightedScore([
      { score: null, weight: 30 },
      { score: null, weight: 25 },
      { score: null, weight: 20 },
    ])
    expect(result).toBe(0)
  })

  it('28. all A scores (100) with full weights → 100', () => {
    const result = computeWeightedScore([
      { score: 100, weight: 30 },
      { score: 100, weight: 25 },
      { score: 100, weight: 20 },
      { score: 100, weight: 15 },
      { score: 100, weight: 10 },
    ])
    expect(result).toBe(100)
  })

  it('29. all F scores (20) → 20', () => {
    const result = computeWeightedScore([
      { score: 20, weight: 30 },
      { score: 20, weight: 25 },
      { score: 20, weight: 20 },
      { score: 20, weight: 15 },
      { score: 20, weight: 10 },
    ])
    expect(result).toBe(20)
  })

  it('30. mixed null and valid scores — redistributes weight', () => {
    // Only one valid section (weight 30, score 100)
    // Other sections null → should return 100
    const result = computeWeightedScore([
      { score: 100, weight: 30 },
      { score: null, weight: 25 },
      { score: null, weight: 20 },
    ])
    expect(result).toBe(100)
  })

  it('31. equal weights, two different scores → correct average', () => {
    // 100 × 50 + 20 × 50 = 6000, / 100 = 60
    const result = computeWeightedScore([
      { score: 100, weight: 50 },
      { score:  20, weight: 50 },
    ])
    expect(result).toBe(60)
  })

  it('32. unequal weights produce weighted result', () => {
    // 80 × 70 + 40 × 30 = 5600 + 1200 = 6800, / 100 = 68
    const result = computeWeightedScore([
      { score: 80, weight: 70 },
      { score: 40, weight: 30 },
    ])
    expect(result).toBe(68)
  })

  it('33. single section → returns that score', () => {
    expect(computeWeightedScore([{ score: 75, weight: 100 }])).toBe(75)
  })

  it('34. empty array → 0', () => {
    expect(computeWeightedScore([])).toBe(0)
  })

  it('35. standard 5-section weights (30+25+20+15+10=100) — full health scenario', () => {
    // Mix of grades: A(100) liq, B(80) prof, C(60) rec, D(40) part, F(20) op
    // 100×30 + 80×25 + 60×20 + 40×15 + 20×10 = 3000+2000+1200+600+200 = 7000 / 100 = 70
    const result = computeWeightedScore([
      { score: 100, weight: 30 },
      { score:  80, weight: 25 },
      { score:  60, weight: 20 },
      { score:  40, weight: 15 },
      { score:  20, weight: 10 },
    ])
    expect(result).toBe(70)
  })

  it('36. null section excluded from weight denominator — redistributed', () => {
    // score 60 weight 20, null weight 80 → result 60 (only valid contributes)
    const result = computeWeightedScore([
      { score: 60, weight: 20 },
      { score: null, weight: 80 },
    ])
    expect(result).toBe(60)
  })

  it('37. result is rounded to integer (Math.round)', () => {
    // 79 × 33 + 80 × 33 + 81 × 34 = 2607 + 2640 + 2754 = 8001 / 100 = 80.01 → 80
    const result = computeWeightedScore([
      { score: 79, weight: 33 },
      { score: 80, weight: 33 },
      { score: 81, weight: 34 },
    ])
    expect(Number.isInteger(result)).toBe(true)
  })
})

// ── buildExecutiveSummary ─────────────────────────────────────────────────────

describe('buildExecutiveSummary — tone checks', () => {
  it('38. grade A → positive tone (contains "sağlıklı" or "güçlü")', () => {
    const summary = buildExecutiveSummary('A', makeSections('A', 'A', 'A', 'A', 'A'))
    const positive = summary.includes('sağlıklı') || summary.includes('güçlü') || summary.includes('iyi')
    expect(positive).toBe(true)
  })

  it('39. grade F → urgent tone (contains "kritik" or "acil")', () => {
    const summary = buildExecutiveSummary('F', makeSections('F', 'F', 'F', 'F', 'F'))
    const urgent = summary.includes('kritik') || summary.includes('acil') || summary.includes('Kritik')
    expect(urgent).toBe(true)
  })

  it('40. grade A → does NOT contain "kritik"', () => {
    const summary = buildExecutiveSummary('A', makeSections())
    expect(summary.toLowerCase()).not.toContain('kritik')
  })

  it('41. grade F with weak liquidity → mentions nakit or nakit akışı', () => {
    const summary = buildExecutiveSummary('F', makeSections('F', 'A', 'A', 'A', 'A'))
    expect(summary.toLowerCase()).toContain('nakit')
  })

  it('42. grade B → result is non-empty string', () => {
    const summary = buildExecutiveSummary('B', makeSections('B', 'B', 'B', 'B', 'B'))
    expect(typeof summary).toBe('string')
    expect(summary.length).toBeGreaterThan(10)
  })

  it('43. grade C → result is non-empty string mentioning "orta" or "dikkat"', () => {
    const summary = buildExecutiveSummary('C', makeSections('C', 'C', 'C', 'C', 'C'))
    const relevant = summary.includes('orta') || summary.includes('dikkat') || summary.includes('gerekiyor')
    expect(relevant).toBe(true)
  })

  it('44. grade D with weak receivables → mentions alacak', () => {
    const summary = buildExecutiveSummary('D', makeSections('A', 'A', 'F', 'A', 'A'))
    expect(summary.toLowerCase()).toContain('alacak')
  })

  it('45. grade D → always returns a non-empty string', () => {
    const summary = buildExecutiveSummary('D', makeSections('D', 'D', 'D', 'D', 'D'))
    expect(summary.length).toBeGreaterThan(0)
  })

  it('46. grade F with weak profitability → mentions karlılık', () => {
    const summary = buildExecutiveSummary('F', makeSections('A', 'F', 'A', 'A', 'A'))
    expect(summary.toLowerCase()).toContain('karlılık')
  })

  it('47. grade B with weak sections → mentions iyileştirme or optimization hint', () => {
    const summary = buildExecutiveSummary('B', makeSections('B', 'F', 'A', 'A', 'A'))
    const hasHint = summary.includes('iyileştirme') || summary.includes('A seviyesine') || summary.includes('iyi')
    expect(hasHint).toBe(true)
  })

  it('48. grade C — does NOT produce empty string', () => {
    const summary = buildExecutiveSummary('C', makeSections('C', 'C', 'C', 'C', 'C'))
    expect(summary.trim().length).toBeGreaterThan(0)
  })

  it('49. unknown grade returns a fallback string', () => {
    const summary = buildExecutiveSummary('X', makeSections())
    expect(typeof summary).toBe('string')
    expect(summary.length).toBeGreaterThan(0)
  })

  it('50. grade F with weak partner obligations → mentions ortak borç', () => {
    const summary = buildExecutiveSummary('F', makeSections('A', 'A', 'A', 'F', 'A'))
    expect(summary.toLowerCase()).toContain('ortak')
  })
})

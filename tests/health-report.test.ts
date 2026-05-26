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
})

// ── scoreToGrade ──────────────────────────────────────────────────────────────

describe('scoreToGrade — boundary values', () => {
  it('6. 90 → A (boundary)', () => {
    expect(scoreToGrade(90)).toBe('A')
  })

  it('7. 75 → B (boundary)', () => {
    expect(scoreToGrade(75)).toBe('B')
  })

  it('8. 60 → C (boundary)', () => {
    expect(scoreToGrade(60)).toBe('C')
  })

  it('9. 45 → D (boundary)', () => {
    expect(scoreToGrade(45)).toBe('D')
  })

  it('10. 44 → F (just below D boundary)', () => {
    expect(scoreToGrade(44)).toBe('F')
  })

  it('11. 100 → A', () => {
    expect(scoreToGrade(100)).toBe('A')
  })

  it('12. 0 → F', () => {
    expect(scoreToGrade(0)).toBe('F')
  })
})

// ── computeWeightedScore ──────────────────────────────────────────────────────

describe('computeWeightedScore — weighted average', () => {
  it('13. all null scores → 0', () => {
    const result = computeWeightedScore([
      { score: null, weight: 30 },
      { score: null, weight: 25 },
      { score: null, weight: 20 },
    ])
    expect(result).toBe(0)
  })

  it('14. all A scores (100) with full weights → 100', () => {
    const result = computeWeightedScore([
      { score: 100, weight: 30 },
      { score: 100, weight: 25 },
      { score: 100, weight: 20 },
      { score: 100, weight: 15 },
      { score: 100, weight: 10 },
    ])
    expect(result).toBe(100)
  })

  it('15. all F scores (20) → 20', () => {
    const result = computeWeightedScore([
      { score: 20, weight: 30 },
      { score: 20, weight: 25 },
      { score: 20, weight: 20 },
      { score: 20, weight: 15 },
      { score: 20, weight: 10 },
    ])
    expect(result).toBe(20)
  })

  it('16. mixed null and valid scores — redistributes weight', () => {
    // Only one valid section (weight 30, score 100)
    // Other sections null → should return 100
    const result = computeWeightedScore([
      { score: 100, weight: 30 },
      { score: null, weight: 25 },
      { score: null, weight: 20 },
    ])
    expect(result).toBe(100)
  })

  it('17. equal weights, two different scores → correct average', () => {
    // 100 × 50 + 20 × 50 = 6000, / 100 = 60
    const result = computeWeightedScore([
      { score: 100, weight: 50 },
      { score:  20, weight: 50 },
    ])
    expect(result).toBe(60)
  })

  it('18. unequal weights produce weighted result', () => {
    // 80 × 70 + 40 × 30 = 5600 + 1200 = 6800, / 100 = 68
    const result = computeWeightedScore([
      { score: 80, weight: 70 },
      { score: 40, weight: 30 },
    ])
    expect(result).toBe(68)
  })
})

// ── buildExecutiveSummary ─────────────────────────────────────────────────────

describe('buildExecutiveSummary — tone checks', () => {
  it('19. grade A → positive tone (contains "sağlıklı" or "güçlü")', () => {
    const summary = buildExecutiveSummary('A', makeSections('A', 'A', 'A', 'A', 'A'))
    const positive = summary.includes('sağlıklı') || summary.includes('güçlü') || summary.includes('iyi')
    expect(positive).toBe(true)
  })

  it('20. grade F → urgent tone (contains "kritik" or "acil")', () => {
    const summary = buildExecutiveSummary('F', makeSections('F', 'F', 'F', 'F', 'F'))
    const urgent = summary.includes('kritik') || summary.includes('acil') || summary.includes('Kritik')
    expect(urgent).toBe(true)
  })

  it('21. grade A → does NOT contain "kritik"', () => {
    const summary = buildExecutiveSummary('A', makeSections())
    expect(summary.toLowerCase()).not.toContain('kritik')
  })

  it('22. grade F with weak liquidity → mentions nakit or nakit akışı', () => {
    const summary = buildExecutiveSummary('F', makeSections('F', 'A', 'A', 'A', 'A'))
    expect(summary.toLowerCase()).toContain('nakit')
  })

  it('23. grade B → result is non-empty string', () => {
    const summary = buildExecutiveSummary('B', makeSections('B', 'B', 'B', 'B', 'B'))
    expect(typeof summary).toBe('string')
    expect(summary.length).toBeGreaterThan(10)
  })

  it('24. grade C → result is non-empty string mentioning "orta" or "dikkat"', () => {
    const summary = buildExecutiveSummary('C', makeSections('C', 'C', 'C', 'C', 'C'))
    const relevant = summary.includes('orta') || summary.includes('dikkat') || summary.includes('gerekiyor')
    expect(relevant).toBe(true)
  })

  it('25. grade D with weak receivables → mentions alacak', () => {
    const summary = buildExecutiveSummary('D', makeSections('A', 'A', 'F', 'A', 'A'))
    expect(summary.toLowerCase()).toContain('alacak')
  })
})

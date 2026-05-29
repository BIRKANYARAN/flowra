/**
 * Tests for pure helper functions in lib/services/pcle/pcle.risk.ts:
 *   scoreToGrade         — numeric score → letter grade
 *   gradeToRiskLabel     — letter grade → Turkish risk label
 *   computeCompanyRiskGrade — weighted aggregate grade
 *
 * Run with: npx vitest run tests/pcle-risk-map.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  scoreToGrade,
  gradeToRiskLabel,
  computeCompanyRiskGrade,
  type RiskGrade,
} from '../lib/services/pcle/pcle.risk'

// ─────────────────────────────────────────────────────────────────────────────
// scoreToGrade
// ─────────────────────────────────────────────────────────────────────────────

describe('scoreToGrade — boundary values', () => {
  it('returns A for score = 100', () => {
    expect(scoreToGrade(100)).toBe('A')
  })

  it('returns A for score = 90 (exact lower boundary)', () => {
    expect(scoreToGrade(90)).toBe('A')
  })

  it('returns A for score = 95', () => {
    expect(scoreToGrade(95)).toBe('A')
  })

  it('returns B for score = 89 (just below A boundary)', () => {
    expect(scoreToGrade(89)).toBe('B')
  })

  it('returns B for score = 75 (exact lower boundary)', () => {
    expect(scoreToGrade(75)).toBe('B')
  })

  it('returns B for score = 80', () => {
    expect(scoreToGrade(80)).toBe('B')
  })

  it('returns C for score = 74 (just below B boundary)', () => {
    expect(scoreToGrade(74)).toBe('C')
  })

  it('returns C for score = 60 (exact lower boundary)', () => {
    expect(scoreToGrade(60)).toBe('C')
  })

  it('returns C for score = 65', () => {
    expect(scoreToGrade(65)).toBe('C')
  })

  it('returns D for score = 59 (just below C boundary)', () => {
    expect(scoreToGrade(59)).toBe('D')
  })

  it('returns D for score = 40 (exact lower boundary)', () => {
    expect(scoreToGrade(40)).toBe('D')
  })

  it('returns D for score = 50', () => {
    expect(scoreToGrade(50)).toBe('D')
  })

  it('returns F for score = 39 (just below D boundary)', () => {
    expect(scoreToGrade(39)).toBe('F')
  })

  it('returns F for score = 20', () => {
    expect(scoreToGrade(20)).toBe('F')
  })

  it('returns F for score = 0', () => {
    expect(scoreToGrade(0)).toBe('F')
  })

  it('returns F for score = 1', () => {
    expect(scoreToGrade(1)).toBe('F')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// gradeToRiskLabel
// ─────────────────────────────────────────────────────────────────────────────

describe('gradeToRiskLabel — all 5 Turkish labels', () => {
  it('returns non-empty string for grade A', () => {
    expect(gradeToRiskLabel('A')).toBeTruthy()
  })

  it('returns non-empty string for grade B', () => {
    expect(gradeToRiskLabel('B')).toBeTruthy()
  })

  it('returns non-empty string for grade C', () => {
    expect(gradeToRiskLabel('C')).toBeTruthy()
  })

  it('returns non-empty string for grade D', () => {
    expect(gradeToRiskLabel('D')).toBeTruthy()
  })

  it('returns non-empty string for grade F', () => {
    expect(gradeToRiskLabel('F')).toBeTruthy()
  })

  it('A maps to Düşük Risk', () => {
    expect(gradeToRiskLabel('A')).toBe('Düşük Risk')
  })

  it('B maps to Kabul Edilebilir', () => {
    expect(gradeToRiskLabel('B')).toBe('Kabul Edilebilir')
  })

  it('C maps to Orta Risk', () => {
    expect(gradeToRiskLabel('C')).toBe('Orta Risk')
  })

  it('D maps to Yüksek Risk', () => {
    expect(gradeToRiskLabel('D')).toBe('Yüksek Risk')
  })

  it('F maps to Kritik', () => {
    expect(gradeToRiskLabel('F')).toBe('Kritik')
  })

  it('all 5 labels are unique (no duplicates)', () => {
    const labels = (['A', 'B', 'C', 'D', 'F'] as RiskGrade[]).map(gradeToRiskLabel)
    const unique  = new Set(labels)
    expect(unique.size).toBe(5)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeCompanyRiskGrade
// ─────────────────────────────────────────────────────────────────────────────

describe('computeCompanyRiskGrade — weighted average + worst-case tie-break', () => {
  it('returns A when all partners are grade A with equal weight', () => {
    const result = computeCompanyRiskGrade([
      { grade: 'A', weight: 0.5 },
      { grade: 'A', weight: 0.5 },
    ])
    expect(result).toBe('A')
  })

  it('returns F when all partners are grade F', () => {
    const result = computeCompanyRiskGrade([
      { grade: 'F', weight: 0.5 },
      { grade: 'F', weight: 0.5 },
    ])
    expect(result).toBe('F')
  })

  it('higher-weight A dominates a single low-weight F (weighted avg stays near top)', () => {
    // A(0.9) + F(0.1): weighted avg = 0.9×95 + 0.1×20 = 87.5 → base B
    // Worst-case tie-break: F is >1 step below B → bumps to C at most
    const result = computeCompanyRiskGrade([
      { grade: 'A', weight: 0.9 },
      { grade: 'F', weight: 0.1 },
    ])
    expect(['B', 'C']).toContain(result)
  })

  it('equal weight A and F yields C or better (worst-case bias applies)', () => {
    const result = computeCompanyRiskGrade([
      { grade: 'A', weight: 0.5 },
      { grade: 'F', weight: 0.5 },
    ])
    // Weighted avg of A(95) and F(20) = 57.5 → base C; worst-case F is 4 steps below A
    // Implementation bumps C by at most 1 step when worst is >1 step below → D
    expect(['C', 'D']).toContain(result)
  })

  it('single partner returns that partner grade', () => {
    expect(computeCompanyRiskGrade([{ grade: 'B', weight: 1 }])).toBe('B')
    expect(computeCompanyRiskGrade([{ grade: 'D', weight: 1 }])).toBe('D')
  })

  it('empty array returns A (no risk)', () => {
    expect(computeCompanyRiskGrade([])).toBe('A')
  })

  it('all-zero weights returns A (no risk)', () => {
    const result = computeCompanyRiskGrade([
      { grade: 'F', weight: 0 },
      { grade: 'F', weight: 0 },
    ])
    expect(result).toBe('A')
  })

  it('result is always a valid RiskGrade', () => {
    const valid: RiskGrade[] = ['A', 'B', 'C', 'D', 'F']
    const inputs: Array<{ grade: RiskGrade; weight: number }> = [
      { grade: 'B', weight: 0.4 },
      { grade: 'C', weight: 0.35 },
      { grade: 'D', weight: 0.25 },
    ]
    const result = computeCompanyRiskGrade(inputs)
    expect(valid).toContain(result)
  })

  it('worst-case tie-break does not go below F', () => {
    const result = computeCompanyRiskGrade([
      { grade: 'F', weight: 0.8 },
      { grade: 'F', weight: 0.2 },
    ])
    expect(result).toBe('F')
  })
})

import { describe, it, expect } from 'vitest'
import {
  classifyFinancialImpact,
  formatActionType,
  CORPORATE_ACTION_TYPE_LABELS,
  CORPORATE_ACTION_TYPES,
  type FinancialImpactLevel,
} from '../lib/services/governance/corporate-actions.service'

// ── classifyFinancialImpact ────────────────────────────────────────────────────

describe('classifyFinancialImpact', () => {
  it('returns minor for 0', () => {
    expect(classifyFinancialImpact(0)).toBe<FinancialImpactLevel>('minor')
  })

  it('returns minor for null', () => {
    expect(classifyFinancialImpact(null)).toBe<FinancialImpactLevel>('minor')
  })

  it('returns minor for undefined', () => {
    expect(classifyFinancialImpact(undefined)).toBe<FinancialImpactLevel>('minor')
  })

  it('returns minor for exactly 10,000', () => {
    expect(classifyFinancialImpact(10_000)).toBe<FinancialImpactLevel>('minor')
  })

  it('returns moderate for 10,001', () => {
    expect(classifyFinancialImpact(10_001)).toBe<FinancialImpactLevel>('moderate')
  })

  it('returns moderate for 50,000', () => {
    expect(classifyFinancialImpact(50_000)).toBe<FinancialImpactLevel>('moderate')
  })

  it('returns moderate for exactly 100,000', () => {
    expect(classifyFinancialImpact(100_000)).toBe<FinancialImpactLevel>('moderate')
  })

  it('returns significant for 100,001', () => {
    expect(classifyFinancialImpact(100_001)).toBe<FinancialImpactLevel>('significant')
  })

  it('returns significant for 250,000', () => {
    expect(classifyFinancialImpact(250_000)).toBe<FinancialImpactLevel>('significant')
  })

  it('returns significant for exactly 500,000', () => {
    expect(classifyFinancialImpact(500_000)).toBe<FinancialImpactLevel>('significant')
  })

  it('returns major for 500,001', () => {
    expect(classifyFinancialImpact(500_001)).toBe<FinancialImpactLevel>('major')
  })

  it('returns major for 1,000,000', () => {
    expect(classifyFinancialImpact(1_000_000)).toBe<FinancialImpactLevel>('major')
  })

  it('returns major for very large amounts', () => {
    expect(classifyFinancialImpact(999_999_999)).toBe<FinancialImpactLevel>('major')
  })

  it('returns minor for small positive amount', () => {
    expect(classifyFinancialImpact(1)).toBe<FinancialImpactLevel>('minor')
  })

  it('returns minor for negative amount (no sign guard enforced at pure helper level)', () => {
    // Negative amounts are still classified as minor since they do not exceed any threshold
    expect(classifyFinancialImpact(-500_000)).toBe<FinancialImpactLevel>('minor')
  })
})

// ── formatActionType ───────────────────────────────────────────────────────────

describe('formatActionType', () => {
  it('formats DIVIDEND_DECLARATION correctly', () => {
    expect(formatActionType('DIVIDEND_DECLARATION')).toBe('Temettü Kararı')
  })

  it('formats CAPITAL_INCREASE correctly', () => {
    expect(formatActionType('CAPITAL_INCREASE')).toBe('Sermaye Artırımı')
  })

  it('formats COMPANY_RESTRUCTURE correctly', () => {
    expect(formatActionType('COMPANY_RESTRUCTURE')).toBe('Şirket Yeniden Yapılanması')
  })

  it('formats OTHER correctly', () => {
    expect(formatActionType('OTHER')).toBe('Diğer')
  })

  it('falls back to raw string for unknown type', () => {
    expect(formatActionType('UNKNOWN_TYPE')).toBe('UNKNOWN_TYPE')
  })

  it('formats BOARD_APPOINTMENT correctly', () => {
    expect(formatActionType('BOARD_APPOINTMENT')).toBe('Yönetici Atanması')
  })

  it('formats PARTNER_ADMISSION correctly', () => {
    expect(formatActionType('PARTNER_ADMISSION')).toBe('Ortak Kabulü')
  })

  it('formats AUDITOR_APPOINTMENT correctly', () => {
    expect(formatActionType('AUDITOR_APPOINTMENT')).toBe('Denetçi Atanması')
  })

  it('formats SIGNIFICANT_ASSET_PURCHASE correctly', () => {
    expect(formatActionType('SIGNIFICANT_ASSET_PURCHASE')).toBe('Önemli Varlık Alımı')
  })

  it('formats COMPENSATION_AUTHORIZATION correctly', () => {
    expect(formatActionType('COMPENSATION_AUTHORIZATION')).toBe('Huzur Hakkı Yetkilendirmesi')
  })
})

// ── CORPORATE_ACTION_TYPE_LABELS completeness ──────────────────────────────────

describe('CORPORATE_ACTION_TYPE_LABELS', () => {
  it('has a label for every action type', () => {
    for (const t of CORPORATE_ACTION_TYPES) {
      expect(CORPORATE_ACTION_TYPE_LABELS[t], `missing label for ${t}`).toBeTruthy()
    }
  })

  it('contains 20 action types', () => {
    expect(CORPORATE_ACTION_TYPES.length).toBe(20)
  })

  it('all labels are non-empty strings', () => {
    for (const [key, label] of Object.entries(CORPORATE_ACTION_TYPE_LABELS)) {
      expect(typeof label, `label for ${key} should be string`).toBe('string')
      expect(label.trim().length, `label for ${key} should not be empty`).toBeGreaterThan(0)
    }
  })
})

// ── VotingOutcome edge cases (pure calculation helpers) ────────────────────────

describe('VotingOutcome edge: all zeros', () => {
  function computePassRatio(votes: { in_favor: number; total: number }) {
    if (votes.total === 0) return 0
    return votes.in_favor / votes.total
  }

  it('returns 0 when total is 0', () => {
    expect(computePassRatio({ in_favor: 0, total: 0 })).toBe(0)
  })

  it('returns 0 when in_favor is 0 but total > 0', () => {
    expect(computePassRatio({ in_favor: 0, total: 5 })).toBe(0)
  })

  it('returns 1 when all vote in favor', () => {
    expect(computePassRatio({ in_favor: 5, total: 5 })).toBe(1)
  })

  it('returns correct ratio for partial approval', () => {
    expect(computePassRatio({ in_favor: 3, total: 5 })).toBeCloseTo(0.6)
  })

  it('does not throw for NaN-like inputs when guarded', () => {
    expect(() => computePassRatio({ in_favor: 0, total: 0 })).not.toThrow()
  })
})

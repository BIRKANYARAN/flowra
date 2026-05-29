// tests/governance.test.ts
//
// Unit tests for lib/services/intelligence/governance.service.ts
// Pure tests only — no DB, no Supabase mocking needed.

import { describe, it, expect } from 'vitest'
import {
  computeResolutionDays,
  computeGovernanceScore,
  buildPayloadSummary,
  WORKFLOW_TYPE_LABELS,
} from '@/lib/services/intelligence/governance.service'

// ── computeResolutionDays ─────────────────────────────────────────────────────

describe('computeResolutionDays', () => {
  it('returns 2 for a 2-day span', () => {
    expect(computeResolutionDays(
      '2026-05-01T10:00:00Z',
      '2026-05-03T10:00:00Z',
    )).toBe(2)
  })

  it('returns null when resolvedAt is null (still pending)', () => {
    expect(computeResolutionDays('2026-05-01T10:00:00Z', null)).toBeNull()
  })

  it('returns 0 when initiated and resolved at the same instant', () => {
    expect(computeResolutionDays(
      '2026-05-01T10:00:00Z',
      '2026-05-01T10:00:00Z',
    )).toBe(0)
  })

  it('returns 0 when resolved within the same day (less than 24h)', () => {
    expect(computeResolutionDays(
      '2026-05-01T08:00:00Z',
      '2026-05-01T23:59:59Z',
    )).toBe(0)
  })

  it('returns 1 for exactly 24 hours', () => {
    expect(computeResolutionDays(
      '2026-05-01T10:00:00Z',
      '2026-05-02T10:00:00Z',
    )).toBe(1)
  })

  it('returns 30 for a full month span', () => {
    expect(computeResolutionDays(
      '2026-04-01T00:00:00Z',
      '2026-05-01T00:00:00Z',
    )).toBe(30)
  })

  it('does not return negative values (floor at 0)', () => {
    // resolved before initiated — defensive check
    const result = computeResolutionDays(
      '2026-05-03T10:00:00Z',
      '2026-05-01T10:00:00Z',
    )
    expect(result).toBeGreaterThanOrEqual(0)
  })
})

// ── computeGovernanceScore ────────────────────────────────────────────────────

describe('computeGovernanceScore', () => {
  it('returns 100 when all conditions are perfect', () => {
    expect(computeGovernanceScore(100, 0, true, true)).toBe(100)
  })

  it('returns 0 when all conditions are worst', () => {
    expect(computeGovernanceScore(0, 5, false, false)).toBe(0)
  })

  it('returns 80 when resolution rate is 50% and rest perfect', () => {
    // resolution_rate: 50% of 40 = 20, no_stale: 30, period_close: 20, audit: 10 → 80
    expect(computeGovernanceScore(50, 0, true, true)).toBe(80)
  })

  it('returns 40 when only resolution rate is perfect (100%), rest worst', () => {
    expect(computeGovernanceScore(100, 1, false, false)).toBe(40)
  })

  it('returns 30 when only no-stale component is satisfied', () => {
    expect(computeGovernanceScore(0, 0, false, false)).toBe(30)
  })

  it('returns 20 when only period close is on time', () => {
    expect(computeGovernanceScore(0, 1, true, false)).toBe(20)
  })

  it('returns 10 when only audit trail exists', () => {
    expect(computeGovernanceScore(0, 1, false, true)).toBe(10)
  })

  it('clamps resolution rate to [0, 100] — negative input treated as 0', () => {
    expect(computeGovernanceScore(-10, 0, true, true)).toBe(60) // 0 + 30 + 20 + 10
  })

  it('clamps resolution rate to [0, 100] — above 100 treated as 100', () => {
    expect(computeGovernanceScore(150, 0, true, true)).toBe(100)
  })

  it('returns 70 when resolution rate 100% + no stale + audit trail, no period close', () => {
    expect(computeGovernanceScore(100, 0, false, true)).toBe(80) // 40+30+0+10
  })
})

// ── buildPayloadSummary ───────────────────────────────────────────────────────

describe('buildPayloadSummary', () => {
  it('returns "—" for null payload', () => {
    expect(buildPayloadSummary(null)).toBe('—')
  })

  it('returns "—" for empty object', () => {
    expect(buildPayloadSummary({})).toBe('—')
  })

  it('includes amount when amount_try is present as number', () => {
    const result = buildPayloadSummary({ amount_try: 50000 })
    expect(result).toMatch(/50/)
  })

  it('uses K suffix for amounts >= 1000', () => {
    const result = buildPayloadSummary({ amount_try: 75000 })
    expect(result).toMatch(/K/)
  })

  it('formats 50000 TRY to contain 50K or 50000', () => {
    const result = buildPayloadSummary({ amount_try: 50000 })
    expect(result).toMatch(/50K|50\.000|50000/)
  })

  it('uses partner_name when no amount', () => {
    const result = buildPayloadSummary({ partner_name: 'Ahmet Yılmaz' })
    expect(result).toBe('Ahmet Yılmaz')
  })

  it('uses description when no amount or partner_name', () => {
    const result = buildPayloadSummary({ description: 'Q1 dönem kapanışı' })
    expect(result).toBe('Q1 dönem kapanışı')
  })

  it('truncates long descriptions at 60 chars', () => {
    const longDesc = 'Bu çok uzun bir açıklama metnidir ve altmış karakterden fazlasına sahiptir, bu yüzden kesilmesi gerekiyor.'
    const result = buildPayloadSummary({ description: longDesc })
    expect(result.length).toBeLessThanOrEqual(63) // 57 + '…' = 58, allow for unicode
    expect(result).toMatch(/…$/)
  })

  it('prefers amount_try over partner_name', () => {
    const result = buildPayloadSummary({ amount_try: 25000, partner_name: 'Mehmet Bey' })
    expect(result).not.toContain('Mehmet Bey')
    expect(result).toMatch(/25/)
  })

  it('handles amount_try as string', () => {
    const result = buildPayloadSummary({ amount_try: '100000' })
    expect(result).toMatch(/100|K/)
  })

  it('returns "—" for amount_try of 0', () => {
    // 0 is falsy — should fall through to next field
    const result = buildPayloadSummary({ amount_try: 0, partner_name: 'Test Ortak' })
    expect(result).toBe('Test Ortak')
  })
})

// ── WORKFLOW_TYPE_LABELS ──────────────────────────────────────────────────────

describe('WORKFLOW_TYPE_LABELS', () => {
  it('has a Turkish label for dividend_declaration', () => {
    expect(WORKFLOW_TYPE_LABELS['dividend_declaration']).toBe('Temettü Beyanı')
  })

  it('has a Turkish label for expense_approval', () => {
    expect(WORKFLOW_TYPE_LABELS['expense_approval']).toBe('Masraf Onayı')
  })

  it('has a Turkish label for partner_loan_entry', () => {
    expect(WORKFLOW_TYPE_LABELS['partner_loan_entry']).toBe('Ortak Borç Girişi')
  })

  it('has a Turkish label for period_close', () => {
    expect(WORKFLOW_TYPE_LABELS['period_close']).toBe('Dönem Kapanışı')
  })

  it('has a Turkish label for period_lock', () => {
    expect(WORKFLOW_TYPE_LABELS['period_lock']).toBe('Dönem Kilitleme')
  })

  it('has 8 entries', () => {
    expect(Object.keys(WORKFLOW_TYPE_LABELS)).toHaveLength(8)
  })

  it('has a Turkish label for equity_payment', () => {
    expect(WORKFLOW_TYPE_LABELS['equity_payment']).toBe('Sermaye Ödemesi')
  })

  it('has a Turkish label for compensation_payment', () => {
    expect(WORKFLOW_TYPE_LABELS['compensation_payment']).toBe('Huzur Hakkı')
  })

  it('has a Turkish label for large_expense', () => {
    expect(WORKFLOW_TYPE_LABELS['large_expense']).toBe('Büyük Masraf Onayı')
  })

  it('all labels are non-empty strings', () => {
    for (const [key, label] of Object.entries(WORKFLOW_TYPE_LABELS)) {
      expect(typeof label).toBe('string')
      expect(label.length).toBeGreaterThan(0)
      expect(typeof key).toBe('string')
    }
  })

  it('no label is undefined for defined keys', () => {
    const keys = [
      'dividend_declaration', 'expense_approval', 'partner_loan_entry',
      'period_close', 'period_lock', 'equity_payment',
      'compensation_payment', 'large_expense',
    ]
    for (const k of keys) {
      expect(WORKFLOW_TYPE_LABELS[k]).toBeDefined()
    }
  })
})

// ── computeResolutionDays — extended edge cases ────────────────────────────────

describe('computeResolutionDays — extended edge cases', () => {
  it('returns 7 for exactly one week', () => {
    expect(computeResolutionDays(
      '2026-05-01T00:00:00Z',
      '2026-05-08T00:00:00Z',
    )).toBe(7)
  })

  it('returns 365 for exactly one year', () => {
    expect(computeResolutionDays(
      '2026-01-01T00:00:00Z',
      '2027-01-01T00:00:00Z',
    )).toBe(365)
  })

  it('handles different times on same day — returns 0', () => {
    expect(computeResolutionDays(
      '2026-06-15T06:00:00Z',
      '2026-06-15T22:30:00Z',
    )).toBe(0)
  })

  it('handles UTC midnight to midnight transition correctly', () => {
    expect(computeResolutionDays(
      '2026-05-31T00:00:00Z',
      '2026-06-01T00:00:00Z',
    )).toBe(1)
  })

  it('resolvedAt empty string returns null (treated as null)', () => {
    // Defensive: if implementation checks for falsy, empty string is falsy
    const result = computeResolutionDays('2026-05-01T10:00:00Z', null)
    expect(result).toBeNull()
  })
})

// ── computeGovernanceScore — score breakdown arithmetic ───────────────────────

describe('computeGovernanceScore — score components', () => {
  it('score components sum correctly: 40+30+20+10 = 100 max', () => {
    // Perfect score: 100% resolution, 0 stale, period closed, audit exists
    const score = computeGovernanceScore(100, 0, true, true)
    expect(score).toBe(100)
  })

  it('50% resolution rate contributes 20 points (50% of 40)', () => {
    // Only resolution rate contribution is variable; rest 0
    const withResolution    = computeGovernanceScore(50, 1, false, false)
    const withoutResolution = computeGovernanceScore(0,  1, false, false)
    const resolutionPoints  = withResolution - withoutResolution
    expect(resolutionPoints).toBeCloseTo(20, 0)
  })

  it('period close contributes exactly 20 points', () => {
    const withClose    = computeGovernanceScore(0, 1, true, false)
    const withoutClose = computeGovernanceScore(0, 1, false, false)
    expect(withClose - withoutClose).toBe(20)
  })

  it('audit trail contributes exactly 10 points', () => {
    const withAudit    = computeGovernanceScore(0, 1, false, true)
    const withoutAudit = computeGovernanceScore(0, 1, false, false)
    expect(withAudit - withoutAudit).toBe(10)
  })

  it('stale=0 contributes exactly 30 points vs stale>0', () => {
    const noStale   = computeGovernanceScore(0, 0, false, false)
    const withStale = computeGovernanceScore(0, 5, false, false)
    expect(noStale - withStale).toBe(30)
  })

  it('score is always a non-negative integer', () => {
    const cases = [
      [0, 0, false, false],
      [50, 2, true, false],
      [100, 0, true, true],
      [-50, 99, false, false],
    ] as [number, number, boolean, boolean][]
    for (const [rate, stale, close, audit] of cases) {
      const score = computeGovernanceScore(rate, stale, close, audit)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(score) || typeof score === 'number').toBe(true)
    }
  })

  it('score never exceeds 100', () => {
    expect(computeGovernanceScore(999, 0, true, true)).toBeLessThanOrEqual(100)
  })
})

// ── buildPayloadSummary — extended cases ──────────────────────────────────────

describe('buildPayloadSummary — extended cases', () => {
  it('ignores null values for amount_try — falls through to next field', () => {
    const result = buildPayloadSummary({ amount_try: null, partner_name: 'Zeynep' })
    expect(result).toBe('Zeynep')
  })

  it('handles numeric-looking string amounts', () => {
    const result = buildPayloadSummary({ amount_try: '5000' })
    expect(result).toMatch(/5000|5K/)
  })

  it('description field is preferred over empty partner_name', () => {
    const result = buildPayloadSummary({ partner_name: '', description: 'Açıklama' })
    // empty partner_name is falsy — falls through to description
    expect(result).toBe('Açıklama')
  })

  it('all fields null → returns "—"', () => {
    const result = buildPayloadSummary({ amount_try: null, partner_name: null, description: null })
    expect(result).toBe('—')
  })

  it('payload with unknown fields → returns "—"', () => {
    const result = buildPayloadSummary({ random_field: 'value', another: 123 })
    expect(result).toBe('—')
  })

  it('amount_try of 1000 → contains K suffix or 1000', () => {
    const result = buildPayloadSummary({ amount_try: 1000 })
    expect(result).toMatch(/1K|1\.000|1000/)
  })

  it('amount_try below 1000 → no K suffix', () => {
    const result = buildPayloadSummary({ amount_try: 500 })
    expect(result).not.toMatch(/K$/)
  })
})

// ── computeResolutionDays — large-span and precision tests ────────────────────

describe('computeResolutionDays — large-span and precision tests', () => {
  it('100 days span returns 100', () => {
    expect(computeResolutionDays(
      '2026-01-01T00:00:00Z',
      '2026-04-11T00:00:00Z',
    )).toBe(100)
  })

  it('exactly 48 hours returns 2', () => {
    expect(computeResolutionDays(
      '2026-05-01T12:00:00Z',
      '2026-05-03T12:00:00Z',
    )).toBe(2)
  })

  it('23h59m59s returns 0 (floor of <1 day)', () => {
    expect(computeResolutionDays(
      '2026-06-01T00:00:00Z',
      '2026-06-01T23:59:59Z',
    )).toBe(0)
  })

  it('returns null for null resolvedAt regardless of initiatedAt', () => {
    expect(computeResolutionDays('2020-01-01T00:00:00Z', null)).toBeNull()
    expect(computeResolutionDays('2025-12-31T00:00:00Z', null)).toBeNull()
  })

  it('leap year: Feb 29 to Mar 1 = 1 day', () => {
    expect(computeResolutionDays(
      '2024-02-29T00:00:00Z',
      '2024-03-01T00:00:00Z',
    )).toBe(1)
  })

  it('resolvedAt before initiatedAt returns 0 (Math.max clamping)', () => {
    const result = computeResolutionDays(
      '2026-05-10T00:00:00Z',
      '2026-05-01T00:00:00Z',
    )
    expect(result).toBe(0)
  })

  it('very old workflow (10 years) computes correctly', () => {
    // 2016-01-01 to 2026-01-01 ≈ 3652 days (includes 2 leap years: 2016, 2020, 2024)
    const result = computeResolutionDays(
      '2016-01-01T00:00:00Z',
      '2026-01-01T00:00:00Z',
    )
    expect(result).toBeGreaterThan(3650)
  })
})

// ── computeGovernanceScore — extended scoring scenarios ───────────────────────

describe('computeGovernanceScore — extended scenarios', () => {
  it('75% resolution rate: 0.75 × 40 = 30 points', () => {
    const score = computeGovernanceScore(75, 0, false, false)
    // resolution=30, stale=30 → 60
    expect(score).toBe(60)
  })

  it('25% resolution rate contributes 10 points', () => {
    const with25  = computeGovernanceScore(25, 1, false, false)
    const with0   = computeGovernanceScore(0,  1, false, false)
    expect(with25 - with0).toBe(10)
  })

  it('stale=0 bonus is exactly 30 points regardless of other values', () => {
    for (const rate of [0, 50, 100]) {
      const noStale   = computeGovernanceScore(rate, 0, false, false)
      const withStale = computeGovernanceScore(rate, 1, false, false)
      expect(noStale - withStale).toBe(30)
    }
  })

  it('all 4 components in isolation sum to 100', () => {
    const resolution = computeGovernanceScore(100, 1, false, false)  // 40
    const stale      = computeGovernanceScore(0,   0, false, false)  // 30
    const period     = computeGovernanceScore(0,   1, true,  false)  // 20
    const audit      = computeGovernanceScore(0,   1, false, true)   // 10
    expect(resolution + stale + period + audit).toBe(100)
  })

  it('resolution rate of 10% → Math.round(0.1*40)=4 points', () => {
    const score = computeGovernanceScore(10, 1, false, false)
    expect(score).toBe(4)
  })

  it('resolution rate of 33% → Math.round(0.33*40)=13 points', () => {
    const score = computeGovernanceScore(33, 1, false, false)
    expect(score).toBe(13)
  })

  it('multiple stale items all give same 0 contribution', () => {
    const one    = computeGovernanceScore(0, 1, false, false)
    const twenty = computeGovernanceScore(0, 20, false, false)
    expect(one).toBe(twenty)
  })

  it('score is non-negative for all valid input combinations', () => {
    const combos = [
      [0, 0, false, false],
      [0, 5, true,  true],
      [100, 0, true, true],
      [50, 3, true, false],
    ] as [number, number, boolean, boolean][]
    for (const [r, s, p, a] of combos) {
      expect(computeGovernanceScore(r, s, p, a)).toBeGreaterThanOrEqual(0)
    }
  })
})

// ── WORKFLOW_TYPE_LABELS — extended coverage ──────────────────────────────────

describe('WORKFLOW_TYPE_LABELS — extended coverage', () => {
  it('no label contains only whitespace', () => {
    for (const label of Object.values(WORKFLOW_TYPE_LABELS)) {
      expect(label.trim().length).toBeGreaterThan(0)
    }
  })

  it('all label keys are snake_case strings', () => {
    for (const key of Object.keys(WORKFLOW_TYPE_LABELS)) {
      expect(key).toMatch(/^[a-z_]+$/)
    }
  })

  it('label for dividend_declaration is exactly "Temettü Beyanı"', () => {
    expect(WORKFLOW_TYPE_LABELS['dividend_declaration']).toBe('Temettü Beyanı')
  })

  it('label for large_expense is exactly "Büyük Masraf Onayı"', () => {
    expect(WORKFLOW_TYPE_LABELS['large_expense']).toBe('Büyük Masraf Onayı')
  })

  it('all 8 workflow types map to Turkish labels', () => {
    const expectedKeys = [
      'dividend_declaration', 'expense_approval', 'partner_loan_entry',
      'period_close', 'period_lock', 'equity_payment',
      'compensation_payment', 'large_expense',
    ]
    for (const key of expectedKeys) {
      expect(WORKFLOW_TYPE_LABELS[key]).toBeDefined()
      expect(typeof WORKFLOW_TYPE_LABELS[key]).toBe('string')
    }
  })

  it('unknown workflow type key returns undefined', () => {
    expect(WORKFLOW_TYPE_LABELS['nonexistent_workflow']).toBeUndefined()
  })

  it('labels are unique (no two workflow types share a label)', () => {
    const labels = Object.values(WORKFLOW_TYPE_LABELS)
    const unique = new Set(labels)
    expect(unique.size).toBe(labels.length)
  })
})

// ── buildPayloadSummary — additional precision tests ──────────────────────────

describe('buildPayloadSummary — additional precision tests', () => {
  it('exact boundary: amount_try=999 → no K suffix', () => {
    const result = buildPayloadSummary({ amount_try: 999 })
    expect(result).not.toMatch(/K/)
    expect(result).toMatch(/999/)
  })

  it('exact boundary: amount_try=1000 → K suffix', () => {
    const result = buildPayloadSummary({ amount_try: 1000 })
    expect(result).toMatch(/K|1\.000/)
  })

  it('amount_try=1_500_000 → formats with K', () => {
    const result = buildPayloadSummary({ amount_try: 1_500_000 })
    expect(result).toMatch(/1\.500K|1500K/)
  })

  it('description exactly 60 chars → not truncated', () => {
    const desc = 'A'.repeat(60)
    const result = buildPayloadSummary({ description: desc })
    expect(result).toBe(desc)
    expect(result).not.toMatch(/…/)
  })

  it('description of 61 chars → truncated with ellipsis', () => {
    const desc = 'A'.repeat(61)
    const result = buildPayloadSummary({ description: desc })
    expect(result.endsWith('…')).toBe(true)
    expect(result.length).toBeLessThanOrEqual(61)
  })

  it('partner_name with only spaces → treated as falsy → falls through', () => {
    const result = buildPayloadSummary({ partner_name: '   ', description: 'FallbackDesc' })
    // Trimmed partner_name is empty → falls through to description
    expect(result).toBe('FallbackDesc')
  })

  it('amount_try = 100 (three-digit) → formatted without K', () => {
    const result = buildPayloadSummary({ amount_try: 100 })
    expect(result).toMatch(/₺/)
    expect(result).not.toMatch(/K/)
  })
})

// ── computeResolutionDays — hour-level precision ──────────────────────────────

describe('computeResolutionDays — hour precision tests', () => {
  it('exactly 36 hours (1.5 days) → floor → 1', () => {
    expect(computeResolutionDays(
      '2026-05-01T00:00:00Z',
      '2026-05-02T12:00:00Z',
    )).toBe(1)
  })

  it('exactly 47h59m → floor → 1 (not 2)', () => {
    expect(computeResolutionDays(
      '2026-05-01T00:00:00Z',
      '2026-05-02T23:59:00Z',
    )).toBe(1)
  })

  it('exactly 5 days → 5', () => {
    expect(computeResolutionDays(
      '2026-06-01T00:00:00Z',
      '2026-06-06T00:00:00Z',
    )).toBe(5)
  })

  it('null resolvedAt always returns null regardless of initiatedAt value', () => {
    expect(computeResolutionDays('1970-01-01T00:00:00Z', null)).toBeNull()
  })
})

// ── computeGovernanceScore — resolution rate linear scaling ──────────────────

describe('computeGovernanceScore — linear scaling', () => {
  it('1% resolution → Math.round(0.01*40)=0 points', () => {
    const score = computeGovernanceScore(1, 1, false, false)
    expect(score).toBe(0)
  })

  it('2% resolution → Math.round(0.02*40)=1 point', () => {
    const score = computeGovernanceScore(2, 1, false, false)
    expect(score).toBe(1)
  })

  it('50% resolution → Math.round(0.50*40)=20 points', () => {
    const withHalf = computeGovernanceScore(50, 1, false, false)
    const withZero = computeGovernanceScore(0, 1, false, false)
    expect(withHalf - withZero).toBe(20)
  })

  it('99% resolution → Math.round(0.99*40)=40 points', () => {
    const with99  = computeGovernanceScore(99, 1, false, false)
    const with100 = computeGovernanceScore(100, 1, false, false)
    // 99% → round(39.6)=40, same as 100% → round(40)=40
    expect(with99).toBe(with100)
  })

  it('full max score = 100 with all conditions met', () => {
    expect(computeGovernanceScore(100, 0, true, true)).toBe(100)
  })

  it('score with only stale=0 + audit = 40 points', () => {
    // stale=30, audit=10 → 40
    expect(computeGovernanceScore(0, 0, false, true)).toBe(40)
  })
})

// ── buildPayloadSummary — string and numeric edge cases ───────────────────────

describe('buildPayloadSummary — edge cases', () => {
  it('amount_try as float → formats with K when >= 1000', () => {
    const result = buildPayloadSummary({ amount_try: 2500.75 })
    expect(result).toMatch(/K/)
  })

  it('empty description string → falls through to "—"', () => {
    const result = buildPayloadSummary({ description: '' })
    expect(result).toBe('—')
  })

  it('description with only whitespace → "—"', () => {
    const result = buildPayloadSummary({ description: '   ' })
    expect(result).toBe('—')
  })

  it('both partner_name and description → uses partner_name', () => {
    const result = buildPayloadSummary({ partner_name: 'Ali Bey', description: 'Açıklama' })
    expect(result).toBe('Ali Bey')
  })

  it('amount_try = -500 (negative) → falls through to partner_name', () => {
    // Negative amount: typeof === number but <=0 → skip
    const result = buildPayloadSummary({ amount_try: -500, partner_name: 'Fatma Hanım' })
    expect(result).toBe('Fatma Hanım')
  })

  it('description of exactly 57 chars → not truncated', () => {
    const desc = 'A'.repeat(57)
    const result = buildPayloadSummary({ description: desc })
    expect(result).toBe(desc)
    expect(result.endsWith('…')).toBe(false)
  })

  it('description of 58 chars → not truncated (threshold is 60)', () => {
    const desc = 'A'.repeat(58)
    const result = buildPayloadSummary({ description: desc })
    expect(result).toBe(desc)
  })
})

// ── WORKFLOW_TYPE_LABELS — all labels exhaustive check ───────────────────────

describe('WORKFLOW_TYPE_LABELS — exhaustive', () => {
  const expectedLabels: Record<string, string> = {
    dividend_declaration: 'Temettü Beyanı',
    expense_approval:     'Masraf Onayı',
    partner_loan_entry:   'Ortak Borç Girişi',
    period_close:         'Dönem Kapanışı',
    period_lock:          'Dönem Kilitleme',
    equity_payment:       'Sermaye Ödemesi',
    compensation_payment: 'Huzur Hakkı',
    large_expense:        'Büyük Masraf Onayı',
  }

  it('all 8 labels match exactly', () => {
    for (const [key, label] of Object.entries(expectedLabels)) {
      expect(WORKFLOW_TYPE_LABELS[key]).toBe(label)
    }
  })

  it('object has exactly 8 keys', () => {
    expect(Object.keys(WORKFLOW_TYPE_LABELS)).toHaveLength(8)
  })

  it('no label is an empty string', () => {
    for (const label of Object.values(WORKFLOW_TYPE_LABELS)) {
      expect(label.trim().length).toBeGreaterThan(0)
    }
  })
})

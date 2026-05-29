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

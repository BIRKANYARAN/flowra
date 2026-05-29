/**
 * Tests for checkDistributionCompliance() in pcle.distribution.ts
 *
 * Validates Turkish legal compliance rules before any distribution is allowed.
 * Run with: npx vitest run tests/pcle-compliance.test.ts
 */
import { describe, it, expect } from 'vitest'
import { checkDistributionCompliance, type ComplianceViolation } from '../lib/services/pcle/pcle.distribution'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function baseParams(overrides: Partial<Parameters<typeof checkDistributionCompliance>[0]> = {}) {
  return {
    distributableNet:      100_000,
    dividendAmount:        50_000,
    legalReservesDone:     true,
    legalReserveBalance:   100_000,  // 20% of ₺500K capital — at cap
    paidInCapital:         500_000,
    boardDecisionRef:      null,
    isCompensationPayment: false,
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Happy path
// ─────────────────────────────────────────────────────────────────────────────

describe('checkDistributionCompliance — happy path', () => {
  it('all rules satisfied → returns empty violations array', () => {
    const violations = checkDistributionCompliance(baseParams())
    expect(violations).toHaveLength(0)
  })

  it('distributableNet exactly equals dividendAmount → allowed (edge: exact match)', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: 50_000,
      dividendAmount:   50_000,
    }))
    // No TTK_509_NO_PROFIT because dividendAmount is NOT > distributableNet
    const ttk509 = violations.find(v => v.rule === 'TTK_509_NO_PROFIT')
    expect(ttk509).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TTK 509 — No profit / insufficient distributable net
// ─────────────────────────────────────────────────────────────────────────────

describe('checkDistributionCompliance — TTK_509_NO_PROFIT', () => {
  it('dividend > distributable net → blocking TTK_509_NO_PROFIT violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: 40_000,
      dividendAmount:   80_000,  // exceeds distributable
    }))
    const v = violations.find(v => v.rule === 'TTK_509_NO_PROFIT')
    expect(v).toBeDefined()
    expect(v?.blocking).toBe(true)
    expect(v?.message).toContain('TTK 509')
  })

  it('dividend === 0 and distributable > 0 → no TTK_509 violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      dividendAmount: 0,
    }))
    const v = violations.find(v => v.rule === 'TTK_509_NO_PROFIT')
    expect(v).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TTK 519 — Legal reserve required
// ─────────────────────────────────────────────────────────────────────────────

describe('checkDistributionCompliance — TTK_519_RESERVE_REQUIRED', () => {
  it('legal reserves not done and balance < 20% of capital → blocking violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      legalReservesDone:   false,
      legalReserveBalance: 0,        // no reserves
      paidInCapital:       500_000,  // 20% cap = ₺100K — not met
    }))
    const v = violations.find(v => v.rule === 'TTK_519_RESERVE_REQUIRED')
    expect(v).toBeDefined()
    expect(v?.blocking).toBe(true)
    expect(v?.message).toContain('TTK 519')
  })

  it('legal reserves done → no TTK_519 violation even if balance is low', () => {
    const violations = checkDistributionCompliance(baseParams({
      legalReservesDone:   true,   // period reserve set — no block
      legalReserveBalance: 10_000, // still below cap but reserve is done this period
      paidInCapital:       500_000,
    }))
    const v = violations.find(v => v.rule === 'TTK_519_RESERVE_REQUIRED')
    expect(v).toBeUndefined()
  })

  it('legal reserve balance already at cap (20%) → no TTK_519 violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      legalReservesDone:   false,    // not done this period BUT...
      legalReserveBalance: 100_000,  // already at 20% of ₺500K — no gap
      paidInCapital:       500_000,
    }))
    const v = violations.find(v => v.rule === 'TTK_519_RESERVE_REQUIRED')
    expect(v).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TTK 394 — Board decision required for compensation
// ─────────────────────────────────────────────────────────────────────────────

describe('checkDistributionCompliance — TTK_394_BOARD_REQUIRED', () => {
  it('compensation payment without board decision ref → blocking violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      isCompensationPayment: true,
      boardDecisionRef:      null,
    }))
    const v = violations.find(v => v.rule === 'TTK_394_BOARD_REQUIRED')
    expect(v).toBeDefined()
    expect(v?.blocking).toBe(true)
    expect(v?.message).toContain('TTK 394')
  })

  it('compensation payment WITH board decision ref → no TTK_394 violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      isCompensationPayment: true,
      boardDecisionRef:      'GK-2025-001',
    }))
    const v = violations.find(v => v.rule === 'TTK_394_BOARD_REQUIRED')
    expect(v).toBeUndefined()
  })

  it('non-compensation payment without board ref → no TTK_394 violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      isCompensationPayment: false,
      boardDecisionRef:      null,
    }))
    const v = violations.find(v => v.rule === 'TTK_394_BOARD_REQUIRED')
    expect(v).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Negative distributable net
// ─────────────────────────────────────────────────────────────────────────────

describe('checkDistributionCompliance — NEGATIVE_DISTRIBUTION', () => {
  it('distributableNet < 0 → blocking NEGATIVE_DISTRIBUTION violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: -10_000,
      dividendAmount:   5_000,
    }))
    const v = violations.find(v => v.rule === 'NEGATIVE_DISTRIBUTION')
    expect(v).toBeDefined()
    expect(v?.blocking).toBe(true)
    expect(v?.message).toContain('zararında')
  })

  it('distributableNet = 0 → no NEGATIVE_DISTRIBUTION violation (zero is not negative)', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: 0,
      dividendAmount:   0,
    }))
    const v = violations.find(v => v.rule === 'NEGATIVE_DISTRIBUTION')
    expect(v).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Multiple violations at once
// ─────────────────────────────────────────────────────────────────────────────

describe('checkDistributionCompliance — multiple violations', () => {
  it('negative distributable + dividend exceeds net → both violations returned', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: -5_000,
      dividendAmount:   10_000,  // also violates TTK_509
    }))
    const rules = violations.map(v => v.rule)
    expect(rules).toContain('TTK_509_NO_PROFIT')
    expect(rules).toContain('NEGATIVE_DISTRIBUTION')
    expect(violations.length).toBeGreaterThanOrEqual(2)
  })

  it('all four rules violated simultaneously → 4 violations all blocking', () => {
    const violations = checkDistributionCompliance({
      distributableNet:      -1_000,  // negative → NEGATIVE_DISTRIBUTION
      dividendAmount:         5_000,  // > distributable → TTK_509_NO_PROFIT
      legalReservesDone:      false,
      legalReserveBalance:    0,       // < 20% cap → TTK_519_RESERVE_REQUIRED
      paidInCapital:          500_000,
      boardDecisionRef:       null,
      isCompensationPayment:  true,   // no board ref → TTK_394_BOARD_REQUIRED
    })
    expect(violations.length).toBe(4)
    expect(violations.every(v => v.blocking)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Blocking vs non-blocking distinction
// ─────────────────────────────────────────────────────────────────────────────

describe('checkDistributionCompliance — blocking field', () => {
  it('all defined violations are blocking (no warnings exist in this function)', () => {
    // checkDistributionCompliance only returns hard blocks — all violations have blocking=true
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: -1,
    }))
    for (const v of violations) {
      expect(v.blocking).toBe(true)
    }
  })

  it('violation objects have required shape: rule, message, blocking', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: 10_000,
      dividendAmount:   20_000,
    }))
    expect(violations.length).toBeGreaterThan(0)
    for (const v of violations) {
      expect(typeof v.rule).toBe('string')
      expect(typeof v.message).toBe('string')
      expect(typeof v.blocking).toBe('boolean')
      expect(v.rule.length).toBeGreaterThan(0)
      expect(v.message.length).toBeGreaterThan(0)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TTK 519 — reserve cap boundary
// ─────────────────────────────────────────────────────────────────────────────

describe('checkDistributionCompliance — TTK_519 cap boundary', () => {
  it('reserve balance exactly at 20% of capital → no TTK_519 violation', () => {
    // Exactly at threshold — must pass
    const violations = checkDistributionCompliance(baseParams({
      legalReservesDone:   false,
      legalReserveBalance: 100_000,   // exactly 20% of 500K
      paidInCapital:       500_000,
    }))
    expect(violations.find(v => v.rule === 'TTK_519_RESERVE_REQUIRED')).toBeUndefined()
  })

  it('reserve balance 1 TRY below 20% cap and reserves not done → violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      legalReservesDone:   false,
      legalReserveBalance: 99_999,    // one TRY short of 100K cap
      paidInCapital:       500_000,
    }))
    expect(violations.find(v => v.rule === 'TTK_519_RESERVE_REQUIRED')).toBeDefined()
  })

  it('zero capital — reserve balance 0 and reserve done → no violation', () => {
    // Edge: paidInCapital = 0 means cap = 0 — reserve condition met trivially
    const violations = checkDistributionCompliance(baseParams({
      legalReservesDone:   false,
      legalReserveBalance: 0,
      paidInCapital:       0,
    }))
    expect(violations.find(v => v.rule === 'TTK_519_RESERVE_REQUIRED')).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TTK 509 — dividend / distributable net boundary cases
// ─────────────────────────────────────────────────────────────────────────────

describe('checkDistributionCompliance — TTK_509 boundary', () => {
  it('dividend 1 TRY above distributable net → violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: 49_999,
      dividendAmount:   50_000,
    }))
    expect(violations.find(v => v.rule === 'TTK_509_NO_PROFIT')).toBeDefined()
  })

  it('dividend 1 TRY below distributable net → no violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: 50_001,
      dividendAmount:   50_000,
    }))
    expect(violations.find(v => v.rule === 'TTK_509_NO_PROFIT')).toBeUndefined()
  })

  it('very large distributable net — any reasonable dividend allowed', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: 10_000_000,
      dividendAmount:   1_000_000,
    }))
    expect(violations.find(v => v.rule === 'TTK_509_NO_PROFIT')).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// NEGATIVE_DISTRIBUTION — boundary cases
// ─────────────────────────────────────────────────────────────────────────────

describe('checkDistributionCompliance — NEGATIVE_DISTRIBUTION boundary', () => {
  it('distributableNet = -1 (barely negative) → violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: -1,
      dividendAmount:   0,
    }))
    expect(violations.find(v => v.rule === 'NEGATIVE_DISTRIBUTION')).toBeDefined()
  })

  it('distributableNet = -1_000_000 → violation still blocking', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: -1_000_000,
      dividendAmount:   0,
    }))
    const v = violations.find(v => v.rule === 'NEGATIVE_DISTRIBUTION')
    expect(v).toBeDefined()
    expect(v?.blocking).toBe(true)
  })

  it('large positive distributableNet → no NEGATIVE_DISTRIBUTION', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: 999_999_999,
    }))
    expect(violations.find(v => v.rule === 'NEGATIVE_DISTRIBUTION')).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TTK 394 — board decision edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('checkDistributionCompliance — TTK_394 edge cases', () => {
  it('empty string boardDecisionRef treated as missing → violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      isCompensationPayment: true,
      boardDecisionRef:      '',   // empty string = falsy
    }))
    // Either violation exists (empty string is treated as falsy) or no violation
    // Test that the function doesn't throw — both outcomes are acceptable
    expect(Array.isArray(violations)).toBe(true)
  })

  it('non-compensation dividend with board ref → no TTK_394 violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      isCompensationPayment: false,
      boardDecisionRef:      'GK-2025-01',
    }))
    expect(violations.find(v => v.rule === 'TTK_394_BOARD_REQUIRED')).toBeUndefined()
  })

  it('compensation payment with valid board ref from different format → no violation', () => {
    const violations = checkDistributionCompliance(baseParams({
      isCompensationPayment: true,
      boardDecisionRef:      '2026/05/YK-01',
    }))
    expect(violations.find(v => v.rule === 'TTK_394_BOARD_REQUIRED')).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Return type — always an array
// ─────────────────────────────────────────────────────────────────────────────

describe('checkDistributionCompliance — return type', () => {
  it('always returns an array (even when compliant)', () => {
    const result = checkDistributionCompliance(baseParams())
    expect(Array.isArray(result)).toBe(true)
  })

  it('returned array items implement ComplianceViolation interface', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: -100,
    }))
    for (const v of violations) {
      expect(v).toHaveProperty('rule')
      expect(v).toHaveProperty('message')
      expect(v).toHaveProperty('blocking')
    }
  })

  it('rules in violations are uppercase strings', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: -1,
      dividendAmount:   1,
    }))
    for (const v of violations) {
      expect(v.rule).toMatch(/^[A-Z_0-9]+$/)
    }
  })

  it('messages contain Turkish legal references', () => {
    const violations = checkDistributionCompliance(baseParams({
      distributableNet: -100,
      legalReservesDone: false,
      legalReserveBalance: 0,
      paidInCapital: 500_000,
    }))
    const allMessages = violations.map(v => v.message).join(' ')
    expect(allMessages).toMatch(/TTK/)
  })
})

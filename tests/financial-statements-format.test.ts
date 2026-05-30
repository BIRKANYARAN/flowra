/**
 * Pure function tests for:
 *   lib/services/balance-sheet.service.ts
 *     — formatBsAmount()
 *     — validateBsInvariant()
 *     — computeCurrentRatio()
 *     — computeDebtToEquity()
 *
 *   lib/services/cashflow-statement.service.ts
 *     — validateCashFlowInvariant()
 *     — classifyCashFlowHealth()
 *
 * All helpers are pure (no I/O). Run with:
 *   npx vitest run tests/financial-statements-format.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  formatBsAmount,
  validateBsInvariant,
  computeCurrentRatio,
  computeDebtToEquity,
} from '../lib/services/balance-sheet.service'
import {
  validateCashFlowInvariant,
  classifyCashFlowHealth,
} from '../lib/services/cashflow-statement.service'

// ─────────────────────────────────────────────────────────────────────────────
// formatBsAmount
// ─────────────────────────────────────────────────────────────────────────────
describe('formatBsAmount', () => {
  it('formats a positive amount without contra flag as positive', () => {
    const result = formatBsAmount(1000, false)
    expect(result).toContain('1.000')   // Turkish locale thousands separator
  })

  it('formats a positive contra amount as negative', () => {
    const result = formatBsAmount(500, true)
    // Negative value should appear in formatted string
    expect(result).toContain('-')
  })

  it('formats zero as zero regardless of contra flag', () => {
    expect(formatBsAmount(0, false)).not.toContain('-')
    // contra of 0 is still 0
    expect(formatBsAmount(0, true)).not.toContain('500')
  })

  it('always includes TRY currency marker', () => {
    const result = formatBsAmount(2500.75, false)
    expect(result).toMatch(/₺|TRY/)
  })

  it('rounds to 2 decimal places', () => {
    const result = formatBsAmount(100.5, false)
    expect(result).toMatch(/,50|\.50/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// validateBsInvariant
// ─────────────────────────────────────────────────────────────────────────────
describe('validateBsInvariant', () => {
  it('returns balanced=true when assets = liabilities + equity exactly', () => {
    const result = validateBsInvariant(1000, 400, 600)
    expect(result.balanced).toBe(true)
    expect(result.discrepancy).toBe(0)
  })

  it('returns balanced=true when discrepancy is less than 0.01', () => {
    // 1000 vs 400 + 599.995 = 999.995, diff = 0.005
    const result = validateBsInvariant(1000, 400, 599.995)
    expect(result.balanced).toBe(true)
    expect(Math.abs(result.discrepancy)).toBeLessThan(0.01)
  })

  it('returns balanced=false when discrepancy is exactly 0.01', () => {
    // assets=1000, liabilities+equity=999.99, diff=0.01
    const result = validateBsInvariant(1000, 400, 599.99)
    expect(result.balanced).toBe(false)
  })

  it('returns balanced=false when discrepancy is larger than 0.01', () => {
    const result = validateBsInvariant(1000, 300, 600)
    expect(result.balanced).toBe(false)
    expect(result.discrepancy).toBe(100)
  })

  it('returns correct positive discrepancy when assets exceed liabilities+equity', () => {
    const result = validateBsInvariant(1100, 400, 600)
    expect(result.discrepancy).toBe(100)
  })

  it('returns correct negative discrepancy when assets are less than liabilities+equity', () => {
    const result = validateBsInvariant(900, 400, 600)
    expect(result.discrepancy).toBe(-100)
  })

  it('handles zero values', () => {
    const result = validateBsInvariant(0, 0, 0)
    expect(result.balanced).toBe(true)
    expect(result.discrepancy).toBe(0)
  })

  it('handles large values with floating-point noise gracefully', () => {
    // 4_250_000 == 2_800_000 + 1_450_000 exactly
    const result = validateBsInvariant(4_250_000, 2_800_000, 1_450_000)
    expect(result.balanced).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeCurrentRatio
// ─────────────────────────────────────────────────────────────────────────────
describe('computeCurrentRatio', () => {
  it('returns null when currentLiabilities is 0', () => {
    expect(computeCurrentRatio(500, 0)).toBeNull()
  })

  it('computes ratio correctly for normal values', () => {
    expect(computeCurrentRatio(1000, 500)).toBe(2)
  })

  it('computes ratio below 1 when assets < liabilities', () => {
    expect(computeCurrentRatio(300, 600)).toBe(0.5)
  })

  it('rounds result to 2 decimal places', () => {
    // 1000 / 300 = 3.3333... → 3.33
    expect(computeCurrentRatio(1000, 300)).toBe(3.33)
  })

  it('returns 1 when currentAssets equals currentLiabilities', () => {
    expect(computeCurrentRatio(750, 750)).toBe(1)
  })

  it('handles zero currentAssets', () => {
    expect(computeCurrentRatio(0, 500)).toBe(0)
  })

  it('returns null only for zero liabilities, not negative liabilities', () => {
    // Negative liabilities are unusual but shouldn't return null
    const result = computeCurrentRatio(1000, -200)
    expect(result).not.toBeNull()
    expect(result).toBe(-5)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeDebtToEquity
// ─────────────────────────────────────────────────────────────────────────────
describe('computeDebtToEquity', () => {
  it('returns null when totalEquity is 0', () => {
    expect(computeDebtToEquity(500, 0)).toBeNull()
  })

  it('returns null when totalEquity is negative', () => {
    expect(computeDebtToEquity(500, -100)).toBeNull()
  })

  it('computes ratio correctly for normal values', () => {
    expect(computeDebtToEquity(1000, 500)).toBe(2)
  })

  it('returns 0 when there is no debt', () => {
    expect(computeDebtToEquity(0, 1000)).toBe(0)
  })

  it('rounds result to 2 decimal places', () => {
    // 1000 / 300 = 3.3333... → 3.33
    expect(computeDebtToEquity(1000, 300)).toBe(3.33)
  })

  it('returns 1 when debt equals equity', () => {
    expect(computeDebtToEquity(400, 400)).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// validateCashFlowInvariant
// ─────────────────────────────────────────────────────────────────────────────
describe('validateCashFlowInvariant', () => {
  it('returns valid=true when opening + netChange = closing exactly', () => {
    const result = validateCashFlowInvariant(1000, 250, 1250)
    expect(result.valid).toBe(true)
    expect(result.discrepancy).toBe(0)
  })

  it('returns valid=true when discrepancy is less than 0.01', () => {
    // 1000 + 250 = 1250, closing = 1250.004, diff = 0.004 → rounds to 0
    const result = validateCashFlowInvariant(1000, 250, 1250.004)
    expect(result.valid).toBe(true)
    expect(Math.abs(result.discrepancy)).toBeLessThan(0.01)
  })

  it('returns valid=false when discrepancy is 0.01 or more', () => {
    // 1000 + 250 = 1250, closing = 1250.01, diff = 0.01
    const result = validateCashFlowInvariant(1000, 250, 1250.01)
    expect(result.valid).toBe(false)
  })

  it('returns valid=false for large discrepancy', () => {
    const result = validateCashFlowInvariant(1000, 250, 1500)
    expect(result.valid).toBe(false)
    expect(result.discrepancy).toBe(250)
  })

  it('handles negative net change (cash decrease)', () => {
    const result = validateCashFlowInvariant(1250, -250, 1000)
    expect(result.valid).toBe(true)
    expect(result.discrepancy).toBe(0)
  })

  it('handles zero opening balance', () => {
    const result = validateCashFlowInvariant(0, 500, 500)
    expect(result.valid).toBe(true)
  })

  it('returns positive discrepancy when closing > expected', () => {
    const result = validateCashFlowInvariant(1000, 100, 1200)
    expect(result.discrepancy).toBe(100)
  })

  it('returns negative discrepancy when closing < expected', () => {
    const result = validateCashFlowInvariant(1000, 300, 1200)
    expect(result.discrepancy).toBe(-100)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// classifyCashFlowHealth
// ─────────────────────────────────────────────────────────────────────────────
describe('classifyCashFlowHealth', () => {
  it("returns 'growing' when operating>0 and investing<0", () => {
    expect(classifyCashFlowHealth(500, -200, -100)).toBe('growing')
  })

  it("returns 'strong' when operating>0 and investing>=0", () => {
    expect(classifyCashFlowHealth(500, 0, -100)).toBe('strong')
    expect(classifyCashFlowHealth(500, 100, -100)).toBe('strong')
  })

  it("returns 'strong' when operating>0 and financing is positive", () => {
    expect(classifyCashFlowHealth(500, 0, 200)).toBe('strong')
  })

  it("returns 'restructuring' when operating<0 and financing>0", () => {
    expect(classifyCashFlowHealth(-100, 0, 300)).toBe('restructuring')
  })

  it("returns 'restructuring' when operating<0, investing is positive, financing>0", () => {
    expect(classifyCashFlowHealth(-200, 50, 400)).toBe('restructuring')
  })

  it("returns 'distressed' when operating<0 and financing<=0", () => {
    expect(classifyCashFlowHealth(-100, 0, 0)).toBe('distressed')
    expect(classifyCashFlowHealth(-100, 0, -50)).toBe('distressed')
  })

  it("returns 'distressed' when all sections are negative", () => {
    expect(classifyCashFlowHealth(-100, -50, -200)).toBe('distressed')
  })

  it("returns 'distressed' when operating=0 (not positive, not restructuring)", () => {
    // operating=0 is not >0, not <0, so falls to default distressed
    expect(classifyCashFlowHealth(0, -50, -100)).toBe('distressed')
  })

  it("prioritises 'growing' over 'strong' when both conditions met", () => {
    // operating>0 AND investing<0 → 'growing', not 'strong'
    expect(classifyCashFlowHealth(1000, -500, 100)).toBe('growing')
  })

  it("returns 'growing' regardless of financing sign when operating>0 and investing<0", () => {
    expect(classifyCashFlowHealth(300, -100, 500)).toBe('growing')
    expect(classifyCashFlowHealth(300, -100, -500)).toBe('growing')
  })
})

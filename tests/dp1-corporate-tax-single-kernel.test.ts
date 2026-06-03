// ── dp1-corporate-tax-single-kernel.test.ts ──────────────────────────────────
// DP-1 GUARD + regression snapshot: corporate tax / matrah has ONE kernel.
//
// Approved decision (DP-1): the canonical matrah = revenue − COGS − deductible
// expenses (+KKEG via deductible-only), and `computeCorporateTax` is the single
// corporate-tax kernel. Every path that applies the corporate-tax rate to a base
// MUST flow through it — so the rate, the loss floor (no tax on a loss), and the
// rounding can never diverge again.
//
// This test pins (a) behavioural EQUIVALENCE: every provision/estimate helper
// equals the kernel applied to its own base, and (b) a STATIC guard that the
// consumer modules don't re-introduce an inline rate multiplication.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, join } from 'path'
import { computeCorporateTax } from '@/lib/services/tax.service'
import {
  computeCorporateTaxProvision,
  computeGeciVergi,
} from '@/lib/services/tax/tax-compliance.service'
import { computeGecikmeTaxEstimate } from '@/lib/services/finance/tax-compliance.service'
import { computeTaxProvision } from '@/lib/services/finance/income-statement.service'
import { CORPORATE_TAX_RATE_TR } from '@/lib/services/finance-rules'

const ROOT = resolve(__dirname, '..')
const kernelTax = (base: number) =>
  computeCorporateTax({ revenue_try: base, cost_try: 0, deductible_expenses_try: 0, rate_percent: CORPORATE_TAX_RATE_TR }).tax_try

const BASES = [0, 1, 100, 333.33, 50_000, 100_000, 1_000_000, 10_000_000, -1, -999_999]

describe('DP-1 — every corporate-tax helper flows through the single kernel', () => {
  it('computeCorporateTaxProvision === kernel(base)', () => {
    for (const b of BASES) expect(computeCorporateTaxProvision(b)).toBe(kernelTax(b))
  })

  it('computeGecikmeTaxEstimate (default rate) === kernel(base)', () => {
    for (const b of BASES) expect(computeGecikmeTaxEstimate(b)).toBe(kernelTax(b))
  })

  it('computeTaxProvision (income-statement, EBT base) === kernel(ebt)', () => {
    for (const b of BASES) expect(computeTaxProvision(b)).toBe(kernelTax(b))
  })

  it('computeGeciVergi(base, q, 0) === kernel(base) × quarter-fraction', () => {
    const frac: Record<number, number> = { 1: 0.25, 2: 0.5, 3: 0.75, 4: 1 }
    for (const b of [100_000, 400_000, 1_000]) {
      for (const q of [1, 2, 3, 4] as const) {
        expect(computeGeciVergi(b, q, 0)).toBeCloseTo(kernelTax(b) * frac[q], 6)
      }
    }
  })

  it('the kernel itself never returns a negative tax (loss floor)', () => {
    expect(kernelTax(-500_000)).toBe(0)
    expect(computeCorporateTaxProvision(-1)).toBe(0)
    expect(computeTaxProvision(-1)).toBe(0)
  })
})

describe('DP-1 — static guard: no inline corporate-tax rate outside the kernel', () => {
  // Each consumer module must DELEGATE to computeCorporateTax and must NOT carry an
  // inline rate-fraction constant or multiply a base by the rate itself.
  const CONSUMERS = [
    'lib/services/tax/tax-compliance.service.ts',
    'lib/services/finance/tax-compliance.service.ts',
    'lib/services/finance/income-statement.service.ts',
    'lib/services/simulation-strategic.service.ts',
  ]
  for (const rel of CONSUMERS) {
    it(`${rel} delegates to computeCorporateTax`, () => {
      const src = readFileSync(join(ROOT, rel), 'utf8')
      expect(src).toContain('computeCorporateTax(')
    })
    it(`${rel} has no inline corporate-tax rate multiplication`, () => {
      const src = readFileSync(join(ROOT, rel), 'utf8')
      expect(src).not.toMatch(/CORP_TAX_FRACTION/)            // the old inline fraction const
      expect(src).not.toMatch(/\*\s*taxRate\s*\/\s*100/)      // ebt * taxRate / 100
      expect(src).not.toMatch(/ytdNetProfit\s*\*\s*taxRate/)  // netProfit * taxRate
    })
  }
})

// ── corporate-tax-rate-single-source.test.ts ─────────────────────────────────
// GUARD for the "single source of truth" root cause (RC-1), corporate-tax-rate slice.
//
// The Turkish corporate / advance (geçici) tax RATE must have exactly one source:
// CORPORATE_TAX_RATE_TR in lib/services/finance-rules.ts (25 for 2023+). When a
// computation hardcoded the stale 0.20 instead, the Vergi/Kurumlar compliance
// dashboard reported a Kurumlar Vergisi ~20% lower than every other screen — the
// exact "the numbers disagree" failure class. This test makes re-introducing a
// stale/independent corporate-tax rate a RED BUILD.
//
// NOTE: KDV (VAT) legitimately uses 0.20 (the standard rate) — these assertions
// are scoped to the corporate-tax computation patterns only, never KDV.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, join } from 'path'
import { CORPORATE_TAX_RATE_TR } from '@/lib/services/finance-rules'

const ROOT = resolve(__dirname, '..')

// Every file that multiplies a tax base by the corporate-tax rate. Each MUST take
// the rate from CORPORATE_TAX_RATE_TR — never a hardcoded literal.
const CORP_TAX_FILES = [
  'lib/services/tax/tax-compliance.service.ts',
  'lib/services/tax.service.ts',
  'lib/services/finance/income-statement.service.ts',
]

// Stale/independent corporate-tax-rate patterns that must never reappear.
const STALE_CORP_RATE_PATTERNS: { re: RegExp; why: string }[] = [
  { re: /netIncome\w*\s*\*\s*0\.20\b/,    why: 'corporate tax provision hardcoded at the stale 20%' },
  { re: /0\.20\s*\*\s*fraction\b/,        why: 'geçici vergi hardcoded at the stale 20%' },
  { re: /TAX_RATE\s*=\s*0\.2[05]\b/,      why: 'corporate TAX_RATE hardcoded instead of the shared constant' },
]

describe('corporate-tax rate — single source of truth (RC-1 guard)', () => {
  it('the canonical rate is 25 (2023+ Turkish statutory Kurumlar Vergisi)', () => {
    expect(CORPORATE_TAX_RATE_TR).toBe(25)
  })

  for (const rel of CORP_TAX_FILES) {
    it(`${rel} sources the corporate-tax rate from CORPORATE_TAX_RATE_TR`, () => {
      const txt = readFileSync(join(ROOT, rel), 'utf8')
      expect(txt).toContain('CORPORATE_TAX_RATE_TR')
    })

    it(`${rel} contains no stale/independent corporate-tax rate literal`, () => {
      const txt = readFileSync(join(ROOT, rel), 'utf8')
      for (const { re, why } of STALE_CORP_RATE_PATTERNS) {
        expect(txt, `stale corporate-tax rate in ${rel}: ${why}`).not.toMatch(re)
      }
    })
  }
})

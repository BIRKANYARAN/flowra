// ── partner-capital-schema-guard.test.ts ─────────────────────────────────────
// GUARD for the partner_capital_commitments column fixes (DP-5) and the compliance
// dashboard's canonical-COGS matrah (DP-1b).
//
// The real partner_capital_commitments columns are committed_try / paid_try /
// commitment_date / due_date / deleted_at (cancellation = soft delete; there is NO
// payment_status, paid_date, *_amount_try, or call_date column). Eight PCLE services
// queried non-existent columns, so paid-in capital silently read 0. These tokens
// must never reappear in the PCLE layer.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { resolve, join } from 'path'

const ROOT = resolve(__dirname, '..')
const PCLE = join(ROOT, 'lib/services/pcle')

const pcleSources = readdirSync(PCLE)
  .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .map(f => ({ file: f, src: readFileSync(join(PCLE, f), 'utf8') }))

// Tokens that are ALWAYS partner_capital_commitments DB-column drift (these names
// never appear as legitimate identifiers in the layer). NOTE: 'call_date' is NOT
// listed — it survives as the report's own output field name; the drift was the DB
// read, which is covered by banning the *_amount_try column selects.
const DRIFT_TOKENS = ['paid_amount_try', 'committed_amount_try']

describe('partner_capital_commitments schema guard (DP-5)', () => {
  for (const token of DRIFT_TOKENS) {
    it(`no PCLE service references the non-existent column "${token}"`, () => {
      const hits = pcleSources.filter(s => s.src.includes(token)).map(s => s.file)
      expect(hits, `drift "${token}" reappeared in: ${hits.join(', ')}`).toEqual([])
    })
  }

  it('the canonical columns committed_try / paid_try are in use', () => {
    const all = pcleSources.map(s => s.src).join('\n')
    expect(all).toContain('committed_try')
    expect(all).toContain('paid_try')
  })
})

describe('compliance dashboard uses the canonical real-COGS matrah (DP-1b)', () => {
  it('tax-compliance dashboard sources matrah from FinanceService, not a 60% COGS guess', () => {
    const src = readFileSync(join(ROOT, 'lib/services/tax/tax-compliance.service.ts'), 'utf8')
    expect(src).toContain('FinanceService.getGrossProfit')
    expect(src).not.toMatch(/ytdRevenue\s*\*\s*0\.60/)   // the old 60%-of-revenue COGS proxy
  })
})

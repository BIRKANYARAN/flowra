// ── dp3-dividend-distributable-guard.test.ts ─────────────────────────────────
// DP-3 GUARD: dividend distributable profit must be the CANONICAL net income
// (revenue − COGS − all opex − corporate tax), the TTK 509 guard must always apply
// (no zero-revenue escape hatch) and must be FATAL, and the TTK 519 reserve must be
// capped at 20% of paid-in capital.
//
// The previous code computed distributable as revenue − opex (ignoring COGS), only
// enforced the guard when ytdRevenue > 0, and proceeded if the check threw — which
// let companies over-distribute (TTK 509 criminal-liability exposure). These guards
// make any regression a red build.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, join } from 'path'

const ROOT = resolve(__dirname, '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

describe('DP-3 — dividend declare route (Pattern B)', () => {
  const src = read('app/api/partners/dividend/declare/route.ts')

  it('distributable comes from the canonical net income (FinanceService), not revenue − opex', () => {
    expect(src).toContain('FinanceService.getFinancialSummary')
    expect(src).toContain('net_after_tax_try')
  })

  it('has NO zero-revenue escape hatch on the TTK 509 guard', () => {
    expect(src).not.toMatch(/ytdRevenue\s*>\s*0\s*&&/)
  })

  it('the distributable guard is FATAL (blocks when profit cannot be verified)', () => {
    expect(src).toContain('DISTRIBUTABLE_UNVERIFIED')
    // the old non-fatal "proceed with a warning" comment must be gone
    expect(src).not.toMatch(/proceed with a logged warning/i)
  })

  it('inserts the batch atomically via the Postgres function (no sequential per-partner loop)', () => {
    // True DB-level atomicity: one RPC, whole batch rolls back on any failure.
    expect(src).toContain("supabase.rpc('declare_dividend_atomic'")
    // The old non-atomic sequential addTransaction loop must be gone.
    expect(src).not.toMatch(/PartnerService\.addTransaction/)
  })
})

describe('DP-3 — DividendService.calculate (Pattern A)', () => {
  const src = read('lib/services/pcle/dividend.service.ts')

  it('net income basis is the canonical FinanceService summary', () => {
    expect(src).toContain('FinanceService.getFinancialSummary')
    expect(src).toContain('summary.net_after_tax_try')
  })

  it('TTK 519 reserve is capped at 20% of paid-in capital', () => {
    expect(src).toMatch(/paidInCapital\s*\*\s*0\.20/)
    expect(src).toContain('reserveCeiling')
  })
})

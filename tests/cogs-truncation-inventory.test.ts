// ── cogs-truncation-inventory.test.ts ─────────────────────────────────────────
// LIVING INVENTORY + GUARD for the COGS row-cap truncation bug class.
//
// Every service that computes COGS reads it through the pipeline
//   sales → sale_items → sale_item_allocations
// and bounds each step with a `.limit(N)`. When a step returns rows UP TO its cap,
// COGS is SILENTLY UNDERSTATED → overstated profit / margin / tax. The pattern is
// replicated across many services (see BASELINE below). The proper fix — pushing
// the date filter into a DB-side join/RPC so no row cap or ID-materialization is
// needed — is credential-gated (needs a migration), so it is not yet applied.
//
// Until then this guard keeps the risk VISIBLE and bounded:
//   1. it enumerates every COGS-cost site (allocations + cost_price_try +
//      stock_lots + qty_allocated) and asserts the set matches BASELINE, so a NEW
//      such query cannot be added without the author cataloguing it here (and
//      thinking about caps + truncation);
//   2. it records which sites already surface a truncation warning — today the two
//      AUTHORITATIVE profit/tax sources (getCfoMetrics + the formal P&L). The rest
//      are lower-stakes analytics (per-month/per-period loops, several with a
//      total_cost fallback) where per-iteration logging would be noise.
//
// When DB credentials unblock the proper fix, this file is the checklist of sites.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { resolve, join } from 'path'

const ROOT = resolve(__dirname, '..')
const LIB = join(ROOT, 'lib')

function walkTs(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walkTs(p, acc)
    else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) acc.push(p)
  }
  return acc
}

// A file is a "COGS-cost site" if it reads the per-unit cost off allocations.
function isCogsCostSite(txt: string): boolean {
  return /from\(\s*['"]sale_item_allocations['"]/.test(txt) &&
    txt.includes('cost_price_try') &&
    txt.includes('stock_lots') &&
    txt.includes('qty_allocated')
}

// Already logs a truncation warning when a row cap is hit.
function isObservable(txt: string): boolean {
  return txt.includes('cogsTruncationWarning') || txt.includes('COGS likely UNDERSTATED')
}

// Documented inventory (paths relative to lib/). Keep sorted.
const BASELINE = [
  'finance/financial-core.ts',
  'services/commercial/inventory-turnover.service.ts',
  'services/commercial/sku-performance.service.ts',
  'services/finance.service.ts',
  'services/finance/ebitda-bridge.service.ts',
  'services/finance/financial-ratios.service.ts',
  'services/finance/gross-margin-bridge.service.ts',
  'services/finance/income-statement.service.ts',
  'services/finance/margin-trend.service.ts',
  'services/inventory/fifo-audit.service.ts',
  'services/planning/variance-analysis.service.ts',
].sort()

// The two authoritative profit/tax sources that surface truncation today.
const OBSERVABLE = [
  'finance/financial-core.ts',
  'services/finance/income-statement.service.ts',
].sort()

const sites = walkTs(LIB)
  .filter(p => isCogsCostSite(readFileSync(p, 'utf8')))
  .map(p => p.slice(LIB.length + 1))
  .sort()

describe('COGS truncation inventory (guard for the silent-understatement bug class)', () => {
  it('every COGS-cost site is catalogued — no new untracked sale_item_allocations COGS query', () => {
    // If this fails, a service started (or stopped) reading COGS from
    // sale_item_allocations. Update BASELINE and confirm the new query's .limit()
    // caps + whether it needs a truncation warning.
    expect(sites).toEqual(BASELINE)
  })

  it('the authoritative profit/tax sources surface a truncation warning', () => {
    for (const rel of OBSERVABLE) {
      const txt = readFileSync(join(LIB, rel), 'utf8')
      expect(isObservable(txt)).toBe(true)
    }
  })

  it('OBSERVABLE is a subset of the catalogued sites (no stale entries)', () => {
    for (const rel of OBSERVABLE) expect(BASELINE).toContain(rel)
  })

  it('the formal P&L threads the truncation warning all the way to the UI', () => {
    // The IncomeStatement shape carries the warning, the service populates it from
    // truncWarn, and the client renders a visible banner — so COGS understatement is
    // never silent on screen (not just a console.warn).
    const svc = readFileSync(join(LIB, 'services/finance/income-statement.service.ts'), 'utf8')
    expect(svc).toMatch(/data_completeness_warning:\s*string \| null/)        // on the public interface
    expect(svc).toContain('data_completeness_warning: truncWarn ?? null')      // populated from the cap check
    const client = readFileSync(
      join(ROOT, 'app/dashboard/finance/_tabs/_income/IncomeStatementClient.tsx'), 'utf8')
    expect(client).toContain('statement?.data_completeness_warning')           // rendered as a banner
  })
})

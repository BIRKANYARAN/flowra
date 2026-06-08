// ── queried-tables-defined-guard.test.ts ──────────────────────────────────────
// REGRESSION GUARD for the "code queries a table that doesn't exist" bug class.
//
// Root cause of a whole family of silently-degrading / 500ing features this codebase
// hit: a service did `.from('<table>')` for a table that exists in NEITHER the canonical
// install NOR prod (wrong name, never-migrated, or never-designed). PostgREST 400s →
// the query throws (500) or degrades to empty (dead feature). Examples fixed:
// recurring_expenses (unmigrated), documents→company_documents, resolutions→
// governance_resolutions, transactions→sales, compensation_schedules→
// partner_compensation_schedules.
//
// This guard fails CI if ANY `.from('table')` in lib/ or app/ references a table that is
// neither in the canonical install (FLOWRA_PRODUCTION_INSTALL.sql) nor a documented
// KNOWN_ORPHANS entry. New undefined-table references are caught at build time.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { resolve, join } from 'path'

const ROOT = resolve(__dirname, '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue
      walk(p, out)
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(p)
    }
  }
  return out
}

// Every table name referenced via `.from('<name>')` in lib/ + app/.
function queriedTables(): Set<string> {
  const out = new Set<string>()
  for (const dir of ['lib', 'app']) {
    for (const file of walk(resolve(ROOT, dir))) {
      const txt = readFileSync(file, 'utf8')
      for (const m of txt.matchAll(/\.from\(\s*'([a-z_][a-z0-9_]*)'\s*\)/g)) {
        out.add(m[1])
      }
    }
  }
  return out
}

// Tables defined by the canonical fresh install.
function canonicalTables(): Set<string> {
  const txt = readFileSync(resolve(ROOT, 'supabase/FLOWRA_PRODUCTION_INSTALL.sql'), 'utf8')
  const out = new Set<string>()
  for (const m of txt.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)/gi)) {
    out.add(m[1].toLowerCase())
  }
  return out
}

// DB views the code legitimately reads via .from() (not CREATE TABLE).
const KNOWN_VIEWS = new Set<string>([
  'v_gl_account_balances',
  'v_trial_balance',
  'alert_rule_audit',
])

// Tables referenced by code but NOT defined anywhere — genuine UNIMPLEMENTED features
// (no real table, no clean rename target). They all degrade gracefully (no 500) today.
// Each is a deliberate, documented gap awaiting a product decision (build the table or
// remove the orphaned endpoint). DO NOT add to this list to silence a real bug — a NEW
// entry here must be a genuinely-unimplemented feature, not a typo/wrong-name.
const KNOWN_ORPHANS = new Set<string>([
  'accounts',
  'alerts',
  'app_config',
  'approval_workflows',
  'audit_readiness_checks',
  'bank_accounts',
  'bank_statement_lines',
  'bank_transactions',
  'cfo_pack_manifests',
  'company_budgets',
  'cost_centers',
  'cost_entries',
  'expense_items',
  'logos',
  'period_close_manual_confirmations',
  'product_cost_entries',
  'sale_lines',
  'sales_targets',
  'tax_obligations',
])

describe('queried tables ⊆ canonical install ∪ known orphans', () => {
  const queried   = queriedTables()
  const canonical = canonicalTables()

  it('parsing sanity — found a healthy number of queried + canonical tables', () => {
    expect(queried.size).toBeGreaterThan(40)
    expect(canonical.size).toBeGreaterThan(50)
  })

  it('every `.from(table)` is defined in the canonical install (or a documented orphan/view)', () => {
    const undefinedRefs = [...queried].filter(
      t => !canonical.has(t) && !KNOWN_ORPHANS.has(t) && !KNOWN_VIEWS.has(t),
    )
    // A NEW undefined-table reference (wrong name, never-migrated, or typo) fails here.
    expect(undefinedRefs).toEqual([])
  })

  it('KNOWN_ORPHANS stays honest — no stale entries (each is still queried & still undefined)', () => {
    const stale = [...KNOWN_ORPHANS].filter(t => !queried.has(t) || canonical.has(t))
    // Once an orphan is implemented (added to canonical) or its last query removed,
    // delete it from KNOWN_ORPHANS — this catches that.
    expect(stale).toEqual([])
  })
})

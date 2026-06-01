// ── schema-drift-guard.test.ts ────────────────────────────────────────────────
// MIGRATION SAFETY CHECK (priority #2 — verification infrastructure).
//
// Root cause of the /api/partners/compensation 500: partner_compensation_payments
// was created in a migration (20260527000002) but NOT added to the canonical
// FLOWRA_PRODUCTION_INSTALL.sql, and the migration was never applied to prod →
// a table the code queries did not exist. This test guards that bug CLASS: every
// table a migration creates must also be in the canonical install, so a fresh
// install is complete and consistent with the migration history.
//
// KNOWN_DRIFT documents the tables that have drifted today (each needs to be
// (a) folded into the canonical install AND (b) applied to prod via its
// migration — the latter is credential-gated). The test FAILS if any NEW
// undocumented drift appears, forcing the author to keep the install canonical.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '..')

function tablesIn(paths: string[]): Set<string> {
  const out = new Set<string>()
  for (const p of paths) {
    let txt = ''
    try { txt = readFileSync(p, 'utf8') } catch { continue }
    for (const m of txt.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/gi)) {
      out.add(m[1].toLowerCase())
    }
  }
  return out
}

const migrationFiles = readdirSync(resolve(ROOT, 'supabase/migrations'))
  .filter(f => f.endsWith('.sql'))
  .map(f => resolve(ROOT, 'supabase/migrations', f))

const migrationTables = tablesIn(migrationFiles)
const canonicalTables = tablesIn([resolve(ROOT, 'supabase/FLOWRA_PRODUCTION_INSTALL.sql')])

// Tables present in migrations but not yet in the canonical install.
// Each MUST be applied to production via its migration (credential-gated) and
// SHOULD be folded into FLOWRA_PRODUCTION_INSTALL.sql for fresh-install parity.
// All 7 previously-drifted tables are now folded into FLOWRA_PRODUCTION_INSTALL.sql
// (the "DRIFT FOLD" section) for fresh-install parity, so the allowlist is empty.
// NOTE: EXISTING production databases must still apply the original migrations to
// gain these tables — that is credential-gated and out of scope for this guard,
// which only verifies fresh-install ⊇ migration tables.
const KNOWN_DRIFT = new Set<string>([])

describe('schema drift — migrations ⊆ canonical install', () => {
  it('every migration table is in the canonical install or a documented KNOWN_DRIFT entry', () => {
    const drift = [...migrationTables].filter(t => !canonicalTables.has(t))
    const undocumented = drift.filter(t => !KNOWN_DRIFT.has(t))
    // A NEW migration table missing from the canonical install fails here.
    expect(undocumented).toEqual([])
  })

  it('KNOWN_DRIFT only lists tables that are actually still drifted (no stale entries)', () => {
    // Keeps the allowlist honest: once a table is folded into the canonical
    // install, it must be removed from KNOWN_DRIFT (this test then catches it).
    const stillDrifted = [...KNOWN_DRIFT].filter(t => migrationTables.has(t) && !canonicalTables.has(t))
    const stale = [...KNOWN_DRIFT].filter(t => !stillDrifted.includes(t))
    expect(stale).toEqual([])
  })

  it('parsing sanity — found migration and canonical tables', () => {
    expect(migrationTables.size).toBeGreaterThan(0)
    expect(canonicalTables.size).toBeGreaterThan(30)
  })
})

/**
 * RLS policy validation tests — static analysis of flowra_install.sql.
 *
 * These tests verify that Row Level Security is correctly declared for every
 * company-scoped table in the schema.  They run without a database connection;
 * they parse the SQL file and assert on its contents.
 *
 * WHY THIS MATTERS:
 *   Without RLS, a user who guesses another company's UUID can read its data
 *   by calling the Supabase REST API directly.  The application-level
 *   company_id filtering in route handlers is a defence-in-depth layer, NOT
 *   a primary security boundary.  RLS is the primary boundary.
 *
 * Run with: npx vitest run tests/rls-policies.test.ts
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  RATE_LIMIT_PRESETS,
  rateLimitKey,
  rateLimitExceededResponse,
} from '../lib/rate-limit'

const sql = readFileSync(join(__dirname, '..', 'supabase', 'flowra_install.sql'), 'utf-8')

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

function hasRls(table: string): boolean {
  return sql.includes(`alter table ${table} enable row level security`)
}

function hasPolicy(table: string): boolean {
  return sql.includes(`on ${table}`)    // policy name OR policy ON clause
}

function hasFlowraPolicy(table: string): boolean {
  return sql.includes(`"flowra_${table}_`) || sql.includes(`on ${table}\n`) || sql.includes(`on ${table} `)
}

// ─────────────────────────────────────────────────────────────────────────────
// flowra_user_companies() helper function
// ─────────────────────────────────────────────────────────────────────────────

describe('flowra_user_companies() RLS helper', () => {
  it('is defined as a SECURITY DEFINER function', () => {
    expect(sql).toContain('create or replace function flowra_user_companies()')
    expect(sql).toContain('security definer')
  })

  it('filters by auth.uid()', () => {
    expect(sql).toContain('where  user_id      = auth.uid()')
  })

  it('excludes soft-deleted and pending members', () => {
    expect(sql).toContain('and  deleted_at   is null')
    expect(sql).toContain('and  accepted_at  is not null')
  })

  it('grants execute to authenticated role', () => {
    expect(sql).toContain('grant execute on function flowra_user_companies to authenticated')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Direct company-scoped tables — must have RLS enabled + company policy
// ─────────────────────────────────────────────────────────────────────────────

const DIRECT_TABLES = [
  'sales',
  'expenses',
  'recurring_expenses',
  'products',
  'customers',
  'stock_lots',
  'stock_movements',
  'proformas',
  'partners',
  'partner_transactions',
  'company_banks',
  'tasks',
  'alerts',
  'audit_logs',
  'purchases',
  'user_settings',
] as const

describe('RLS enabled — direct company-scoped tables', () => {
  for (const table of DIRECT_TABLES) {
    it(`${table}: row level security is enabled`, () => {
      expect(hasRls(table), `Missing: alter table ${table} enable row level security`).toBe(true)
    })

    it(`${table}: flowra isolation policy is declared`, () => {
      expect(
        sql.includes(`"flowra_${table}_company_isolation"`),
        `Missing policy "flowra_${table}_company_isolation"`,
      ).toBe(true)
    })

    it(`${table}: policy uses flowra_user_companies() helper`, () => {
      // The policy block for this table must reference the helper function
      const tableSection = sql.slice(sql.indexOf(`"flowra_${table}_company_isolation"`))
      const endOfBlock   = tableSection.indexOf('exception when duplicate_object')
      const policyBlock  = tableSection.slice(0, endOfBlock > 0 ? endOfBlock : 500)
      expect(
        policyBlock.includes('flowra_user_companies()'),
        `Policy for ${table} must use flowra_user_companies()`,
      ).toBe(true)
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Child tables — isolated via parent (EXISTS subquery)
// ─────────────────────────────────────────────────────────────────────────────

const CHILD_TABLES = [
  { table: 'sale_items',              parent: 'sales',     fk: 'sale_id' },
  { table: 'sale_item_allocations',   parent: 'sales',     fk: 'sale_id' },
  { table: 'proforma_items',          parent: 'proformas', fk: 'proforma_id' },
  { table: 'purchase_items',          parent: 'purchases', fk: 'purchase_id' },
  { table: 'purchase_costs',          parent: 'purchases', fk: 'purchase_id' },
] as const

describe('RLS enabled — child tables (parent-scoped)', () => {
  for (const { table, parent, fk } of CHILD_TABLES) {
    it(`${table}: row level security is enabled`, () => {
      expect(hasRls(table), `Missing: alter table ${table} enable row level security`).toBe(true)
    })

    it(`${table}: flowra isolation policy is declared`, () => {
      expect(
        sql.includes(`"flowra_${table}_company_isolation"`),
        `Missing policy "flowra_${table}_company_isolation"`,
      ).toBe(true)
    })

    it(`${table}: policy uses EXISTS subquery via ${parent}`, () => {
      const policyMarker = `"flowra_${table}_company_isolation"`
      const idx = sql.indexOf(policyMarker)
      if (idx === -1) return // will fail in the previous test
      const block = sql.slice(idx, idx + 600)
      expect(block).toContain('exists')
      expect(block).toContain(parent)
      expect(block).toContain(fk)
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// company_members — special dual-access policy
// ─────────────────────────────────────────────────────────────────────────────

describe('company_members RLS', () => {
  it('has row level security enabled', () => {
    expect(hasRls('company_members')).toBe(true)
  })

  it('has flowra_company_members_isolation policy', () => {
    expect(sql).toContain('"flowra_company_members_isolation"')
  })

  it('allows user to always see their own membership rows', () => {
    const idx = sql.indexOf('"flowra_company_members_isolation"')
    const block = sql.slice(idx, idx + 500)
    expect(block).toContain('user_id = auth.uid()')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Global reference tables — authenticated-read only
// ─────────────────────────────────────────────────────────────────────────────

describe('Reference table RLS — authenticated read', () => {
  it('fx_rates: RLS enabled', () => {
    expect(hasRls('fx_rates')).toBe(true)
  })

  it('fx_rates: authenticated read policy exists', () => {
    expect(sql).toContain('"flowra_fx_rates_authenticated_read"')
  })

  it('interest_rates: RLS enabled', () => {
    expect(hasRls('interest_rates')).toBe(true)
  })

  it('interest_rates: authenticated read policy exists', () => {
    expect(sql).toContain('"flowra_interest_rates_authenticated_read"')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// idempotency_keys — existing policy (regression guard)
// ─────────────────────────────────────────────────────────────────────────────

describe('idempotency_keys RLS (existing — regression guard)', () => {
  it('has row level security enabled', () => {
    expect(hasRls('idempotency_keys')).toBe(true)
  })

  it('has idempotency_own_rows policy', () => {
    expect(sql).toContain('"idempotency_own_rows"')
  })

  it('policy filters by auth.uid()', () => {
    const idx = sql.indexOf('"idempotency_own_rows"')
    const block = sql.slice(idx, idx + 200)
    expect(block).toContain('auth.uid()')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiter presets — structural check
// ─────────────────────────────────────────────────────────────────────────────

describe('Rate limiter — preset coverage', () => {
  it('has export preset', () => {
    expect(RATE_LIMIT_PRESETS).toHaveProperty('export')
    expect(RATE_LIMIT_PRESETS.export.limit).toBeGreaterThan(0)
    expect(RATE_LIMIT_PRESETS.export.windowMs).toBeGreaterThanOrEqual(60_000)
  })

  it('has backup preset', () => {
    expect(RATE_LIMIT_PRESETS).toHaveProperty('backup')
    expect(RATE_LIMIT_PRESETS.backup.limit).toBeGreaterThan(0)
  })

  it('has auth preset', () => {
    expect(RATE_LIMIT_PRESETS).toHaveProperty('auth')
  })

  it('export limit is more restrictive than api_read', () => {
    expect(RATE_LIMIT_PRESETS.export.limit).toBeLessThan(RATE_LIMIT_PRESETS.api_read.limit)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// rateLimitKey + rateLimitExceededResponse helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('Rate limiter helpers', () => {
  it('rateLimitKey: prefers userId over IP', () => {
    const fakeReq = { headers: { get: (h: string) => h === 'x-forwarded-for' ? '1.2.3.4' : null } }
    expect(rateLimitKey('user-abc', fakeReq)).toBe('u:user-abc')
  })

  it('rateLimitKey: falls back to IP when userId null', () => {
    const fakeReq = { headers: { get: (h: string) => h === 'x-forwarded-for' ? '1.2.3.4' : null } }
    expect(rateLimitKey(null, fakeReq)).toBe('ip:1.2.3.4')
  })

  it('rateLimitKey: falls back to anon when neither available', () => {
    const fakeReq = { headers: { get: () => null } }
    expect(rateLimitKey(null, fakeReq)).toBe('anon')
  })

  it('rateLimitExceededResponse: includes error + code + reset_at', () => {
    const fakeResult = { allowed: false, remaining: 0, resetAt: Date.now() + 60_000 }
    const resp = rateLimitExceededResponse(fakeResult)
    expect(resp.code).toBe('RATE_LIMIT_EXCEEDED')
    expect(resp).toHaveProperty('reset_at')
    expect(resp).toHaveProperty('remaining')
  })
})

/**
 * SQL validation tests — verifies key patterns in flowra_install.sql
 * These are static analysis tests that validate the SQL schema
 * Run with: npx vitest run tests/sql-validation.test.ts
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const sql = readFileSync(join(__dirname, '..', 'supabase', 'flowra_install.sql'), 'utf-8')

describe('flowra_install.sql — event_outbox atomic claim', () => {
  it('contains claim_event_batch function', () => {
    expect(sql).toContain('create or replace function claim_event_batch')
  })

  it('uses FOR UPDATE SKIP LOCKED in claim_event_batch', () => {
    const fnStart = sql.indexOf('claim_event_batch')
    const fnEnd   = sql.indexOf('$$;', fnStart)
    const fnBody  = sql.slice(fnStart, fnEnd)
    expect(fnBody).toContain('for update skip locked')
  })
})

describe('flowra_install.sql — zero-cost lot validation', () => {
  it('checks for zero-cost lots before FIFO allocation', () => {
    expect(sql).toContain("raise exception 'ZERO_COST_LOT product=%'")
  })

  it('checks unit_cost <= 0 condition', () => {
    expect(sql).toContain('sl.unit_cost is null or sl.unit_cost <= 0')
  })
})

describe('flowra_install.sql — FX rate blocking (no silent fallback)', () => {
  it('does NOT silently default to fx_rate := 1', () => {
    // Old behavior was: "if not found then v_fx_rate := 1"
    // New behavior raises an exception
    expect(sql).not.toContain("if not found then v_fx_rate := 1; v_fx_source := 'fallback'")
  })

  it('raises FX_RATE_NOT_FOUND instead', () => {
    expect(sql).toContain('FX_RATE_NOT_FOUND')
  })
})

describe('flowra_install.sql — proforma snapshot columns', () => {
  it('has company_snapshot column', () => {
    expect(sql).toContain('company_snapshot')
  })

  it('has customer_snapshot column', () => {
    expect(sql).toContain('customer_snapshot')
  })

  it('has column guards for snapshot columns', () => {
    expect(sql).toContain('add column if not exists company_snapshot')
    expect(sql).toContain('add column if not exists customer_snapshot')
  })
})

describe('flowra_install.sql — idempotency request_hash', () => {
  it('has request_hash column guard', () => {
    expect(sql).toContain('add column if not exists request_hash text')
  })
})

describe('flowra_install.sql — create_proforma_atomic accepts snapshots', () => {
  it('accepts p_company_snapshot parameter', () => {
    expect(sql).toContain('p_company_snapshot')
  })

  it('accepts p_customer_snapshot parameter', () => {
    expect(sql).toContain('p_customer_snapshot')
  })

  it('returns jsonb', () => {
    const fnLine = sql.split('\n').find(l => l.includes('create_proforma_atomic'))
    expect(sql).toContain("return jsonb_build_object('id', v_proforma_id, 'proforma_no', v_proforma_no)")
  })
})

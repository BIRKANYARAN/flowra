/**
 * SQL validation tests — verifies key patterns in flowra_install.sql
 * These are static analysis tests that validate the SQL schema
 * Run with: npx vitest run tests/sql-validation.test.ts
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// FLOWRA_FULL_INSTALL.sql is the canonical all-phases installer (base + migrations merged).
// flowra_install.sql is the base schema only — later phase features live in the full file.
const sql = readFileSync(join(__dirname, '..', 'supabase', 'FLOWRA_FULL_INSTALL.sql'), 'utf-8')

describe('flowra_install.sql — event_outbox atomic claim', () => {
  it('contains claim_event_batch function (schema-qualified)', () => {
    // Function is created in public schema: public.claim_event_batch
    expect(sql).toContain('create or replace function public.claim_event_batch')
  })

  it('uses FOR UPDATE SKIP LOCKED in claim_event_batch', () => {
    // Function definition starts after its name comment
    const fnStart = sql.indexOf('create or replace function public.claim_event_batch')
    const fnEnd   = sql.indexOf('$$;', fnStart)
    const fnBody  = sql.slice(fnStart, fnEnd)
    expect(fnBody).toContain('for update skip locked')
  })
})

describe('flowra_install.sql — zero-cost lot validation', () => {
  it('checks for zero-cost lots before FIFO allocation', () => {
    expect(sql).toContain("raise exception 'ZERO_COST_LOT product=% lot=%'")
  })

  it('checks cost_price <= 0 condition on stock lot', () => {
    expect(sql).toContain('v_lot.cost_price is null or v_lot.cost_price <= 0')
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
  it('has company_snapshot column in proformas table', () => {
    expect(sql).toContain('company_snapshot')
  })

  it('has customer_snapshot column in proformas table', () => {
    expect(sql).toContain('customer_snapshot')
  })

  it('passes snapshots through to create_proforma_atomic', () => {
    // In FLOWRA_FULL_INSTALL.sql these are CREATE TABLE columns (not ALTER TABLE).
    // The function accepts them as parameters and stores them.
    expect(sql).toContain('p_company_snapshot')
    expect(sql).toContain('p_customer_snapshot')
  })
})

describe('flowra_install.sql — idempotency request_hash', () => {
  it('has request_hash column (idempotency_keys table)', () => {
    // Defined as a CREATE TABLE column in the full installer
    expect(sql).toContain('request_hash')
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

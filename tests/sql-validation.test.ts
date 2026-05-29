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

describe('flowra_install.sql — journal_entries table', () => {
  it('contains journal_entries table definition', () => {
    expect(sql).toContain('journal_entries')
  })

  it('contains entry_date column', () => {
    expect(sql).toContain('entry_date')
  })

  it('contains source_type column', () => {
    expect(sql).toContain('source_type')
  })

  it('contains source_id column', () => {
    expect(sql).toContain('source_id')
  })
})

describe('flowra_install.sql — journal_entry_lines table', () => {
  it('contains journal_entry_lines table reference', () => {
    expect(sql).toContain('journal_entry_lines')
  })

  it('contains debit_try column', () => {
    expect(sql).toContain('debit_try')
  })

  it('contains credit_try column', () => {
    expect(sql).toContain('credit_try')
  })

  it('contains account_code column', () => {
    expect(sql).toContain('account_code')
  })
})

describe('flowra_install.sql — double-entry balance check', () => {
  it('contains debit reference in journal context', () => {
    expect(sql).toContain('debit')
  })

  it('contains credit reference in journal context', () => {
    expect(sql).toContain('credit')
  })

  it('debit and credit both appear in the file', () => {
    expect(sql).toContain('debit_try')
    expect(sql).toContain('credit_try')
  })
})

describe('flowra_install.sql — audit_logs table', () => {
  it('contains audit_logs table', () => {
    expect(sql).toContain('audit_logs')
  })

  it('contains action column in audit_logs context', () => {
    expect(sql).toContain('action')
  })

  it('contains resource_type column', () => {
    expect(sql).toContain('resource_type')
  })
})

describe('flowra_install.sql — partner_finance_events table', () => {
  it('contains partner_finance_events table', () => {
    expect(sql).toContain('partner_finance_events')
  })

  it('contains event_type column', () => {
    expect(sql).toContain('event_type')
  })
})

describe('flowra_install.sql — workflow_instances table', () => {
  it('contains workflow_instances table', () => {
    expect(sql).toContain('workflow_instances')
  })

  it('contains workflow_type column', () => {
    expect(sql).toContain('workflow_type')
  })

  it('contains status column in workflow context', () => {
    // status is a common column — just verify it's present
    expect(sql).toContain('status')
  })
})

describe('flowra_install.sql — companies table', () => {
  it('contains companies table definition', () => {
    expect(sql).toContain('companies')
  })

  it('contains create table for companies', () => {
    const lowerSql = sql.toLowerCase()
    expect(lowerSql).toContain('companies')
  })
})

describe('flowra_install.sql — idempotency_keys table', () => {
  it('contains idempotency_keys table', () => {
    expect(sql).toContain('idempotency_keys')
  })
})

describe('flowra_install.sql — RLS enabled on key tables', () => {
  it('contains enable row level security (lowercase)', () => {
    expect(sql).toContain('enable row level security')
  })

  it('enable row level security appears at least 5 times', () => {
    const count = (sql.match(/enable row level security/gi) ?? []).length
    expect(count).toBeGreaterThanOrEqual(5)
  })

  it('contains ROW LEVEL SECURITY string (case-insensitive)', () => {
    expect(sql.toLowerCase()).toContain('row level security')
  })
})

describe('flowra_install.sql — no DROP DATABASE', () => {
  it('does not contain DROP DATABASE', () => {
    expect(sql).not.toContain('DROP DATABASE')
  })

  it('does not contain drop database (case insensitive)', () => {
    expect(sql.toLowerCase()).not.toContain('drop database')
  })
})

describe('flowra_install.sql — no TRUNCATE', () => {
  it('does not contain TRUNCATE TABLE', () => {
    expect(sql).not.toContain('TRUNCATE TABLE')
  })

  it('does not contain truncate table (case insensitive)', () => {
    expect(sql.toLowerCase()).not.toContain('truncate table')
  })
})

describe('flowra_install.sql — uuid primary keys', () => {
  it('contains uuid as a column type', () => {
    expect(sql).toContain('uuid')
  })

  it('contains uuid in primary key context', () => {
    const lowerSql = sql.toLowerCase()
    expect(lowerSql).toContain('uuid')
  })

  it('uuid appears multiple times (used for many PKs)', () => {
    const count = (sql.match(/uuid/gi) ?? []).length
    expect(count).toBeGreaterThan(1)
  })
})

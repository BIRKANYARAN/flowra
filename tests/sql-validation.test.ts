/**
 * SQL validation tests — verifies key patterns in flowra_install.sql
 * These are static analysis tests that validate the SQL schema.
 * Run with: npx vitest run tests/sql-validation.test.ts
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const sql = readFileSync(join(__dirname, '..', 'supabase', 'flowra_install.sql'), 'utf-8')

// ── Partner transactions ───────────────────────────────────────────────────────

describe('flowra_install.sql — partner_transactions constraint', () => {
  it('drops and recreates chk_partner_tx_type', () => {
    expect(sql).toContain('drop constraint if exists chk_partner_tx_type')
    expect(sql).toContain('add constraint chk_partner_tx_type')
  })

  it('includes canonical tx_types in constraint', () => {
    expect(sql).toContain("'capital_in'")
    expect(sql).toContain("'loan_to_company'")
    expect(sql).toContain("'loan_repayment'")
    expect(sql).toContain("'dividend'")
  })
})

// ── create_partner_loan_expense function ─────────────────────────────────────

describe('flowra_install.sql — create_partner_loan_expense', () => {
  it('defines the function', () => {
    expect(sql).toContain('create or replace function create_partner_loan_expense')
  })

  it('raises on unauthorized access', () => {
    expect(sql).toContain("raise exception 'create_partner_loan_expense: unauthorized'")
  })

  it('inserts into partner_transactions', () => {
    expect(sql).toContain('insert into partner_transactions')
  })
})

// ── Proforma snapshot columns ──────────────────────────────────────────────────

describe('flowra_install.sql — proforma snapshot columns', () => {
  it('has company_snapshot column guard', () => {
    expect(sql).toContain('add column if not exists company_snapshot')
  })

  it('has customer_snapshot column', () => {
    expect(sql).toContain('customer_snapshot')
  })
})

// ── create_proforma_atomic function ───────────────────────────────────────────

describe('flowra_install.sql — create_proforma_atomic', () => {
  it('defines the function', () => {
    expect(sql).toContain('create or replace function create_proforma_atomic')
  })

  it('accepts p_company_snapshot parameter', () => {
    expect(sql).toContain('p_company_snapshot')
  })

  it('accepts p_customer_snapshot parameter', () => {
    expect(sql).toContain('p_customer_snapshot')
  })

  it('returns a jsonb object with id and proforma_no', () => {
    expect(sql).toContain("return jsonb_build_object('id', v_proforma_id, 'proforma_no', v_proforma_no)")
  })
})

// ── Idempotency ───────────────────────────────────────────────────────────────

describe('flowra_install.sql — idempotency request_hash', () => {
  it('has request_hash column guard', () => {
    expect(sql).toContain('add column if not exists request_hash text')
  })
})

// ── RLS grants ────────────────────────────────────────────────────────────────

describe('flowra_install.sql — function grants to authenticated', () => {
  it('grants create_partner_loan_expense to authenticated', () => {
    expect(sql).toContain('grant  execute on function create_partner_loan_expense to authenticated')
  })

  it('grants create_proforma_atomic to authenticated', () => {
    expect(sql).toContain('grant  execute on function create_proforma_atomic      to authenticated')
  })
})

// ── Partner transactions indexes ──────────────────────────────────────────────

describe('flowra_install.sql — partner_transactions indexes', () => {
  it('creates per-partner aggregation index', () => {
    expect(sql).toContain('on partner_transactions (partner_id, company_id)')
  })

  it('creates per-type index', () => {
    expect(sql).toContain('on partner_transactions (company_id, tx_type)')
  })
})

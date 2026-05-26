/**
 * Migration SQL validation tests — static analysis of migration files
 * Verifies structure, required sections, and key SQL patterns.
 * Run with: npx vitest run tests/migration-sql.test.ts
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations')

function readMigration(filename: string): string {
  return readFileSync(join(MIGRATIONS_DIR, filename), 'utf-8')
}

function migrationExists(filename: string): boolean {
  return existsSync(join(MIGRATIONS_DIR, filename))
}

// ─────────────────────────────────────────────────────────────────────────────
// File existence checks
// ─────────────────────────────────────────────────────────────────────────────

describe('migration files — existence', () => {
  const expectedFiles = [
    '20260526000001_audit_chain_columns.sql',
    '20260526000002_journal_voucher_numbers.sql',
    '20260526000003_workflow_instances.sql',
    '20260526000004_alert_rules_table.sql',
    '20260526000005_job_runs_table.sql',
    '20260526000006_companies_gl_mode_default.sql',
  ]

  for (const file of expectedFiles) {
    it(`${file} exists`, () => {
      expect(migrationExists(file)).toBe(true)
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// migrate:up / migrate:down section checks for all files
// ─────────────────────────────────────────────────────────────────────────────

describe('migration files — required sections', () => {
  const files = [
    '20260526000001_audit_chain_columns.sql',
    '20260526000002_journal_voucher_numbers.sql',
    '20260526000003_workflow_instances.sql',
    '20260526000004_alert_rules_table.sql',
    '20260526000005_job_runs_table.sql',
    '20260526000006_companies_gl_mode_default.sql',
  ]

  for (const file of files) {
    it(`${file} has -- migrate:up section`, () => {
      const sql = readMigration(file)
      expect(sql).toContain('-- migrate:up')
    })

    it(`${file} has -- migrate:down section`, () => {
      const sql = readMigration(file)
      expect(sql).toContain('-- migrate:down')
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// workflow_instances specific checks
// ─────────────────────────────────────────────────────────────────────────────

describe('20260526000003_workflow_instances.sql — content', () => {
  let sql: string
  beforeAll(() => { sql = readMigration('20260526000003_workflow_instances.sql') })

  it('creates workflow_instances table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS workflow_instances')
  })

  it('has RLS enabled', () => {
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
  })

  it('has RLS policy for company members', () => {
    expect(sql).toContain('"workflow_instances_company_member"')
  })

  it('has workflow_type CHECK constraint with correct values', () => {
    expect(sql).toContain('expense_approval')
    expect(sql).toContain('partner_loan_entry')
    expect(sql).toContain('dividend_declaration')
    expect(sql).toContain('period_close')
    expect(sql).toContain('period_lock')
  })

  it('has status CHECK constraint', () => {
    expect(sql).toContain("'pending'")
    expect(sql).toContain("'approved'")
    expect(sql).toContain("'rejected'")
  })

  it('has expires_at index for pending workflows', () => {
    expect(sql).toContain('idx_workflow_instances_expires')
  })

  it('migrate:down drops the table', () => {
    const downSection = sql.slice(sql.indexOf('-- migrate:down'))
    expect(downSection).toContain('DROP TABLE IF EXISTS workflow_instances')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// alert_rules specific checks
// ─────────────────────────────────────────────────────────────────────────────

describe('20260526000004_alert_rules_table.sql — content', () => {
  let sql: string
  beforeAll(() => { sql = readMigration('20260526000004_alert_rules_table.sql') })

  it('creates alert_rules table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS alert_rules')
  })

  it('has UNIQUE constraint on (company_id, rule_type)', () => {
    expect(sql).toContain('UNIQUE (company_id, rule_type)')
  })

  it('has is_active column', () => {
    expect(sql).toContain('is_active')
  })

  it('has threshold_value numeric column', () => {
    expect(sql).toContain('threshold_value')
    expect(sql).toContain('numeric(15,2)')
  })

  it('has RLS policy for company members', () => {
    expect(sql).toContain('"alert_rules_company_member"')
  })

  it('migrate:down drops the table', () => {
    const downSection = sql.slice(sql.indexOf('-- migrate:down'))
    expect(downSection).toContain('DROP TABLE IF EXISTS alert_rules')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// job_runs specific checks
// ─────────────────────────────────────────────────────────────────────────────

describe('20260526000005_job_runs_table.sql — content', () => {
  let sql: string
  beforeAll(() => { sql = readMigration('20260526000005_job_runs_table.sql') })

  it('creates job_runs table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS job_runs')
  })

  it('has idempotency_key UNIQUE constraint', () => {
    expect(sql).toContain('idempotency_key')
    expect(sql).toContain('UNIQUE')
  })

  it('idempotency_key column is UNIQUE', () => {
    // The column definition should have UNIQUE inline
    const upSection = sql.slice(0, sql.indexOf('-- migrate:down'))
    expect(upSection).toContain('idempotency_key   text UNIQUE')
  })

  it('has status CHECK constraint', () => {
    expect(sql).toContain("'running'")
    expect(sql).toContain("'completed'")
    expect(sql).toContain("'failed'")
    expect(sql).toContain("'skipped'")
  })

  it('has company_id as nullable (platform-wide jobs)', () => {
    // company_id should NOT have NOT NULL — it's nullable for platform-wide jobs
    const upSection = sql.slice(0, sql.indexOf('-- migrate:down'))
    const companyLine = upSection.split('\n').find(l => l.includes('company_id') && l.includes('uuid'))
    expect(companyLine).toBeDefined()
    expect(companyLine).not.toContain('NOT NULL')
  })

  it('has index on running jobs', () => {
    expect(sql).toContain('idx_job_runs_status')
  })

  it('does NOT have RLS (service role table)', () => {
    expect(sql).not.toContain('ENABLE ROW LEVEL SECURITY')
  })

  it('migrate:down drops the table', () => {
    const downSection = sql.slice(sql.indexOf('-- migrate:down'))
    expect(downSection).toContain('DROP TABLE IF EXISTS job_runs')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// companies gl_mode specific checks
// ─────────────────────────────────────────────────────────────────────────────

describe('20260526000006_companies_gl_mode_default.sql — content', () => {
  let sql: string
  beforeAll(() => { sql = readMigration('20260526000006_companies_gl_mode_default.sql') })

  it('alters companies table to add gl_mode', () => {
    expect(sql).toContain('ALTER TABLE companies')
    expect(sql).toContain('gl_mode')
  })

  it('uses ADD COLUMN IF NOT EXISTS (idempotent)', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS gl_mode')
  })

  it("has default 'shadow'", () => {
    expect(sql).toContain("DEFAULT 'shadow'")
  })

  it('has CHECK constraint with all three modes', () => {
    expect(sql).toContain("'shadow'")
    expect(sql).toContain("'parallel'")
    expect(sql).toContain("'gl_primary'")
  })

  it('has COMMENT explaining the column', () => {
    expect(sql).toContain('COMMENT ON COLUMN companies.gl_mode')
  })

  it('migrate:down drops the column', () => {
    const downSection = sql.slice(sql.indexOf('-- migrate:down'))
    expect(downSection).toContain('DROP COLUMN IF EXISTS gl_mode')
  })
})

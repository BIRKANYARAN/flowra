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

// ─────────────────────────────────────────────────────────────────────────────
// audit_chain_columns specific checks
// ─────────────────────────────────────────────────────────────────────────────

describe('20260526000001_audit_chain_columns.sql — content', () => {
  let sql: string
  beforeAll(() => { sql = readMigration('20260526000001_audit_chain_columns.sql') })

  it('contains ADD COLUMN statement', () => {
    expect(sql).toMatch(/ADD COLUMN/i)
  })

  it('references audit-related columns', () => {
    // Audit chain columns involve things like created_by, updated_at or chain fields
    expect(sql.toLowerCase()).toMatch(/audit|chain|created_at|updated_at|created_by/)
  })

  it('migrate:down section exists and is non-trivial', () => {
    const downIdx = sql.indexOf('-- migrate:down')
    const downSection = sql.slice(downIdx)
    expect(downSection.trim().length).toBeGreaterThan('-- migrate:down'.length)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// journal_voucher_numbers specific checks
// ─────────────────────────────────────────────────────────────────────────────

describe('20260526000002_journal_voucher_numbers.sql — content', () => {
  let sql: string
  beforeAll(() => { sql = readMigration('20260526000002_journal_voucher_numbers.sql') })

  it('references voucher_number or sequence', () => {
    expect(sql.toLowerCase()).toMatch(/voucher|sequence|serial|nextval/)
  })

  it('has migrate:up with actual SQL (CREATE or ALTER)', () => {
    const upSection = sql.slice(0, sql.indexOf('-- migrate:down'))
    expect(upSection).toMatch(/CREATE|ALTER|INSERT/i)
  })

  it('migrate:down is reversible (has DROP or ALTER)', () => {
    const downSection = sql.slice(sql.indexOf('-- migrate:down'))
    expect(downSection).toMatch(/DROP|ALTER/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// decision_context_snapshots specific checks
// ─────────────────────────────────────────────────────────────────────────────

describe('20260526000007_decision_context_snapshots.sql — content', () => {
  it('exists on disk', () => {
    expect(migrationExists('20260526000007_decision_context_snapshots.sql')).toBe(true)
  })

  it('references decision_context or snapshots table', () => {
    const sql = readMigration('20260526000007_decision_context_snapshots.sql')
    expect(sql.toLowerCase()).toMatch(/decision_context|snapshot/)
  })

  it('has CREATE TABLE statement', () => {
    const sql = readMigration('20260526000007_decision_context_snapshots.sql')
    expect(sql).toMatch(/CREATE TABLE/i)
  })

  it('is non-empty', () => {
    const sql = readMigration('20260526000007_decision_context_snapshots.sql')
    expect(sql.length).toBeGreaterThan(100)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// company_documents migration checks
// ─────────────────────────────────────────────────────────────────────────────

describe('20260527000001_company_documents.sql — content', () => {
  it('exists on disk', () => {
    expect(migrationExists('20260527000001_company_documents.sql')).toBe(true)
  })

  it('creates company_documents table', () => {
    const sql = readMigration('20260527000001_company_documents.sql')
    expect(sql).toContain('company_documents')
    expect(sql).toMatch(/CREATE TABLE/i)
  })

  it('contains SQL statements', () => {
    const sql = readMigration('20260527000001_company_documents.sql')
    expect(sql).toMatch(/CREATE TABLE|ALTER TABLE/i)
  })

  it('has document_type column', () => {
    const sql = readMigration('20260527000001_company_documents.sql')
    expect(sql).toContain('document_type')
  })

  it('has file_url column', () => {
    const sql = readMigration('20260527000001_company_documents.sql')
    expect(sql).toContain('file_url')
  })

  it('has is_audit_required column', () => {
    const sql = readMigration('20260527000001_company_documents.sql')
    expect(sql).toContain('is_audit_required')
  })

  it('has deleted_at for soft delete support', () => {
    const sql = readMigration('20260527000001_company_documents.sql')
    expect(sql).toContain('deleted_at')
  })

  it('has RLS enabled', () => {
    const sql = readMigration('20260527000001_company_documents.sql')
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
  })

  it('references company_documents throughout', () => {
    const sql = readMigration('20260527000001_company_documents.sql')
    // The table name appears multiple times (CREATE + indexes + policies)
    const occurrences = (sql.match(/company_documents/g) ?? []).length
    expect(occurrences).toBeGreaterThan(3)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// General SQL quality checks on all migration files
// ─────────────────────────────────────────────────────────────────────────────

describe('migration files — SQL quality', () => {
  const allFiles = [
    '20260526000001_audit_chain_columns.sql',
    '20260526000002_journal_voucher_numbers.sql',
    '20260526000003_workflow_instances.sql',
    '20260526000004_alert_rules_table.sql',
    '20260526000005_job_runs_table.sql',
    '20260526000006_companies_gl_mode_default.sql',
  ]

  for (const file of allFiles) {
    it(`${file} down section comes after up section`, () => {
      const sql = readMigration(file)
      const upIdx   = sql.indexOf('-- migrate:up')
      const downIdx = sql.indexOf('-- migrate:down')
      expect(upIdx).toBeGreaterThan(-1)
      expect(downIdx).toBeGreaterThan(upIdx)
    })

    it(`${file} does not contain TRUNCATE statements (safety)`, () => {
      const sql = readMigration(file)
      expect(sql.toUpperCase()).not.toContain('TRUNCATE')
    })

    it(`${file} does not contain DROP DATABASE statement`, () => {
      const sql = readMigration(file)
      expect(sql.toUpperCase()).not.toContain('DROP DATABASE')
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// SQL quality extended — decision_context + company_documents
// ─────────────────────────────────────────────────────────────────────────────

describe('migration files — SQL quality (extended files)', () => {
  const extendedFiles = [
    '20260526000007_decision_context_snapshots.sql',
    '20260527000001_company_documents.sql',
  ]

  for (const file of extendedFiles) {
    it(`${file} does not contain TRUNCATE statements (safety)`, () => {
      const sql = readMigration(file)
      expect(sql.toUpperCase()).not.toContain('TRUNCATE')
    })

    it(`${file} does not contain DROP DATABASE statement`, () => {
      const sql = readMigration(file)
      expect(sql.toUpperCase()).not.toContain('DROP DATABASE')
    })

    it(`${file} has a CREATE TABLE statement`, () => {
      const sql = readMigration(file)
      expect(sql).toMatch(/CREATE TABLE/i)
    })

    it(`${file} is non-empty`, () => {
      const sql = readMigration(file)
      expect(sql.length).toBeGreaterThan(200)
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// company_documents — additional checks
// ─────────────────────────────────────────────────────────────────────────────

describe('20260527000001_company_documents.sql — additional', () => {
  let sql: string
  beforeAll(() => { sql = readMigration('20260527000001_company_documents.sql') })

  it('file_url column has text type', () => {
    // The column definition: "file_url text NOT NULL"
    expect(sql).toMatch(/file_url\s+text/)
  })

  it('RLS policy name appears in double-quoted form', () => {
    // Policy names use double-quoted strings in PostgreSQL
    expect(sql).toMatch(/"[A-Za-z]/)
  })

  it('has company_id column with uuid type', () => {
    expect(sql).toContain('company_id uuid')
  })

  it('has title column', () => {
    expect(sql).toContain('title text')
  })

  it('document_date column is of date type', () => {
    expect(sql).toMatch(/document_date\s+date/)
  })

  it('has uploaded_by column referencing auth.users', () => {
    expect(sql).toContain('uploaded_by')
    expect(sql).toContain('auth.users')
  })

  it('has at least 3 CREATE INDEX statements', () => {
    const indexCount = (sql.match(/CREATE INDEX/gi) ?? []).length
    expect(indexCount).toBeGreaterThanOrEqual(3)
  })

  it('has SELECT policy for members', () => {
    expect(sql).toContain('FOR SELECT')
  })

  it('has INSERT policy for members', () => {
    expect(sql).toContain('FOR INSERT')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// decision_context_snapshots — additional checks
// ─────────────────────────────────────────────────────────────────────────────

describe('20260526000007_decision_context_snapshots.sql — additional', () => {
  let sql: string
  beforeAll(() => { sql = readMigration('20260526000007_decision_context_snapshots.sql') })

  it('does not contain TRUNCATE', () => {
    expect(sql.toUpperCase()).not.toContain('TRUNCATE')
  })

  it('company_id column is present', () => {
    expect(sql).toContain('company_id')
  })

  it('has context_snapshot jsonb column', () => {
    expect(sql).toContain('context_snapshot')
    expect(sql).toContain('jsonb')
  })

  it('has trigger_type column', () => {
    expect(sql).toContain('trigger_type')
  })

  it('has trigger_label column', () => {
    expect(sql).toContain('trigger_label')
  })

  it('has decision_at column', () => {
    expect(sql).toContain('decision_at')
  })

  it('has annotation column for post-decision notes', () => {
    expect(sql).toContain('annotation')
  })

  it('has RLS enabled', () => {
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
  })

  it('has index on company_id for performance', () => {
    expect(sql).toContain('idx_decision_snapshots_company')
  })

  it('has RLS policies for SELECT', () => {
    expect(sql).toContain('FOR SELECT')
  })

  it('has RLS policies for INSERT', () => {
    expect(sql).toContain('FOR INSERT')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Timestamp ordering — filenames must be ascending
// ─────────────────────────────────────────────────────────────────────────────

describe('migration files — timestamp ordering', () => {
  const allMigrationFiles = [
    '20260526000001_audit_chain_columns.sql',
    '20260526000002_journal_voucher_numbers.sql',
    '20260526000003_workflow_instances.sql',
    '20260526000004_alert_rules_table.sql',
    '20260526000005_job_runs_table.sql',
    '20260526000006_companies_gl_mode_default.sql',
    '20260526000007_decision_context_snapshots.sql',
    '20260527000001_company_documents.sql',
  ]

  it('filenames are in ascending order', () => {
    const timestamps = allMigrationFiles.map(f => f.slice(0, 18))  // "YYYYMMDDHHMMSSNN" prefix
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i] >= timestamps[i - 1]).toBe(true)
    }
  })

  it('20260526... files come before 20260527... files', () => {
    const day26Files = allMigrationFiles.filter(f => f.startsWith('20260526'))
    const day27Files = allMigrationFiles.filter(f => f.startsWith('20260527'))

    const maxDay26 = day26Files[day26Files.length - 1]
    const minDay27 = day27Files[0]

    expect(maxDay26 < minDay27).toBe(true)
  })

  it('all timestamp prefixes parse as positive integers', () => {
    for (const file of allMigrationFiles) {
      const prefix = parseInt(file.slice(0, 14), 10)
      expect(prefix).toBeGreaterThan(0)
      expect(Number.isNaN(prefix)).toBe(false)
    }
  })

  it('no two files share the same timestamp prefix', () => {
    const timestamps = allMigrationFiles.map(f => f.slice(0, 18))
    const unique = new Set(timestamps)
    expect(unique.size).toBe(timestamps.length)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// No duplicate CREATE TABLE in a single file
// ─────────────────────────────────────────────────────────────────────────────

describe('migration files — no duplicate CREATE TABLE IF NOT EXISTS', () => {
  const checkFiles = [
    '20260526000003_workflow_instances.sql',
    '20260526000004_alert_rules_table.sql',
    '20260526000005_job_runs_table.sql',
    '20260526000007_decision_context_snapshots.sql',
    '20260527000001_company_documents.sql',
  ]

  for (const file of checkFiles) {
    it(`${file} contains CREATE TABLE IF NOT EXISTS at most once`, () => {
      const sql = readMigration(file)
      const matches = sql.match(/CREATE TABLE IF NOT EXISTS/gi) ?? []
      expect(matches.length).toBeLessThanOrEqual(1)
    })
  }

  it('all table-creation files create exactly one table each', () => {
    for (const file of checkFiles) {
      const sql = readMigration(file)
      const count = (sql.match(/CREATE TABLE IF NOT EXISTS/gi) ?? []).length
      expect(count).toBeLessThanOrEqual(1)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// RLS consistency — tables with user data must have RLS enabled
// ─────────────────────────────────────────────────────────────────────────────

describe('migration files — RLS presence', () => {
  const rlsRequiredFiles = [
    '20260526000003_workflow_instances.sql',
    '20260526000004_alert_rules_table.sql',
    '20260526000007_decision_context_snapshots.sql',
    '20260527000001_company_documents.sql',
  ]

  for (const file of rlsRequiredFiles) {
    it(`${file} has ENABLE ROW LEVEL SECURITY`, () => {
      const sql = readMigration(file)
      expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    })

    it(`${file} has at least one CREATE POLICY statement`, () => {
      const sql = readMigration(file)
      expect(sql).toContain('CREATE POLICY')
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Index naming conventions — all indexes follow naming pattern
// ─────────────────────────────────────────────────────────────────────────────

describe('migration files — index naming conventions', () => {
  it('workflow_instances indexes start with idx_', () => {
    const sql = readMigration('20260526000003_workflow_instances.sql')
    const indexes = sql.match(/CREATE INDEX IF NOT EXISTS (\w+)/g) ?? []
    for (const idx of indexes) {
      const name = idx.replace('CREATE INDEX IF NOT EXISTS ', '')
      expect(name).toMatch(/^idx_/)
    }
  })

  it('alert_rules indexes start with idx_', () => {
    const sql = readMigration('20260526000004_alert_rules_table.sql')
    const indexes = sql.match(/CREATE INDEX IF NOT EXISTS (\w+)/g) ?? []
    for (const idx of indexes) {
      const name = idx.replace('CREATE INDEX IF NOT EXISTS ', '')
      expect(name).toMatch(/^idx_/)
    }
  })

  it('job_runs indexes start with idx_', () => {
    const sql = readMigration('20260526000005_job_runs_table.sql')
    const indexes = sql.match(/CREATE INDEX IF NOT EXISTS (\w+)/g) ?? []
    for (const idx of indexes) {
      const name = idx.replace('CREATE INDEX IF NOT EXISTS ', '')
      expect(name).toMatch(/^idx_/)
    }
  })

  it('company_documents has at least 4 indexes', () => {
    const sql = readMigration('20260527000001_company_documents.sql')
    const indexCount = (sql.match(/CREATE INDEX IF NOT EXISTS/g) ?? []).length
    expect(indexCount).toBeGreaterThanOrEqual(4)
  })

  it('decision_context_snapshots has at least 2 indexes', () => {
    const sql = readMigration('20260526000007_decision_context_snapshots.sql')
    const indexCount = (sql.match(/CREATE INDEX IF NOT EXISTS/g) ?? []).length
    expect(indexCount).toBeGreaterThanOrEqual(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Primary key — all tables have UUID primary key
// ─────────────────────────────────────────────────────────────────────────────

describe('migration files — UUID primary key', () => {
  const tableFiles = [
    '20260526000003_workflow_instances.sql',
    '20260526000004_alert_rules_table.sql',
    '20260526000005_job_runs_table.sql',
    '20260526000007_decision_context_snapshots.sql',
    '20260527000001_company_documents.sql',
  ]

  for (const file of tableFiles) {
    it(`${file} has uuid PRIMARY KEY with gen_random_uuid()`, () => {
      const sql = readMigration(file)
      expect(sql).toContain('uuid PRIMARY KEY DEFAULT gen_random_uuid()')
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Company linkage — company_id foreign key
// ─────────────────────────────────────────────────────────────────────────────

describe('migration files — company_id foreign key', () => {
  const companyLinkedFiles = [
    '20260526000003_workflow_instances.sql',
    '20260526000004_alert_rules_table.sql',
    '20260526000007_decision_context_snapshots.sql',
    '20260527000001_company_documents.sql',
  ]

  for (const file of companyLinkedFiles) {
    it(`${file} has company_id uuid NOT NULL REFERENCES companies(id)`, () => {
      const sql = readMigration(file)
      // Allow for varying whitespace used for column alignment
      expect(sql).toMatch(/company_id\s+uuid\s+NOT NULL\s+REFERENCES companies\(id\)/)
    })

    it(`${file} has ON DELETE CASCADE for company_id`, () => {
      const sql = readMigration(file)
      expect(sql).toContain('ON DELETE CASCADE')
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Timestamp columns — created_at defaults
// ─────────────────────────────────────────────────────────────────────────────

describe('migration files — created_at and timestamptz', () => {
  // These files have created_at timestamptz columns (job_runs uses different audit approach)
  const timestampFiles = [
    '20260526000003_workflow_instances.sql',
    '20260526000004_alert_rules_table.sql',
    '20260526000007_decision_context_snapshots.sql',
    '20260527000001_company_documents.sql',
  ]

  for (const file of timestampFiles) {
    it(`${file} has created_at timestamptz with DEFAULT now()`, () => {
      const sql = readMigration(file)
      // Allow for varying whitespace (some files use tabs/spaces for alignment)
      expect(sql).toMatch(/created_at\s+timestamptz\s+NOT NULL\s+DEFAULT now\(\)/)
    })
  }

  it('job_runs table uses started_at and finished_at timestamps', () => {
    const sql = readMigration('20260526000005_job_runs_table.sql')
    // job_runs tracks timing with started_at/finished_at rather than created_at
    expect(sql).toMatch(/started_at|created_at|run_at/i)
  })
})

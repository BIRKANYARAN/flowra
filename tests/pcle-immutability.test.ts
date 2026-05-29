/**
 * Tests for lib/services/pcle/pcle.immutability.ts
 * Run with: npx vitest run tests/pcle-immutability.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  validateImmutability,
  validateJournalOperation,
} from '../lib/services/pcle/pcle.immutability'

describe('validateImmutability', () => {
  it('audit_logs delete → not allowed', () => {
    const result = validateImmutability('audit_logs', 'delete')
    expect(result.allowed).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it('audit_logs update → not allowed', () => {
    const result = validateImmutability('audit_logs', 'update')
    expect(result.allowed).toBe(false)
  })

  it('partner_finance_events delete → not allowed', () => {
    const result = validateImmutability('partner_finance_events', 'delete')
    expect(result.allowed).toBe(false)
  })

  it('non-immutable table delete → allowed', () => {
    const result = validateImmutability('products', 'delete')
    expect(result.allowed).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('non-immutable table update → allowed', () => {
    const result = validateImmutability('companies', 'update')
    expect(result.allowed).toBe(true)
  })

  it('journal_entry_lines delete → not allowed', () => {
    const result = validateImmutability('journal_entry_lines', 'delete')
    expect(result.allowed).toBe(false)
  })

  it('balance_sheet_snapshots update → not allowed', () => {
    const result = validateImmutability('balance_sheet_snapshots', 'update')
    expect(result.allowed).toBe(false)
  })
})

describe('validateJournalOperation', () => {
  it('void → allowed', () => {
    const result = validateJournalOperation('void')
    expect(result.allowed).toBe(true)
  })

  it('delete → not allowed', () => {
    const result = validateJournalOperation('delete')
    expect(result.allowed).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it('update_amount → not allowed', () => {
    const result = validateJournalOperation('update_amount')
    expect(result.allowed).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it('update_description → allowed', () => {
    const result = validateJournalOperation('update_description')
    expect(result.allowed).toBe(true)
  })
})

// Need to also import IMMUTABLE_TABLES for the new tests
import { IMMUTABLE_TABLES } from '../lib/services/pcle/pcle.immutability'

describe('IMMUTABLE_TABLES — constant contents', () => {
  it('contains partner_finance_events', () => {
    expect(IMMUTABLE_TABLES).toContain('partner_finance_events')
  })

  it('contains journal_entries', () => {
    expect(IMMUTABLE_TABLES).toContain('journal_entries')
  })

  it('contains journal_entry_lines', () => {
    expect(IMMUTABLE_TABLES).toContain('journal_entry_lines')
  })

  it('contains balance_sheet_snapshots', () => {
    expect(IMMUTABLE_TABLES).toContain('balance_sheet_snapshots')
  })

  it('contains audit_logs', () => {
    expect(IMMUTABLE_TABLES).toContain('audit_logs')
  })

  it('has exactly 5 entries', () => {
    expect(IMMUTABLE_TABLES.length).toBe(5)
  })

  it('all entries are strings', () => {
    for (const t of IMMUTABLE_TABLES) {
      expect(typeof t).toBe('string')
    }
  })
})

describe('validateImmutability — all immutable tables for delete', () => {
  it('partner_finance_events delete → not allowed', () => {
    expect(validateImmutability('partner_finance_events', 'delete').allowed).toBe(false)
  })

  it('journal_entries delete → not allowed', () => {
    expect(validateImmutability('journal_entries', 'delete').allowed).toBe(false)
  })

  it('journal_entry_lines delete → not allowed', () => {
    expect(validateImmutability('journal_entry_lines', 'delete').allowed).toBe(false)
  })

  it('balance_sheet_snapshots delete → not allowed', () => {
    expect(validateImmutability('balance_sheet_snapshots', 'delete').allowed).toBe(false)
  })

  it('audit_logs delete → not allowed', () => {
    expect(validateImmutability('audit_logs', 'delete').allowed).toBe(false)
  })

  it('all IMMUTABLE_TABLES are blocked for delete', () => {
    for (const tableName of IMMUTABLE_TABLES) {
      expect(validateImmutability(tableName, 'delete').allowed).toBe(false)
    }
  })
})

describe('validateImmutability — all immutable tables for update', () => {
  it('partner_finance_events update → not allowed', () => {
    expect(validateImmutability('partner_finance_events', 'update').allowed).toBe(false)
  })

  it('journal_entries update → not allowed', () => {
    expect(validateImmutability('journal_entries', 'update').allowed).toBe(false)
  })

  it('journal_entry_lines update → not allowed', () => {
    expect(validateImmutability('journal_entry_lines', 'update').allowed).toBe(false)
  })

  it('balance_sheet_snapshots update → not allowed', () => {
    expect(validateImmutability('balance_sheet_snapshots', 'update').allowed).toBe(false)
  })

  it('audit_logs update → not allowed', () => {
    expect(validateImmutability('audit_logs', 'update').allowed).toBe(false)
  })

  it('all IMMUTABLE_TABLES are blocked for update', () => {
    for (const tableName of IMMUTABLE_TABLES) {
      expect(validateImmutability(tableName, 'update').allowed).toBe(false)
    }
  })
})

describe('validateImmutability — reason contains table name', () => {
  it('reason for journal_entries delete contains "journal_entries"', () => {
    const result = validateImmutability('journal_entries', 'delete')
    expect(result.reason).toContain('journal_entries')
  })

  it('reason for audit_logs update contains "audit_logs"', () => {
    const result = validateImmutability('audit_logs', 'update')
    expect(result.reason).toContain('audit_logs')
  })

  it('reason for balance_sheet_snapshots delete contains "balance_sheet_snapshots"', () => {
    const result = validateImmutability('balance_sheet_snapshots', 'delete')
    expect(result.reason).toContain('balance_sheet_snapshots')
  })

  it('all immutable tables have reason containing the table name for delete', () => {
    for (const tableName of IMMUTABLE_TABLES) {
      const result = validateImmutability(tableName, 'delete')
      expect(result.reason).toContain(tableName)
    }
  })

  it('all immutable tables have reason containing the table name for update', () => {
    for (const tableName of IMMUTABLE_TABLES) {
      const result = validateImmutability(tableName, 'update')
      expect(result.reason).toContain(tableName)
    }
  })
})

describe('validateImmutability — non-immutable tables', () => {
  it('sales delete → allowed', () => {
    expect(validateImmutability('sales', 'delete').allowed).toBe(true)
  })

  it('expenses delete → allowed', () => {
    expect(validateImmutability('expenses', 'delete').allowed).toBe(true)
  })

  it('purchases delete → allowed', () => {
    expect(validateImmutability('purchases', 'delete').allowed).toBe(true)
  })

  it('partners delete → allowed', () => {
    expect(validateImmutability('partners', 'delete').allowed).toBe(true)
  })

  it('products delete → allowed', () => {
    expect(validateImmutability('products', 'delete').allowed).toBe(true)
  })

  it('sales update → allowed', () => {
    expect(validateImmutability('sales', 'update').allowed).toBe(true)
  })

  it('expenses update → allowed', () => {
    expect(validateImmutability('expenses', 'update').allowed).toBe(true)
  })

  it('purchases update → allowed', () => {
    expect(validateImmutability('purchases', 'update').allowed).toBe(true)
  })

  it('partners update → allowed', () => {
    expect(validateImmutability('partners', 'update').allowed).toBe(true)
  })

  it('products update → allowed', () => {
    expect(validateImmutability('products', 'update').allowed).toBe(true)
  })
})

describe('validateImmutability — no reason for allowed ops', () => {
  it('sales delete has no reason', () => {
    const result = validateImmutability('sales', 'delete')
    expect(result.reason).toBeUndefined()
  })

  it('expenses update has no reason', () => {
    const result = validateImmutability('expenses', 'update')
    expect(result.reason).toBeUndefined()
  })

  it('purchases delete has no reason', () => {
    const result = validateImmutability('purchases', 'delete')
    expect(result.reason).toBeUndefined()
  })

  it('partners update has no reason', () => {
    const result = validateImmutability('partners', 'update')
    expect(result.reason).toBeUndefined()
  })

  it('products delete has no reason', () => {
    const result = validateImmutability('products', 'delete')
    expect(result.reason).toBeUndefined()
  })
})

describe('validateJournalOperation — all operations', () => {
  it('void → allowed is true', () => {
    expect(validateJournalOperation('void').allowed).toBe(true)
  })

  it('delete → allowed is false', () => {
    expect(validateJournalOperation('delete').allowed).toBe(false)
  })

  it('update_description → allowed is true', () => {
    expect(validateJournalOperation('update_description').allowed).toBe(true)
  })

  it('update_amount → allowed is false', () => {
    expect(validateJournalOperation('update_amount').allowed).toBe(false)
  })
})

describe('validateJournalOperation — reason strings', () => {
  it('delete has a non-empty reason', () => {
    const result = validateJournalOperation('delete')
    expect(result.reason).toBeTruthy()
    expect((result.reason ?? '').length).toBeGreaterThan(0)
  })

  it('update_amount has a non-empty reason', () => {
    const result = validateJournalOperation('update_amount')
    expect(result.reason).toBeTruthy()
    expect((result.reason ?? '').length).toBeGreaterThan(0)
  })

  it('void has no reason (or undefined)', () => {
    const result = validateJournalOperation('void')
    expect(result.reason == null || result.reason === '').toBe(true)
  })

  it('update_description has no reason (or undefined)', () => {
    const result = validateJournalOperation('update_description')
    expect(result.reason == null || result.reason === '').toBe(true)
  })
})

describe('validateJournalOperation — Turkish reason text', () => {
  it('delete reason contains Turkish keyword "silinemez" or "iptal"', () => {
    const result = validateJournalOperation('delete')
    const reason = result.reason ?? ''
    const hasTurkish = reason.includes('silinemez') || reason.includes('iptal') || reason.includes('void')
    expect(hasTurkish).toBe(true)
  })

  it('update_amount reason contains Turkish financial term', () => {
    const result = validateJournalOperation('update_amount')
    const reason = result.reason ?? ''
    const hasTurkish = reason.includes('değiştirilemez') || reason.includes('iptal') || reason.includes('finansal')
    expect(hasTurkish).toBe(true)
  })

  it('delete reason is longer than 10 characters', () => {
    const result = validateJournalOperation('delete')
    expect((result.reason ?? '').length).toBeGreaterThan(10)
  })

  it('update_amount reason is longer than 10 characters', () => {
    const result = validateJournalOperation('update_amount')
    expect((result.reason ?? '').length).toBeGreaterThan(10)
  })
})

describe('validateImmutability — result shape', () => {
  it('allowed is a boolean for immutable table delete', () => {
    const result = validateImmutability('journal_entries', 'delete')
    expect(typeof result.allowed).toBe('boolean')
  })

  it('allowed is a boolean for non-immutable table delete', () => {
    const result = validateImmutability('products', 'delete')
    expect(typeof result.allowed).toBe('boolean')
  })

  it('reason is a string when present for immutable table', () => {
    const result = validateImmutability('audit_logs', 'delete')
    expect(typeof result.reason).toBe('string')
  })

  it('reason is undefined (not null) for allowed operations', () => {
    const result = validateImmutability('customers', 'delete')
    expect(result.reason).toBeUndefined()
  })

  it('allowed=false result has reason property', () => {
    const result = validateImmutability('journal_entries', 'update')
    expect('reason' in result).toBe(true)
    expect(result.reason).toBeTruthy()
  })

  it('allowed=true result does not have truthy reason', () => {
    const result = validateImmutability('sales', 'update')
    expect(result.reason).toBeFalsy()
  })
})

describe('validateImmutability — delete vs update reason difference', () => {
  it('delete reason mentions silme/silinemez', () => {
    const result = validateImmutability('journal_entries', 'delete')
    const r = result.reason ?? ''
    expect(r.includes('silme') || r.includes('silinemez') || r.includes('delete')).toBe(true)
  })

  it('update reason mentions güncelleme/güncellenemez', () => {
    const result = validateImmutability('journal_entries', 'update')
    const r = result.reason ?? ''
    expect(r.includes('güncelleme') || r.includes('güncellenemez') || r.includes('update')).toBe(true)
  })

  it('delete and update produce different reason strings', () => {
    const rDel = validateImmutability('audit_logs', 'delete').reason ?? ''
    const rUpd = validateImmutability('audit_logs', 'update').reason ?? ''
    expect(rDel).not.toBe(rUpd)
  })
})

describe('validateImmutability — unknown tables are always allowed', () => {
  it('completely unknown table is allowed for delete', () => {
    expect(validateImmutability('unknown_table_xyz', 'delete').allowed).toBe(true)
  })

  it('completely unknown table is allowed for update', () => {
    expect(validateImmutability('unknown_table_xyz', 'update').allowed).toBe(true)
  })

  it('empty string table name is allowed (not in immutable list)', () => {
    expect(validateImmutability('', 'delete').allowed).toBe(true)
  })

  it('partial match of immutable table name is allowed', () => {
    // 'audit' is not 'audit_logs' — partial matches should NOT block
    expect(validateImmutability('audit', 'delete').allowed).toBe(true)
  })

  it('journal (not journal_entries) is allowed', () => {
    expect(validateImmutability('journal', 'delete').allowed).toBe(true)
  })
})

describe('validateJournalOperation — return shape', () => {
  it('void result has allowed=true and no reason', () => {
    const result = validateJournalOperation('void')
    expect(result.allowed).toBe(true)
    expect(result.reason).toBeFalsy()
  })

  it('delete result has allowed=false and truthy reason', () => {
    const result = validateJournalOperation('delete')
    expect(result.allowed).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it('update_description result has allowed=true and no reason', () => {
    const result = validateJournalOperation('update_description')
    expect(result.allowed).toBe(true)
    expect(result.reason).toBeFalsy()
  })

  it('update_amount result has allowed=false and truthy reason', () => {
    const result = validateJournalOperation('update_amount')
    expect(result.allowed).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it('allowed property is always boolean', () => {
    const ops = ['void', 'delete', 'update_description', 'update_amount'] as const
    for (const op of ops) {
      expect(typeof validateJournalOperation(op).allowed).toBe('boolean')
    }
  })
})

describe('validateJournalOperation — consistency across calls', () => {
  it('same operation always returns same allowed value', () => {
    for (let i = 0; i < 3; i++) {
      expect(validateJournalOperation('delete').allowed).toBe(false)
      expect(validateJournalOperation('void').allowed).toBe(true)
      expect(validateJournalOperation('update_amount').allowed).toBe(false)
      expect(validateJournalOperation('update_description').allowed).toBe(true)
    }
  })

  it('delete reason is same string on repeated calls', () => {
    const r1 = validateJournalOperation('delete').reason
    const r2 = validateJournalOperation('delete').reason
    expect(r1).toBe(r2)
  })

  it('update_amount reason is same string on repeated calls', () => {
    const r1 = validateJournalOperation('update_amount').reason
    const r2 = validateJournalOperation('update_amount').reason
    expect(r1).toBe(r2)
  })
})

describe('validateImmutability — combined immutability for all tables', () => {
  it('all 5 IMMUTABLE_TABLES blocked for both delete and update', () => {
    for (const tableName of IMMUTABLE_TABLES) {
      expect(validateImmutability(tableName, 'delete').allowed).toBe(false)
      expect(validateImmutability(tableName, 'update').allowed).toBe(false)
    }
  })

  it('companies table is NOT in the immutable list', () => {
    expect(validateImmutability('companies', 'delete').allowed).toBe(true)
    expect(validateImmutability('companies', 'update').allowed).toBe(true)
  })

  it('customers table is NOT in the immutable list', () => {
    expect(validateImmutability('customers', 'delete').allowed).toBe(true)
    expect(validateImmutability('customers', 'update').allowed).toBe(true)
  })

  it('tasks table is NOT in the immutable list', () => {
    expect(validateImmutability('tasks', 'delete').allowed).toBe(true)
    expect(validateImmutability('tasks', 'update').allowed).toBe(true)
  })

  it('proformas table is NOT in the immutable list', () => {
    expect(validateImmutability('proformas', 'delete').allowed).toBe(true)
    expect(validateImmutability('proformas', 'update').allowed).toBe(true)
  })
})

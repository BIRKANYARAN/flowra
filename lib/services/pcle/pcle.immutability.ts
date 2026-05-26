// ─────────────────────────────────────────────────────────────────────────────
// PCLE Immutability Rules
//
// Defines which tables and operations are ALWAYS forbidden regardless of period
// status. This is the application-layer enforcement of financial record immutability.
// The DB-layer enforcement is RLS policies + triggers.
//
// Usage:
//   validateImmutability('audit_logs', 'delete')  // { allowed: false, reason: '…' }
//   validateJournalOperation('void')               // { allowed: true }
// ─────────────────────────────────────────────────────────────────────────────

// These tables are financially immutable — updates and deletes are forbidden.
// journal_entries may be soft-voided (is_voided=true) but never hard-deleted.
export const IMMUTABLE_TABLES = [
  'partner_finance_events',
  'journal_entries',         // entries can be VOIDED (is_voided=true) but never deleted
  'journal_entry_lines',
  'balance_sheet_snapshots',
  'audit_logs',
] as const

export type ImmutableTable = typeof IMMUTABLE_TABLES[number]

export interface ImmutabilityCheckResult {
  allowed:  boolean
  reason?:  string
}

/**
 * Pure validator — does the requested operation violate immutability rules?
 *
 * @param tableName  DB table being targeted
 * @param operation  'update' | 'delete'
 * @returns { allowed, reason }
 */
export function validateImmutability(
  tableName: string,
  operation: 'update' | 'delete',
): ImmutabilityCheckResult {
  const isImmutable = (IMMUTABLE_TABLES as readonly string[]).includes(tableName)
  if (!isImmutable) {
    return { allowed: true }
  }
  return {
    allowed: false,
    reason:  `'${tableName}' tablosu değiştirilemez — ${operation === 'delete' ? 'silme' : 'güncelleme'} işlemi bu tablo için yasaktır.`,
  }
}

export type JournalOperation =
  | 'void'
  | 'delete'
  | 'update_description'
  | 'update_amount'

/**
 * Journal-entry-specific operation validator.
 *
 * Rules:
 *   void               → allowed  (soft-void: sets is_voided=true, creates reversal entries)
 *   delete             → not allowed  (hard delete is always forbidden)
 *   update_description → allowed  (non-financial field, no effect on balances)
 *   update_amount      → not allowed  (financial immutability — void and re-enter instead)
 */
export function validateJournalOperation(
  operation: JournalOperation,
): ImmutabilityCheckResult {
  switch (operation) {
    case 'void':
      return { allowed: true }

    case 'delete':
      return {
        allowed: false,
        reason:  'Journal kayıtları silinemez. Kaydı iptal etmek için "void" işlemini kullanın.',
      }

    case 'update_description':
      return { allowed: true }

    case 'update_amount':
      return {
        allowed: false,
        reason:  'Journal kayıtlarında finansal tutarlar değiştirilemez. Kaydı iptal edip yeni bir giriş oluşturun.',
      }
  }
}

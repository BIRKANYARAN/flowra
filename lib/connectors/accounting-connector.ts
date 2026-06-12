// ── lib/connectors/accounting-connector.ts ───────────────────────────────────
//
// Read-only contract every accounting / e-invoice adapter implements
// (Paraşüt, Logo, Mikro, Uyumsoft, Bizim Hesap). v1 is strictly read — there are
// NO write/push methods; Flowra reads the truth, it does not author it.
//
// All list methods accept a `SyncWindow` for incremental, cursor-based pulls so
// ingestion stays idempotent and cheap.

import type {
  AccountingProviderId,
  ExternalInvoice,
  ExternalExpense,
  ExternalParty,
  ExternalCollection,
} from './types'

/** Incremental pull window. `since` is an ISO timestamp / opaque provider cursor. */
export interface SyncWindow {
  since?:  string | null   // pull records changed after this point
  until?:  string | null
  limit?:  number
  cursor?: string | null   // opaque provider pagination cursor
}

export interface Page<T> {
  items:       T[]
  nextCursor:  string | null   // null = no more pages
}

export interface AccountingConnector {
  readonly provider: AccountingProviderId

  /** Cheap reachability/credential check — never throws for "not reachable". */
  healthCheck(): Promise<{ ok: boolean; detail?: string }>

  listInvoices(window?: SyncWindow):    Promise<Page<ExternalInvoice>>
  listExpenses(window?: SyncWindow):    Promise<Page<ExternalExpense>>
  listCustomers(window?: SyncWindow):   Promise<Page<ExternalParty>>
  listSuppliers(window?: SyncWindow):   Promise<Page<ExternalParty>>
  listCollections(window?: SyncWindow): Promise<Page<ExternalCollection>>
}

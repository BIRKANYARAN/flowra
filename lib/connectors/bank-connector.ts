// ── lib/connectors/bank-connector.ts ─────────────────────────────────────────
//
// Read-only contract for bank movement sources. Two realistic implementations:
//   • a statement-FILE adapter (MT940 / CSV) — zero external-API risk, build first
//   • an open-banking / BaaS API adapter — later
// Both implement this same interface.

import type { ExternalBankAccount, ExternalBankTransaction } from './types'
import type { SyncWindow, Page } from './accounting-connector'

export interface BankConnector {
  readonly provider: string

  healthCheck(): Promise<{ ok: boolean; detail?: string }>

  listAccounts(): Promise<ExternalBankAccount[]>
  listTransactions(accountExternalId: string, window?: SyncWindow): Promise<Page<ExternalBankTransaction>>
}

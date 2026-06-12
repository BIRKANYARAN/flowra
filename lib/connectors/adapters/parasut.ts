// ── lib/connectors/adapters/parasut.ts ───────────────────────────────────────
//
// Paraşüt adapter SKELETON. The shape is real; the wiring is not. Every method
// throws NotConfiguredError until OAuth2 credentials + a token store exist
// (roadmap step 1 — needs a Paraşüt app + secrets, a user/product decision).
//
// Implementation notes for whoever wires it (kept here so the contract is clear):
//   • Auth: OAuth2 (client credentials + per-company refresh token).
//   • Base: https://api.parasut.com/v4/{company_id}/...
//   • listInvoices → GET /sales_invoices (outbound) and /purchase_invoices (inbound).
//   • Map each payload to ExternalInvoice, then normalize.ts → NormalizedSale/Expense.
//   • Respect rate limits; page via `nextCursor`.

import type { AccountingConnector, SyncWindow, Page } from '../accounting-connector'
import type { ExternalInvoice, ExternalExpense, ExternalParty, ExternalCollection } from '../types'
import { NotConfiguredError } from '../types'

export class ParasutConnector implements AccountingConnector {
  readonly provider = 'parasut' as const

  // A wired adapter would accept { companyId, tokenStore } here.
  constructor(private readonly _config?: unknown) {}

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    return { ok: false, detail: 'Paraşüt bağlantısı henüz yapılandırılmadı.' }
  }

  private notWired(): never { throw new NotConfiguredError('parasut', 'OAuth kimlik bilgileri gerekli') }

  async listInvoices(_window?: SyncWindow):    Promise<Page<ExternalInvoice>>    { this.notWired() }
  async listExpenses(_window?: SyncWindow):    Promise<Page<ExternalExpense>>    { this.notWired() }
  async listCustomers(_window?: SyncWindow):   Promise<Page<ExternalParty>>      { this.notWired() }
  async listSuppliers(_window?: SyncWindow):   Promise<Page<ExternalParty>>      { this.notWired() }
  async listCollections(_window?: SyncWindow): Promise<Page<ExternalCollection>> { this.notWired() }
}

// ── lib/connectors/adapters/skeleton.ts ──────────────────────────────────────
//
// Generic un-wired AccountingConnector. Every list method throws
// NotConfiguredError until a real adapter + credentials exist for the provider.
// Used by the factory for providers whose bespoke adapter isn't built yet
// (Logo, Mikro, Uyumsoft, Bizim Hesap) so createAccountingConnector() always
// returns a typed instance instead of throwing on construction.

import type { AccountingConnector, SyncWindow, Page } from '../accounting-connector'
import type { AccountingProviderId, ExternalInvoice, ExternalExpense, ExternalParty, ExternalCollection } from '../types'
import { NotConfiguredError } from '../types'

export class SkeletonAccountingConnector implements AccountingConnector {
  constructor(public readonly provider: AccountingProviderId) {}

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    return { ok: false, detail: `${this.provider} bağlantısı henüz yapılandırılmadı.` }
  }
  private notWired(): never { throw new NotConfiguredError(this.provider, 'kimlik bilgileri / adaptör gerekli') }

  async listInvoices(_w?: SyncWindow):    Promise<Page<ExternalInvoice>>    { this.notWired() }
  async listExpenses(_w?: SyncWindow):    Promise<Page<ExternalExpense>>    { this.notWired() }
  async listCustomers(_w?: SyncWindow):   Promise<Page<ExternalParty>>      { this.notWired() }
  async listSuppliers(_w?: SyncWindow):   Promise<Page<ExternalParty>>      { this.notWired() }
  async listCollections(_w?: SyncWindow): Promise<Page<ExternalCollection>> { this.notWired() }
}

// ── lib/connectors/index.ts — connector layer barrel + factory ────────────────
//
// Public entry point. Importing this performs NO I/O and wires NO provider.
// `createAccountingConnector` returns an adapter instance; every adapter is a
// skeleton that throws NotConfiguredError until real credentials exist.
//
// See docs/architecture/CONNECTOR_LAYER.md for the full design + roadmap.

export * from './types'
export * from './registry'
export * from './normalize'
export * from './bank-statement'
export * from './reconcile'
export type { AccountingConnector, SyncWindow, Page } from './accounting-connector'
export type { BankConnector } from './bank-connector'

import type { AccountingConnector } from './accounting-connector'
import type { AccountingProviderId } from './types'
import { NotConfiguredError } from './types'
import { ParasutConnector } from './adapters/parasut'

/**
 * Resolve an accounting connector for a provider. Currently every provider is a
 * skeleton (no live wiring) — calling any list*() method throws NotConfiguredError.
 * A future wired adapter would receive the company's stored credentials here.
 */
export function createAccountingConnector(id: AccountingProviderId): AccountingConnector {
  switch (id) {
    case 'parasut':
      return new ParasutConnector()
    // logo / mikro / uyumsoft / bizimhesap adapters land here as they're built.
    default:
      throw new NotConfiguredError(id, 'bu sağlayıcı için adaptör henüz eklenmedi')
  }
}

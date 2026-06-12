// ── lib/connectors/registry.ts ────────────────────────────────────────────────
//
// Static capability catalogue of the systems Flowra intends to read from. Pure
// metadata — importing this wires NOTHING and calls nothing. The settings UI can
// render it as "Bağlanabilir sistemler" with honest status badges before any
// adapter is implemented.

import type { AccountingProviderId } from './types'

export type ConnectorStatus = 'planned' | 'beta' | 'live'
export type AuthModel = 'oauth2' | 'api_key' | 'on_prem_sql' | 'soap_ws' | 'file'
export type ReadCapability = 'invoices' | 'expenses' | 'customers' | 'suppliers' | 'collections'

export interface AccountingProviderMeta {
  id:           AccountingProviderId
  label:        string
  auth:         AuthModel
  reads:        ReadCapability[]
  status:       ConnectorStatus
  /** Why this priority / how it integrates — shown as a hint, not marketing. */
  note:         string
  /** Build order from the roadmap (1 = first). */
  buildOrder:   number
}

export const ACCOUNTING_PROVIDERS: readonly AccountingProviderMeta[] = [
  {
    id: 'parasut', label: 'Paraşüt', auth: 'oauth2',
    reads: ['invoices', 'expenses', 'customers', 'suppliers', 'collections'],
    status: 'beta', buildOrder: 1,
    note: 'OAuth2 REST adaptörü yazıldı — PARASUT_* env kimlikleri girilince aktif (canlı hesapta doğrulanmalı).',
  },
  {
    id: 'bizimhesap', label: 'Bizim Hesap', auth: 'api_key',
    reads: ['invoices', 'customers'],
    status: 'planned', buildOrder: 2,
    note: 'API anahtarı ile REST; fatura + cari okuma.',
  },
  {
    id: 'uyumsoft', label: 'Uyumsoft', auth: 'soap_ws',
    reads: ['invoices'],
    status: 'planned', buildOrder: 3,
    note: 'e-Fatura/e-Arşiv web servisleri — e-belge derinliği.',
  },
  {
    id: 'logo', label: 'Logo', auth: 'on_prem_sql',
    reads: ['invoices', 'expenses', 'customers', 'suppliers', 'collections'],
    status: 'planned', buildOrder: 4,
    note: 'Çoğunlukla yerinde (on-prem) SQL → ajan/dosya köprüsü gerektirir.',
  },
  {
    id: 'mikro', label: 'Mikro', auth: 'on_prem_sql',
    reads: ['invoices', 'expenses', 'customers', 'suppliers', 'collections'],
    status: 'planned', buildOrder: 4,
    note: 'Yerinde SQL / web API — dağıtıma bağlı.',
  },
] as const

export interface BankSourceMeta {
  id:     string
  label:  string
  auth:   AuthModel
  status: ConnectorStatus
  note:   string
  buildOrder: number
}

export const BANK_SOURCES: readonly BankSourceMeta[] = [
  {
    id: 'statement_file', label: 'Banka Ekstresi (MT940 / CSV)', auth: 'file',
    status: 'planned', buildOrder: 1,
    note: 'Dosya yükleme — dış API riski yok, ilk gerçek veri yolu.',
  },
  {
    id: 'open_banking', label: 'Açık Bankacılık / BaaS', auth: 'oauth2',
    status: 'planned', buildOrder: 2,
    note: 'Banka API’leri ile otomatik hareket çekme — sonraki aşama.',
  },
] as const

export function getAccountingProvider(id: string): AccountingProviderMeta | null {
  return ACCOUNTING_PROVIDERS.find(p => p.id === id) ?? null
}

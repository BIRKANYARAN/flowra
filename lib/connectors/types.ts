// ── lib/connectors/types.ts — canonical connector domain ──────────────────────
//
// The ONLY place external-system shapes are described. Adapters return these
// provider-shaped `External*` DTOs; `normalize.ts` maps them to Flowra-canonical
// records carrying a `source`. Read-only by design — there are no write/push types.
//
// See docs/architecture/CONNECTOR_LAYER.md.

// ── Provider identity + provenance ────────────────────────────────────────────

export type AccountingProviderId =
  | 'parasut' | 'logo' | 'mikro' | 'uyumsoft' | 'bizimhesap'

export type BankProviderId = string   // bank/BaaS id, open-ended

export type ProviderId = AccountingProviderId | BankProviderId

/** Where a record came from. Drives precedence (connector supersedes manual). */
export type DataSource = 'flowra_manual' | `connector:${string}`

export function connectorSource(provider: ProviderId): DataSource {
  return `connector:${provider}`
}

/** Provenance stamp attached to every normalized record. */
export interface Provenance {
  source:        DataSource
  /** Stable id in the EXTERNAL system (for idempotent upsert / dedupe). */
  external_id:   string | null
  /** When the external system last modified it (ISO), if known. */
  external_updated_at: string | null
}

// ── External DTOs (provider-shaped, pre-normalization) ────────────────────────
// Loosely typed on purpose: each adapter maps its raw payload into these before
// handing them to the normalizer. Amounts are kept in their native currency;
// normalization is responsible for any TRY conversion downstream.

export type DocDirection = 'inbound' | 'outbound'   // alış (in) vs satış (out)

export interface ExternalParty {
  external_id: string | null
  name:        string
  tax_number?: string | null
  tax_office?: string | null
  email?:      string | null
  phone?:      string | null
  address?:    string | null
}

export interface ExternalInvoiceLine {
  description: string
  quantity:    number
  unit_price:  number       // native currency, excl. KDV
  kdv_rate:    number       // percent, e.g. 20
}

export interface ExternalInvoice {
  external_id:   string
  direction:     DocDirection         // outbound = satış faturası, inbound = alış
  invoice_no?:   string | null
  party:         ExternalParty        // customer (outbound) or supplier (inbound)
  issue_date:    string               // YYYY-MM-DD
  due_date?:     string | null
  currency:      string               // 'TRY' | 'USD' | …
  total:         number               // KDV-inclusive, native currency
  kdv_total?:    number | null
  status?:       string | null        // provider-native status string
  updated_at?:   string | null
}

export interface ExternalExpense {
  external_id:  string
  description:  string
  category?:    string | null         // provider-native category label
  party?:       ExternalParty | null  // supplier/vendor if known
  expense_date: string                // YYYY-MM-DD
  currency:     string
  amount:       number                // KDV-inclusive, native currency
  updated_at?:  string | null
}

export interface ExternalCollection {
  external_id:    string
  /** Links to an invoice's external id when the provider exposes it. */
  invoice_external_id?: string | null
  party_name?:    string | null
  date:           string              // YYYY-MM-DD
  currency:       string
  amount:         number
  method?:        string | null       // 'havale' | 'nakit' | 'kredi karti' …
  updated_at?:    string | null
}

// ── Bank DTOs ─────────────────────────────────────────────────────────────────

export interface ExternalBankAccount {
  external_id:  string
  name:         string                // "İş Bankası TL" etc.
  iban?:        string | null
  currency:     string
  balance?:     number | null         // current balance if exposed
  balance_date?: string | null
}

export interface ExternalBankTransaction {
  external_id:    string
  account_external_id: string
  date:           string              // value/transaction date YYYY-MM-DD
  currency:       string
  /** Signed: positive = inflow (alacak), negative = outflow (borç). */
  amount:         number
  description:    string
  counterparty?:  string | null
  reference?:     string | null
  balance_after?: number | null
}

// ── Errors ────────────────────────────────────────────────────────────────────

/** Thrown by un-wired adapters and by any read attempted without credentials. */
export class NotConfiguredError extends Error {
  readonly provider: ProviderId
  constructor(provider: ProviderId, detail?: string) {
    super(`Connector "${provider}" yapılandırılmamış${detail ? ` — ${detail}` : ''}.`)
    this.name = 'NotConfiguredError'
    this.provider = provider
  }
}

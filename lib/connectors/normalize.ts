// ── lib/connectors/normalize.ts ──────────────────────────────────────────────
//
// Pure mapping: provider-shaped External* DTOs → Flowra-canonical records, each
// stamped with provenance. The ONLY layer that understands external shapes; every
// downstream consumer sees Flowra types. No I/O, fully unit-tested.
//
// Canonical output mirrors Flowra's existing insert columns (sales/expenses/
// customers) + a `provenance` block, so a later ingestion step can upsert directly.

import {
  connectorSource,
  type Provenance,
  type ProviderId,
  type ExternalInvoice,
  type ExternalExpense,
  type ExternalParty,
  type ExternalBankTransaction,
  type ExternalCollection,
} from './types'

// ── Canonical (Flowra-shaped) outputs ─────────────────────────────────────────

export interface NormalizedCustomer {
  name:        string
  tax_number:  string | null
  tax_office:  string | null
  email:       string | null
  phone:       string | null
  address:     string | null
  provenance:  Provenance
}

export interface NormalizedSale {
  customer_name:  string
  currency:       string
  total:          number          // KDV-inclusive, native currency
  kdv_amount:     number          // KDV portion (native currency)
  sale_date:      string          // YYYY-MM-DD
  due_date:       string | null
  invoice_no:     string | null
  provenance:     Provenance
}

export interface NormalizedExpense {
  title:         string
  category:      string           // a Flowra ALLOWED_CATEGORIES value
  amount:        number           // KDV-inclusive, native currency
  currency:      string
  expense_date:  string
  vendor_name:   string | null
  provenance:    Provenance
}

export interface NormalizedCollection {
  invoice_external_id: string | null   // links to the source invoice when exposed
  party_name:   string | null
  date:         string                 // YYYY-MM-DD
  amount:       number                 // native currency, positive
  currency:     string
  method:       string | null          // havale · nakit · kredi karti …
  provenance:   Provenance
}

export interface NormalizedBankLine {
  account_external_id: string
  date:        string
  currency:    string
  amount:      number             // signed: + inflow, − outflow
  description: string
  counterparty: string | null
  reference:   string | null
  provenance:  Provenance
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function prov(provider: ProviderId, externalId: string | null, updatedAt?: string | null): Provenance {
  return { source: connectorSource(provider), external_id: externalId, external_updated_at: updatedAt ?? null }
}

const round2 = (n: number) => Math.round(n * 100) / 100
const ymd = (s: string) => (s ?? '').slice(0, 10)
function clean(s: string | null | undefined): string | null {
  const t = (s ?? '').trim()
  return t === '' ? null : t
}

/** Split a KDV-inclusive total into its KDV portion at a given rate (percent). */
export function kdvPortion(totalInclusive: number, kdvRate: number): number {
  const r = kdvRate > 0 ? kdvRate : 0
  const net = totalInclusive / (1 + r / 100)
  return round2(totalInclusive - net)
}

// Provider-native category label → Flowra ALLOWED_CATEGORIES (general fallback).
const CATEGORY_MAP: Record<string, string> = {
  'kira': 'rent', 'rent': 'rent',
  'maaş': 'salary', 'maas': 'salary', 'personel': 'salary', 'salary': 'salary',
  'fatura': 'utilities', 'elektrik': 'utilities', 'su': 'utilities', 'doğalgaz': 'utilities',
  'internet': 'utilities', 'utilities': 'utilities',
  'pazarlama': 'marketing', 'reklam': 'marketing', 'marketing': 'marketing',
  'lojistik': 'logistics', 'kargo': 'logistics', 'nakliye': 'logistics', 'logistics': 'logistics',
  'yazılım': 'software', 'yazilim': 'software', 'software': 'software', 'abonelik': 'software',
  'ekipman': 'equipment', 'demirbaş': 'equipment', 'equipment': 'equipment',
  'vergi': 'tax', 'tax': 'tax',
  'faiz': 'interest', 'interest': 'interest',
}

export function mapExpenseCategory(label: string | null | undefined): string {
  const key = (label ?? '').trim().toLowerCase()
  return CATEGORY_MAP[key] ?? 'general'
}

// ── Normalizers ───────────────────────────────────────────────────────────────

export function normalizeCustomer(p: ExternalParty, provider: ProviderId): NormalizedCustomer {
  return {
    name:       (p.name ?? '').trim(),
    tax_number: clean(p.tax_number),
    tax_office: clean(p.tax_office),
    email:      clean(p.email),
    phone:      clean(p.phone),
    address:    clean(p.address),
    provenance: prov(provider, p.external_id),
  }
}

/** Outbound invoice (satış faturası) → a Flowra sale. */
export function normalizeInvoiceToSale(inv: ExternalInvoice, provider: ProviderId): NormalizedSale {
  const total = round2(Number(inv.total) || 0)
  const kdv   = inv.kdv_total != null ? round2(Number(inv.kdv_total)) : kdvPortion(total, 20)
  return {
    customer_name: (inv.party?.name ?? '—').trim(),
    currency:      inv.currency || 'TRY',
    total,
    kdv_amount:    kdv,
    sale_date:     ymd(inv.issue_date),
    due_date:      inv.due_date ? ymd(inv.due_date) : null,
    invoice_no:    clean(inv.invoice_no),
    provenance:    prov(provider, inv.external_id, inv.updated_at),
  }
}

/** Inbound invoice (alış faturası) → a Flowra expense. */
export function normalizeInvoiceToExpense(inv: ExternalInvoice, provider: ProviderId): NormalizedExpense {
  return {
    title:        inv.invoice_no ? `Alış Faturası ${inv.invoice_no}` : (inv.party?.name ?? 'Alış Faturası'),
    category:     'general',
    amount:       round2(Number(inv.total) || 0),
    currency:     inv.currency || 'TRY',
    expense_date: ymd(inv.issue_date),
    vendor_name:  clean(inv.party?.name),
    provenance:   prov(provider, inv.external_id, inv.updated_at),
  }
}

export function normalizeExpense(e: ExternalExpense, provider: ProviderId): NormalizedExpense {
  return {
    title:        (e.description ?? '').trim() || 'Gider',
    category:     mapExpenseCategory(e.category),
    amount:       round2(Number(e.amount) || 0),
    currency:     e.currency || 'TRY',
    expense_date: ymd(e.expense_date),
    vendor_name:  clean(e.party?.name),
    provenance:   prov(provider, e.external_id, e.updated_at),
  }
}

export function normalizeCollection(c: ExternalCollection, provider: ProviderId): NormalizedCollection {
  return {
    invoice_external_id: clean(c.invoice_external_id),
    party_name:  clean(c.party_name),
    date:        ymd(c.date),
    amount:      Math.abs(round2(Number(c.amount) || 0)),
    currency:    c.currency || 'TRY',
    method:      clean(c.method),
    provenance:  prov(provider, c.external_id, c.updated_at),
  }
}

export function normalizeBankTransaction(t: ExternalBankTransaction, provider: ProviderId): NormalizedBankLine {
  return {
    account_external_id: t.account_external_id,
    date:        ymd(t.date),
    currency:    t.currency || 'TRY',
    amount:      round2(Number(t.amount) || 0),
    description: (t.description ?? '').trim(),
    counterparty: clean(t.counterparty),
    reference:   clean(t.reference),
    provenance:  prov(provider, t.external_id),   // bank lines are immutable (no updated_at)
  }
}

// ── lib/connectors/adapters/parasut-map.ts ───────────────────────────────────
//
// PURE mappers: Paraşüt v4 JSON:API payloads → Flowra External* DTOs. Separated
// from the HTTP/OAuth wiring so the mapping (the bug-prone part) is unit-tested
// without a live account. Field names follow the Paraşüt v4 API; verify against
// the current docs + a real company before trusting in production.
//
// JSON:API shape: { data: [{ id, type, attributes, relationships }], included: [...] }
//   • a record references a contact via relationships.contact.data = { id, type }
//   • the contact's attributes live in `included` keyed by `${type}:${id}`

import type { ExternalInvoice, ExternalParty, ExternalExpense, DocDirection } from '../types'

export interface JsonApiResource {
  id: string
  type: string
  attributes?: Record<string, unknown>
  relationships?: Record<string, { data?: { id: string; type: string } | null }>
}

/** Build a lookup of included resources by `${type}:${id}`. */
export function buildIncludedMap(included: JsonApiResource[] | undefined): Map<string, JsonApiResource> {
  const m = new Map<string, JsonApiResource>()
  for (const r of included ?? []) m.set(`${r.type}:${r.id}`, r)
  return m
}

function rel(res: JsonApiResource, name: string, included: Map<string, JsonApiResource>): JsonApiResource | null {
  const ref = res.relationships?.[name]?.data
  if (!ref) return null
  return included.get(`${ref.type}:${ref.id}`) ?? { id: ref.id, type: ref.type }
}

function str(v: unknown): string | null {
  if (typeof v === 'string' && v.trim() !== '') return v.trim()
  if (typeof v === 'number') return String(v)
  return null
}
function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return Number.isFinite(n) ? n : 0
}
const ymd = (v: unknown) => (typeof v === 'string' ? v.slice(0, 10) : '')

export function mapContact(res: JsonApiResource): ExternalParty {
  const a = res.attributes ?? {}
  return {
    external_id: res.id,
    name:        str(a.name) ?? '—',
    tax_number:  str(a.tax_number),
    tax_office:  str(a.tax_office),
    email:       str(a.email),
    phone:       str(a.phone),
    address:     str(a.address) ?? str(a.city),
  }
}

/** Map a sales_invoices / purchase_invoices resource → ExternalInvoice. */
export function mapInvoice(
  res: JsonApiResource,
  included: Map<string, JsonApiResource>,
  direction: DocDirection,
): ExternalInvoice {
  const a = res.attributes ?? {}
  const contactRes = rel(res, 'contact', included)
  const party = contactRes ? mapContact(contactRes) : { external_id: null, name: '—' }
  // Paraşüt: gross_total = KDV-inclusive, net_total = excl., total_vat = KDV.
  const total = num(a.gross_total ?? a.total ?? a.remaining)
  return {
    external_id: res.id,
    direction,
    invoice_no:  str(a.invoice_no) ?? str(a.invoice_series),
    party,
    issue_date:  ymd(a.issue_date),
    due_date:    a.due_date ? ymd(a.due_date) : null,
    currency:    str(a.currency) ?? 'TRY',
    total,
    kdv_total:   a.total_vat != null ? num(a.total_vat) : null,
    status:      str(a.payment_status) ?? str(a.item_type),
    updated_at:  str(a.updated_at),
  }
}

/** Map a purchase_invoices / expenses resource → ExternalExpense. */
export function mapExpense(res: JsonApiResource, included: Map<string, JsonApiResource>): ExternalExpense {
  const a = res.attributes ?? {}
  const contactRes = rel(res, 'contact', included) ?? rel(res, 'supplier', included)
  return {
    external_id:  res.id,
    description:  str(a.description) ?? str(a.invoice_no) ?? 'Alış',
    category:     str(a.category),
    party:        contactRes ? mapContact(contactRes) : null,
    expense_date: ymd(a.issue_date ?? a.date),
    currency:     str(a.currency) ?? 'TRY',
    amount:       num(a.gross_total ?? a.total),
    updated_at:   str(a.updated_at),
  }
}

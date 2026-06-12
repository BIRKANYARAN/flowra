import { describe, it, expect } from 'vitest'
import { buildIncludedMap, mapContact, mapInvoice, mapExpense, type JsonApiResource } from '@/lib/connectors/adapters/parasut-map'

// Realistic Paraşüt v4 JSON:API fragments.
const contact: JsonApiResource = {
  id: 'c100', type: 'contacts',
  attributes: { name: 'ABC Teknoloji A.Ş.', tax_number: '1234567890', tax_office: 'Kadıköy', email: 'info@abc.com', phone: '+90 212', address: 'İstanbul' },
}
const included = buildIncludedMap([contact])

describe('parasut-map — JSON:API → External*', () => {
  it('maps a contact', () => {
    const p = mapContact(contact)
    expect(p).toMatchObject({ external_id: 'c100', name: 'ABC Teknoloji A.Ş.', tax_number: '1234567890', email: 'info@abc.com' })
  })

  it('maps an outbound sales invoice with its contact + KDV-inclusive total', () => {
    const inv: JsonApiResource = {
      id: 's1', type: 'sales_invoices',
      attributes: { issue_date: '2026-06-01', due_date: '2026-06-30', currency: 'TRY', gross_total: '1200.0', net_total: '1000.0', total_vat: '200.0', invoice_no: 'FTR-1', updated_at: '2026-06-02T10:00:00Z' },
      relationships: { contact: { data: { id: 'c100', type: 'contacts' } } },
    }
    const e = mapInvoice(inv, included, 'outbound')
    expect(e).toMatchObject({
      external_id: 's1', direction: 'outbound', invoice_no: 'FTR-1',
      currency: 'TRY', total: 1200, kdv_total: 200, issue_date: '2026-06-01', due_date: '2026-06-30',
    })
    expect(e.party.name).toBe('ABC Teknoloji A.Ş.')
    expect(e.updated_at).toBe('2026-06-02T10:00:00Z')
  })

  it('falls back to — when the contact is not in included', () => {
    const inv: JsonApiResource = {
      id: 's2', type: 'sales_invoices',
      attributes: { issue_date: '2026-06-05', currency: 'USD', gross_total: 590 },
      relationships: { contact: { data: { id: 'cX', type: 'contacts' } } },
    }
    const e = mapInvoice(inv, included, 'outbound')
    expect(e.party.name).toBe('—')
    expect(e.total).toBe(590)
    expect(e.currency).toBe('USD')
    expect(e.due_date).toBeNull()
  })

  it('maps a purchase invoice → expense', () => {
    const pi: JsonApiResource = {
      id: 'p1', type: 'purchase_invoices',
      attributes: { issue_date: '2026-05-15', currency: 'TRY', gross_total: '5000.0', description: 'Ofis malzemesi' },
      relationships: { contact: { data: { id: 'c100', type: 'contacts' } } },
    }
    const x = mapExpense(pi, included)
    expect(x).toMatchObject({ external_id: 'p1', amount: 5000, expense_date: '2026-05-15', description: 'Ofis malzemesi' })
    expect(x.party?.name).toBe('ABC Teknoloji A.Ş.')
  })
})

import { describe, it, expect } from 'vitest'
import {
  connectorSource,
  NotConfiguredError,
  createAccountingConnector,
  ACCOUNTING_PROVIDERS,
  BANK_SOURCES,
  kdvPortion,
  mapExpenseCategory,
  normalizeCustomer,
  normalizeInvoiceToSale,
  normalizeInvoiceToExpense,
  normalizeExpense,
  normalizeBankTransaction,
  normalizeCollection,
} from '@/lib/connectors'
import type { ExternalInvoice, ExternalParty, ExternalExpense, ExternalBankTransaction, ExternalCollection } from '@/lib/connectors'

describe('connector provenance + registry', () => {
  it('connectorSource tags records with the provider', () => {
    expect(connectorSource('parasut')).toBe('connector:parasut')
  })

  it('registry is non-empty and every provider has a build order + status', () => {
    expect(ACCOUNTING_PROVIDERS.length).toBeGreaterThanOrEqual(5)
    for (const p of ACCOUNTING_PROVIDERS) {
      expect(p.buildOrder).toBeGreaterThan(0)
      expect(['planned', 'beta', 'live']).toContain(p.status)
      expect(p.reads.length).toBeGreaterThan(0)
    }
    expect(BANK_SOURCES.some(b => b.auth === 'file')).toBe(true)  // file import is the safe first path
  })

  it('Paraşüt is the first accounting build target', () => {
    const first = [...ACCOUNTING_PROVIDERS].sort((a, b) => a.buildOrder - b.buildOrder)[0]
    expect(first.id).toBe('parasut')
  })
})

describe('connector factory — skeletons throw until configured', () => {
  it('returns an adapter but list*() throws NotConfiguredError', async () => {
    const c = createAccountingConnector('parasut')
    expect(c.provider).toBe('parasut')
    await expect(c.listInvoices()).rejects.toBeInstanceOf(NotConfiguredError)
    expect((await c.healthCheck()).ok).toBe(false)
  })

  it('un-adaptered providers return a skeleton whose list*() throws', async () => {
    const logo = createAccountingConnector('logo')
    expect(logo.provider).toBe('logo')
    await expect(logo.listInvoices()).rejects.toBeInstanceOf(NotConfiguredError)
    await expect(logo.listCustomers()).rejects.toBeInstanceOf(NotConfiguredError)
    expect((await logo.healthCheck()).ok).toBe(false)
  })
})

describe('normalize — KDV + category', () => {
  it('kdvPortion splits a 20% inclusive total', () => {
    expect(kdvPortion(1200, 20)).toBeCloseTo(200, 2)   // net 1000 + 200 KDV
    expect(kdvPortion(1000, 0)).toBe(0)
  })

  it('maps TR/EN category labels to Flowra categories, default general', () => {
    expect(mapExpenseCategory('Kira')).toBe('rent')
    expect(mapExpenseCategory('personel')).toBe('salary')
    expect(mapExpenseCategory('ELEKTRIK')).toBe('utilities')
    expect(mapExpenseCategory('bilinmeyen')).toBe('general')
    expect(mapExpenseCategory(null)).toBe('general')
  })
})

describe('normalize — entities carry provenance + canonical shape', () => {
  const party: ExternalParty = { external_id: 'p1', name: '  ABC A.Ş.  ', tax_number: '123', email: '' }

  it('normalizeCustomer trims + nulls empties + stamps source', () => {
    const c = normalizeCustomer(party, 'parasut')
    expect(c.name).toBe('ABC A.Ş.')
    expect(c.tax_number).toBe('123')
    expect(c.email).toBeNull()
    expect(c.provenance).toEqual({ source: 'connector:parasut', external_id: 'p1', external_updated_at: null })
  })

  it('outbound invoice → sale (KDV derived when total-only)', () => {
    const inv: ExternalInvoice = {
      external_id: 'i1', direction: 'outbound', invoice_no: 'FTR-1', party,
      issue_date: '2026-06-01T08:00:00Z', due_date: '2026-06-30', currency: 'TRY', total: 1200,
    }
    const s = normalizeInvoiceToSale(inv, 'parasut')
    expect(s.customer_name).toBe('ABC A.Ş.')
    expect(s.total).toBe(1200)
    expect(s.kdv_amount).toBeCloseTo(200, 2)
    expect(s.sale_date).toBe('2026-06-01')
    expect(s.due_date).toBe('2026-06-30')
    expect(s.invoice_no).toBe('FTR-1')
    expect(s.provenance.source).toBe('connector:parasut')
  })

  it('inbound invoice → expense', () => {
    const inv: ExternalInvoice = {
      external_id: 'i2', direction: 'inbound', invoice_no: 'ALF-9', party,
      issue_date: '2026-05-15', currency: 'TRY', total: 590,
    }
    const e = normalizeInvoiceToExpense(inv, 'parasut')
    expect(e.amount).toBe(590)
    expect(e.expense_date).toBe('2026-05-15')
    expect(e.vendor_name).toBe('ABC A.Ş.')
    expect(e.category).toBe('general')
  })

  it('expense maps category + trims title', () => {
    const x: ExternalExpense = { external_id: 'e1', description: ' Ofis kirası ', category: 'kira', expense_date: '2026-06-02', currency: 'TRY', amount: 25000 }
    const e = normalizeExpense(x, 'logo')
    expect(e.title).toBe('Ofis kirası')
    expect(e.category).toBe('rent')
    expect(e.provenance.source).toBe('connector:logo')
  })

  it('collection normalizes to a positive payment with provenance', () => {
    const c: ExternalCollection = {
      external_id: 'c1', invoice_external_id: 'i9', party_name: ' XYZ ', date: '2026-06-07', currency: 'TRY', amount: -1200, method: 'havale',
    }
    const n = normalizeCollection(c, 'parasut')
    expect(n.amount).toBe(1200)            // magnitude
    expect(n.invoice_external_id).toBe('i9')
    expect(n.party_name).toBe('XYZ')
    expect(n.method).toBe('havale')
    expect(n.provenance.source).toBe('connector:parasut')
  })

  it('bank transaction keeps signed amount + provenance', () => {
    const t: ExternalBankTransaction = {
      external_id: 'b1', account_external_id: 'acc1', date: '2026-06-10', currency: 'TRY',
      amount: -1500.5, description: '  Kira ödemesi  ', counterparty: 'Ev sahibi',
    }
    const l = normalizeBankTransaction(t, 'statement_file')
    expect(l.amount).toBe(-1500.5)
    expect(l.description).toBe('Kira ödemesi')
    expect(l.account_external_id).toBe('acc1')
    expect(l.provenance.source).toBe('connector:statement_file')
  })
})

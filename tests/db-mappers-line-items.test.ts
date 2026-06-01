// Node-env tests completing lib/db/mappers.ts coverage — the expense, proforma,
// proforma-item, sale-item and partner-loan-tranche mappers. Like the sale/stock
// mappers, these resolve DB column aliases + apply defaults (the integrity layer
// where field drift hides). With db-mappers.test.ts, every row→DTO mapper is now
// covered.
import { describe, it, expect } from 'vitest'
import {
  mapExpenseRow, mapProformaRow, mapProformaItemRow, mapSaleItemRow, mapPartnerLoanTrancheRow,
} from '@/lib/db/mappers'

describe('mapExpenseRow', () => {
  it('falls back amount_try → amount and applies type/status defaults', () => {
    const m = mapExpenseRow({ id: 'e1', amount: 250 })   // no amount_try
    expect(m.amount).toBe(250)
    expect(m.amount_try).toBe(250)        // aliased from amount
    expect(m.expense_type).toBe('general')
    expect(m.payment_status).toBe('pending')
    expect(m.is_paid).toBe(false)
  })
  it('coerces is_paid to a real boolean', () => {
    expect(mapExpenseRow({ id: 'e1', is_paid: 1 }).is_paid).toBe(true)
    expect(mapExpenseRow({ id: 'e1', is_paid: 0 }).is_paid).toBe(false)
  })
})

describe('mapProformaRow', () => {
  it('defaults validity_days to 30 (including when the row has 0) and status to draft', () => {
    expect(mapProformaRow({ id: 'p1' }).validity_days).toBe(30)
    expect(mapProformaRow({ id: 'p1', validity_days: 0 }).validity_days).toBe(30) // 0 → 30 via || 30
    expect(mapProformaRow({ id: 'p1', validity_days: 45 }).validity_days).toBe(45)
    expect(mapProformaRow({ id: 'p1' }).status).toBe('draft')
  })
  it('keeps snapshots only when they are objects, else null', () => {
    expect(mapProformaRow({ id: 'p1', company_snapshot: { name: 'X' } }).company_snapshot).toEqual({ name: 'X' })
    expect(mapProformaRow({ id: 'p1', company_snapshot: 'oops' }).company_snapshot).toBeNull()
  })
})

describe('mapProformaItemRow / mapSaleItemRow — shared line-item alias logic', () => {
  for (const [label, mapper] of [['proforma', mapProformaItemRow], ['sale', mapSaleItemRow]] as const) {
    it(`${label}: resolves product_name/unit_price/qty/discount_pct/kdv_rate canonical names`, () => {
      const m = mapper({ id: 'i1', product_name: 'Widget', unit_price: 100, qty: 3, discount_pct: 10, kdv_rate: 20 })
      expect(m.name).toBe('Widget')
      expect(m.price).toBe(100)
      expect(m.quantity).toBe(3)
      expect(m.discount_percent).toBe(10)
      expect(m.kdv).toBe(20)
    })
    it(`${label}: falls back to legacy aliases (name/price/quantity/discount_percent/kdv)`, () => {
      const m = mapper({ id: 'i1', name: 'Legacy', price: 50, quantity: 2, discount_percent: 5, kdv: 18 })
      expect(m.name).toBe('Legacy')
      expect(m.price).toBe(50)
      expect(m.quantity).toBe(2)
      expect(m.discount_percent).toBe(5)
      expect(m.kdv).toBe(18)
    })
    it(`${label}: defaults name '—', quantity 1 (0→1), unit 'adet'`, () => {
      const m = mapper({ id: 'i1', qty: 0 })
      expect(m.name).toBe('—')
      expect(m.quantity).toBe(1)   // 0 → 1 via || 1
      expect(m.unit).toBe('adet')
    })
  }
})

describe('mapPartnerLoanTrancheRow', () => {
  it('resolves interest_rate_annual_pct ← annual_interest_rate and defaults status active', () => {
    expect(mapPartnerLoanTrancheRow({ id: 't1', annual_interest_rate: 42 }).interest_rate_annual_pct).toBe(42)
    expect(mapPartnerLoanTrancheRow({ id: 't1', interest_rate_annual_pct: 30 }).interest_rate_annual_pct).toBe(30)
    expect(mapPartnerLoanTrancheRow({ id: 't1' }).status).toBe('active')
  })
  it('maps absent dates to null', () => {
    const m = mapPartnerLoanTrancheRow({ id: 't1' })
    expect(m.disbursed_at).toBeNull()
    expect(m.due_date).toBeNull()
  })
})

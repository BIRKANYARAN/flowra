// Node-env tests for lib/db/mappers.ts — the canonical row→DTO mappers. Their
// whole reason to exist is resolving DB column-name ALIASES and applying
// defaults (the exact class of bug behind earlier field-mapping incidents, e.g.
// total↔total_try, paid_amount↔amount_paid). Previously untested.
import { describe, it, expect } from 'vitest'
import { saleOutstanding, mapSaleRow, mapStockLotRow } from '@/lib/db/mappers'

describe('saleOutstanding', () => {
  it('= max(0, total − paid), never negative', () => {
    expect(saleOutstanding({ total_try: 1000, amount_paid: 600 })).toBe(400)
    expect(saleOutstanding({ total_try: 1000, amount_paid: 1000 })).toBe(0)
    expect(saleOutstanding({ total_try: 1000, amount_paid: 1200 })).toBe(0) // overpaid → 0, not −200
  })
})

describe('mapSaleRow — alias resolution + defaults', () => {
  it('resolves the total → total_try and paid_amount → amount_paid aliases', () => {
    const fromAlias    = mapSaleRow({ id: 's1', total: 500, paid_amount: 200 })
    const fromCanonical = mapSaleRow({ id: 's1', total_try: 500, amount_paid: 200 })
    expect(fromAlias.total_try).toBe(500)
    expect(fromAlias.amount_paid).toBe(200)
    expect(fromCanonical.total_try).toBe(500)   // canonical name also works
    expect(fromCanonical.amount_paid).toBe(200)
  })
  it('applies defaults for missing currency / statuses', () => {
    const m = mapSaleRow({ id: 's1' })
    expect(m.currency).toBe('TRY')
    expect(m.payment_status).toBe('unpaid')
    expect(m.shipment_status).toBe('pending')
    expect(m.total_try).toBe(0)         // safeNum default
    expect(m.amount_paid).toBe(0)
  })
  it('maps absent optional FKs/dates to null (not empty string)', () => {
    const m = mapSaleRow({ id: 's1' })
    expect(m.customer_id).toBeNull()
    expect(m.due_date).toBeNull()
    expect(m.paid_at).toBeNull()
    expect(m.proforma_id).toBeNull()
    expect(m.deleted_at).toBeNull()
  })
})

describe('mapStockLotRow — legacy cost-field aliases', () => {
  it('accepts the canonical cost fields', () => {
    const m = mapStockLotRow({ id: 'l1', cost_price: 12, cost_price_try: 12, cost_fx_rate: 1, qty_remaining: 5 })
    expect(m.cost_price).toBe(12)
    expect(m.cost_price_try).toBe(12)
    expect(m.qty_remaining).toBe(5)
  })
  it('falls back to legacy aliases (unit_cost / entry_cost_try / fx_rate_at_entry)', () => {
    const m = mapStockLotRow({ id: 'l1', unit_cost: 9, entry_cost_try: 18, fx_rate_at_entry: 2 })
    expect(m.cost_price).toBe(9)
    expect(m.cost_price_try).toBe(18)
    expect(m.cost_fx_rate).toBe(2)
  })
  it('defaults fx rate to 1 and currency to TRY when absent', () => {
    const m = mapStockLotRow({ id: 'l1' })
    expect(m.cost_fx_rate).toBe(1)
    expect(m.currency).toBe('TRY')
  })
})

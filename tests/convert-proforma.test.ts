/**
 * convert-proforma.test.ts
 *
 * Three suites:
 *  A. SQL static analysis — function body column names, safety guards,
 *     P0-A aggregate pre-flight, P0-B parallel array, P0-C NO_ITEMS,
 *     P0-D total_try computation.
 *
 *  B. Schema guarantee analysis — both SQL installer files must declare
 *     the columns written by the function (P0-E).
 *
 *  C. Scenario tests — mock the Supabase RPC layer and verify that
 *     SaleService.convertProforma maps each DB exception to the correct
 *     AppError code.
 *
 * Run: npx vitest run tests/convert-proforma.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { join }        from 'path'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const sqlPath      = join(__dirname, '..', 'supabase', 'repair_production.sql')
const installPath  = join(__dirname, '..', 'supabase', 'flowra_install.sql')
const fullSql      = readFileSync(sqlPath,     'utf-8')
const installSql   = readFileSync(installPath, 'utf-8')

/** Extract the convert_proforma_to_sale function body from repair_production.sql */
function extractFunctionBody(sql: string): string {
  const start     = sql.indexOf('create or replace function public.convert_proforma_to_sale')
  if (start === -1) throw new Error('convert_proforma_to_sale not found')
  const bodyStart = sql.indexOf('as $$', start)
  const bodyEnd   = sql.indexOf('\nend $$;', bodyStart)
  if (bodyStart === -1 || bodyEnd === -1) throw new Error('Could not isolate function body')
  return sql.slice(bodyStart, bodyEnd + '\nend $$;'.length)
}

const fnBody = extractFunctionBody(fullSql)

// Strip SQL comment lines so assertions don't fire on documentation text
const fnBodyCode = fnBody.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')

// ─────────────────────────────────────────────────────────────────────────────
// A. SQL STATIC ANALYSIS — function body
// ─────────────────────────────────────────────────────────────────────────────

describe('repair_production.sql — convert_proforma_to_sale static analysis', () => {

  // ── Signature ───────────────────────────────────────────────────────────────

  it('drops the old incompatible overload before recreating', () => {
    expect(fullSql).toContain(
      'drop function if exists public.convert_proforma_to_sale(uuid, uuid, date, date, uuid, text, text)',
    )
  })

  it('signature has p_item_ids parameter', () => { expect(fnBody).toContain('p_item_ids') })
  it('signature has p_quantities parameter', () => { expect(fnBody).toContain('p_quantities') })
  it('signature has p_interest_days parameter', () => { expect(fnBody).toContain('p_interest_days') })
  it('signature has p_company_id parameter', () => { expect(fnBody).toContain('p_company_id') })

  it('returns uuid', () => {
    const sig = fullSql.slice(
      fullSql.indexOf('create or replace function public.convert_proforma_to_sale'),
      fullSql.indexOf('as $$', fullSql.indexOf('create or replace function public.convert_proforma_to_sale')),
    )
    expect(sig).toContain('returns uuid')
  })

  // ── proforma_items canonical column names ───────────────────────────────────

  it('reads proforma_items.quantity (not qty)', () => {
    expect(fnBody).toContain('v_item.quantity')
    expect(fnBody).not.toContain('v_item.qty')
  })

  it('reads proforma_items.name (not product_name)', () => {
    expect(fnBody).toContain('v_item.name')
  })

  it('reads proforma_items.price (not unit_price)', () => {
    expect(fnBody).toContain('v_item.price')
    expect(fnBody).not.toContain('v_item.unit_price')
  })

  it('reads proforma_items.discount_percent (not discount_pct)', () => {
    expect(fnBody).toContain('discount_percent')
    expect(fnBody).not.toContain('discount_pct')
  })

  // ── sale_items canonical columns ────────────────────────────────────────────

  it('inserts product_name into sale_items', () => {
    const itemsInsert = fnBody.slice(fnBody.indexOf('insert into sale_items'))
    expect(itemsInsert).toContain('product_name')
  })

  it('inserts line_total_try into sale_items', () => {
    const itemsInsert = fnBody.slice(fnBody.indexOf('insert into sale_items'))
    expect(itemsInsert).toContain('line_total_try')
  })

  // ── sale_item_allocations required fields ───────────────────────────────────

  it('inserts all 8 required fields into sale_item_allocations', () => {
    const allocInsert = fnBody.slice(fnBody.indexOf('insert into sale_item_allocations'))
    for (const col of ['sale_id', 'company_id', 'sale_item_id', 'stock_lot_id',
                        'qty_allocated', 'unit_cost', 'holding_days', 'interest_cost']) {
      expect(allocInsert, `missing: ${col}`).toContain(col)
    }
  })

  // ── payment_status ──────────────────────────────────────────────────────────

  it("uses payment_status = 'unpaid' (not 'pending') in executable code", () => {
    expect(fnBody).toContain("'unpaid'")
    expect(fnBodyCode).not.toContain("'pending'")
  })

  // ── P0-A: Aggregate FIFO pre-flight by product_id ──────────────────────────

  it('[P0-A] pre-flight groups by product_id — aggregate check, not per-line', () => {
    // The aggregate approach uses GROUP BY so the same product across multiple
    // proforma lines is checked once against total available stock.
    expect(fnBodyCode).toContain('group by pi.product_id')
  })

  it('[P0-A] pre-flight sums quantities before comparing to stock', () => {
    // sum(...) is used to aggregate qty across all lines for a product
    expect(fnBodyCode).toContain('sum(')
    expect(fnBodyCode).toContain('total_qty_needed')
  })

  it('[P0-A] pre-flight uses a separate cursor (v_check) from main item loop (v_item)', () => {
    expect(fnBodyCode).toContain('v_check.product_id')
    expect(fnBodyCode).toContain('v_check.total_qty_needed')
  })

  // ── P0-B: Parallel array by array_position, not sort_order index ───────────

  it('[P0-B] quantity resolution uses array_position(p_item_ids, ...) not row_number', () => {
    expect(fnBodyCode).toContain('array_position(p_item_ids, pi.id)')
    // The old sort_order-based indexing must not appear
    expect(fnBodyCode).not.toContain('v_item.rn + 1')
  })

  it('[P0-B] array_position lookup also used in main item loop', () => {
    // Qty resolution in both pre-flight (aggregate) and main item loop
    expect(fnBodyCode).toContain('array_position(p_item_ids, v_item.id)')
  })

  // ── P0-C: NO_ITEMS guard ────────────────────────────────────────────────────

  it("[P0-C] raises NO_ITEMS when no items match the selection", () => {
    expect(fnBodyCode).toContain("'NO_ITEMS'")
  })

  it('[P0-C] checks item count before any INSERT', () => {
    // The count check must precede the sale INSERT — verify ordering in the body
    const noItemsPos = fnBodyCode.indexOf("'NO_ITEMS'")
    const insertPos  = fnBodyCode.indexOf('insert into sales')
    expect(noItemsPos).toBeGreaterThan(0)
    expect(insertPos).toBeGreaterThan(0)
    expect(noItemsPos).toBeLessThan(insertPos)
  })

  // ── P0-D: total_try / subtotal / kdv_total computation ─────────────────────

  it('[P0-D] declares v_subtotal_sum, v_kdv_total_sum, v_total_try_sum accumulators', () => {
    expect(fnBody).toContain('v_subtotal_sum')
    expect(fnBody).toContain('v_kdv_total_sum')
    expect(fnBody).toContain('v_total_try_sum')
  })

  it('[P0-D] accumulates totals inside the item loop', () => {
    expect(fnBodyCode).toContain('v_subtotal_sum  :=')
    expect(fnBodyCode).toContain('v_kdv_total_sum :=')
    expect(fnBodyCode).toContain('v_total_try_sum :=')
  })

  it('[P0-D] writes total, total_try, subtotal, kdv_total back to sales via UPDATE', () => {
    expect(fnBodyCode).toContain('update sales')
    expect(fnBodyCode).toContain('total_try  = round(v_total_try_sum')
    expect(fnBodyCode).toContain('subtotal   = round(v_subtotal_sum')
    expect(fnBodyCode).toContain('kdv_total  = round(v_kdv_total_sum')
  })

  it('[P0-D] UPDATE comes after the item processing loop', () => {
    const updatePos   = fnBodyCode.indexOf('update sales')
    const itemLoopPos = fnBodyCode.indexOf('insert into sale_items')
    expect(updatePos).toBeGreaterThan(itemLoopPos)
  })

  // ── R1: Concurrent conversion — proforma row lock ───────────────────────────

  it('[R1] proforma SELECT uses FOR UPDATE to prevent concurrent conversion', () => {
    // The SELECT that loads v_proforma must include FOR UPDATE so a second
    // concurrent call on the same proforma blocks at this point.
    expect(fnBodyCode).toContain('for update')
    // FOR UPDATE must appear before the status check (which relies on the lock)
    const forUpdatePos = fnBodyCode.indexOf('for update')
    const statusPos    = fnBodyCode.indexOf('ALREADY_CONVERTED')
    expect(forUpdatePos).toBeGreaterThan(0)
    expect(forUpdatePos).toBeLessThan(statusPos)
  })

  // ── R2: Stale stock — FOR UPDATE on lots + post-allocation guard ────────────

  it('[R2] FIFO allocation uses FOR UPDATE on stock_lots to prevent concurrent depletion', () => {
    // The inner lot cursor must lock rows so concurrent sales block until commit.
    const fifoStart  = fnBodyCode.indexOf('select *\n        from   stock_lots')
    const forUpdates = fnBodyCode.slice(fifoStart, fifoStart + 500)
    expect(forUpdates).toContain('for update')
  })

  it('[R2] post-allocation shortfall raises INSUFFICIENT_STOCK (concurrent depletion guard)', () => {
    // After the lot loop, v_qty_needed > 0 must trigger INSUFFICIENT_STOCK.
    // This catches concurrent stock depletion that slipped past the pre-flight.
    expect(fnBodyCode).toContain('v_qty_needed > 0')
    // Ensure it raises INSUFFICIENT_STOCK (there are two: pre-flight and post-alloc)
    const occurrences = (fnBodyCode.match(/INSUFFICIENT_STOCK/g) ?? []).length
    expect(occurrences).toBeGreaterThanOrEqual(2)
  })

  it('[R2] post-allocation check mentions concurrent detection', () => {
    expect(fnBody).toContain('concurrent')
  })

  // ── R3: Partial conversion total — computed from selected items ─────────────

  it('[R3] total is computed from selected items (UPDATE sets total, not INSERT)', () => {
    // The INSERT must NOT copy v_proforma.total — it uses 0 as placeholder.
    // The UPDATE after the loop computes total = subtotal + kdv_total.
    expect(fnBodyCode).toContain('total      = round(v_subtotal_sum + v_kdv_total_sum')
  })

  it('[R3] sales INSERT uses 0 placeholder for total (not v_proforma.total)', () => {
    // Extract just the INSERT ... values block
    const insertStart = fnBodyCode.indexOf('insert into sales')
    const insertEnd   = fnBodyCode.indexOf('returning id into v_sale_id', insertStart)
    const insertBlock = fnBodyCode.slice(insertStart, insertEnd)
    // Must not copy v_proforma.total into the INSERT values
    expect(insertBlock).not.toContain('v_proforma.total')
  })

  // ── R4: uq_sales_proforma_live in SQL files ─────────────────────────────────
  // (Covered in Suite B below — keep cross-reference here)

  // ── Remaining safety guards ─────────────────────────────────────────────────

  it('raises INSUFFICIENT_STOCK on stock shortage', () => {
    expect(fnBodyCode).toContain('INSUFFICIENT_STOCK')
  })

  it('raises ALREADY_CONVERTED for duplicate conversion', () => {
    expect(fnBodyCode).toContain('ALREADY_CONVERTED')
  })

  it('uses pg_advisory_xact_lock for race-safe sale_no', () => {
    expect(fnBodyCode).toContain('pg_advisory_xact_lock')
  })

  it('checks membership with accepted_at is not null', () => {
    expect(fnBody).toContain('accepted_at is not null')
  })

  it('checks company_id guard (FORBIDDEN)', () => {
    expect(fnBodyCode).toContain('FORBIDDEN')
  })

  it('fetches interest rate from interest_rates table', () => {
    expect(fnBodyCode).toContain('interest_rates')
    expect(fnBodyCode).toContain('annual_rate')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// B. SCHEMA GUARANTEE ANALYSIS — P0-E
// Both SQL files must ADD COLUMN the fields used by the function.
// ─────────────────────────────────────────────────────────────────────────────

describe('repair_production.sql — uq_sales_proforma_live unique index (R4)', () => {

  it('defines uq_sales_proforma_live unique partial index', () => {
    expect(fullSql).toContain('create unique index if not exists uq_sales_proforma_live')
  })

  it('uq_sales_proforma_live is on sales(proforma_id) where deleted_at is null', () => {
    expect(fullSql).toContain('on sales (proforma_id)')
    const idxBlock = fullSql.slice(
      fullSql.indexOf('create unique index if not exists uq_sales_proforma_live'),
      fullSql.indexOf('\n\n', fullSql.indexOf('uq_sales_proforma_live')),
    )
    expect(idxBlock).toContain('where deleted_at is null')
  })

  it('uq_sales_proforma_live appears BEFORE the function definition', () => {
    const idxPos = fullSql.indexOf('uq_sales_proforma_live')
    const fnPos  = fullSql.indexOf('create or replace function public.convert_proforma_to_sale')
    expect(idxPos).toBeLessThan(fnPos)
  })
})

describe('flowra_install.sql — uq_sales_proforma_live unique index (R4)', () => {

  it('defines uq_sales_proforma_live unique partial index', () => {
    expect(installSql).toContain('create unique index if not exists uq_sales_proforma_live')
  })

  it('uq_sales_proforma_live is on sales(proforma_id) where deleted_at is null', () => {
    const idxBlock = installSql.slice(
      installSql.indexOf('create unique index if not exists uq_sales_proforma_live'),
      installSql.indexOf('\n\n', installSql.indexOf('uq_sales_proforma_live')),
    )
    expect(idxBlock).toContain('where deleted_at is null')
  })
})

describe('repair_production.sql — column guarantees (P0-E)', () => {

  it('guarantees sales.interest_rate column', () => {
    expect(fullSql).toContain('add column if not exists interest_rate')
  })

  it('guarantees sales.interest_days column', () => {
    expect(fullSql).toContain('add column if not exists interest_days')
  })

  it('guarantees sales.subtotal column', () => {
    expect(fullSql).toContain('add column if not exists subtotal')
  })

  it('guarantees sales.kdv_total column', () => {
    expect(fullSql).toContain('add column if not exists kdv_total')
  })

  it('guarantees sale_items.line_total_try column', () => {
    expect(fullSql).toContain('add column if not exists line_total_try')
  })

  it('guarantees sale_item_allocations.holding_days column', () => {
    expect(fullSql).toContain('add column if not exists holding_days')
  })

  it('guarantees sale_item_allocations.interest_cost column', () => {
    expect(fullSql).toContain('add column if not exists interest_cost')
  })

  it('column guarantees appear BEFORE the function definition', () => {
    // Columns must be guaranteed before the function is created
    const colPos = fullSql.indexOf('add column if not exists interest_rate')
    const fnPos  = fullSql.indexOf('create or replace function public.convert_proforma_to_sale')
    expect(colPos).toBeGreaterThan(0)
    expect(fnPos).toBeGreaterThan(0)
    expect(colPos).toBeLessThan(fnPos)
  })
})

describe('flowra_install.sql — column guarantees (P0-E)', () => {

  it('guarantees sales.interest_rate column', () => {
    expect(installSql).toContain('add column if not exists interest_rate')
  })

  it('guarantees sales.interest_days column', () => {
    expect(installSql).toContain('add column if not exists interest_days')
  })

  it('guarantees sales.subtotal column', () => {
    expect(installSql).toContain('add column if not exists subtotal')
  })

  it('guarantees sales.kdv_total column', () => {
    expect(installSql).toContain('add column if not exists kdv_total')
  })

  it('guarantees sale_items.line_total_try column', () => {
    expect(installSql).toContain('add column if not exists line_total_try')
  })

  it('guarantees sale_item_allocations.holding_days column', () => {
    expect(installSql).toContain('add column if not exists holding_days')
  })

  it('guarantees sale_item_allocations.interest_cost column', () => {
    expect(installSql).toContain('add column if not exists interest_cost')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// C. SCENARIO TESTS — SaleService.convertProforma
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))
vi.mock('@/lib/idempotency', () => ({
  checkIdempotency:      vi.fn(),
  reserveIdempotencyKey: vi.fn(),
  commitIdempotencyKey:  vi.fn(),
  failIdempotencyKey:    vi.fn(),
}))
vi.mock('@/lib/services/event.service', () => ({
  EventService: { emit: vi.fn() },
}))

import { createClient }                               from '@/lib/supabase-server'
import { checkIdempotency, reserveIdempotencyKey,
         commitIdempotencyKey, failIdempotencyKey }   from '@/lib/idempotency'
import { SaleService }                                from '@/lib/services/sale.service'
import { AppError }                                   from '@/types/errors'

// ── Helpers ───────────────────────────────────────────────────────────────────

type RpcResponse = { data: string | null; error: { message: string } | null }

function mockRpc(response: RpcResponse) {
  const rpcMock = vi.fn().mockResolvedValue(response)
  ;(createClient as ReturnType<typeof vi.fn>).mockReturnValue({ rpc: rpcMock })
  return rpcMock
}

const BASE_INPUT = {
  idempotency_key: 'test-key-001',
  proforma_id:     'proforma-uuid-001',
  item_ids:        [] as string[],
  quantities:      [] as number[],
  interest_days:   0,
}
const COMPANY_ID = 'company-uuid-001'
const USER_ID    = 'user-uuid-001'
const CTX        = { requestId: 'req-001', userId: USER_ID } as Parameters<typeof SaleService.convertProforma>[3]

beforeEach(() => {
  vi.clearAllMocks()
  ;(checkIdempotency     as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  ;(reserveIdempotencyKey as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  ;(commitIdempotencyKey  as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  ;(failIdempotencyKey    as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SaleService.convertProforma — scenario tests', () => {

  // ── Success ──────────────────────────────────────────────────────────────────

  it('success: returns sale_id when RPC succeeds', async () => {
    const saleId = 'sale-uuid-success'
    mockRpc({ data: saleId, error: null })

    const result = await SaleService.convertProforma(USER_ID, BASE_INPUT, COMPANY_ID, CTX)

    expect(result.sale_id).toBe(saleId)
    expect(result.cached).toBeUndefined()
    expect(commitIdempotencyKey).toHaveBeenCalledWith(
      USER_ID, BASE_INPUT.idempotency_key, 'sale_convert', saleId,
      expect.objectContaining({ proforma_id: BASE_INPUT.proforma_id }),
    )
  })

  // ── Partial quantity — parallel array ────────────────────────────────────────

  it('[P0-B] partial quantity: forwards p_item_ids and p_quantities to RPC as parallel arrays', async () => {
    const saleId    = 'sale-uuid-partial'
    const rpcMock   = mockRpc({ data: saleId, error: null })
    const itemIds   = ['item-uuid-b', 'item-uuid-a']   // intentionally reversed from sort_order
    const quantities = [5, 3]                           // b→5, a→3 by position

    const result = await SaleService.convertProforma(
      USER_ID,
      { ...BASE_INPUT, item_ids: itemIds, quantities },
      COMPANY_ID,
      CTX,
    )

    expect(result.sale_id).toBe(saleId)
    // RPC must receive the arrays unchanged so DB can use array_position for lookup
    expect(rpcMock).toHaveBeenCalledWith('convert_proforma_to_sale', expect.objectContaining({
      p_item_ids:   itemIds,
      p_quantities: quantities,
    }))
  })

  // ── Insufficient stock (P0-A aggregate) ─────────────────────────────────────

  it('[P0-A] insufficient stock: throws AppError INSUFFICIENT_STOCK', async () => {
    // DB raises INSUFFICIENT_STOCK after aggregating multi-line qty for the same product
    mockRpc({ data: null, error: { message: 'INSUFFICIENT_STOCK:Ürün A' } })

    await expect(
      SaleService.convertProforma(USER_ID, BASE_INPUT, COMPANY_ID, CTX),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' })

    expect(failIdempotencyKey).toHaveBeenCalled()
  })

  // ── No items (P0-C) ──────────────────────────────────────────────────────────

  it('[P0-C] no items: RPC returns NO_ITEMS → throws AppError NO_ITEMS', async () => {
    // p_item_ids that don't exist in the proforma causes DB to raise NO_ITEMS
    mockRpc({ data: null, error: { message: 'NO_ITEMS' } })

    await expect(
      SaleService.convertProforma(
        USER_ID,
        { ...BASE_INPUT, item_ids: ['nonexistent-uuid'], quantities: [1] },
        COMPANY_ID,
        CTX,
      ),
    ).rejects.toMatchObject({ code: 'NO_ITEMS' })

    expect(failIdempotencyKey).toHaveBeenCalled()
  })

  it('[P0-C] empty proforma: RPC returns NO_ITEMS → throws AppError NO_ITEMS', async () => {
    mockRpc({ data: null, error: { message: 'NO_ITEMS' } })

    await expect(
      SaleService.convertProforma(USER_ID, BASE_INPUT, COMPANY_ID, CTX),
    ).rejects.toMatchObject({ code: 'NO_ITEMS' })
  })

  // ── Partial vs full conversion (R3) ─────────────────────────────────────────

  it('[R3] full conversion: all items → RPC called with empty p_item_ids', async () => {
    const rpcMock = mockRpc({ data: 'sale-uuid-full', error: null })

    await SaleService.convertProforma(USER_ID, BASE_INPUT, COMPANY_ID, CTX)

    expect(rpcMock).toHaveBeenCalledWith('convert_proforma_to_sale', expect.objectContaining({
      p_item_ids:   [],    // empty = all items
      p_quantities: [],
    }))
  })

  it('[R3] partial conversion: subset of items → RPC receives specific p_item_ids', async () => {
    const rpcMock = mockRpc({ data: 'sale-uuid-partial-r3', error: null })
    // Two items out of three; second item has quantity override
    const itemIds  = ['item-uuid-1', 'item-uuid-3']
    const quantities = [10, 5]

    const result = await SaleService.convertProforma(
      USER_ID,
      { ...BASE_INPUT, item_ids: itemIds, quantities },
      COMPANY_ID,
      CTX,
    )

    expect(result.sale_id).toBe('sale-uuid-partial-r3')
    // DB receives the subset — total computed from these items only (R3 guarantee)
    expect(rpcMock).toHaveBeenCalledWith('convert_proforma_to_sale', expect.objectContaining({
      p_item_ids:   itemIds,
      p_quantities: quantities,
      p_company_id: COMPANY_ID,
    }))
  })

  // ── Already converted ────────────────────────────────────────────────────────

  it('already converted: throws AppError ALREADY_CONVERTED', async () => {
    mockRpc({ data: null, error: { message: 'ALREADY_CONVERTED' } })

    await expect(
      SaleService.convertProforma(USER_ID, BASE_INPUT, COMPANY_ID, CTX),
    ).rejects.toMatchObject({ code: 'ALREADY_CONVERTED' })

    expect(failIdempotencyKey).toHaveBeenCalled()
  })

  it('already converted via unique constraint: throws AppError ALREADY_CONVERTED', async () => {
    mockRpc({ data: null, error: { message: 'duplicate key violates unique constraint uq_sales_proforma_live' } })

    await expect(
      SaleService.convertProforma(USER_ID, BASE_INPUT, COMPANY_ID, CTX),
    ).rejects.toMatchObject({ code: 'ALREADY_CONVERTED' })
  })

  // ── Wrong company ────────────────────────────────────────────────────────────

  it('wrong company: RPC raises FORBIDDEN → TypeScript maps to RPC_FAILED', async () => {
    // SQL raises generic FORBIDDEN for both wrong_company and no_membership;
    // no specific handler in TypeScript service — maps to RPC_FAILED
    mockRpc({ data: null, error: { message: 'FORBIDDEN' } })

    await expect(
      SaleService.convertProforma(USER_ID, BASE_INPUT, COMPANY_ID, CTX),
    ).rejects.toMatchObject({ code: 'RPC_FAILED' })

    expect(failIdempotencyKey).toHaveBeenCalled()
  })

  // ── No membership ────────────────────────────────────────────────────────────

  it('no membership: RPC raises FORBIDDEN → TypeScript maps to RPC_FAILED', async () => {
    mockRpc({ data: null, error: { message: 'FORBIDDEN' } })

    await expect(
      SaleService.convertProforma(USER_ID, BASE_INPUT, COMPANY_ID, CTX),
    ).rejects.toMatchObject({ code: 'RPC_FAILED' })
  })

  // ── Proforma not found ────────────────────────────────────────────────────────

  it('proforma not found: throws AppError PROFORMA_NOT_FOUND', async () => {
    mockRpc({ data: null, error: { message: 'PROFORMA_NOT_FOUND' } })

    await expect(
      SaleService.convertProforma(USER_ID, BASE_INPUT, COMPANY_ID, CTX),
    ).rejects.toMatchObject({ code: 'PROFORMA_NOT_FOUND' })
  })

  // ── Idempotency cache hit ─────────────────────────────────────────────────────

  it('idempotency cache hit: returns cached sale_id without calling RPC', async () => {
    const cachedSaleId = 'sale-uuid-cached'
    ;(checkIdempotency as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 'success', result_id: cachedSaleId,
    })
    const rpcMock = mockRpc({ data: 'new-id', error: null })

    const result = await SaleService.convertProforma(USER_ID, BASE_INPUT, COMPANY_ID, CTX)

    expect(result.sale_id).toBe(cachedSaleId)
    expect(result.cached).toBe(true)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  // ── RPC canonical parameter names ────────────────────────────────────────────

  it('RPC call uses canonical parameter names (p_proforma_id, p_user_id, p_company_id)', async () => {
    const rpcMock = mockRpc({ data: 'sale-uuid-shape', error: null })

    await SaleService.convertProforma(USER_ID, BASE_INPUT, COMPANY_ID, CTX)

    expect(rpcMock).toHaveBeenCalledWith('convert_proforma_to_sale', {
      p_proforma_id:   BASE_INPUT.proforma_id,
      p_user_id:       USER_ID,
      p_item_ids:      [],
      p_quantities:    [],
      p_interest_days: 0,
      p_company_id:    COMPANY_ID,
    })
  })
})

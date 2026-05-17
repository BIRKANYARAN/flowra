export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { REQUEST_ID_HEADER } from '@/middleware'
import { StockService } from '@/lib/services/stock.service'
import {
  requireString, optionalString, requireNonNegativeNumber,
  sanitizeCurrency, ValidationError,
} from '@/lib/validation'
import { toErrorResponse } from '@/types/errors'
import { resolveApiAuth } from '@/lib/api-auth'

// ── POST — create product ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth


  try {
    const body = await req.json()
    const payload = {
      user_id:         uid,
      name:            requireString(body.name, 'name', 300),
      sku:             optionalString(body.sku, 'sku', 100),
      unit:            optionalString(body.unit, 'unit', 50) ?? 'adet',
      unit_cost:       requireNonNegativeNumber(body.unit_cost ?? 0, 'unit_cost'),
      catalog_price:   requireNonNegativeNumber(body.catalog_price ?? 0, 'catalog_price'),
      cost_currency:   sanitizeCurrency(body.cost_currency ?? 'TRY'),
      stock_qty:       requireNonNegativeNumber(body.stock_qty ?? 0, 'stock_qty'),
      stock_alert_qty: requireNonNegativeNumber(body.stock_alert_qty ?? 0, 'stock_alert_qty'),
      description:     optionalString(body.description, 'description', 2000),
    }

    // ── New canonical catalog fields (all optional; legacy rows ignore them) ──
    const catalogExtras: Record<string, unknown> = {}
    if (body.category !== undefined)              catalogExtras.category              = optionalString(body.category, 'category', 100)
    if (body.default_sale_price !== undefined)    catalogExtras.default_sale_price    = requireNonNegativeNumber(body.default_sale_price, 'default_sale_price')
    if (body.default_sale_currency !== undefined) catalogExtras.default_sale_currency = sanitizeCurrency(body.default_sale_currency)
    if (body.default_sale_vat_rate !== undefined) catalogExtras.default_sale_vat_rate = requireNonNegativeNumber(body.default_sale_vat_rate, 'default_sale_vat_rate')
    if (body.is_active !== undefined)             catalogExtras.is_active             = Boolean(body.is_active)

    const { data, error } = await supabase.from('products').insert({ ...payload, ...catalogExtras, company_id: companyId }).select('id').single()
    if (error) {
      await logger.error(ctx, 'product_create:db_error', { error: error.message })
      return NextResponse.json({ error: error.message }, { status: 500, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
    }

    // Initial stock movement via ledger (if qty > 0)
    if (payload.stock_qty > 0) {
      const entryDate = body.entry_date || new Date().toISOString().slice(0, 10)
      const { data: mvData, error: mvErr } = await supabase.from('stock_movements').insert({
        // Note: stock_movements has no user_id column
        product_id:  data.id,
        company_id:  companyId,
        type:        'initial',
        qty:         payload.stock_qty,
        unit_cost:   payload.unit_cost,
        notes:       'Başlangıç stok girişi',
        moved_at:    entryDate,
      }).select('id').single()

      if (mvErr) {
        await logger.error(ctx, 'product_create:movement_error', { error: mvErr.message, product_id: data.id })
        // Non-fatal: product is created, stock movement failed — log and continue
      }

      // FIFO lot for initial stock
      const costCurrency = payload.cost_currency ?? 'TRY'
      const costFxRate   = Number(body.fx_rate_at_entry) || 1
      const costPriceTry = costCurrency === 'TRY'
        ? payload.unit_cost
        : payload.unit_cost * costFxRate

      const { error: lotErr } = await supabase.from('stock_lots').insert({
        // Note: stock_lots has no user_id or movement_id column
        product_id:     data.id,
        company_id:     companyId,
        qty_initial:    payload.stock_qty,
        qty_remaining:  payload.stock_qty,
        cost_price:     payload.unit_cost,
        cost_currency:  costCurrency,
        cost_fx_rate:   costFxRate,
        cost_price_try: costPriceTry,
        received_at:    entryDate,
        notes:          mvData?.id ? `movement_id:${mvData.id}` : null,
      })

      if (lotErr) {
        await logger.error(ctx, 'product_create:lot_error', { error: lotErr.message, product_id: data.id })
        // Non-fatal: product is created, lot failed — log and continue
      }
    }

    const { EventService } = await import('@/lib/services/event.service')
    await EventService.emit(supabase, uid, 'product.created', {
      product_id: data.id,
      product_name: payload.name,
    })

    await logger.info(ctx, 'product_create:success', { id: data.id })
    return NextResponse.json({ id: data.id }, { status: 201, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })

  } catch (err) {
    if (err instanceof ValidationError) return NextResponse.json({ error: err.message, code: 'VALIDATION_ERROR', type: 'BUSINESS', field: err.field }, { status: 422 })
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}

// ── PATCH — update product metadata ─────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth


  try {
    const body = await req.json()
    const id   = requireString(body.id, 'id')
    const payload: Record<string, unknown> = {}
    if (body.name !== undefined) payload.name = requireString(body.name, 'name', 300)
    if (body.sku !== undefined) payload.sku = optionalString(body.sku, 'sku', 100)
    if (body.unit !== undefined) payload.unit = optionalString(body.unit, 'unit', 50) ?? 'adet'
    if (body.unit_cost !== undefined) payload.unit_cost = requireNonNegativeNumber(body.unit_cost, 'unit_cost')
    if (body.catalog_price !== undefined) payload.catalog_price = requireNonNegativeNumber(body.catalog_price, 'catalog_price')
    if (body.cost_currency !== undefined) payload.cost_currency = sanitizeCurrency(body.cost_currency)
    if (body.stock_alert_qty !== undefined) payload.stock_alert_qty = requireNonNegativeNumber(body.stock_alert_qty, 'stock_alert_qty')
    if (body.description !== undefined) payload.description = optionalString(body.description, 'description', 2000)
    // New canonical catalog fields — optional
    if (body.category !== undefined)              payload.category              = optionalString(body.category, 'category', 100)
    if (body.default_sale_price !== undefined)    payload.default_sale_price    = requireNonNegativeNumber(body.default_sale_price, 'default_sale_price')
    if (body.default_sale_currency !== undefined) payload.default_sale_currency = sanitizeCurrency(body.default_sale_currency)
    if (body.default_sale_vat_rate !== undefined) payload.default_sale_vat_rate = requireNonNegativeNumber(body.default_sale_vat_rate, 'default_sale_vat_rate')
    if (body.is_active !== undefined)             payload.is_active             = Boolean(body.is_active)

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: 'Güncellenecek alan bulunamadı' }, { status: 422 })
    }

    const { error } = await supabase.from('products').update(payload).eq('id', id).eq('company_id', companyId).is('deleted_at', null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
    return NextResponse.json({ id }, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })

  } catch (err) {
    if (err instanceof ValidationError) return NextResponse.json({ error: err.message, code: 'VALIDATION_ERROR', type: 'BUSINESS', field: err.field }, { status: 422 })
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}

// ── PUT — stock adjustment (idempotent via StockService) ────────────────────
export async function PUT(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth


  try {
    const body = await req.json()
    if (!body.idempotency_key || typeof body.idempotency_key !== 'string') {
      return NextResponse.json({ error: 'idempotency_key zorunludur', code: 'IDEMPOTENCY_KEY_MISSING', type: 'BUSINESS' }, { status: 422 })
    }

    const rawCostPrice = body.cost_price != null ? Number(body.cost_price) : null
    const costPrice = (rawCostPrice !== null && isFinite(rawCostPrice) && rawCostPrice >= 0) ? rawCostPrice : null
    const entryDate = typeof body.entry_date === 'string' && body.entry_date.length >= 10
      ? body.entry_date.slice(0, 10)
      : null

    const rawQtyChange = Number(body.qty_change)
    if (!isFinite(rawQtyChange) || rawQtyChange === 0) {
      return NextResponse.json({ error: 'qty_change geçerli ve sıfırdan farklı bir sayı olmalıdır', code: 'VALIDATION_ERROR', type: 'BUSINESS' }, { status: 422 })
    }

    const result = await StockService.adjust(uid, {
      idempotency_key: body.idempotency_key,
      product_id:      requireString(body.product_id, 'product_id'),
      qty_change:      rawQtyChange,
      reference_type:  body.reference_type ?? 'adjustment',
      notes:           body.notes ?? null,
      cost_price:      costPrice,
      entry_date:      entryDate,
    }, companyId, ctx)

    return NextResponse.json(result, { status: result.cached ? 200 : 201, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })

  } catch (err) {
    if (err instanceof ValidationError) return NextResponse.json({ error: err.message, code: 'VALIDATION_ERROR', type: 'BUSINESS', field: err.field }, { status: 422 })
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}

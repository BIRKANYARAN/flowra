// ── Stock Service ─────────────────────────────────────────────────────────────
// Route → THIS SERVICE → DB
//
// Optimistic concurrency: UPDATE ... WHERE stock_qty = <known_before>
// Supabase requires { count: 'exact' } to get the affected-row count back.
// Without it, count is always null and the retry branch never fires.

import { createClient } from '@/lib/supabase-server'
import { logger, type RequestContext } from '@/lib/logger'
import {
  checkIdempotency, reserveIdempotencyKey,
  commitIdempotencyKey, failIdempotencyKey,
} from '@/lib/idempotency'
import { AppError } from '@/types/errors'
import { round2 } from '@/lib/calc'
import type { MovementType } from '@/types'
import { logAudit, logAlert } from '@/lib/audit'

export type StockMovementType = 'purchase' | 'adjustment' | 'return' | 'write_off'

/** @deprecated Use `MovementType` from `@/types`. */
export type MovementDirection = MovementType

/**
 * Derive the movement_type from qty_change — SINGLE SOURCE OF TRUTH.
 *
 * HARDENING RULE (Phase 2.5):
 *   qty_change is the ONLY authority for direction. movement_type is
 *   informational / indexable metadata that MUST agree with the sign of
 *   qty_change. The DB CHECK constraint enforces this at rest; this
 *   function enforces it on write.
 *
 *   Why ignore `reference_type` here?
 *     reference_type = *business cause* (purchase / sale / adjustment / …)
 *     movement_type  = *stock direction* (in / out / adjustment)
 *     They are independent dimensions. A sale with a positive qty_change
 *     is almost certainly a bug, but the correct stock_direction for that
 *     row is still "in" (the ledger records what actually happened).
 *     We let `validateMovementRow()` log the business-level anomaly.
 *
 * Mapping:
 *   qty > 0  →  'in'
 *   qty < 0  →  'out'
 *   qty = 0  →  'adjustment'
 */
export function deriveMovementType(qtyChange: number): MovementType {
  if (qtyChange > 0) return 'in'
  if (qtyChange < 0) return 'out'
  return 'adjustment'
}

/** Classification of an integrity anomaly found in a stock_movement row. */
export type MovementAnomalyKind =
  | 'zero_qty_with_in_or_out'
  | 'sign_type_mismatch'
  | 'business_direction_conflict'   // sale with qty>0, purchase with qty<0, …
  | 'missing_movement_type'

export interface MovementAnomaly {
  kind:           MovementAnomalyKind
  refType:        string
  qtyChange:      number
  movementType:   MovementType | null
  message:        string
}

/**
 * Validate a single stock_movement row for integrity.
 * Does NOT throw — returns null when the row is clean.
 * Callers should log anomalies (guardrail), not block writes on them,
 * because some anomalies are legitimate business corrections.
 *
 * The DB CHECK constraint is the hard invariant; this function catches
 * softer cases worth a log line.
 */
export function validateMovementRow(input: {
  refType:      string
  qtyChange:    number
  movementType: MovementType | null | undefined
}): MovementAnomaly | null {
  const { refType, qtyChange, movementType } = input

  // Hard — movement_type must exist on any row we write
  if (movementType == null) {
    return {
      kind:         'missing_movement_type',
      refType, qtyChange, movementType: null,
      message:      'movement_type is null — must be one of in / out / adjustment',
    }
  }

  // Hard — zero qty cannot be in/out
  if (qtyChange === 0 && (movementType === 'in' || movementType === 'out')) {
    return {
      kind:         'zero_qty_with_in_or_out',
      refType, qtyChange, movementType,
      message:      `qty_change=0 is not valid for movement_type="${movementType}" (must be adjustment)`,
    }
  }

  // Hard — sign must agree with type
  if (movementType === 'in'  && qtyChange < 0) {
    return {
      kind:         'sign_type_mismatch',
      refType, qtyChange, movementType,
      message:      `movement_type="in" but qty_change=${qtyChange} is negative`,
    }
  }
  if (movementType === 'out' && qtyChange > 0) {
    return {
      kind:         'sign_type_mismatch',
      refType, qtyChange, movementType,
      message:      `movement_type="out" but qty_change=${qtyChange} is positive`,
    }
  }

  // Soft — reference_type business rules
  if (refType === 'sale' && qtyChange > 0) {
    return {
      kind:         'business_direction_conflict',
      refType, qtyChange, movementType,
      message:      `reference_type="sale" with qty_change=${qtyChange} (expected negative)`,
    }
  }
  if (refType === 'purchase' && qtyChange < 0) {
    return {
      kind:         'business_direction_conflict',
      refType, qtyChange, movementType,
      message:      `reference_type="purchase" with qty_change=${qtyChange} (expected positive)`,
    }
  }
  if (refType === 'write_off' && qtyChange > 0) {
    return {
      kind:         'business_direction_conflict',
      refType, qtyChange, movementType,
      message:      `reference_type="write_off" with qty_change=${qtyChange} (expected negative)`,
    }
  }

  return null
}

export interface StockAdjustInput {
  idempotency_key: string
  product_id:      string
  qty_change:      number
  reference_type:  StockMovementType
  notes?:          string | null
  cost_price?:      number | null
  entry_date?:      string | null
  cost_currency?:   string
  fx_rate_at_entry?: number
}

export interface StockAdjustResult {
  product_id:   string
  stock_qty:    number
  movement_id?: string
  cached?:      boolean
}

export class StockService {

  static async adjust(
    userId:    string,
    input:     StockAdjustInput,
    companyId: string,
    ctx:       RequestContext,
  ): Promise<StockAdjustResult> {

    // 1. Idempotency
    const cached = await checkIdempotency(userId, input.idempotency_key, 'stock_adjust')
    if (cached?.status === 'success' && cached.result_id) {
      await logger.info(ctx, 'stock_adjust:cache_hit', { key: input.idempotency_key })
      return {
        product_id:  input.product_id,
        stock_qty:   (cached.result_data?.stock_qty as number) ?? 0,
        movement_id: cached.result_id,
        cached:      true,
      }
    }

    if (!isFinite(input.qty_change)) throw new AppError('INVALID_QUANTITY', 'Geçersiz miktar')
    if (!['purchase','adjustment','return','write_off'].includes(input.reference_type)) {
      throw new AppError('INVALID_QUANTITY', 'Geçersiz hareket tipi')
    }

    // ── Historical FX resolution — BEFORE any DB writes ─────────────────────
    // For foreign-currency stock-in entries, we MUST use the rate at entry_date.
    // A live-rate fallback would freeze the wrong cost into the stock lot forever.
    // If no historical rate exists for the requested date → FAIL FAST (no silent fallback).
    const isStockInOp =
      (input.reference_type === 'purchase' || input.reference_type === 'return') &&
      input.qty_change > 0

    let resolvedFxRateAtEntry: number = input.fx_rate_at_entry ?? 0

    if (isStockInOp) {
      const costCurrency = input.cost_currency || 'TRY'
      const entryDate    = input.entry_date || new Date().toISOString().slice(0, 10)

      if (costCurrency === 'TRY') {
        resolvedFxRateAtEntry = 1   // TRY→TRY is always 1; no DB lookup needed
      } else if (resolvedFxRateAtEntry <= 0) {
        // Caller did not supply an explicit rate → fetch historical rate from DB.
        // We use lte (on-or-before) to handle weekends / public holidays when
        // TCMB doesn't publish. No live-rate call: historical rate must come from
        // the rate_date index to keep the cost snapshot frozen at the entry date.
        const fxSupabase = createClient()
        const { data: fxRow } = await fxSupabase
          .from('fx_rates')
          .select('buying')
          .eq('currency', costCurrency)
          .lte('rate_date', entryDate)
          .order('rate_date', { ascending: false })
          .limit(1)
          .maybeSingle()

        const histRate = fxRow ? Number(fxRow.buying) : 0
        if (histRate <= 0) {
          throw new AppError(
            'FX_RATE_NOT_FOUND',
            `${entryDate} tarihi için ${costCurrency}/TRY kuru bulunamadı. ` +
            `Stok girişi reddedildi. Kuru manuel olarak girin veya fx_rates tablosunu güncelleyin.`,
            { currency: costCurrency, entryDate }
          )
        }
        resolvedFxRateAtEntry = histRate
      }
      // else: caller provided fx_rate_at_entry > 0 → use as-is (trusted explicit override)
    }

    await reserveIdempotencyKey(userId, input.idempotency_key, 'stock_adjust')

    try {
      const supabase = createClient()

      // 2. Read current stock (scoped to company)
      const { data: product, error: fetchErr } = await supabase
        .from('products')
        .select('id, stock_qty, unit_cost')
        .eq('id', input.product_id)
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .maybeSingle()

      if (fetchErr || !product) throw new AppError('PRODUCT_NOT_FOUND', 'Ürün bulunamadı', { id: input.product_id })

      const qty_before = Number(product.stock_qty)
      const qty_after  = qty_before + input.qty_change
      let committedQtyBefore = qty_before
      let committedQtyAfter  = qty_after

      // 3. Prevent negative stock (application-layer guard; DB also has CHECK)
      if (qty_after < 0) {
        await failIdempotencyKey(userId, input.idempotency_key, 'stock_adjust')
        throw new AppError(
          'NEGATIVE_STOCK',
          `Stok negatife düşemez (mevcut: ${qty_before.toFixed(2)}, değişim: ${input.qty_change})`
        )
      }

      // 4. Optimistic update: predicate includes current stock_qty value.
      //    { count: 'exact' } is required — otherwise count is always null.
      const { error: updErr, count } = await supabase
        .from('products')
        .update({ stock_qty: qty_after }, { count: 'exact' })
        .eq('id', input.product_id)
        .eq('company_id', companyId)
        .eq('stock_qty', qty_before)

      if (updErr) {
        await failIdempotencyKey(userId, input.idempotency_key, 'stock_adjust')
        throw new AppError('DB_UPDATE_FAILED', 'Stok güncellenemedi', { dbError: updErr.message })
      }

      if (count === 0) {
        // A concurrent update changed stock_qty between our read and write.
        // Retry once with a fresh read.
        await logger.warn(ctx, 'stock_adjust:optimistic_miss', { product_id: input.product_id })

        const { data: retry } = await supabase
          .from('products')
          .select('stock_qty')
          .eq('id', input.product_id)
          .eq('company_id', companyId)
          .maybeSingle()

        const retryBefore = Number(retry?.stock_qty ?? 0)
        const retryAfter  = retryBefore + input.qty_change

        if (retryAfter < 0) {
          await failIdempotencyKey(userId, input.idempotency_key, 'stock_adjust')
          throw new AppError('NEGATIVE_STOCK', 'Stok negatife düşemez')
        }

        const { error: retryUpdErr, count: retryCount } = await supabase
          .from('products')
          .update({ stock_qty: retryAfter }, { count: 'exact' })
          .eq('id', input.product_id)
          .eq('company_id', companyId)
          .eq('stock_qty', retryBefore)

        if (retryUpdErr || retryCount === 0) {
          await failIdempotencyKey(userId, input.idempotency_key, 'stock_adjust')
          throw new AppError('DB_UPDATE_FAILED', 'Stok eşzamanlı güncellendi, lütfen tekrar deneyin.', {
            dbError: retryUpdErr?.message,
            retryCount,
          })
        }

        committedQtyBefore = retryBefore
        committedQtyAfter  = retryAfter
      }

      // 5. Append to ledger (append-only — never update)
      // Use caller-supplied cost_price if provided, otherwise fall back to product.unit_cost
      const effectiveCost = (input.cost_price != null && input.cost_price > 0)
        ? input.cost_price
        : Number(product.unit_cost)

      // HARDENING: movement_type is derived from qty_change alone.
      //   - qty_change is the source of truth for direction.
      //   - A zero qty_change is recorded as 'adjustment' (metadata-only row).
      const movementType = deriveMovementType(input.qty_change)

      // Soft guardrail — log (do not block) business-level inconsistencies
      // like reference_type='sale' with qty_change>0.
      const anomaly = validateMovementRow({
        refType:      input.reference_type,
        qtyChange:    input.qty_change,
        movementType,
      })
      if (anomaly) {
        await logger.warn(ctx, 'stock_adjust:anomaly', {
          product_id: input.product_id,
          kind:       anomaly.kind,
          message:    anomaly.message,
        })
      }

      const movementPayload: Record<string, unknown> = {
        user_id:        userId,
        product_id:     input.product_id,
        reference_type: input.reference_type,
        movement_type:  movementType,
        qty_change:     input.qty_change,
        qty_before:      committedQtyBefore,
        qty_after:       committedQtyAfter,
        unit_cost:      effectiveCost,
        notes:          input.notes ?? null,
        company_id:     companyId,
      }
      // Add entry_date if provided (stock-in date for holding-time calculations)
      if (input.entry_date) {
        movementPayload.entry_date = input.entry_date
      }

      const { data: movement, error: mvErr } = await supabase
        .from('stock_movements')
        .insert(movementPayload)
        .select('id')
        .single()

      if (mvErr) {
        await logger.error(ctx, 'stock_adjust:movement_error', { error: mvErr.message })
        await supabase
          .from('products')
          .update({ stock_qty: committedQtyBefore })
          .eq('id', input.product_id)
          .eq('company_id', companyId)
          .eq('stock_qty', committedQtyAfter)
        await failIdempotencyKey(userId, input.idempotency_key, 'stock_adjust')
        throw new AppError('DB_INSERT_FAILED', 'Stok hareketi kaydedilemedi; ürün stoğu geri alındı.', {
          dbError: mvErr.message,
        })
      }

      // 6. FIFO lot creation — every stock-in creates a lot for FIFO consumption
      const isStockIn = input.reference_type === 'purchase' || input.reference_type === 'return'
      if (isStockIn && input.qty_change > 0) {
        const costCurrency = input.cost_currency || 'TRY'
        // resolvedFxRateAtEntry was resolved before any DB writes (historical rate,
        // no live fallback). For TRY it is 1; for foreign currencies it is the
        // rate from fx_rates at or before entry_date.
        const fxRateAtEntry = resolvedFxRateAtEntry > 0 ? resolvedFxRateAtEntry : 1
        const entryDate = input.entry_date || new Date().toISOString().slice(0, 10)

        // Fetch FX rates at entry date for multi-currency cost snapshot
        let fxUsdTry = 0
        let fxEurTry = 0

        try {
          // Run two separate queries (one per currency) to guarantee one row each.
          // A single .in(['USD','EUR']).limit(4) can return 4 USD rows if EUR data is older.
          const [{ data: usdRows }, { data: eurRows }] = await Promise.all([
            supabase.from('fx_rates').select('buying')
              .eq('currency', 'USD').lte('rate_date', entryDate)
              .order('rate_date', { ascending: false }).limit(1),
            supabase.from('fx_rates').select('buying')
              .eq('currency', 'EUR').lte('rate_date', entryDate)
              .order('rate_date', { ascending: false }).limit(1),
          ])
          fxUsdTry = usdRows?.[0] ? Number(usdRows[0].buying) : 0
          fxEurTry = eurRows?.[0] ? Number(eurRows[0].buying) : 0
        } catch {
          // Non-fatal — snapshot will have zeros for unavailable currencies
        }

        // Compute entry cost in all 3 currencies (frozen at entry date, NEVER recomputed)
        const entryCostTry = round2(effectiveCost * fxRateAtEntry) // cost in TRY
        const entryCostUsd = fxUsdTry > 0 ? round2(entryCostTry / fxUsdTry) : 0
        const entryCostEur = fxEurTry > 0 ? round2(entryCostTry / fxEurTry) : 0

        const lotPayload: Record<string, unknown> = {
          user_id:          userId,
          company_id:       companyId,
          product_id:       input.product_id,
          qty_initial:      input.qty_change,
          qty_remaining:    input.qty_change,
          unit_cost:        effectiveCost,
          cost_currency:    costCurrency,
          fx_rate_at_entry: fxRateAtEntry,
          entry_date:       entryDate,
          source_type:      input.reference_type as string,
          source_id:        movement?.id ?? null,
          // Multi-currency cost snapshot (frozen at entry date)
          entry_cost_try:   entryCostTry,
          entry_cost_usd:   entryCostUsd > 0 ? entryCostUsd : null,
          entry_cost_eur:   entryCostEur > 0 ? entryCostEur : null,
          entry_fx_usd_try: fxUsdTry > 0 ? fxUsdTry : null,
          entry_fx_eur_try: fxEurTry > 0 ? fxEurTry : null,
        }
        const { error: lotErr } = await supabase
          .from('stock_lots')
          .insert(lotPayload)

        if (lotErr) {
          await logger.error(ctx, 'stock_adjust:lot_create_error', { error: lotErr.message })
          await supabase
            .from('products')
            .update({ stock_qty: committedQtyBefore })
            .eq('id', input.product_id)
            .eq('company_id', companyId)
            .eq('stock_qty', committedQtyAfter)
          if (movement?.id) {
            await supabase
              .from('stock_movements')
              .delete()
              .eq('id', movement.id)
              .eq('company_id', companyId)
          }
          await failIdempotencyKey(userId, input.idempotency_key, 'stock_adjust')
          throw new AppError('DB_INSERT_FAILED', 'Stok lotu kaydedilemedi; stok girişi geri alındı.', {
            dbError: lotErr.message,
          })
        }
      }

      const movementId = movement?.id ?? null

      await commitIdempotencyKey(
        userId, input.idempotency_key, 'stock_adjust',
        movementId ?? input.product_id,
        { stock_qty: committedQtyAfter, qty_change: input.qty_change }
      )
      await logger.info(ctx, 'stock_adjust:success', {
        product_id: input.product_id, qty_before: committedQtyBefore, qty_after: committedQtyAfter, type: input.reference_type,
      })

      try {
        const { EventService } = await import('@/lib/services/event.service')
        await EventService.emit(supabase, userId, 'stock.adjusted', {
          product_id: input.product_id,
          delta: input.qty_change,
          reference_type: input.reference_type,
        })
      } catch { /* never crash on event emit failure */ }

      logAudit({
        userId,
        companyId,
        entityType: 'stock_movement',
        entityId:   movementId ?? input.product_id,
        action:     'create',
        newData:    { product_id: input.product_id, qty_change: input.qty_change, reference_type: input.reference_type },
      })
      if (input.reference_type === 'adjustment') {
        logAlert({
          actorUserId: userId,
          entityType:  'stock_movement',
          entityId:    movementId ?? input.product_id,
          message:     `Stok düzeltmesi: ürün ${input.product_id}, değişim: ${input.qty_change > 0 ? '+' : ''}${input.qty_change}`,
          severity:    'info',
        })
      }

      return { product_id: input.product_id, stock_qty: committedQtyAfter, movement_id: movementId ?? undefined }

    } catch (err) {
      if (!(err instanceof AppError)) {
        await failIdempotencyKey(userId, input.idempotency_key, 'stock_adjust').catch(() => {})
      }
      throw err
    }
  }
}

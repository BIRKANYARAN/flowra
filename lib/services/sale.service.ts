// ── Sale Service ──────────────────────────────────────────────────────────────
// Route → THIS SERVICE → DB

import { createClient } from '@/lib/supabase-server'
import { logger, type RequestContext } from '@/lib/logger'
import {
  checkIdempotency, reserveIdempotencyKey,
  commitIdempotencyKey, failIdempotencyKey,
} from '@/lib/idempotency'
import { AppError } from '@/types/errors'
import { logAudit } from '@/lib/audit'

export interface ConvertInput {
  idempotency_key: string
  proforma_id:     string
  // Live DB signature (repair_production schema)
  sale_date?:      string | null
  due_date?:       string | null
  bank_id?:        string | null
  notes?:          string | null
  internal_notes?: string | null
  // Legacy — accepted but unused (live DB handles item selection)
  item_ids?:        string[]
  quantities?:      number[]
  interest_days?:   number
}

export interface ConvertResult {
  sale_id: string
  sale_no?: string
  cached?: boolean
}

export class SaleService {

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async convertProforma(
    userId:    string,
    input:     ConvertInput,
    companyId: string,
    ctx:       RequestContext,
    clientOverride?: any,
  ): Promise<ConvertResult> {

    // 1. Idempotency
    const cached = await checkIdempotency(userId, input.idempotency_key, 'sale_convert')
    if (cached?.status === 'success' && cached.result_id) {
      await logger.info(ctx, 'sale_convert:cache_hit', { key: input.idempotency_key })
      return { sale_id: cached.result_id, cached: true }
    }
    if (cached?.status === 'pending') {
      throw new AppError('IDEMPOTENCY_PENDING', 'Dönüşüm işlemi devam ediyor, lütfen bekleyin.', { key: input.idempotency_key })
    }

    await reserveIdempotencyKey(userId, input.idempotency_key, 'sale_convert')

    try {
      const supabase = clientOverride ?? createClient()

      // 2. Delegate to atomic DB function (live signature: p_proforma_id, p_user_id, p_sale_date, p_due_date, p_bank_id, p_notes, p_internal_notes)
      const today = new Date().toISOString().slice(0, 10)
      const { data: rpcResult, error } = await supabase.rpc('convert_proforma_to_sale', {
        p_proforma_id:    input.proforma_id,
        p_user_id:        userId,
        p_sale_date:      input.sale_date ?? today,
        p_due_date:       input.due_date ?? null,
        p_bank_id:        input.bank_id ?? null,
        p_notes:          input.notes ?? null,
        p_internal_notes: input.internal_notes ?? null,
      })

      if (error) {
        await failIdempotencyKey(userId, input.idempotency_key, 'sale_convert')
        const msg = error.message

        // Map named DB exceptions → typed AppErrors
        if (msg.includes('PROFORMA_NOT_FOUND')) throw new AppError('PROFORMA_NOT_FOUND', 'Proforma bulunamadı')
        if (msg.includes('ALREADY_CONVERTED'))  throw new AppError('ALREADY_CONVERTED',  'Bu proforma zaten satışa dönüştürüldü')
        if (msg.includes('NO_ITEMS'))           throw new AppError('NO_ITEMS',            'Seçili ürün bulunamadı')
        if (msg.includes('INSUFFICIENT_STOCK')) throw new AppError('INSUFFICIENT_STOCK',  'Yetersiz stok')
        if (msg.includes('INVALID_QUANTITY'))   throw new AppError('INVALID_QUANTITY',    'Geçersiz miktar')
        if (msg.includes('INVALID_PRICE'))      throw new AppError('INVALID_PRICE',       'Geçersiz fiyat')
        if (msg.includes('ZERO_COST_LOT'))      throw new AppError('ZERO_COST_LOT',       'Sıfır maliyetli stok lotu tespit edildi. Maliyetleri güncelleyin.')
        if (msg.includes('FX_RATE_NOT_FOUND'))  throw new AppError('FX_RATE_NOT_FOUND',   'Döviz kuru bulunamadı. Lütfen kur verisi ekleyin.')
        if (msg.includes('uq_sales_proforma_live') || msg.includes('duplicate key'))
          throw new AppError('ALREADY_CONVERTED', 'Bu proforma zaten satışa dönüştürüldü')

        await logger.error(ctx, 'sale_convert:rpc_failed', { dbError: msg, dbCode: error.code, dbDetails: error.details })
        throw new AppError('RPC_FAILED', 'Dönüşüm hatası', { dbError: msg })
      }

      // RPC returns jsonb { sale_id, sale_no }
      const result = rpcResult as { sale_id: string; sale_no?: string } | null
      if (!result?.sale_id) {
        await failIdempotencyKey(userId, input.idempotency_key, 'sale_convert')
        throw new AppError('RPC_FAILED', 'Dönüşüm hatası: sale_id alınamadı')
      }

      // Post-conversion: if sale total_try is 0, compute from sale_items.line_total and patch.
      // The live convert_proforma_to_sale function may not aggregate totals (schema mismatch).
      // line_total in sale_items already includes KDV (it's copied from proforma_items.line_total).
      try {
        const { data: saleCheck } = await supabase
          .from('sales')
          .select('total_try:total, fx_rate_try')
          .eq('id', result.sale_id)
          .maybeSingle()

        if (saleCheck && (Number(saleCheck.total_try) === 0)) {
          const fxRate = Number(saleCheck.fx_rate_try ?? 1) || 1

          const { data: saleItemsFull } = await supabase
            .from('sale_items')
            .select('id, qty, unit_price, discount_pct, line_total')
            .eq('sale_id', result.sale_id)

          if (saleItemsFull && saleItemsFull.length > 0) {
            let total = 0
            const patchOps: Promise<unknown>[] = []

            for (const item of saleItemsFull) {
              let lineTotal = Number(item.line_total ?? 0)
              if (lineTotal === 0) {
                // Fallback: compute from qty × unit_price (no KDV — approximate)
                const qty   = Number(item.qty ?? 0)
                const price = Number(item.unit_price ?? 0)
                const disc  = Number(item.discount_pct ?? 0) / 100
                lineTotal = Math.round(qty * price * (1 - disc) * 100) / 100
                if (lineTotal > 0) {
                  patchOps.push(
                    supabase.from('sale_items').update({ line_total: lineTotal }).eq('id', item.id)
                  )
                }
              }
              total += lineTotal
            }

            const total_try = Math.round(total * fxRate * 100) / 100

            // Compute KDV amount (line_total includes KDV; subtract net subtotal to get KDV portion)
            // Approximate: KDV = total - (total / 1.2) for 20% — but we don't know the rate per line.
            // Use the total directly: kdv_amount_try = total_try - sum(qty*unit_price*(1-disc)) × fxRate
            // For simplicity, patch only total_try; kdv_amount_try can remain 0 or computed later.

            // Run line_total patches + sale total_try patch in parallel
            await Promise.all([
              ...patchOps,
              supabase.from('sales')
                .update({ total: total_try })   // use actual column name 'total' (not 'total_try')
                .eq('id', result.sale_id),
            ])

            await logger.info(ctx, 'sale_convert:total_patched', { sale_id: result.sale_id, total_try })
          }
        }
      } catch (patchErr) {
        // Non-fatal: sale was created, totals patch failed — log and continue
        await logger.error(ctx, 'sale_convert:total_patch_failed', {
          sale_id: result.sale_id,
          error: patchErr instanceof Error ? patchErr.message : String(patchErr),
        })
      }

      const sale_id = result.sale_id
      await commitIdempotencyKey(userId, input.idempotency_key, 'sale_convert', sale_id, { proforma_id: input.proforma_id, sale_no: result.sale_no })
      await logger.info(ctx, 'sale_convert:success', { sale_id, sale_no: result.sale_no, proforma_id: input.proforma_id })

      // ── GAP 9 fix: dual-write journal entry for the converted sale ──────────
      // DR 120 Alıcılar = total_try, CR 600 Revenue = net, CR 391 KDV = kdv_amount_try
      // KDV split approximated from total (exact split requires sale_items.kdv_rate column).
      try {
        const { dualWrite, resolvePeriodId } = await import('@/lib/services/ledger/dual-write.service')
        const { JournalEntryService } = await import('@/lib/services/ledger/journal-entry.service')

        const { data: saleRow } = await supabase
          .from('sales')
          .select('total, sale_date')
          .eq('id', sale_id)
          .maybeSingle()

        if (saleRow) {
          const total_try  = Math.round(Number(saleRow.total ?? 0) * 100) / 100
          const saleDate   = (saleRow.sale_date as string | null) ?? (input.sale_date ?? today)
          const periodId   = await resolvePeriodId(companyId, saleDate, supabase)
          // Approximate revenue/KDV split assuming blended 20% KDV (most common Turkish rate).
          // Exact split requires a kdv_rate column on sale_items (planned schema addition).
          const revenue_try    = Math.round(total_try / 1.2 * 100) / 100
          const kdv_amount_try = Math.round((total_try - revenue_try) * 100) / 100
          await dualWrite({
            companyId,
            periodId,
            createdBy: userId,
            supabase,
            buildEntry: () => JournalEntryService.buildSaleEntry({
              id:             sale_id,
              sale_date:      saleDate,
              revenue_try,
              kdv_amount_try,
              total_try,
            }),
          })
        }
      } catch (jeErr) {
        // Best-effort: sale is committed, journal entry failure is non-fatal
        await logger.error(ctx, 'sale_convert:journal_entry_failed', {
          sale_id,
          error: jeErr instanceof Error ? jeErr.message : String(jeErr),
        })
      }

      // ── GAP 3 fix: COGS journal entry for inventory-allocated items ─────────
      // DR 620 Satılan Malın Maliyeti / CR 153 Ticari Mallar
      // COGS = Σ (qty_allocated × cost_price_try) from sale_item_allocations.
      // Only fires when allocations exist (product-linked proforma items with stock).
      // Service-only proformas (no product_id on items) produce zero COGS — skipped.
      // Requires: sale_item_allocations.cost_price_try (added in accounting_truth_v1 migration).
      try {
        const { dualWrite: dualWriteCogs, resolvePeriodId: resolvePeriodCogs } =
          await import('@/lib/services/ledger/dual-write.service')
        const { JournalEntryService: JES } =
          await import('@/lib/services/ledger/journal-entry.service')

        // Step 1: get sale_item IDs for this sale
        const { data: saleItemRows } = await supabase
          .from('sale_items')
          .select('id')
          .eq('sale_id', sale_id)

        const saleItemIds = (saleItemRows ?? []).map((r: { id: string }) => r.id)

        if (saleItemIds.length > 0) {
          // Step 2: sum COGS from frozen cost_price_try (GAP 13 column).
          // Falls back to 0 for rows predating the migration (no allocation rows).
          const { data: allocRows } = await supabase
            .from('sale_item_allocations')
            .select('qty_allocated, cost_price_try')
            .in('sale_item_id', saleItemIds)

          const cogs_try = Math.round(
            (allocRows ?? []).reduce(
              (s: number, r: { qty_allocated?: unknown; cost_price_try?: unknown }) =>
                s + Number(r.qty_allocated ?? 0) * Number(r.cost_price_try ?? 0),
              0,
            ) * 100,
          ) / 100

          if (cogs_try > 0) {
            // Reuse sale_date from input (committed by RPC above)
            const cogsDate   = input.sale_date ?? today
            const cogsPeriod = await resolvePeriodCogs(companyId, cogsDate, supabase)
            await dualWriteCogs({
              companyId,
              periodId:  cogsPeriod,
              createdBy: userId,
              supabase,
              buildEntry: () => JES.buildCogsEntry({
                id:        sale_id,
                sale_date: cogsDate,
                cogs_try,
              }),
            })
          }
        }
      } catch (cogsErr) {
        // Best-effort: COGS entry failure is non-fatal — sale and sale entry succeeded.
        await logger.error(ctx, 'sale_convert:cogs_entry_failed', {
          sale_id,
          error: cogsErr instanceof Error ? cogsErr.message : String(cogsErr),
        })
      }

      try {
        const { EventService } = await import('@/lib/services/event.service')
        await EventService.emit(supabase, userId, 'sale.created', {
          sale_id,
          proforma_id: input.proforma_id,
          sale_date: input.sale_date ?? today,
        })
      } catch { /* never crash on event emit failure */ }

      logAudit({
        userId,
        companyId,
        entityType: 'sale',
        entityId:   sale_id,
        action:     'create',
        newData:    { sale_id, proforma_id: input.proforma_id },
      })

      return { sale_id, sale_no: result.sale_no }

    } catch (err) {
      if (!(err instanceof AppError)) {
        await failIdempotencyKey(userId, input.idempotency_key, 'sale_convert').catch(() => {})
      }
      throw err
    }
  }
}

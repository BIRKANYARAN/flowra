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
  item_ids:        string[]
  quantities:      number[]
  interest_days:   number
}

export interface ConvertResult {
  sale_id: string
  cached?: boolean
}

export class SaleService {

  static async convertProforma(
    userId:    string,
    input:     ConvertInput,
    companyId: string,
    ctx:       RequestContext,
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
      const supabase = createClient()

      // 2. Delegate to atomic DB function
      const { data: saleId, error } = await supabase.rpc('convert_proforma_to_sale', {
        p_proforma_id:   input.proforma_id,
        p_user_id:       userId,
        p_item_ids:      input.item_ids.length ? input.item_ids : [],
        p_quantities:    input.quantities.length ? input.quantities : [],
        p_interest_days: input.interest_days,
        p_company_id:    companyId,
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

        throw new AppError('RPC_FAILED', 'Dönüşüm hatası', { dbError: msg })
      }

      const sale_id = saleId as string
      await commitIdempotencyKey(userId, input.idempotency_key, 'sale_convert', sale_id, { proforma_id: input.proforma_id })
      await logger.info(ctx, 'sale_convert:success', { sale_id, proforma_id: input.proforma_id })

      try {
        const { EventService } = await import('@/lib/services/event.service')
        await EventService.emit(supabase, userId, 'sale.created', {
          sale_id,
          proforma_id: input.proforma_id,
          sale_date: new Date().toISOString().slice(0, 10),
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

      return { sale_id }

    } catch (err) {
      if (!(err instanceof AppError)) {
        await failIdempotencyKey(userId, input.idempotency_key, 'sale_convert').catch(() => {})
      }
      throw err
    }
  }
}

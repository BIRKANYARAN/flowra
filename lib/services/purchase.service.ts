// ═══════════════════════════════════════════════════════════════════════════════
// Phase 3 — Purchase Service
//
// Owns the *write* lifecycle of a purchase:
//
//   createDraft(...)   — insert header + lines + costs (status='draft')
//   updateDraft(...)   — replace lines + costs while still draft
//   cancel(...)        — terminal state for drafts only
//   finalize(...)      — atomic: compute allocation → for each line, call
//                        StockService.adjust() with the FINAL TRY unit cost
//                        → flip status to 'finalized' → freeze the lots'
//                        purchase_item_id + allocated_cost_try snapshots.
//
// Invariants:
//   • Finalization NEVER mutates stock_movements directly. It always calls
//     StockService.adjust() so:
//       - the optimistic-concurrency guard fires
//       - the BEFORE INSERT trigger fills movement_type
//       - sale_item_allocations / FIFO downstream stay consistent
//   • Allocation runs in the request thread (pure math, microseconds for the
//     line counts we expect — typical purchase has <50 lines).
//   • Once status = 'finalized', the row is immutable (DB trigger).
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient } from '@/lib/supabase-server'
import { logger, type RequestContext } from '@/lib/logger'
import { AppError } from '@/types/errors'
import { logAudit } from '@/lib/audit'
import { StockService } from '@/lib/services/stock.service'
import { CostService } from '@/lib/services/cost.service'
import { CURRENCIES_EXTENDED } from '@/types'
import type {
  CostAllocationMethod,
  Purchase,
  PurchaseAllocationResult,
  PurchaseCostType,
  PurchaseStatus,
} from '@/types'

const ALLOWED_CURRENCIES   = CURRENCIES_EXTENDED as readonly string[]
const ALLOWED_COST_TYPES   = ['shipping','customs','tax','insurance','other'] as const
const ALLOWED_ALLOC_METHOD = ['by_quantity','by_value'] as const

// ── Input shapes ─────────────────────────────────────────────────────────────

export interface PurchaseLineInput {
  product_id: string
  quantity:   number
  unit_price: number       // in purchase.currency
  sort_order?: number
}

export interface PurchaseCostInput {
  cost_type:         PurchaseCostType
  description?:      string | null
  amount:            number
  currency:          string
  /** TRY-side rate. If omitted we assume cost was entered directly in TRY. */
  fx_rate?:          number
  allocation_method: CostAllocationMethod
}

export interface CreatePurchaseInput {
  supplier_name?: string
  purchase_date?: string             // YYYY-MM-DD; defaults to today
  currency:       string             // line currency
  fx_rate:        number             // currency → TRY snapshot
  notes?:         string | null
  lines:          PurchaseLineInput[]
  costs?:         PurchaseCostInput[]
}

// ── Validation helpers ──────────────────────────────────────────────────────

function assertCurrency(c: string): string {
  const up = String(c || '').toUpperCase()
  if (!ALLOWED_CURRENCIES.includes(up)) {
    throw new AppError('VALIDATION_ERROR', `Geçersiz para birimi: ${c}`)
  }
  return up
}

function assertPositive(n: number, label: string): number {
  if (!isFinite(n) || n <= 0) {
    throw new AppError('VALIDATION_ERROR', `${label} pozitif olmalı`)
  }
  return n
}

function assertNonNegative(n: number, label: string): number {
  if (!isFinite(n) || n < 0) {
    throw new AppError('VALIDATION_ERROR', `${label} negatif olamaz`)
  }
  return n
}

// ── Service ──────────────────────────────────────────────────────────────────

export class PurchaseService {

  /**
   * Create a new draft purchase with its lines and (optional) overhead costs.
   * Atomic from the API caller's perspective even though we issue three
   * inserts: any failure throws and orphaned children are impossible because
   * children are FK'd to the header with ON DELETE CASCADE — we delete the
   * header on rollback path.
   */
  static async createDraft(
    userId:    string,
    input:     CreatePurchaseInput,
    companyId: string,
    ctx:       RequestContext,
  ): Promise<{ purchase_id: string }> {

    if (!Array.isArray(input.lines) || input.lines.length === 0) {
      throw new AppError('PURCHASE_NO_LINES', 'En az bir satır gerekli')
    }

    const currency = assertCurrency(input.currency)
    const fxRate   = assertPositive(Number(input.fx_rate), 'fx_rate')
    const date     = (input.purchase_date && /^\d{4}-\d{2}-\d{2}$/.test(input.purchase_date))
      ? input.purchase_date
      : new Date().toISOString().slice(0, 10)

    const supabase = createClient()

    // 1. Header
    const { data: header, error: hErr } = await supabase
      .from('purchases')
      .insert({
        user_id:       userId,
        company_id:    companyId,
        supplier_name: input.supplier_name ?? '',
        purchase_date: date,
        currency,
        fx_rate:       fxRate,
        status:        'draft',
        notes:         input.notes ?? null,
      })
      .select('id')
      .single()

    if (hErr || !header) {
      throw new AppError('DB_INSERT_FAILED', 'Satın alma oluşturulamadı', { dbError: hErr?.message })
    }
    const purchaseId = header.id as string

    // 2. Lines
    const linesPayload = input.lines.map((l, i) => ({
      purchase_id: purchaseId,
      product_id:  l.product_id,
      quantity:    assertPositive(Number(l.quantity), 'quantity'),
      unit_price:  assertNonNegative(Number(l.unit_price), 'unit_price'),
      sort_order:  l.sort_order ?? i,
    }))

    const { error: liErr } = await supabase.from('purchase_items').insert(linesPayload)
    if (liErr) {
      // Best-effort cleanup; CASCADE handles children automatically.
      await supabase.from('purchases').delete().eq('id', purchaseId)
      throw new AppError('DB_INSERT_FAILED', 'Satırlar eklenemedi', { dbError: liErr.message })
    }

    // 3. Costs (optional)
    if (input.costs && input.costs.length > 0) {
      const costsPayload = input.costs.map(c => {
        const ccy = assertCurrency(c.currency)
        const fx  = c.fx_rate == null ? (ccy === 'TRY' ? 1 : 1) : assertPositive(Number(c.fx_rate), 'cost.fx_rate')
        const amt = assertNonNegative(Number(c.amount), 'cost.amount')
        const method = ALLOWED_ALLOC_METHOD.includes(c.allocation_method)
          ? c.allocation_method
          : 'by_value'
        const type = ALLOWED_COST_TYPES.includes(c.cost_type as typeof ALLOWED_COST_TYPES[number])
          ? c.cost_type
          : 'other'
        return {
          purchase_id:       purchaseId,
          cost_type:         type,
          description:       c.description ?? null,
          amount:            amt,
          currency:          ccy,
          fx_rate:           fx,
          // amount_try frozen at create time; never recomputed.
          amount_try:        Math.round(amt * fx * 10000) / 10000,
          allocation_method: method,
        }
      })

      const { error: cErr } = await supabase.from('purchase_costs').insert(costsPayload)
      if (cErr) {
        await supabase.from('purchases').delete().eq('id', purchaseId)
        throw new AppError('DB_INSERT_FAILED', 'Maliyet kalemleri eklenemedi', { dbError: cErr.message })
      }
    }

    await logger.info(ctx, 'purchase:create', { purchase_id: purchaseId, lines: linesPayload.length })
    return { purchase_id: purchaseId }
  }

  /**
   * Cancel a draft purchase (terminal state, no side effects).
   * Refuses if already finalized — the trigger would block us anyway, but a
   * clean error message is friendlier than a CHECK violation.
   */
  static async cancel(userId: string, purchaseId: string, companyId: string, ctx: RequestContext): Promise<void> {
    const supabase = createClient()
    const { data: cur } = await supabase
      .from('purchases')
      .select('status')
      .eq('id', purchaseId)
      .eq('company_id', companyId)
      .maybeSingle()

    if (!cur) throw new AppError('PURCHASE_NOT_FOUND', 'Satın alma bulunamadı', { id: purchaseId })
    if (cur.status !== 'draft') {
      throw new AppError('PURCHASE_NOT_DRAFT', 'Sadece taslak satın almalar iptal edilebilir')
    }

    const { error } = await supabase
      .from('purchases')
      .update({ status: 'cancelled' })
      .eq('id', purchaseId)
      .eq('company_id', companyId)

    if (error) throw new AppError('DB_UPDATE_FAILED', 'İptal başarısız', { dbError: error.message })
    await logger.info(ctx, 'purchase:cancel', { purchase_id: purchaseId })
  }

  /**
   * Finalize a draft → for each line, call StockService.adjust() with the
   * FINAL allocated TRY unit cost, then stamp the resulting stock_lots with
   * `purchase_item_id` and `allocated_cost_try` so the breakdown survives
   * forever.
   *
   * Idempotency: each line gets a deterministic key derived from
   * `purchaseId + purchase_item_id` so a retried finalization that died
   * mid-loop will not double-insert lots.
   *
   * Failure model: if any line fails AFTER its lot was created, we leave the
   * purchase in 'draft' and surface the error. Already-created lots remain
   * (they're real stock) — the operator can re-run finalize() and the
   * idempotency keys will recognize the survivors. The status flip happens
   * only after all lines succeed.
   */
  static async finalize(
    userId:     string,
    purchaseId: string,
    companyId:  string,
    ctx:        RequestContext,
  ): Promise<{ purchase_id: string; allocation: PurchaseAllocationResult; lots_created: number }> {

    const supabase = createClient()

    // 1. Verify it's a draft we own
    const { data: header, error: hErr } = await supabase
      .from('purchases')
      .select('id, status, currency, fx_rate, purchase_date')
      .eq('id', purchaseId)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle()

    if (hErr || !header) {
      throw new AppError('PURCHASE_NOT_FOUND', 'Satın alma bulunamadı', { id: purchaseId, dbError: hErr?.message })
    }
    if (header.status !== 'draft') {
      throw new AppError('PURCHASE_NOT_DRAFT', `Satın alma zaten ${header.status}`)
    }

    // 2. Compute the allocation (CostService is the SoT for unit-cost math)
    const allocation = await CostService.calculateUnitCost(purchaseId)

    // 3. For each line: stock-in via StockService.adjust() at the FINAL cost
    let lotsCreated = 0
    for (const line of allocation.lines) {
      const idemKey = `purchase_finalize:${purchaseId}:${line.purchase_item_id}`

      // StockService.adjust() will:
      //   • insert a stock_movement row (BEFORE INSERT trigger fills movement_type)
      //   • create a stock_lot with unit_cost = final_unit_cost_try (already
      //     in TRY; we pass cost_currency='TRY' + fx_rate_at_entry=1 so the
      //     entry_cost_try snapshot equals final_unit_cost_try exactly)
      const result = await StockService.adjust(
        userId,
        {
          idempotency_key:  idemKey,
          product_id:       line.product_id,
          qty_change:       line.quantity,
          reference_type:   'purchase',
          notes:            `purchase:${purchaseId}`,
          cost_price:       line.final_unit_cost_try,
          entry_date:       header.purchase_date,
          cost_currency:    'TRY',
          fx_rate_at_entry: 1,
        },
        companyId,
        ctx,
      )

      // 4. Stamp the new lot with purchase_item_id + allocated_cost_try.
      //    We locate the lot by movement_id (source_id) — every adjust call
      //    that creates a lot sets source_id to the movement.id.
      if (result.movement_id && !result.cached) {
        const { error: stampErr } = await supabase
          .from('stock_lots')
          .update({
            purchase_item_id:   line.purchase_item_id,
            allocated_cost_try: line.allocated_cost_try,
          })
          .eq('source_id', result.movement_id)
          .eq('company_id', companyId)

        if (stampErr) {
          // Non-fatal: cost breakdown will miss this lot but stock is real.
          await logger.error(ctx, 'purchase:finalize:stamp_failed', {
            purchase_id: purchaseId,
            line_id:     line.purchase_item_id,
            movement_id: result.movement_id,
            error:       stampErr.message,
          })
        } else {
          lotsCreated++
        }
      }
    }

    // 5. Flip status (immutability trigger then locks the row)
    const { error: flipErr } = await supabase
      .from('purchases')
      .update({ status: 'finalized', finalized_at: new Date().toISOString() })
      .eq('id', purchaseId)
      .eq('company_id', companyId)
      .eq('status', 'draft')   // optimistic — refuses if someone else won the race

    if (flipErr) {
      // Lots already exist → operator can re-run finalize() to converge.
      throw new AppError('DB_UPDATE_FAILED', 'Finalize tamamlanamadı', { dbError: flipErr.message })
    }

    await logger.info(ctx, 'purchase:finalize', {
      purchase_id:  purchaseId,
      lines:        allocation.lines.length,
      lots_created: lotsCreated,
      grand_total:  allocation.grand_total_try,
    })

    logAudit({
      userId,
      companyId,
      entityType: 'purchase',
      entityId:   purchaseId,
      action:     'update',
      newData:    { status: 'finalized', lots_created: lotsCreated, grand_total_try: allocation.grand_total_try },
    })

    return { purchase_id: purchaseId, allocation, lots_created: lotsCreated }
  }

  /**
   * List purchases for the current user. Lightweight — no embedded children;
   * the detail view refetches via getById().
   */
  static async list(userId: string, companyId: string, status?: PurchaseStatus): Promise<Purchase[]> {
    const supabase = createClient()
    let q = supabase
      .from('purchases')
      .select('*')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('purchase_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (status) q = q.eq('status', status)

    const { data, error } = await q
    if (error) throw new AppError('DB_READ_FAILED', 'Satın almalar okunamadı', { dbError: error.message })
    return (data ?? []) as Purchase[]
  }

  static async getById(userId: string, companyId: string, purchaseId: string) {
    const supabase = createClient()
    const [{ data: purchase, error: pErr }, { data: items, error: iErr }, { data: costs, error: cErr }] =
      await Promise.all([
        supabase.from('purchases').select('*').eq('id', purchaseId).eq('company_id', companyId).maybeSingle(),
        supabase.from('purchase_items').select('*').eq('purchase_id', purchaseId).order('sort_order', { ascending: true }),
        supabase.from('purchase_costs').select('*').eq('purchase_id', purchaseId),
      ])
    if (pErr || !purchase) throw new AppError('PURCHASE_NOT_FOUND', 'Satın alma bulunamadı', { id: purchaseId })
    if (iErr) throw new AppError('DB_READ_FAILED', 'Satırlar okunamadı', { dbError: iErr.message })
    if (cErr) throw new AppError('DB_READ_FAILED', 'Maliyetler okunamadı', { dbError: cErr.message })
    return { purchase, items: items ?? [], costs: costs ?? [] }
  }
}

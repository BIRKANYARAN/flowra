// ─────────────────────────────────────────────────────────────────────────────
// lib/rollback.ts
//
// Phase 7 — Reversal (Rollback) Strategy
//
// This module does NOT implement a full undo system. Instead, it creates
// compensating records that cancel out the original:
//
//   stock_movement   →  reverse stock_movement (qty = -original.qty_change)
//   expense          →  soft-delete original + audit record
//   partner_tx       →  opposite tx_type with same amount_try
//
// All reversals:
//   • Validate company scope
//   • Write the compensating record
//   • Fire-and-forget audit log
//   • Return the new compensating entity_id
//
// POST /api/rollback { entity_type, entity_id, reason }
// ─────────────────────────────────────────────────────────────────────────────

import { requireAuthContext } from '@/lib/auth-context'
import { AppError }     from '@/types/errors'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any
import { logAudit, logAlert } from '@/lib/audit'
import { StockService } from '@/lib/services/stock.service'
import type { RequestContext } from '@/lib/logger'

export type RollbackEntityType =
  | 'stock_movement'
  | 'expense'
  | 'partner_transaction'

export interface RollbackInput {
  entityType: RollbackEntityType
  entityId:   string
  reason:     string
}

export interface RollbackResult {
  original_entity_id:   string
  reversal_entity_id:   string
  entity_type:          RollbackEntityType
  reason:               string
}

// ── Opposite tx_type map ──────────────────────────────────────────────────────
const OPPOSITE_TX: Record<string, string> = {
  loan_in:   'loan_out',
  loan_out:  'loan_in',
  salary:    'salary',      // no natural opposite — creates negative-note duplicate
  board_fee: 'board_fee',
  dividend:  'dividend',
}

// ── RollbackService ───────────────────────────────────────────────────────────

export class RollbackService {

  // ── reverseStockMovement ──────────────────────────────────────────────────
  /**
   * Creates a reverse stock movement through StockService so the product's
   * live stock count and the ledger stay in sync.
   *
   * Use-case: movement was recorded with wrong quantity; add the inverse to
   * zero it out in the ledger for reporting purposes.
   */
  static async reverseStockMovement(
    userId:     string,
    companyId:  string,
    movementId: string,
    reason:     string,
    ctx:        RequestContext,
    clientOverride?: AnySupabase,
  ): Promise<RollbackResult> {
    const supabase = requireAuthContext(clientOverride, 'RollbackService.reverseStockMovement')

    // 1. Fetch original movement in the resolved company scope.
    // Real stock_movements columns: qty (not qty_change), and there is no
    // user_id / reference_type here. The old select referenced those non-existent
    // columns → query error → rollback always failed "not found". Select the real
    // ones actually used below. (The compensating write goes through
    // StockService.adjust with its own params, so it's unaffected.)
    const { data: orig, error: fetchErr } = await supabase
      .from('stock_movements')
      .select('id, product_id, qty, unit_cost')
      .eq('id', movementId)
      .eq('company_id', companyId)
      .maybeSingle()

    if (fetchErr || !orig) {
      throw new AppError(
        'ROLLBACK_ENTITY_NOT_FOUND',
        'Tersine çevrilecek stok hareketi bulunamadı',
        { movementId },
      )
    }

    const reverseQty = -Number(orig.qty)

    // 2. Apply the compensating movement through the canonical stock path.
    const rev = await StockService.adjust(userId, {
      idempotency_key: `rollback:${movementId}`,
      product_id:      String(orig.product_id),
      qty_change:      reverseQty,
      reference_type:  reverseQty < 0 ? 'write_off' : 'adjustment',
      notes:           `[REVERSAL] ${reason} (tersine çevrildi: ${movementId})`,
      cost_price:      Number(orig.unit_cost) || null,
    }, companyId, ctx)
    const reversalId = rev.movement_id ?? rev.product_id

    // 3. Audit + alert (fire-and-forget)
    logAudit({
      userId,
      companyId,
      entityType: 'stock_movement',
      entityId:   reversalId,
      action:     'create',
      oldData:    { reversed_movement_id: movementId },
      newData:    { reversal_movement_id: reversalId, reason, reverse_qty: reverseQty },
    })
    logAlert({
      actorUserId: userId,
      entityType:  'stock_movement',
      entityId:    reversalId,
      message:     `Stok hareketi tersine çevrildi (orijinal: ${movementId}). Sebep: ${reason}`,
      severity:    'warning',
    })

    return {
      original_entity_id: movementId,
      reversal_entity_id: reversalId,
      entity_type:        'stock_movement',
      reason,
    }
  }

  // ── reverseExpense ────────────────────────────────────────────────────────
  /**
   * Soft-deletes the original expense (sets deleted_at = now()) and writes
   * an audit log capturing the old state. This is the safest reversal for
   * expenses — no duplicate rows that would double-count in reports.
   *
   * If the expense is already deleted, throws ROLLBACK_ENTITY_NOT_FOUND.
   */
  static async reverseExpense(
    userId:    string,
    companyId: string,
    expenseId: string,
    reason:    string,
    clientOverride?: AnySupabase,
  ): Promise<RollbackResult> {
    const supabase = requireAuthContext(clientOverride, 'RollbackService.reverseExpense')

    // 1. Fetch original (must be alive)
    const { data: orig, error: fetchErr } = await supabase
      .from('expenses')
      .select('*')
      .eq('id', expenseId)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle()

    if (fetchErr || !orig) {
      throw new AppError(
        'ROLLBACK_ENTITY_NOT_FOUND',
        'Tersine çevrilecek gider bulunamadı',
        { expenseId },
      )
    }

    // 2. Soft-delete
    const { error: delErr } = await supabase
      .from('expenses')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', expenseId)
      .eq('company_id', companyId)

    if (delErr) {
      throw new AppError('DB_UPDATE_FAILED', 'Gider silinemedi', delErr)
    }

    // 3. Audit + alert
    logAudit({
      userId,
      companyId,
      entityType: 'expense',
      entityId:   expenseId,
      action:     'delete',
      oldData:    orig as Record<string, unknown>,
      newData:    { deleted_reason: reason },
    })
    logAlert({
      actorUserId: userId,
      entityType:  'expense',
      entityId:    expenseId,
      message:     `Gider silindi (${orig.description ?? expenseId}). Sebep: ${reason}`,
      severity:    'warning',
    })

    return {
      original_entity_id: expenseId,
      reversal_entity_id: expenseId,   // same row — was soft-deleted
      entity_type:        'expense',
      reason,
    }
  }

  // ── reversePartnerTransaction ────────────────────────────────────────────
  /**
   * Creates an opposite partner_transaction to cancel the effect of the
   * original (e.g. loan_in → loan_out with same amount_try).
   *
   * For tx_types without a natural opposite (salary, board_fee, dividend),
   * a same-type entry is created with a reversal note so the balance nets
   * out when the caller creates the compensating payment separately.
   */
  static async reversePartnerTransaction(
    userId: string,
    companyId: string,
    txId:   string,
    reason: string,
    clientOverride?: AnySupabase,
  ): Promise<RollbackResult> {
    const supabase = requireAuthContext(clientOverride, 'RollbackService.reversePartnerTransaction')

    // 1. Fetch original
    const { data: orig, error: fetchErr } = await supabase
      .from('partner_transactions')
      .select('*')
      .eq('id', txId)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle()

    if (fetchErr || !orig) {
      throw new AppError(
        'ROLLBACK_ENTITY_NOT_FOUND',
        'Tersine çevrilecek ortak işlemi bulunamadı',
        { txId },
      )
    }

    const oppositeTxType = OPPOSITE_TX[orig.tx_type] ?? orig.tx_type

    // 2. Soft-delete original (mark as reversed)
    try {
      await supabase
        .from('partner_transactions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', txId)
        .eq('company_id', companyId)
    } catch (err) {
      console.error('[rollback] soft-delete partner_transaction failed:', err instanceof Error ? err.message : String(err))
    }

    // 3. Insert compensating transaction
    const { data: rev, error: insertErr } = await supabase
      .from('partner_transactions')
      .insert({
        partner_id: orig.partner_id,
        user_id:    userId,
        company_id: companyId,
        tx_type:    oppositeTxType,
        amount:     orig.amount,
        currency:   orig.currency,
        fx_rate:    orig.fx_rate,
        amount_try: orig.amount_try,
        tx_date:    new Date().toISOString().slice(0, 10),
        notes:      `[REVERSAL] ${reason} (orijinal işlem: ${txId})`,
      })
      .select('id')
      .single()

    if (insertErr || !rev) {
      throw new AppError('DB_INSERT_FAILED', 'Ters ortak işlemi oluşturulamadı', insertErr)
    }

    // 4. Audit + alert
    logAudit({
      userId,
      companyId,
      entityType: 'partner_transaction',
      entityId:   rev.id,
      action:     'create',
      oldData:    { reversed_tx_id: txId, original_tx_type: orig.tx_type },
      newData:    { reversal_tx_id: rev.id, reversal_tx_type: oppositeTxType, reason },
    })
    logAlert({
      actorUserId: userId,
      entityType:  'partner_transaction',
      entityId:    rev.id,
      message:     `Ortak işlemi tersine çevrildi (${orig.tx_type} → ${oppositeTxType}). Sebep: ${reason}`,
      severity:    'warning',
    })

    return {
      original_entity_id: txId,
      reversal_entity_id: rev.id,
      entity_type:        'partner_transaction',
      reason,
    }
  }

  // ── dispatch ─────────────────────────────────────────────────────────────
  /**
   * Single entry-point called by the API route.
   * Routes to the right reversal method by entity_type.
   */
  static async dispatch(
    userId:     string,
    companyId:  string,
    input:      RollbackInput,
    ctx:        RequestContext,
    clientOverride?: AnySupabase,
  ): Promise<RollbackResult> {
    switch (input.entityType) {
      case 'stock_movement':
        return RollbackService.reverseStockMovement(userId, companyId, input.entityId, input.reason, ctx, clientOverride)
      case 'expense':
        return RollbackService.reverseExpense(userId, companyId, input.entityId, input.reason, clientOverride)
      case 'partner_transaction':
        return RollbackService.reversePartnerTransaction(userId, companyId, input.entityId, input.reason, clientOverride)
      default:
        throw new AppError(
          'ROLLBACK_NOT_SUPPORTED',
          `'${input.entityType}' için tersine çevirme desteklenmiyor`,
          { supported: ['stock_movement', 'expense', 'partner_transaction'] },
        )
    }
  }
}

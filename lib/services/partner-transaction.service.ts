// ─────────────────────────────────────────────────────────────────────────────
// lib/services/partner-transaction.service.ts
//
// Partner transaction methods.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase-server'
import { logger, contextFromHeader } from '@/lib/logger'
import { AppError } from '@/types/errors'
import { logAudit, logAlert } from '@/lib/audit'
import { round2 } from '@/lib/calc'
import type { PartnerTransaction } from '@/types/index'

type Ctx = ReturnType<typeof contextFromHeader>

export class PartnerTransactionService {
  // ── addTransaction ──────────────────────────────────────────────────────────
  static async addTransaction(
    userId:    string,
    partnerId: string,
    input: {
      tx_type:   string
      amount:    number
      currency:  string
      fx_rate:   number
      tx_date:   string
      notes?:    string
    },
    companyId: string,
    ctx?:      Ctx,
  ): Promise<PartnerTransaction> {
    const supabase = createClient()

    // Verify partner belongs to this company
    const { data: partner, error: pErr } = await supabase
      .from('partners')
      .select('id')
      .eq('id', partnerId)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle()

    if (pErr || !partner) {
      throw new AppError('PARTNER_NOT_FOUND', 'Ortak bulunamadı', { partnerId })
    }

    // Phase 4 canonical types + legacy types (backward compat)
    const VALID_TX_TYPES = new Set([
      'capital_in', 'loan_to_company', 'loan_repayment', 'dividend',  // Phase 4 canonical
      'loan_in', 'loan_out', 'salary', 'board_fee',                    // legacy
    ])
    if (!VALID_TX_TYPES.has(input.tx_type)) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Geçersiz işlem tipi. Geçerli tipler: capital_in, loan_to_company, loan_repayment, dividend',
        { received: input.tx_type },
      )
    }

    if (input.amount <= 0) {
      throw new AppError('INVALID_AMOUNT', 'Tutar sıfırdan büyük olmalı', { amount: input.amount })
    }

    if (input.fx_rate <= 0) {
      throw new AppError('VALIDATION_ERROR', 'fx_rate sıfırdan büyük olmalı', { fx_rate: input.fx_rate })
    }

    const amount_try = round2(input.amount * input.fx_rate)

    const { data, error } = await supabase
      .from('partner_transactions')
      .insert({
        partner_id:  partnerId,
        user_id:     userId,
        tx_type:     input.tx_type,
        amount:      input.amount,
        currency:    input.currency,
        fx_rate:     input.fx_rate,
        amount_try,
        tx_date:     input.tx_date,
        notes:       input.notes ?? null,
        company_id:  companyId,
      })
      .select()
      .single()

    if (error || !data) {
      if (ctx) void logger.error(ctx, 'partner_tx_create_failed', { error })
      throw new AppError('DB_INSERT_FAILED', 'İşlem kaydedilemedi', error)
    }

    const tx = data as PartnerTransaction

    logAudit({
      userId,
      companyId,
      entityType: 'partner_transaction',
      entityId:   tx.id,
      action:     'create',
      newData:    { tx_type: input.tx_type, amount: input.amount, currency: input.currency, amount_try },
    })
    if (amount_try >= 10_000) {
      logAlert({
        actorUserId: userId,
        entityType:  'partner_transaction',
        entityId:    tx.id,
        message:     `Büyük ortak işlemi: ${input.tx_type} ${amount_try.toLocaleString('tr-TR')} TRY`,
        severity:    'warning',
      })
    }

    return tx
  }

  // ── listTransactions ────────────────────────────────────────────────────────
  static async listTransactions(
    userId:    string,
    companyId: string,
    partnerId: string,
    ctx?:      Ctx,
  ): Promise<PartnerTransaction[]> {
    const supabase = createClient()

    // Verify partner belongs to this company
    const { data: partner, error: pErr } = await supabase
      .from('partners')
      .select('id')
      .eq('id', partnerId)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle()

    if (pErr || !partner) {
      throw new AppError('PARTNER_NOT_FOUND', 'Ortak bulunamadı', { partnerId })
    }

    const { data, error } = await supabase
      .from('partner_transactions')
      .select('*')
      .eq('partner_id', partnerId)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('tx_date', { ascending: false })

    if (error) {
      if (ctx) void logger.error(ctx, 'partner_tx_list_failed', { error })
      throw new AppError('DB_READ_FAILED', 'İşlemler listelenemedi', error)
    }

    return (data ?? []) as PartnerTransaction[]
  }
}

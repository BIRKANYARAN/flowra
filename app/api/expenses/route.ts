export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { REQUEST_ID_HEADER } from '@/middleware'
import { getOrFetchFxRate } from '@/lib/fx'
import { requireString, requirePositiveNumber, ValidationError } from '@/lib/validation'
import { toErrorResponse } from '@/types/errors'
import { CURRENCIES_EXTENDED, type ExpenseType, type PaymentStatus } from '@/types'
import { logAudit } from '@/lib/audit'
import { resolveExpenseType } from '@/lib/services/finance-rules'
import { checkPeriodGuard } from '@/lib/middleware/period-guard'
import { dualWrite, resolvePeriodId } from '@/lib/services/ledger/dual-write.service'
import { JournalEntryService } from '@/lib/services/ledger/journal-entry.service'
import { resolveApiAuth } from '@/lib/api-auth'

const ALLOWED_CURRENCIES = CURRENCIES_EXTENDED as readonly string[]
const ALLOWED_CATEGORIES = [
  'general','rent','salary','utilities','marketing','logistics','software','equipment','tax',
  'interest','board_fee','principal','dividend','partner_loan',
  'other',
]
const ALLOWED_PAYMENT_STATUSES: readonly PaymentStatus[] = ['pending', 'paid', 'partial', 'overdue', 'cancelled']
const ALLOWED_EXPENSE_TYPES: readonly ExpenseType[] = [
  'operational',
  'fixed',
  'variable',
  'capital',
  'financial',
  'tax',
  'loan_repayment',
  'partner_financing',
  'dividend',
  'internal_transfer',
  'other',
]

// ── GET — list expenses ───────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  const { searchParams } = new URL(req.url)
  const limit  = Math.min(100, Math.max(1, Number(searchParams.get('limit')  ?? 50)))
  const offset = Math.max(0,              Number(searchParams.get('offset') ?? 0))

  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('expense_date', { ascending: false })
    .order('created_at',   { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// ── POST — create expense ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth


  try {
    const body = await req.json()

    const amount       = requirePositiveNumber(body.amount, 'amount')
    const rawCurrency  = (body.currency ?? 'TRY').toString().toUpperCase()
    const currency     = ALLOWED_CURRENCIES.includes(rawCurrency) ? rawCurrency : 'TRY'
    const description  = requireString(body.description, 'description', 500)
    const rawCategory  = (body.category ?? 'general').toString().toLowerCase()
    const category     = ALLOWED_CATEGORIES.includes(rawCategory) ? rawCategory : 'general'
    const rawPaymentStatus = String(body.payment_status ?? 'paid').toLowerCase()
    const paymentStatus = ALLOWED_PAYMENT_STATUSES.includes(rawPaymentStatus as PaymentStatus)
      ? rawPaymentStatus as PaymentStatus
      : 'paid'
    const rawExpenseType = typeof body.expense_type === 'string'
      ? body.expense_type.trim().toLowerCase()
      : ''
    const expenseType = ALLOWED_EXPENSE_TYPES.includes(rawExpenseType as ExpenseType)
      ? rawExpenseType as ExpenseType
      : resolveExpenseType(category)
    const expense_date = (body.expense_date && /^\d{4}-\d{2}-\d{2}$/.test(body.expense_date))
      ? body.expense_date
      : new Date().toISOString().slice(0, 10)

    const kdv = Math.min(100, Math.max(0, Number(body.kdv) || 0))

    // Period guard — block writes to locked periods
    const guard = await checkPeriodGuard(companyId, expense_date, supabase)
    if (guard.blocked) {
      return NextResponse.json({ error: guard.reason, code: 'PERIOD_LOCKED', type: 'BUSINESS' }, { status: 422 })
    }

    // partner_id: only relevant when category = 'partner_loan'
    const partnerId = (category === 'partner_loan' && typeof body.partner_id === 'string')
      ? body.partner_id.trim()
      : ''

    // Snapshot FX rate at creation time
    const fx         = await getOrFetchFxRate(currency)
    const amount_try = amount * fx.rate

    // ── Partner loan: atomic DB-level operation ───────────────────────────────
    // create_partner_loan_expense() inserts partner_transaction + expense in a
    // single PostgreSQL transaction — both succeed or neither does.
    // No compensating rollback needed; concurrency is safe.
    if (partnerId) {
      const { data: rpcData, error: rpcError } = await supabase.rpc('create_partner_loan_expense', {
        p_uid:          uid,
        p_partner_id:   partnerId,
        p_amount:       amount,
        p_currency:     currency,
        p_amount_try:   amount_try,
        p_fx_rate:      fx.rate,
        p_fx_source:    fx.source,
        p_description:  description,
        p_expense_date: expense_date,
        p_kdv:          kdv,
        p_company_id:   companyId,
      })

      if (rpcError) {
        await logger.error(ctx, 'expense_create:partner_rpc_error', { error: rpcError.message })
        // Surface PARTNER_NOT_FOUND as 404; all other errors as 422
        const isNotFound = rpcError.message?.includes('PARTNER_NOT_FOUND')
        return NextResponse.json(
          { error: isNotFound ? 'Ortak bulunamadı' : rpcError.message, code: isNotFound ? 'PARTNER_NOT_FOUND' : 'RPC_ERROR' },
          { status: isNotFound ? 404 : 422 },
        )
      }

      const expenseId = (rpcData as { expense_id: string } | null)?.expense_id ?? ''
      await logger.info(ctx, 'expense_create:success', { id: expenseId, amount_try, partner_id: partnerId })
      logAudit({
        userId:     uid,
        companyId,
        entityType: 'expense',
        entityId:   expenseId,
        action:     'create',
        newData:    { amount, currency, amount_try, category: 'partner_loan', payment_status: 'paid', expense_type: 'partner_financing', expense_date, partner_id: partnerId },
      })
      return NextResponse.json({ id: expenseId }, { status: 201, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
    }

    // ── Standard (non-partner) expense insert ─────────────────────────────────
    const { data, error } = await supabase
      .from('expenses')
      .insert({
        user_id:      uid,
        amount,
        currency,
        amount_try,
        fx_rate:      fx.rate,
        fx_source:    fx.source,
        description,
        category,
        payment_status: paymentStatus,
        expense_type:   expenseType,
        expense_date,
        kdv,
        company_id:   companyId,
      })
      .select('id')
      .single()

    if (error) {
      await logger.error(ctx, 'expense_create:db_error', { error: error.message })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await logger.info(ctx, 'expense_create:success', { id: data.id, amount_try })
    logAudit({
      userId:     uid,
      companyId,
      entityType: 'expense',
      entityId:   data.id,
      action:     'create',
      newData:    { amount, currency, amount_try, category, payment_status: paymentStatus, expense_type: expenseType, expense_date },
    })

    // Dual-write: journal entry (mode-aware: shadow=skip, parallel=async, gl_primary=sync)
    const periodId = guard.period_id ?? await resolvePeriodId(companyId, expense_date, supabase)
    const paidFromBank = paymentStatus === 'paid'
    await dualWrite({
      companyId,
      periodId,
      createdBy: uid,
      supabase,
      buildEntry: () => JournalEntryService.buildExpenseEntry({
        id:              data.id,
        expense_date,
        expense_type:    category,
        amount_try:      amount_try,
        kdv_amount_try:  amount_try * (kdv / 100),
        paid_from_bank:  paidFromBank,
        description,
      }),
    })

    return NextResponse.json({ id: data.id }, { status: 201, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })

  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message, code: 'VALIDATION_ERROR', type: 'BUSINESS', field: err.field }, { status: 422 })
    }
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status })
  }
}

// ── DELETE — soft delete ──────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id') ?? ''
    if (!id) return NextResponse.json({ error: 'id zorunludur', code: 'VALIDATION_ERROR', type: 'BUSINESS' }, { status: 422 })

    const { data: existing, error: findErr } = await supabase
      .from('expenses')
      .select('id')
      .eq('id', id)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle()
    if (findErr) {
      console.error('[expenses DELETE] find error:', findErr.message)
      return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
    }

    if (!existing) return NextResponse.json({ error: 'Gider bulunamadı', code: 'EXPENSE_NOT_FOUND', type: 'BUSINESS' }, { status: 404 })

    await supabase
      .from('expenses')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', companyId)

    logAudit({
      userId:     uid,
      companyId,
      entityType: 'expense',
      entityId:   id,
      action:     'delete',
      oldData:    { id },
    })

    return NextResponse.json({ deleted: true })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}

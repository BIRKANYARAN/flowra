// ── /api/recurring-expenses ───────────────────────────────────────────────────
// GET    — list active recurring expense templates for the current user
// POST   — create a new recurring expense template
// DELETE — soft delete (sets deleted_at, is_active = false)

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getOrFetchFxRate } from '@/lib/fx'
import { resolveExpenseType } from '@/lib/services/finance-rules'
import type { ExpenseType } from '@/types'
import { resolveApiAuth } from '@/lib/api-auth'

const ALLOWED_CATEGORIES  = [
  'general','rent','salary','utilities','marketing','logistics','software','equipment','tax',
  'interest','board_fee','principal','dividend','partner_loan',
  'other',
]
const ALLOWED_FREQUENCIES = ['monthly', 'quarterly', 'yearly']
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

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  const { data, error } = await supabase
    .from('recurring_expenses')
    .select('*')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// ── POST ──────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  try {
    const body = await req.json()

    const description = typeof body.description === 'string' ? body.description.trim() : ''
    if (!description)
      return NextResponse.json({ error: 'Açıklama zorunludur', code: 'VALIDATION_ERROR', type: 'BUSINESS' }, { status: 422 })

    const amount = Number(body.amount)
    if (!Number.isFinite(amount) || amount <= 0)
      return NextResponse.json({ error: 'Geçerli bir tutar girin', code: 'VALIDATION_ERROR', type: 'BUSINESS' }, { status: 422 })

    const rawCurrency = String(body.currency ?? 'TRY').toUpperCase()
    const currency    = ['TRY','USD','EUR','GBP'].includes(rawCurrency) ? rawCurrency : 'TRY'

    const rawCategory = String(body.category ?? 'general').toLowerCase()
    const category    = ALLOWED_CATEGORIES.includes(rawCategory) ? rawCategory : 'general'
    const rawExpenseType = typeof body.expense_type === 'string'
      ? body.expense_type.trim().toLowerCase()
      : ''
    const expenseType = ALLOWED_EXPENSE_TYPES.includes(rawExpenseType as ExpenseType)
      ? rawExpenseType as ExpenseType
      : resolveExpenseType(category)

    const rawFrequency = String(body.frequency ?? 'monthly').toLowerCase()
    const frequency    = ALLOWED_FREQUENCIES.includes(rawFrequency) ? rawFrequency : 'monthly'

    const start_date = typeof body.start_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.start_date)
      ? body.start_date
      : new Date().toISOString().slice(0, 10)

    const end_date = typeof body.end_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.end_date)
      ? body.end_date
      : null

    const kdv = Math.min(100, Math.max(0, Number(body.kdv) || 0))

    const fx = await getOrFetchFxRate(currency)

    const { data, error } = await supabase
      .from('recurring_expenses')
      .insert({
        user_id:       uid,
        description,
        amount,
        currency,
        fx_rate:       fx.rate,
        category,
        expense_type:  expenseType,
        frequency,
        start_date,
        end_date,
        kdv,
        is_active:     true,
        is_deductible: body.is_deductible !== false,
        company_id:    companyId,
      })
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ error: 'id zorunludur' }, { status: 422 })

  const { error } = await supabase
    .from('recurring_expenses')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}

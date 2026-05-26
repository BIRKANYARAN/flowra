// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/finance/budget-variance  — Budget vs Actuals variance report
// POST /api/finance/budget-variance  — Create/update budget entry (admin only)
//
// GET returns { report: BudgetVarianceReport }
// POST body: { year, month, revenue_target_try, expense_target_try, notes? }
//
// Auth: any authenticated company member (GET), admin only (POST).
// Cache: revalidate every 300 seconds.
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { BudgetVarianceService } from '@/lib/services/finance/budget-variance.service'
import { REQUEST_ID_HEADER } from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  try {
    const report = await BudgetVarianceService.getReport(companyId, supabase)
    return NextResponse.json(
      { report },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: msg, code: 'SERVICE_ERROR', type: 'SYSTEM' },
      { status: 500, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }
}

export async function POST(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  // ── Admin-only check ────────────────────────────────────────────────────────
  const { data: memberRow, error: memberErr } = await supabase
    .from('company_members')
    .select('role')
    .eq('company_id', companyId)
    .eq('user_id', uid)
    .single()

  if (memberErr || !memberRow || memberRow.role !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden: admin role required', code: 'FORBIDDEN', type: 'AUTH' },
      { status: 403, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'BAD_REQUEST', type: 'VALIDATION' },
      { status: 400, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json(
      { error: 'Body must be an object', code: 'BAD_REQUEST', type: 'VALIDATION' },
      { status: 400, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }

  const { year, month, revenue_target_try, expense_target_try, notes } = body as Record<string, unknown>

  if (
    typeof year !== 'number' ||
    typeof month !== 'number' ||
    typeof revenue_target_try !== 'number' ||
    typeof expense_target_try !== 'number'
  ) {
    return NextResponse.json(
      {
        error: 'year, month, revenue_target_try, expense_target_try are required numbers',
        code: 'BAD_REQUEST',
        type: 'VALIDATION',
      },
      { status: 400, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }

  if (year < 2020 || year > 2100 || month < 1 || month > 12) {
    return NextResponse.json(
      { error: 'year must be 2020-2100, month must be 1-12', code: 'BAD_REQUEST', type: 'VALIDATION' },
      { status: 400, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }

  // ── Upsert on company_id, budget_year, budget_month ─────────────────────────
  const { data: upserted, error: upsertErr } = await supabase
    .from('monthly_budgets')
    .upsert(
      {
        company_id:          companyId,
        budget_year:         year,
        budget_month:        month,
        revenue_target_try,
        expense_target_try,
        notes:               typeof notes === 'string' ? notes : null,
        created_by:          uid,
      },
      { onConflict: 'company_id,budget_year,budget_month' },
    )
    .select()
    .single()

  if (upsertErr) {
    return NextResponse.json(
      { error: upsertErr.message, code: 'DB_ERROR', type: 'SYSTEM' },
      { status: 500, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }

  return NextResponse.json(
    { budget: upserted },
    { status: 200, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
  )
}

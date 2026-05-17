import { NextRequest, NextResponse } from 'next/server'
import { detectDuplicates }          from '@/lib/engines/duplicate-detector'
import type { ExpenseRow }           from '@/lib/engines/duplicate-detector'
import { resolveApiAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// GET /api/insights/duplicates?days=90
//
// Detects likely duplicate expense entries in the last N days.
// Returns DuplicateGroup[] — CFO reviews, no auto-deletion.

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { companyId, supabase } = auth

    const rawDays = parseInt(req.nextUrl.searchParams.get('days') ?? '90', 10)
    const days    = Math.min(isFinite(rawDays) ? Math.max(1, rawDays) : 90, 365)
    const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)

    const { data, error } = await supabase
      .from('expenses')
      .select('id, expense_date, expense_type, amount_try, vendor_name, description')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('expense_date', from)
      .order('expense_date', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const expenses: ExpenseRow[] = (data ?? []).map(e => ({
      id:           e.id as string,
      expense_date: e.expense_date as string,
      expense_type: (e.expense_type as string) ?? 'general',
      amount_try:   Number(e.amount_try ?? 0),
      vendor_name:  e.vendor_name as string | null ?? null,
      description:  e.description as string | null ?? null,
    }))

    const duplicates = detectDuplicates(expenses)

    return NextResponse.json({
      duplicates,
      count:        duplicates.length,
      high_confidence: duplicates.filter(d => d.confidence === 'high').length,
      days_checked: days,
    })
  } catch (e) {
    console.error('[insights/duplicates]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

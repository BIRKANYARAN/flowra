import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// GET /api/ledger/journal-entries?period_id=&from_date=&to_date=&source_type=&limit=50&offset=0
export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase, ctx } = auth

    const params      = req.nextUrl.searchParams
    const periodId    = params.get('period_id')   ?? null
    const fromDate    = params.get('from_date')    ?? null
    const toDate      = params.get('to_date')      ?? null
    const sourceType  = params.get('source_type')  ?? null
    const limit       = Math.min(parseInt(params.get('limit')  ?? '50'), 200)
    const offset      = parseInt(params.get('offset') ?? '0')

    let query = supabase
      .from('journal_entries')
      .select(`
        id, source_type, source_id, entry_date, description, reference,
        is_adjustment, is_reversal, is_voided, created_at,
        journal_entry_lines (
          id, account_code, account_name, debit_try, credit_try, description
        )
      `)
      .eq('company_id', companyId)
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (periodId)   query = query.eq('period_id',   periodId)
    if (sourceType) query = query.eq('source_type', sourceType)
    if (fromDate)   query = query.gte('entry_date', fromDate)
    if (toDate)     query = query.lte('entry_date', toDate)

    const { data, error } = await query
    if (error) {
      console.warn('[ledger/journal-entries] query error (table may not exist):', error.message)
      return NextResponse.json({ entries: [], total: 0 })
    }

    return NextResponse.json({ entries: data ?? [], total: (data ?? []).length })
  } catch (e) {
    console.error('[ledger/journal-entries] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

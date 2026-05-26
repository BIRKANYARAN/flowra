import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// GET /api/ledger/journal-entries?period_id=&from_date=&to_date=&source_type=&limit=50&offset=0
export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { companyId, supabase } = auth

    const params      = req.nextUrl.searchParams
    const periodId    = params.get('period_id')   ?? null
    const fromDate    = params.get('from_date')    ?? null
    const toDate      = params.get('to_date')      ?? null
    const sourceType  = params.get('source_type')  ?? null
    const rawLimit    = parseInt(params.get('limit')  ?? '50', 10)
    const rawOffset   = parseInt(params.get('offset') ?? '0',  10)
    const limit       = Math.min(isFinite(rawLimit)  ? Math.max(1, rawLimit)  : 50,  200)
    const offset      = isFinite(rawOffset) ? Math.max(0, rawOffset) : 0

    const buildQuery = (withVoucher: boolean) => {
      const selectFields = withVoucher
        ? `id, source_type, source_id, entry_date, description, reference, voucher_number,
           is_adjustment, is_reversal, is_voided, created_at,
           journal_entry_lines (
             id, account_code, account_name, debit_try, credit_try, description
           )`
        : `id, source_type, source_id, entry_date, description, reference,
           is_adjustment, is_reversal, is_voided, created_at,
           journal_entry_lines (
             id, account_code, account_name, debit_try, credit_try, description
           )`
      let q = supabase
        .from('journal_entries')
        .select(selectFields, { count: 'exact' })
        .eq('company_id', companyId)
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)
      if (periodId)   q = q.eq('period_id',   periodId)
      if (sourceType) q = q.eq('source_type', sourceType)
      if (fromDate)   q = q.gte('entry_date', fromDate)
      if (toDate)     q = q.lte('entry_date', toDate)
      return q
    }

    // Try with voucher_number first; fall back if migration is pending and column doesn't exist yet.
    let { data, error, count } = await buildQuery(true)
    if (error && error.message?.includes('voucher_number')) {
      console.warn('[ledger/journal-entries] voucher_number column missing, retrying without it')
      ;({ data, error, count } = await buildQuery(false))
    }
    if (error) {
      console.warn('[ledger/journal-entries] query error (table may not exist):', error.message)
      return NextResponse.json({ entries: [], total: 0 })
    }

    // `count` is the true total rows matching the filters (not the page size).
    // Use it for proper pagination on the client side.
    return NextResponse.json({ entries: data ?? [], total: count ?? (data ?? []).length })
  } catch (e) {
    console.error('[ledger/journal-entries] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

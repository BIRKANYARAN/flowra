// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ledger/journal-entries
//
// Returns journal entries for the requested date range plus a trial balance.
//
// Query params:
//   ?from=YYYY-MM-DD  (default: first day of current month)
//   ?to=YYYY-MM-DD    (default: today)
//
// Auth: admin only (resolveApiAuth + requireRole admin)
// Cache: revalidate 300 seconds
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 300

import { NextRequest, NextResponse }  from 'next/server'
import { resolveApiAuth }             from '@/lib/api-auth'
import { requireRole }                from '@/lib/require-role'
import { JournalEntryService }        from '@/lib/services/ledger/journal-entry.service'
import { REQUEST_ID_HEADER }          from '@/middleware'

function currentMonthBounds(): { from: string; to: string } {
  const now   = new Date()
  const year  = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day   = String(now.getDate()).padStart(2, '0')
  return {
    from: `${year}-${month}-01`,
    to:   `${year}-${month}-${day}`,
  }
}

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  // Admin-only route
  try {
    await requireRole(uid, companyId, 'admin', supabase)
  } catch {
    return NextResponse.json(
      { error: 'Forbidden: admin role required', code: 'FORBIDDEN', type: 'SECURITY' },
      { status: 403, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }

  const defaults = currentMonthBounds()
  const from     = req.nextUrl.searchParams.get('from') ?? defaults.from
  const to       = req.nextUrl.searchParams.get('to')   ?? defaults.to

  // Validate date format
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return NextResponse.json(
      { error: 'Invalid date format. Expected YYYY-MM-DD.', code: 'INVALID_PARAM', type: 'CLIENT' },
      { status: 400, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }

  try {
    const service       = new JournalEntryService(supabase)
    const [entries, trialBalance] = await Promise.all([
      service.getEntriesForPeriod(companyId, from, to),
      service.verifyTrialBalance(companyId, to),
    ])

    return NextResponse.json(
      {
        entries,
        trial_balance: {
          balanced:     trialBalance.balanced,
          debit_total:  trialBalance.debit_total,
          credit_total: trialBalance.credit_total,
        },
      },
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

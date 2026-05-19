import { NextRequest, NextResponse } from 'next/server'
import { getSystemAdminClient }      from '@/lib/admin-db'
import { round2 } from '@/lib/calc'

export const dynamic = 'force-dynamic'

// POST /api/cron/interest-accrual
//
// Invoked daily by Vercel Cron at 01:00 UTC.
// Accrues daily interest on all active partner_loan_tranches.
// Idempotent: skips tranches already accrued for today.
//
// Interest logic:
//   If tranche has no annual_rate → skip (interest-free loan)
//   daily_interest = principal × (annual_rate / 365)
//   Writes a LOAN_INTEREST_ACCRUAL event to partner_finance_events.

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(req: NextRequest) {
  // Verify Vercel Cron signature (or shared secret).
  // Treat a missing CRON_SECRET as misconfiguration — deny access rather than
  // leaving the endpoint open to unauthenticated callers.
  const authHeader = req.headers.get('authorization')
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Cron jobs run without an HTTP session — use the service-role client so that
  // Supabase RLS (which requires auth.uid()) does not silently block every query.
  // company_id is always present on every row we touch, so no cross-company leak is possible.
  const supabase = getSystemAdminClient()
  const today    = new Date().toISOString().slice(0, 10)

  try {
    // Get all active tranches with an interest rate
    const { data: tranches, error: tErr } = await supabase
      .from('partner_loan_tranches')
      .select('id, company_id, partner_id, outstanding_try, annual_interest_rate')
      .eq('status', 'active')
      .not('annual_interest_rate', 'is', null)
      .gt('annual_interest_rate', 0)
      .gt('outstanding_try', 0)

    if (tErr || !tranches?.length) {
      return NextResponse.json({ ok: true, accrued: 0, message: 'No active interest-bearing tranches' })
    }

    // ── Bulk idempotency check: one query for all tranches ────────────────
    const trancheRefs = tranches.map(t => `tranche:${t.id}`)
    const { data: alreadyDone } = await supabase
      .from('partner_finance_events')
      .select('reference')
      .eq('event_type', 'LOAN_INTEREST_ACCRUAL')
      .eq('event_date', today)
      .in('reference', trancheRefs)

    const doneSet = new Set((alreadyDone ?? []).map(r => r.reference as string))

    // ── Compute new accrual rows ───────────────────────────────────────────
    const newRows = tranches
      .filter(t => !doneSet.has(`tranche:${t.id}`))
      .map(t => ({
        // annual_interest_rate is a decimal (0.15 = 15%) — do NOT divide by 100 again
        // round2() prevents IEEE 754 edge cases in daily interest computation
        dailyInterest: round2(Number(t.outstanding_try) * (Number(t.annual_interest_rate) / 365)),
        t,
      }))
      .filter(({ dailyInterest }) => dailyInterest >= 0.01)  // skip below ₺0.01
      .map(({ dailyInterest, t }) => ({
        company_id:  t.company_id,
        partner_id:  t.partner_id,
        event_type:  'LOAN_INTEREST_ACCRUAL',
        amount_try:  dailyInterest,
        event_date:  today,
        reference:   `tranche:${t.id}`,
        description: `Günlük faiz tahakkuku — ${today}`,
      }))

    if (!newRows.length) {
      return NextResponse.json({ ok: true, accrued: 0, skipped: tranches.length, date: today })
    }

    // ── Single bulk insert ─────────────────────────────────────────────────
    const { error: insErr } = await supabase
      .from('partner_finance_events')
      .insert(newRows)

    if (insErr) {
      console.error('[cron/interest-accrual] bulk insert error:', insErr.message)
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }

    return NextResponse.json({
      ok:      true,
      accrued: newRows.length,
      skipped: tranches.length - newRows.length,
      date:    today,
    })
  } catch (e) {
    console.error('[cron/interest-accrual]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase-server'

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
  // Verify Vercel Cron signature (or shared secret)
  const authHeader = req.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient()
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

    let accrued = 0
    const errors: string[] = []

    for (const t of tranches) {
      // Idempotency: check if already accrued today for this tranche
      const { data: existing } = await supabase
        .from('partner_finance_events')
        .select('id')
        .eq('company_id', t.company_id)
        .eq('partner_id',  t.partner_id)
        .eq('event_type',  'LOAN_INTEREST_ACCRUAL')
        .eq('event_date',  today)
        .eq('reference',   `tranche:${t.id}`)
        .limit(1)
        .maybeSingle()

      if (existing) continue  // already done today

      const dailyInterest = Math.round(
        (Number(t.outstanding_try) * (Number(t.annual_interest_rate) / 100 / 365)) * 100
      ) / 100

      if (dailyInterest < 0.01) continue  // below ₺0.01 — skip

      const { error: insErr } = await supabase
        .from('partner_finance_events')
        .insert({
          company_id:  t.company_id,
          partner_id:  t.partner_id,
          event_type:  'LOAN_INTEREST_ACCRUAL',
          amount_try:  dailyInterest,
          event_date:  today,
          reference:   `tranche:${t.id}`,
          description: `Günlük faiz tahakkuku — ${today}`,
        })

      if (insErr) {
        errors.push(`tranche ${t.id}: ${insErr.message}`)
      } else {
        accrued++
      }
    }

    return NextResponse.json({
      ok:      errors.length === 0,
      accrued,
      errors:  errors.length ? errors : undefined,
      date:    today,
    })
  } catch (e) {
    console.error('[cron/interest-accrual]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

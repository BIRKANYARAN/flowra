import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// POST /api/cron/overdue-update
//
// Invoked daily by Vercel Cron at 00:30 UTC.
// Marks sales as overdue where due_date < today and payment_status is still unpaid/partial.
// Idempotent: only updates rows that aren't already overdue.
//
// Also fires audit_logs entries for any newly overdue sales.

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient()
  const today    = new Date().toISOString().slice(0, 10)

  try {
    // Find all unpaid/partial sales whose due_date has passed
    const { data: stale, error: fetchErr } = await supabase
      .from('sales')
      .select('id, company_id, customer_name, total_try, due_date, payment_status')
      .in('payment_status', ['pending', 'partial'])
      .lt('due_date', today)
      .is('deleted_at', null)
      .not('due_date', 'is', null)

    if (fetchErr) {
      console.error('[cron/overdue-update] fetch error:', fetchErr)
      return NextResponse.json({ error: fetchErr.message }, { status: 500 })
    }

    if (!stale?.length) {
      return NextResponse.json({ ok: true, updated: 0, date: today })
    }

    const ids = stale.map(s => s.id)

    const { error: updateErr, count } = await supabase
      .from('sales')
      .update({ payment_status: 'overdue' })
      .in('id', ids)

    if (updateErr) {
      console.error('[cron/overdue-update] update error:', updateErr)
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    // Audit log for each newly overdue sale — use actual prior status (may be 'partial')
    const auditRows = stale.map(s => ({
      company_id:    s.company_id,
      action:        'update',
      resource_type: 'sale',
      resource_id:   s.id,
      old_values:    { payment_status: s.payment_status },
      new_values:    { payment_status: 'overdue' },
      description:   `Otomatik gecikmiş işaretleme — vade ${s.due_date}`,
    }))

    await supabase.from('audit_logs').insert(auditRows)

    return NextResponse.json({
      ok:      true,
      updated: count ?? stale.length,
      date:    today,
    })
  } catch (e) {
    console.error('[cron/overdue-update]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

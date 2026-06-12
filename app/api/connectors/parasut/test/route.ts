// ── /api/connectors/parasut/test — read-only Paraşüt connection check ─────────
//
// Admin-gated. Calls the live Paraşüt adapter's healthCheck() + a 1-page invoice
// read to prove the connection works once PARASUT_* env credentials are set.
// READ-ONLY — fetches a few invoices, persists NOTHING. With no credentials it
// returns { ok:false } gracefully (NotConfiguredError), never 500s.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { requireAdmin } from '@/lib/require-role'
import { createAccountingConnector, NotConfiguredError } from '@/lib/connectors'

export async function POST(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase } = auth
  try { await requireAdmin(uid, companyId, supabase) }
  catch { return NextResponse.json({ error: 'Bu işlem için admin yetkisi gerekir' }, { status: 403 }) }

  const connector = createAccountingConnector('parasut')
  try {
    const health = await connector.healthCheck()
    if (!health.ok) return NextResponse.json({ ok: false, detail: health.detail ?? 'Bağlantı kurulamadı' })

    const page = await connector.listInvoices({ limit: 3 })
    const sample = page.items.slice(0, 3).map(i => ({
      no: i.invoice_no, date: i.issue_date, party: i.party?.name, total: i.total, currency: i.currency,
    }))
    return NextResponse.json({ ok: true, invoiceCount: page.items.length, sample })
  } catch (e) {
    if (e instanceof NotConfiguredError) return NextResponse.json({ ok: false, detail: e.message })
    return NextResponse.json({ ok: false, detail: e instanceof Error ? e.message : 'Bilinmeyen hata' })
  }
}

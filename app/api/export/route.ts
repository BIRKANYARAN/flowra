// ── /api/export — full company data export as JSON ────────────────────────────
// Returns a JSON blob the user can save as a backup.
// Rate-limited: 3 requests per 5 minutes per user.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import { rateLimit, rateLimitKey, rateLimitExceededResponse } from '@/lib/rate-limit'

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED', type: 'SECURITY' }, { status: 401 })
    const user = authData.user

    const uid = user.id

    // ── Rate limit: 3 exports per 5 minutes per user ─────────────────────────
    const rl = rateLimit(rateLimitKey(uid, req), 'export')
    if (!rl.allowed) {
      return NextResponse.json(rateLimitExceededResponse(rl), {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
      })
    }

    let companyId: string
    try { companyId = await resolveCompanyId(uid, supabase) }
    catch { return NextResponse.json({ error: 'Şirket bilgisi alınamadı', code: 'COMPANY_NOT_RESOLVED', type: 'SYSTEM' }, { status: 409 }) }

    const [
      settingsRes, customersRes, productsRes, banksRes,
      proformasRes, salesRes, expensesRes, stockRes,
    ] = await Promise.all([
      supabase.from('user_settings').select('*').eq('company_id', companyId)
        .order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('customers').select('*').eq('company_id', companyId).is('deleted_at', null),
      supabase.from('products').select('*').eq('company_id', companyId).is('deleted_at', null),
      supabase.from('company_banks').select('*').eq('company_id', companyId).is('deleted_at', null),
      supabase.from('proformas').select('*, proforma_items(*)').eq('company_id', companyId).is('deleted_at', null),
      supabase.from('sales').select('*, sale_items(*)').eq('company_id', companyId).is('deleted_at', null),
      supabase.from('expenses').select('*').eq('company_id', companyId).is('deleted_at', null),
      // Full backup export — ceiling 2000 covers realistic company history.
      // For very large inventories the user can run multiple exports by date range.
      supabase.from('stock_movements').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(2000),
    ])

    const payload = {
      version:    '1.0',
      exported_at: new Date().toISOString(),
      user_id:    uid,
      company_id: companyId,
      data: {
        settings:        settingsRes.data ?? null,
        customers:       customersRes.data ?? [],
        products:        productsRes.data ?? [],
        company_banks:   banksRes.data ?? [],
        proformas:       proformasRes.data ?? [],
        sales:           salesRes.data ?? [],
        expenses:        expensesRes.data ?? [],
        stock_movements: stockRes.data ?? [],
      },
    }

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type':        'application/json',
        'Content-Disposition': `attachment; filename="flowra-backup-${new Date().toISOString().slice(0,10)}.json"`,
      },
    })
  } catch (err) {
    console.error('[export]', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}

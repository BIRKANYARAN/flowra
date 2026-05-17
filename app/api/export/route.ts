// ── /api/export — full company data export as JSON ────────────────────────────
// Returns a JSON blob the user can save as a backup.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase, ctx } = auth

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
      supabase.from('stock_movements').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(500),
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

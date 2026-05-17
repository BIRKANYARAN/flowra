// ── /api/reset — wipe all demo data for current company ───────────────────────
// Cleans ALL company-owned data so the account behaves like a fresh user.
// Order matters: child rows first, then parent rows.
//
// SECURITY: Disabled in production unless ENABLE_RESET=true is set explicitly.
// This prevents accidental data loss if the endpoint is hit in prod.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-role'
import { resolveApiAuth } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  // Feature flag guard — must be explicitly enabled per environment
  if (process.env.ENABLE_RESET !== 'true') {
    return NextResponse.json(
      { error: 'This endpoint is disabled in this environment.', code: 'FORBIDDEN', type: 'SECURITY' },
      { status: 403 }
    )
  }

  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth
    try { await requireAdmin(uid, companyId, supabase) }
    catch { return NextResponse.json({ error: 'Bu işlem için admin yetkisi gerekir', code: 'FORBIDDEN', type: 'SECURITY' }, { status: 403 }) }

    const now = new Date().toISOString()
    const result: Record<string, string> = {}

    // 1. Hard-delete sale_items (no company_id — gate via parent sales)
    const { data: companySales } = await supabase
      .from('sales')
      .select('id')
      .eq('company_id', companyId)

    if (companySales && companySales.length > 0) {
      const saleIds = companySales.map((s: { id: string }) => s.id)
      const { error: siErr } = await supabase
        .from('sale_items')
        .delete()
        .in('sale_id', saleIds)
      result.sale_items = siErr ? `error: ${siErr.message}` : `deleted for ${saleIds.length} sales`
    } else {
      result.sale_items = 'skipped'
    }

    // 2. Soft-delete sales
    const { error: saleErr } = await supabase
      .from('sales')
      .update({ deleted_at: now })
      .eq('company_id', companyId)
      .is('deleted_at', null)
    result.sales = saleErr ? `error: ${saleErr.message}` : 'completed'

    // 3. Hard-delete proforma_items (no company_id — gate via parent proformas)
    const { data: companyProformas } = await supabase
      .from('proformas')
      .select('id')
      .eq('company_id', companyId)

    if (companyProformas && companyProformas.length > 0) {
      const ids = companyProformas.map((p: { id: string }) => p.id)
      const { error: itemErr } = await supabase
        .from('proforma_items')
        .delete()
        .in('proforma_id', ids)
      result.proforma_items = itemErr ? `error: ${itemErr.message}` : `deleted for ${ids.length} proformas`
    } else {
      result.proforma_items = 'skipped'
    }

    // 4. Soft-delete proformas
    const { error: prfErr } = await supabase
      .from('proformas')
      .update({ deleted_at: now })
      .eq('company_id', companyId)
      .is('deleted_at', null)
    result.proformas = prfErr ? `error: ${prfErr.message}` : 'completed'

    // 5. Hard-delete stock_movements (append-only ledger — no soft delete column)
    const { error: smErr } = await supabase
      .from('stock_movements')
      .delete()
      .eq('company_id', companyId)
    result.stock_movements = smErr ? `error: ${smErr.message}` : 'completed'

    // 6. Soft-delete customers
    const { error: custErr } = await supabase
      .from('customers')
      .update({ deleted_at: now })
      .eq('company_id', companyId)
      .is('deleted_at', null)
    result.customers = custErr ? `error: ${custErr.message}` : 'completed'

    // 7. Soft-delete company_banks
    const { error: bankErr } = await supabase
      .from('company_banks')
      .update({ deleted_at: now })
      .eq('company_id', companyId)
      .is('deleted_at', null)
    result.company_banks = bankErr ? `error: ${bankErr.message}` : 'completed'

    // 8. Soft-delete products
    const { error: prodErr } = await supabase
      .from('products')
      .update({ deleted_at: now })
      .eq('company_id', companyId)
      .is('deleted_at', null)
    result.products = prodErr ? `error: ${prodErr.message}` : 'completed'

    // 9. Soft-delete expenses
    const { error: expErr } = await supabase
      .from('expenses')
      .update({ deleted_at: now })
      .eq('company_id', companyId)
      .is('deleted_at', null)
    result.expenses = expErr ? `error: ${expErr.message}` : 'completed'

    // 10. Hard-delete idempotency_keys — user-personal table (keep user_id filter)
    const { error: idemErr } = await supabase
      .from('idempotency_keys')
      .delete()
      .eq('user_id', uid)
    result.idempotency_keys = idemErr ? `error: ${idemErr.message}` : 'completed'

    console.log('[reset] completed for company', companyId, 'user', uid, result)
    return NextResponse.json({ message: 'reset', ok: true, result })

  } catch (err) {
    console.error('[reset]', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Reset failed' }, { status: 500 })
  }
}

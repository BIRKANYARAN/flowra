// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/admin/journal-backfill
//
// Reports how many operational records (sales/expenses/purchases) exist vs how
// many have corresponding journal entries. Used to track backfill progress.
//
// Role guard: requires 'admin' role.
//
// Response:
//   {
//     operational_totals: { sales, expenses, purchases },
//     journaled_totals:   { sales, expenses, purchases },
//     voided_entries:     number,
//     backfill_complete:  boolean,
//     checked_at:         string,
//   }
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { requireAdmin }              from '@/lib/require-role'
import { AppError }                  from '@/types/errors'
import { getSystemAdminClient }      from '@/lib/admin-db'
import { computeBackfillStatus }     from '@/lib/admin/journal-backfill'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any

async function countTable(
  supabase:  AnySupabaseClient,
  table:     string,
  companyId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .is('deleted_at', null)
  if (error) {
    console.warn(`[journal-backfill] count error for ${table}:`, error.message)
    return 0
  }
  return count ?? 0
}

async function countJournaled(
  adminClient: AnySupabaseClient,
  companyId:   string,
  sourceType:  string,
): Promise<number> {
  const { count, error } = await adminClient
    .from('journal_entries')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('source_type', sourceType)
    .eq('is_voided', false)
  if (error) {
    console.warn(`[journal-backfill] count error for journal_entries[${sourceType}]:`, error.message)
    return 0
  }
  return count ?? 0
}

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    // Require admin role
    try {
      await requireAdmin(uid, companyId, supabase)
    } catch (err) {
      if (err instanceof AppError && err.code === 'FORBIDDEN') {
        return NextResponse.json({ error: err.message }, { status: 403 })
      }
      throw err
    }

    // Count operational records using user-scoped client (RLS applies)
    const [opSales, opExpenses, opPurchases] = await Promise.all([
      countTable(supabase, 'sales',     companyId),
      countTable(supabase, 'expenses',  companyId),
      countTable(supabase, 'purchases', companyId),
    ])

    // Count journaled entries using admin client (bypasses RLS for cross-table counts)
    const adminClient = getSystemAdminClient()
    const [jeSales, jeExpenses, jePurchases] = await Promise.all([
      countJournaled(adminClient, companyId, 'sale'),
      countJournaled(adminClient, companyId, 'expense'),
      countJournaled(adminClient, companyId, 'purchase'),
    ])

    // Count voided entries
    const { count: voidedCount } = await adminClient
      .from('journal_entries')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('is_voided', true)

    const operationalTotals = { sales: opSales, expenses: opExpenses, purchases: opPurchases }
    const journaledTotals   = { sales: jeSales, expenses: jeExpenses, purchases: jePurchases }

    const { backfill_complete } = computeBackfillStatus(operationalTotals, journaledTotals)

    return NextResponse.json({
      operational_totals: operationalTotals,
      journaled_totals:   journaledTotals,
      voided_entries:     voidedCount ?? 0,
      backfill_complete,
      checked_at:         new Date().toISOString(),
    })
  } catch (e) {
    console.error('[journal-backfill] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

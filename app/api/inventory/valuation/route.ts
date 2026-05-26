// ─────────────────────────────────────────────────────────────────────────────
// GET /api/inventory/valuation
//
// FIFO inventory valuation report — lot aging, product summaries, low-stock.
// Auth: any member. No date params needed (reports as of today).
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }             from '@/lib/api-auth'
import { InventoryValuationService }  from '@/lib/services/inventory/inventory-valuation.service'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  try {
    const report = await InventoryValuationService.getReport(companyId, supabase)
    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

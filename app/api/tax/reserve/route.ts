// ── GET /api/tax/reserve ───────────────────────────────────────────────────────
//
// Returns a TaxReserveReport: all upcoming tax obligations and cash reserve
// coverage for the authenticated company.
//
// Auth: any authenticated member (any role).
// Cache: revalidate every 5 minutes.
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { TaxReserveService } from '@/lib/services/tax/tax-reserve.service'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  const sp    = req.nextUrl.searchParams
  const today = sp.get('today') ?? new Date().toISOString().slice(0, 10)

  // Validate today format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    return NextResponse.json(
      { error: 'today parametresi YYYY-MM-DD formatında olmalı', code: 'VALIDATION_ERROR' },
      { status: 422 },
    )
  }

  try {
    const report = await TaxReserveService.buildReport(companyId, supabase, today)
    return NextResponse.json({ report })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[tax/reserve] error:', msg)
    return NextResponse.json(
      { error: 'Vergi rezervi hesaplanamadı', detail: msg, code: 'INTERNAL_ERROR' },
      { status: 500 },
    )
  }
}

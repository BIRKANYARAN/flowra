// ── GET /api/tax/calendar ──────────────────────────────────────────────────────
//
// Returns TaxCalendar: next 12 months of Turkish tax obligations.
//
// Query params:
//   today=YYYY-MM-DD   (optional, defaults to current date)
//   horizon=12         (optional, number of months, max 24)
//
// Auth: any authenticated member.
// ──────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { TaxCalendarService } from '@/lib/services/tax/tax-calendar.service'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase } = auth

  const sp      = req.nextUrl.searchParams
  const today   = sp.get('today') ?? new Date().toISOString().slice(0, 10)
  const horizon = Math.min(24, Math.max(1, parseInt(sp.get('horizon') ?? '12', 10) || 12))

  // Validate today format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    return NextResponse.json(
      { error: 'today parametresi YYYY-MM-DD formatında olmalı', code: 'VALIDATION_ERROR' },
      { status: 422 },
    )
  }

  try {
    const calendar = await TaxCalendarService.getCalendar(companyId, uid, supabase, { today, horizon })
    return NextResponse.json(calendar)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[tax/calendar] error:', msg)
    return NextResponse.json(
      { error: 'Vergi takvimi hesaplanamadı', detail: msg, code: 'INTERNAL_ERROR' },
      { status: 500 },
    )
  }
}

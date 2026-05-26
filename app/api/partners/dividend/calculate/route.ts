// ── POST /api/partners/dividend/calculate ─────────────────────────────────────
//
// Computes a DividendCalculation with TTK 509/519 compliance checks.
//
// Request body:
//   { gross_dividend_try: number }
//
// Auth: admin only.
// ──────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { requireAdmin } from '@/lib/require-role'
import { DividendService } from '@/lib/services/pcle/dividend.service'

export async function POST(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase } = auth

  // Admin only — dividend declarations are financial events
  try { await requireAdmin(uid, companyId, supabase) }
  catch {
    return NextResponse.json(
      { error: 'Temettü hesabı için admin yetkisi gerekir', code: 'FORBIDDEN' },
      { status: 403 },
    )
  }

  let body: { gross_dividend_try?: unknown }
  try { body = await req.json() }
  catch {
    return NextResponse.json(
      { error: 'Geçersiz JSON', code: 'VALIDATION_ERROR' },
      { status: 422 },
    )
  }

  const gross = Number(body.gross_dividend_try)
  if (!isFinite(gross) || gross <= 0) {
    return NextResponse.json(
      { error: 'gross_dividend_try sıfırdan büyük bir sayı olmalı', code: 'VALIDATION_ERROR' },
      { status: 422 },
    )
  }

  try {
    const calculation = await DividendService.calculate(companyId, uid, supabase, gross)
    return NextResponse.json(calculation)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[dividend/calculate] error:', msg)
    return NextResponse.json(
      { error: 'Temettü hesabı yapılamadı', detail: msg, code: 'INTERNAL_ERROR' },
      { status: 500 },
    )
  }
}

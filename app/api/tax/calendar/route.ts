// ── GET /api/tax/calendar ──────────────────────────────────────────────────────
//
// Returns TaxCalendarReport: all Turkish tax obligations for the given year.
//
// Query params:
//   year=2026          (optional, defaults to current year)
//   today=YYYY-MM-DD   (optional, defaults to current date)
//   horizon=12         (optional, number of months for rolling view, max 24)
//
// Auth: any authenticated member.
// Cache: revalidate every 3600 seconds (deadlines don't change).
// ──────────────────────────────────────────────────────────────────────────────

export const revalidate = 3600

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import {
  TaxCalendarService,
  TaxCalendarReportService,
} from '@/lib/services/tax/tax-calendar.service'
import { REQUEST_ID_HEADER } from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  const sp      = req.nextUrl.searchParams
  const today   = sp.get('today') ?? new Date().toISOString().slice(0, 10)
  const yearRaw = sp.get('year')
  const horizon = Math.min(24, Math.max(1, parseInt(sp.get('horizon') ?? '12', 10) || 12))

  // Validate today format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    return NextResponse.json(
      { error: 'today parametresi YYYY-MM-DD formatında olmalı', code: 'VALIDATION_ERROR' },
      { status: 422, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }

  const year = yearRaw ? parseInt(yearRaw, 10) : new Date(today).getFullYear()

  if (isNaN(year) || year < 2020 || year > 2099) {
    return NextResponse.json(
      { error: 'year parametresi geçersiz', code: 'VALIDATION_ERROR' },
      { status: 422, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }

  try {
    // If year param explicitly provided, return TaxCalendarReport
    if (yearRaw) {
      const report = await TaxCalendarReportService.buildReport(
        companyId, uid, supabase, year, today,
      )
      return NextResponse.json(
        { report },
        { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
      )
    }

    // Default: rolling calendar (legacy behaviour)
    const calendar = await TaxCalendarService.getCalendar(companyId, uid, supabase, { today, horizon })
    return NextResponse.json(
      calendar,
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[tax/calendar] error:', msg)
    return NextResponse.json(
      { error: 'Vergi takvimi hesaplanamadı', detail: msg, code: 'INTERNAL_ERROR' },
      { status: 500, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }
}

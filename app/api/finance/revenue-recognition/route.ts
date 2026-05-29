// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/revenue-recognition
//
// Returns revenue recognition report: accrual vs cash basis comparison,
// deferred revenue, monthly recognition trend, and collection lag.
//
// Query params:
//   ?method=accrual_basis|cash_basis  (default: accrual_basis)
//
// Auth: resolveApiAuth, manager+
// Cache: revalidate every 1800 seconds
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 1800

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import {
  RevenueRecognitionService,
  type RecognitionMethod,
} from '@/lib/services/finance/revenue-recognition.service'
import { REQUEST_ID_HEADER } from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  const methodRaw = req.nextUrl.searchParams.get('method') ?? 'accrual_basis'

  if (methodRaw !== 'accrual_basis' && methodRaw !== 'cash_basis') {
    return NextResponse.json(
      {
        error: 'Invalid method. Expected accrual_basis or cash_basis.',
        code:  'INVALID_PARAM',
        type:  'CLIENT',
      },
      { status: 400, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }

  const method = methodRaw as RecognitionMethod

  try {
    const service = new RevenueRecognitionService(supabase)
    const report  = await service.getReport(companyId, method)

    return NextResponse.json(
      { report },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: msg, code: 'SERVICE_ERROR', type: 'SYSTEM' },
      { status: 500, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }
}

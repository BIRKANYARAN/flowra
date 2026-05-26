// ═══════════════════════════════════════════════════════════════════════════════
// GET  /api/bank-reconciliation?from=YYYY-MM-DD&to=YYYY-MM-DD  — get report
// POST /api/bank-reconciliation                                  — import lines
//
// Auth:
//   GET  — any company member
//   POST — admin only
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }              from '@/lib/api-auth'
import { reqCtx, apiError }            from '@/lib/api-utils'
import { requireAdmin }                from '@/lib/require-role'
import { BankReconciliationService }   from '@/lib/services/finance/reconciliation.service'
import { AppError }                    from '@/types/errors'

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { companyId, supabase } = auth

    const params = req.nextUrl.searchParams
    const from   = params.get('from')
    const to     = params.get('to')

    if (!from || !to) {
      return apiError(ctx, "Zorunlu parametreler eksik: 'from' ve 'to' (YYYY-MM-DD)", 422, 'MISSING_PARAMS', 'BUSINESS')
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return apiError(ctx, "Geçersiz tarih formatı. YYYY-MM-DD kullanın.", 422, 'INVALID_DATE', 'BUSINESS')
    }

    const report = await BankReconciliationService.getReport(companyId, supabase, { from, to })
    return NextResponse.json(report)
  } catch (e) {
    console.error('[bank-reconciliation GET]', e)
    return apiError(ctx, 'Banka mutabakat raporu alınamadı', 500)
  }
}

export async function POST(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    try { await requireAdmin(uid, companyId, supabase) }
    catch (e) {
      if (e instanceof AppError && e.code === 'FORBIDDEN') {
        return apiError(ctx, 'Bu işlem için admin yetkisi gereklidir.', 403, 'FORBIDDEN', 'SECURITY')
      }
      throw e
    }

    const body = await req.json()
    const { lines } = body as { lines?: unknown[] }

    if (!Array.isArray(lines) || lines.length === 0) {
      return apiError(ctx, "'lines' dizisi zorunludur ve boş olmamalıdır.", 422, 'MISSING_LINES', 'BUSINESS')
    }

    const result = await BankReconciliationService.importLines(
      companyId,
      uid,
      supabase,
      lines as Parameters<typeof BankReconciliationService.importLines>[3],
    )

    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    console.error('[bank-reconciliation POST]', e)
    return apiError(ctx, 'Banka ekstresi satırları içe aktarılamadı', 500)
  }
}

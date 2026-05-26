// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/bank-reconciliation/[id]/match
//
// Confirm a match for a bank statement line (manual or auto).
// Body: { resource_type: string, resource_id: string }
// Auth: admin only
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse }   from 'next/server'
import { resolveApiAuth }              from '@/lib/api-auth'
import { reqCtx, apiError }            from '@/lib/api-utils'
import { requireAdmin }                from '@/lib/require-role'
import { BankReconciliationService }   from '@/lib/services/finance/reconciliation.service'
import { AppError }                    from '@/types/errors'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

    const { id: bankLineId } = await params
    const body = await req.json()
    const { resource_type, resource_id } = body as { resource_type?: string; resource_id?: string }

    if (!resource_type || !resource_id) {
      return apiError(ctx, "'resource_type' ve 'resource_id' zorunludur.", 422, 'MISSING_FIELDS', 'BUSINESS')
    }

    await BankReconciliationService.confirmMatch(
      bankLineId,
      companyId,
      uid,
      resource_type,
      resource_id,
      supabase,
    )

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[bank-reconciliation match]', e)
    return apiError(ctx, 'Eşleştirme kaydedilemedi', 500)
  }
}

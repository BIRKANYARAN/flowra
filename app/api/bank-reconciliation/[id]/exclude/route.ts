// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/bank-reconciliation/[id]/exclude
//
// Exclude a bank statement line from reconciliation (e.g., bank fees).
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

    await BankReconciliationService.excludeLine(bankLineId, companyId, uid, supabase)

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[bank-reconciliation exclude]', e)
    return apiError(ctx, 'Satır dışarıda bırakılamadı', 500)
  }
}

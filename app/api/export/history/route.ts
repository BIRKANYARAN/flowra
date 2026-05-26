import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { reqCtx, apiError } from '@/lib/api-utils'
import { ExportLogService } from '@/lib/services/export/export-log.service'

export const dynamic = 'force-dynamic'

// ── GET /api/export/history ───────────────────────────────────────────────────
// List past export log entries. Admin-only.

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    // ── Admin check ───────────────────────────────────────────────────────────
    const { data: membership, error: memberError } = await supabase
      .from('company_members')
      .select('role')
      .eq('company_id', companyId)
      .eq('user_id', uid)
      .single()

    if (memberError || !membership) {
      return apiError(ctx, 'Şirket üyeliği bulunamadı', 403, 'FORBIDDEN')
    }
    if (membership.role !== 'admin') {
      return apiError(ctx, 'Bu işlem için yönetici yetkisi gereklidir', 403, 'FORBIDDEN')
    }

    const entries = await ExportLogService.list(companyId, supabase)

    return NextResponse.json({ entries })
  } catch (e) {
    console.error('[export/history GET]', e)
    return apiError(ctx, 'Dışa aktarma geçmişi alınamadı', 500, 'DB_READ_FAILED')
  }
}

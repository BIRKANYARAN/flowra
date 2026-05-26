import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { reqCtx, apiError } from '@/lib/api-utils'
import { CertifiedExportService } from '@/lib/services/export/certified-export.service'
import { ExportLogService } from '@/lib/services/export/export-log.service'

export const dynamic = 'force-dynamic'

// ── GET /api/export/certified?from=YYYY-MM-DD&to=YYYY-MM-DD ──────────────────
// Generate a certified export package. Admin-only.

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

    // ── Parse period params ───────────────────────────────────────────────────
    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    if (!from || !to) {
      return apiError(ctx, '"from" ve "to" parametreleri gereklidir (YYYY-MM-DD)', 400, 'INVALID_PARAMS')
    }

    const datePattern = /^\d{4}-\d{2}-\d{2}$/
    if (!datePattern.test(from) || !datePattern.test(to)) {
      return apiError(ctx, 'Geçersiz tarih formatı. YYYY-MM-DD kullanın', 400, 'INVALID_PARAMS')
    }

    if (from > to) {
      return apiError(ctx, '"from" tarihi "to" tarihinden önce olmalıdır', 400, 'INVALID_PARAMS')
    }

    // ── Generate export ───────────────────────────────────────────────────────
    const exportPackage = await CertifiedExportService.generate(
      uid,
      companyId,
      from,
      to,
      supabase,
    )

    // ── Log to export_logs ────────────────────────────────────────────────────
    await ExportLogService.log(
      companyId,
      uid,
      exportPackage.manifest.export_id,
      { from, to },
      exportPackage.manifest.checksum,
      exportPackage.manifest.sections,
      exportPackage.manifest.record_counts,
      supabase,
    )

    return NextResponse.json(exportPackage)
  } catch (e) {
    console.error('[export/certified GET]', e)
    return apiError(ctx, 'Sertifikalı dışa aktarma oluşturulamadı', 500, 'EXPORT_FAILED')
  }
}

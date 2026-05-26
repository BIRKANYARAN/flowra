export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { reqCtx, apiError }          from '@/lib/api-utils'
import { DocumentService }           from '@/lib/services/documents/document.service'

// ── GET — document summary for the company ────────────────────────────────────
export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { companyId, supabase } = auth

    const summary = await DocumentService.getSummary(companyId, supabase)
    return NextResponse.json({ summary })
  } catch (e) {
    console.error('[documents/summary GET]', e)
    return apiError(ctx, 'Belge özeti alınamadı', 500, 'DB_READ_FAILED')
  }
}

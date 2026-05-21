// ═══════════════════════════════════════════════════════════════════════════════
// app/api/reconciliation/snapshots/[id]/route.ts
//
// GET — get single snapshot with signoffs joined
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { reqCtx, apiError } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { companyId, supabase } = auth

    const { id } = params

    const { data, error } = await supabase
      .from('reconciliation_snapshots')
      .select(`
        *,
        reconciliation_signoffs (
          id, partner_id, partner_name, ownership_pct,
          status, signed_at, comments, created_at
        )
      `)
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle()

    if (error) throw error

    if (!data) {
      return NextResponse.json(
        { error: 'Mutabakat bulunamadı', code: 'NOT_FOUND' },
        { status: 404 },
      )
    }

    return NextResponse.json({ snapshot: data })
  } catch (e) {
    console.error('[reconciliation/snapshots/:id GET]', e)
    return apiError(ctx, 'Mutabakat alınamadı', 500, 'DB_READ_FAILED')
  }
}

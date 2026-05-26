export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { reqCtx, apiError }          from '@/lib/api-utils'
import { DocumentService }           from '@/lib/services/documents/document.service'

// ── POST — mark document as verified (admin only) ────────────────────────────
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    // Check admin role
    const { data: member, error: roleErr } = await supabase
      .from('company_members')
      .select('role')
      .eq('company_id', companyId)
      .eq('user_id', uid)
      .maybeSingle()

    if (roleErr) throw roleErr
    if (!member || member.role !== 'admin') {
      return NextResponse.json(
        { error: 'Bu işlem için yönetici yetkisi gereklidir', code: 'FORBIDDEN', type: 'SECURITY' },
        { status: 403 },
      )
    }

    await DocumentService.verify(params.id, companyId, uid, supabase)
    return NextResponse.json({ verified: true })
  } catch (e) {
    console.error('[documents/[id]/verify POST]', e)
    return apiError(ctx, 'Belge doğrulanamadı', 500, 'DB_WRITE_FAILED')
  }
}

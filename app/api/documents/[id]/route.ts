export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { reqCtx, apiError }          from '@/lib/api-utils'
import { DocumentService }           from '@/lib/services/documents/document.service'

// ── GET — single document ─────────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { companyId, supabase } = auth

    const { data, error } = await supabase
      .from('company_documents')
      .select('*')
      .eq('id', params.id)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle()

    if (error) throw error
    if (!data) {
      return NextResponse.json({ error: 'Belge bulunamadı', code: 'NOT_FOUND', type: 'BUSINESS' }, { status: 404 })
    }

    return NextResponse.json({ document: data })
  } catch (e) {
    console.error('[documents/[id] GET]', e)
    return apiError(ctx, 'Belge alınamadı', 500, 'DB_READ_FAILED')
  }
}

// ── DELETE — soft delete (admin only) ────────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
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
      return NextResponse.json({ error: 'Bu işlem için yönetici yetkisi gereklidir', code: 'FORBIDDEN', type: 'SECURITY' }, { status: 403 })
    }

    await DocumentService.softDelete(params.id, companyId, supabase)
    return NextResponse.json({ deleted: true })
  } catch (e) {
    console.error('[documents/[id] DELETE]', e)
    return apiError(ctx, 'Belge silinemedi', 500, 'DB_WRITE_FAILED')
  }
}

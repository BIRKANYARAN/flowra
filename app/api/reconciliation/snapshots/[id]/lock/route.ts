// ═══════════════════════════════════════════════════════════════════════════════
// app/api/reconciliation/snapshots/[id]/lock/route.ts
//
// POST — admin only, makes snapshot immutable
//   - Sets is_immutable = true
//   - Sets immutable_at = now()
//   - Returns updated snapshot
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { reqCtx, apiError } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    const { id: snapshotId } = params

    // Admin-only
    const { data: member } = await supabase
      .from('company_members')
      .select('role')
      .eq('company_id', companyId)
      .eq('user_id', uid)
      .is('deleted_at', null)
      .maybeSingle()

    if (member?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Bu işlem için yönetici yetkisi gereklidir.', code: 'FORBIDDEN' },
        { status: 403 },
      )
    }

    // Verify snapshot exists and belongs to this company
    const { data: snapshot, error: snapError } = await supabase
      .from('reconciliation_snapshots')
      .select('id, company_id, is_immutable, status')
      .eq('id', snapshotId)
      .eq('company_id', companyId)
      .maybeSingle()

    if (snapError || !snapshot) {
      return NextResponse.json(
        { error: 'Mutabakat bulunamadı', code: 'NOT_FOUND' },
        { status: 404 },
      )
    }

    if (snapshot.is_immutable) {
      return NextResponse.json(
        { error: 'Bu mutabakat zaten kilitlenmiştir.', code: 'ALREADY_IMMUTABLE' },
        { status: 409 },
      )
    }

    // Lock the snapshot
    const { data: updated, error: lockError } = await supabase
      .from('reconciliation_snapshots')
      .update({
        is_immutable: true,
        immutable_at: new Date().toISOString(),
      })
      .eq('id', snapshotId)
      .select('*')
      .single()

    if (lockError || !updated) {
      console.error('[reconciliation/snapshots/:id/lock POST] lock error:', lockError)
      return apiError(ctx, 'Mutabakat kilitlenemedi', 500, 'LOCK_FAILED')
    }

    return NextResponse.json({ snapshot: updated })
  } catch (e) {
    console.error('[reconciliation/snapshots/:id/lock POST]', e)
    return apiError(ctx, 'Kilit işlemi başarısız', 500, 'LOCK_FAILED')
  }
}

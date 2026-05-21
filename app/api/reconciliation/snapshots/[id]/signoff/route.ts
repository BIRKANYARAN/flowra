// ═══════════════════════════════════════════════════════════════════════════════
// app/api/reconciliation/snapshots/[id]/signoff/route.ts
//
// POST — record a signoff
//   Body: { status: 'approved' | 'rejected', comments?: string }
//   - Resolves the requesting user's partner row
//   - Updates reconciliation_signoffs for that partner
//   - If all signoffs approved: update snapshot status to 'approved'
//   - If snapshot is_immutable: block updates
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

    // Parse body
    const body = await req.json().catch(() => ({}))
    const signoffStatus: 'approved' | 'rejected' = body.status
    const comments: string | null = body.comments ?? null

    if (signoffStatus !== 'approved' && signoffStatus !== 'rejected') {
      return NextResponse.json(
        { error: 'status alanı "approved" veya "rejected" olmalıdır.', code: 'INVALID_INPUT' },
        { status: 400 },
      )
    }

    // Fetch snapshot — verify it belongs to this company and is not immutable
    const { data: snapshot, error: snapError } = await supabase
      .from('reconciliation_snapshots')
      .select('id, company_id, is_immutable, status, approver_count')
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
        { error: 'Bu mutabakat kilitlenmiştir ve değiştirilemez.', code: 'SNAPSHOT_IMMUTABLE' },
        { status: 409 },
      )
    }

    // Resolve the user's partner row in this company
    // A user may be linked to a partner via email match or explicit partner_id in company_members
    const { data: { user } } = await supabase.auth.getUser()
    const userEmail = user?.email ?? ''

    // Try to find a matching signoff row by email match on partners table
    const { data: partner } = await supabase
      .from('partners')
      .select('id, name')
      .eq('company_id', companyId)
      .ilike('email', userEmail)
      .is('deleted_at', null)
      .maybeSingle()

    // Find the signoff row for this partner (by partner_id if available, else by email-name match)
    let signoffQuery = supabase
      .from('reconciliation_signoffs')
      .select('id, status')
      .eq('snapshot_id', snapshotId)
      .eq('company_id', companyId)

    if (partner?.id) {
      signoffQuery = signoffQuery.eq('partner_id', partner.id)
    } else if (partner?.name) {
      signoffQuery = signoffQuery.eq('partner_name', partner.name)
    } else {
      // Fall back: user is an admin signing off on behalf — find any pending signoff
      // and require admin role for this path
      const { data: memberCheck } = await supabase
        .from('company_members')
        .select('role')
        .eq('company_id', companyId)
        .eq('user_id', uid)
        .maybeSingle()

      if (memberCheck?.role !== 'admin') {
        return NextResponse.json(
          { error: 'Bu kullanıcıya ait ortak kaydı bulunamadı.', code: 'PARTNER_NOT_FOUND' },
          { status: 403 },
        )
      }

      // Admin signs first pending signoff for their own name — match by user settings name
      signoffQuery = signoffQuery.eq('status', 'pending')
    }

    const { data: signoffRow, error: signoffFindError } = await signoffQuery.maybeSingle()

    if (signoffFindError || !signoffRow) {
      return NextResponse.json(
        { error: 'Bu mutabakatta imzalanacak kayıt bulunamadı.', code: 'SIGNOFF_NOT_FOUND' },
        { status: 404 },
      )
    }

    // Update the signoff row
    const ip        = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? null
    const userAgent = req.headers.get('user-agent') ?? null

    const { error: updateError } = await supabase
      .from('reconciliation_signoffs')
      .update({
        status:     signoffStatus,
        signed_at:  new Date().toISOString(),
        comments,
        ip_address: ip,
        user_agent: userAgent,
      })
      .eq('id', signoffRow.id)

    if (updateError) throw updateError

    // Check if all signoffs are now complete — if so, mark snapshot approved
    const { data: allSignoffs } = await supabase
      .from('reconciliation_signoffs')
      .select('status')
      .eq('snapshot_id', snapshotId)

    const allApproved = (allSignoffs ?? []).every((s: { status: string }) => s.status === 'approved')
    const completedCount = (allSignoffs ?? []).filter((s: { status: string }) => s.status !== 'pending').length

    const snapshotUpdates: Record<string, unknown> = { signoff_count: completedCount }
    if (allApproved) snapshotUpdates.status = 'approved'

    await supabase
      .from('reconciliation_snapshots')
      .update(snapshotUpdates)
      .eq('id', snapshotId)

    return NextResponse.json({
      ok:              true,
      signoff_status:  signoffStatus,
      all_approved:    allApproved,
      completed_count: completedCount,
    })
  } catch (e) {
    console.error('[reconciliation/snapshots/:id/signoff POST]', e)
    return apiError(ctx, 'İmza kaydedilemedi', 500, 'SIGNOFF_FAILED')
  }
}

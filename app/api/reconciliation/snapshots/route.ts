// ═══════════════════════════════════════════════════════════════════════════════
// app/api/reconciliation/snapshots/route.ts
//
// GET  — list snapshots for company (last 12, newest first)
// POST — create new snapshot (admin only)
//   Body: { reconciliation_date: string, title?: string }
//   1. Call ReconciliationEngine.compute()
//   2. Insert to reconciliation_snapshots
//   3. Insert reconciliation_signoffs rows for each active partner
//   4. Return created snapshot
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { reqCtx, apiError } from '@/lib/api-utils'
import { ReconciliationEngine } from '@/lib/engines/reconciliation.engine'

export const dynamic = 'force-dynamic'

// ── GET /api/reconciliation/snapshots ─────────────────────────────────────────

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { companyId, supabase } = auth

    const { data, error } = await supabase
      .from('reconciliation_snapshots')
      .select(`
        id, company_id, created_by, created_at,
        reconciliation_date, title, period_label, status,
        data_hash, is_immutable, immutable_at,
        confidence_score, approver_count, signoff_count,
        reconciliation_signoffs ( id, partner_name, ownership_pct, status, signed_at )
      `)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(12)

    if (error) throw error

    return NextResponse.json({ snapshots: data ?? [] })
  } catch (e) {
    console.error('[reconciliation/snapshots GET]', e)
    return apiError(ctx, 'Mutabakat listeleme başarısız', 500, 'DB_READ_FAILED')
  }
}

// ── POST /api/reconciliation/snapshots ────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

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

    const body = await req.json().catch(() => ({}))
    const reconciliationDate: string = body.reconciliation_date ?? new Date().toISOString().slice(0, 10)
    const title: string = body.title ?? 'Ortaklar Kurulu Mutabakat Dosyası'

    // Resolve the user's email for the management declaration
    const { data: { user } } = await supabase.auth.getUser()
    const createdByEmail = user?.email ?? 'yönetim'

    // Compute all 19 sections
    const reconData = await ReconciliationEngine.compute(
      uid,
      companyId,
      reconciliationDate,
      supabase,
      createdByEmail,
    )

    // Run Phase 3 engines
    const { runValidation, buildShareholderPositions, buildExecutiveSummary, buildConfidenceV2 } = await import('@/lib/engines/reconciliation.engine')
    const validation = runValidation(reconData)
    const confidenceV2 = buildConfidenceV2(reconData, validation)
    const shareholderPositions = buildShareholderPositions(reconData, reconciliationDate)
    const executiveSummary = buildExecutiveSummary(reconData, validation, confidenceV2)

    // Store computed metadata alongside sections
    const enrichedSections = {
      ...reconData,
      _validation: validation,
      _confidence_v2: confidenceV2,
      _shareholder_positions: shareholderPositions,
      _executive_summary: executiveSummary,
    }

    // Build period_label from the date
    const periodLabel = reconciliationDate.slice(0, 7)

    // Insert snapshot
    const { data: snapshot, error: insertError } = await supabase
      .from('reconciliation_snapshots')
      .insert({
        company_id:          companyId,
        created_by:          uid,
        reconciliation_date: reconciliationDate,
        title,
        period_label:        periodLabel,
        status:              'draft',
        sections:            enrichedSections,
        data_hash:           reconData.data_hash,
        confidence_score:    reconData.confidence_score,
        confidence_factors:  reconData.confidence_factors,
        governance_findings: reconData.section16.findings,
        signoff_count:       0,
        approver_count:      reconData.section19.required_count,
      })
      .select('*')
      .single()

    if (insertError || !snapshot) {
      console.error('[reconciliation/snapshots POST] insert error:', insertError)
      return apiError(ctx, 'Mutabakat kaydedilemedi', 500, 'DB_WRITE_FAILED')
    }

    // Insert signoff rows for each active partner
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const signoffRows = (reconData.section19.signoffs as any[]).map((s: {
      partner_name:  string
      ownership_pct: number
    }) => ({
      snapshot_id:   snapshot.id,
      company_id:    companyId,
      partner_name:  s.partner_name,
      ownership_pct: s.ownership_pct,
      status:        'pending',
    }))

    if (signoffRows.length > 0) {
      const { error: signoffError } = await supabase
        .from('reconciliation_signoffs')
        .insert(signoffRows)

      if (signoffError) {
        console.warn('[reconciliation/snapshots POST] signoff insert warning:', signoffError)
        // Non-fatal — snapshot was created, signoffs can be created later
      }
    }

    return NextResponse.json({ snapshot }, { status: 201 })
  } catch (e) {
    console.error('[reconciliation/snapshots POST]', e)
    return apiError(ctx, 'Mutabakat oluşturulamadı', 500, 'RECON_CREATE_FAILED')
  }
}

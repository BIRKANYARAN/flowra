// ─────────────────────────────────────────────────────────────────────────────
// GET /api/financial-statements/balance-sheet/verify
//
// Admin-only invariant verification endpoint.
// Computes both GL-based and operational balance sheets, then compares them.
// Useful for spotting divergence between dual-write GL and the operational
// snapshot.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { requireAdmin } from '@/lib/require-role'
import { GLBalanceSheetService } from '@/lib/services/ledger/gl-balance-sheet.service'
import { BalanceSheetService } from '@/lib/services/balance-sheet.service'
import { round2 } from '@/lib/calc'
import { AppError } from '@/types/errors'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    await requireAdmin(uid, companyId, supabase)

    const asOf    = req.nextUrl.searchParams.get('as_of') ?? new Date().toISOString().slice(0, 10)

    // Compute GL-based balance sheet
    const gl = await GLBalanceSheetService.compute(companyId, supabase, { asOf })

    // Shadow mode: GL has no entries at all
    const glHasEntries = (
      gl.total_assets_try !== 0 ||
      gl.total_liabilities_try !== 0 ||
      gl.total_equity_try !== 0
    )

    if (!glHasEntries) {
      return NextResponse.json({
        gl_mode:              'shadow',
        gl_balanced:          true,
        gl_imbalance_try:     0,
        operational_vs_gl: {
          assets_delta_try:      0,
          liabilities_delta_try: 0,
          equity_delta_try:      0,
        },
        divergence_significant: false,
        note:                 'GL modu shadow — karşılaştırma için journal entry yok',
        computed_at:          new Date().toISOString(),
      })
    }

    // Compute operational balance sheet
    const op = await BalanceSheetService.compute(uid, companyId, asOf, supabase)

    const assetsDelta      = round2(gl.total_assets_try      - op.assets.total_assets_try)
    const liabilitiesDelta = round2(gl.total_liabilities_try - op.liabilities.total_liabilities_try)
    const equityDelta      = round2(gl.total_equity_try      - op.equity.total_equity_try)

    const divergenceSignificant =
      Math.abs(assetsDelta) > 1000 ||
      Math.abs(liabilitiesDelta) > 1000 ||
      Math.abs(equityDelta) > 1000

    const note = divergenceSignificant
      ? `GL ve operasyonel bilanço arasında önemli fark var — çift yazım kontrolü gerekiyor.`
      : gl.is_balanced
        ? 'Dengeli — GL ve operasyonel bilanço tutarlı.'
        : `GL ${gl.imbalance_try.toFixed(2)} TL dengesizlik içeriyor.`

    return NextResponse.json({
      gl_mode:              'active',
      gl_balanced:          gl.is_balanced,
      gl_imbalance_try:     gl.imbalance_try,
      operational_vs_gl: {
        assets_delta_try:      assetsDelta,
        liabilities_delta_try: liabilitiesDelta,
        equity_delta_try:      equityDelta,
      },
      divergence_significant: divergenceSignificant,
      note,
      computed_at:          new Date().toISOString(),
    })
  } catch (e) {
    if (e instanceof AppError && e.code === 'FORBIDDEN') {
      return NextResponse.json(
        { error: e.message, code: 'FORBIDDEN' },
        { status: 403 },
      )
    }
    console.error('[financial-statements/balance-sheet/verify] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

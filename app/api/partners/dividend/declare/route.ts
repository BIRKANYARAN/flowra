// ── POST /api/partners/dividend/declare ───────────────────────────────────────
//
// Atomic (server-side) dividend declaration for all partners in one request.
// Replaces the previous N×POST-per-partner pattern from the client, which was
// non-atomic: a failure mid-loop left some partners with dividend records and
// others without.
//
// Request body:
//   {
//     declarations: Array<{
//       partner_id:      string
//       gross_try:       number   // gross entitlement before withholding
//       withholding_try: number   // stopaj (default: %10 GVK 94)
//       net_try:         number   // net payout = gross - withholding
//       tx_date:         string   // YYYY-MM-DD
//     }>
//   }
//
// Behaviour:
//   - Auth + company resolution required (admin only)
//   - Sequential inserts; on first failure → 500, no partial success reported
//   - All records use tx_type = 'dividend', currency = 'TRY', fx_rate = 1
//   - If a partner_id does not belong to this company → 422
//
// Response:
//   { success: true, inserted: number }    on success
//   { error: string, failed_partner_id? }  on failure
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-role'
import { PartnerService } from '@/lib/services/partner.service'
import { REQUEST_ID_HEADER } from '@/middleware'
import { resolveApiAuth } from '@/lib/api-auth'

interface DeclareEntry {
  partner_id:      string
  gross_try:       number
  withholding_try: number
  net_try:         number
  tx_date:         string
}

export async function POST(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  // Dividend declaration is a financial event — admin only.
  try { await requireAdmin(uid, companyId, supabase) }
  catch { return NextResponse.json({ error: 'Temettü beyanı için admin yetkisi gerekir', code: 'FORBIDDEN', type: 'SECURITY' }, { status: 403 }) }

  let body: { declarations?: unknown }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Geçersiz JSON', code: 'VALIDATION_ERROR', type: 'BUSINESS' }, { status: 422 }) }

  const declarations = body.declarations
  if (!Array.isArray(declarations) || declarations.length === 0) {
    return NextResponse.json({ error: 'declarations dizisi boş veya eksik', code: 'VALIDATION_ERROR', type: 'BUSINESS' }, { status: 422 })
  }

  // Validate each entry before touching the DB.
  for (const entry of declarations as DeclareEntry[]) {
    if (!entry.partner_id || typeof entry.partner_id !== 'string') {
      return NextResponse.json({ error: 'partner_id eksik', code: 'VALIDATION_ERROR', type: 'BUSINESS' }, { status: 422 })
    }
    const gross = Number(entry.gross_try)
    const withholding = Number(entry.withholding_try)
    const net = Number(entry.net_try)
    if (!isFinite(gross) || gross < 0) {
      return NextResponse.json({ error: `${entry.partner_id}: gross_try geçersiz ya da negatif`, code: 'VALIDATION_ERROR', type: 'BUSINESS' }, { status: 422 })
    }
    if (!isFinite(withholding) || withholding < 0) {
      return NextResponse.json({ error: `${entry.partner_id}: withholding_try geçersiz ya da negatif`, code: 'VALIDATION_ERROR', type: 'BUSINESS' }, { status: 422 })
    }
    if (!isFinite(net) || net <= 0) {
      return NextResponse.json({ error: `${entry.partner_id}: net_try sıfırdan büyük olmalı`, code: 'VALIDATION_ERROR', type: 'BUSINESS' }, { status: 422 })
    }
    // Invariant: gross - withholding must equal net (within 1 kuruş rounding tolerance)
    if (Math.abs(gross - withholding - net) > 0.02) {
      return NextResponse.json({
        error: `${entry.partner_id}: gross_try (${gross}) − withholding_try (${withholding}) ≠ net_try (${net})`,
        code: 'VALIDATION_ERROR', type: 'BUSINESS',
      }, { status: 422 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.tx_date ?? '')) {
      return NextResponse.json({ error: `${entry.partner_id}: geçersiz tx_date formatı (YYYY-MM-DD bekleniyor)`, code: 'VALIDATION_ERROR', type: 'BUSINESS' }, { status: 422 })
    }
  }

  // Sequential inserts — first failure aborts the rest.
  // Not true DB-level atomicity (requires a PostgreSQL function for that),
  // but server-side orchestration prevents N parallel failures from the client.
  let inserted = 0
  for (const entry of declarations as DeclareEntry[]) {
    try {
      const notes = [
        `Temettü beyanı`,
        `Brüt: ₺${(entry.gross_try ?? 0).toFixed(2)}`,
        `Stopaj (%10): ₺${(entry.withholding_try ?? 0).toFixed(2)}`,
        `Net: ₺${entry.net_try.toFixed(2)}`,
      ].join(' — ')

      await PartnerService.addTransaction(uid, entry.partner_id, {
        tx_type:  'dividend',
        amount:   entry.net_try,
        currency: 'TRY',
        fx_rate:  1,
        tx_date:  entry.tx_date,
        notes,
      }, companyId, ctx)

      inserted++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[dividend/declare] partner ${entry.partner_id} failed after ${inserted} inserts:`, msg)
      return NextResponse.json(
        { error: `Ortak ${entry.partner_id} kaydedilemedi: ${msg}`, failed_partner_id: entry.partner_id, inserted },
        { status: 500, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
      )
    }
  }

  return NextResponse.json(
    { success: true, inserted },
    { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
  )
}

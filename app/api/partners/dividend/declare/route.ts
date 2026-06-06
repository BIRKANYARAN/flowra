// ── POST /api/partners/dividend/declare ───────────────────────────────────────
//
// Handles two different declaration patterns (detected by body shape):
//
// Pattern A — Workflow initiation (new, TTK-compliant):
//   Body:  { gross_dividend_try: number, notes?: string }
//   Auth:  admin only
//   Action: calculates DividendCalculation, verifies TTK 509/519, then
//           creates a dividend_declaration workflow_instance for approval.
//   Response: { workflowId: string }
//
// Pattern B — Atomic batch insert (legacy, direct insert):
//   Body:  { declarations: Array<{ partner_id, gross_try, withholding_try, net_try, tx_date }> }
//   Auth:  admin only
//   Action: inserts partner_finance_events for each partner atomically.
//   Response: { success: true, inserted: number }
//
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/require-role'
import { REQUEST_ID_HEADER } from '@/middleware'
import { logAudit, logAlert } from '@/lib/audit'
import { resolveApiAuth } from '@/lib/api-auth'
import { round2 } from '@/lib/calc'
import { DividendService } from '@/lib/services/pcle/dividend.service'
import { safeGuard, assertNonNegativeAmount, assertPositiveAmount } from '@/lib/db/guards'

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

  let body: { declarations?: unknown; gross_dividend_try?: unknown; notes?: unknown }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Geçersiz JSON', code: 'VALIDATION_ERROR', type: 'BUSINESS' }, { status: 422 }) }

  // ── Pattern A: Workflow initiation ────────────────────────────────────────
  if (body.gross_dividend_try !== undefined) {
    const gross = Number(body.gross_dividend_try)
    if (!isFinite(gross) || gross <= 0) {
      return NextResponse.json(
        { error: 'gross_dividend_try sıfırdan büyük bir sayı olmalı', code: 'VALIDATION_ERROR' },
        { status: 422 },
      )
    }
    try {
      const calculation = await DividendService.calculate(companyId, uid, supabase, gross)
      if (!calculation.can_declare) {
        return NextResponse.json(
          { error: 'Temettü beyanı engellenmiş', blocking_reasons: calculation.blocking_reasons, code: 'COMPLIANCE_FAILURE' },
          { status: 422 },
        )
      }
      const result = await DividendService.initiateDeclaration(
        companyId, uid, supabase, calculation,
        typeof body.notes === 'string' ? body.notes : undefined,
      )
      return NextResponse.json(result, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return NextResponse.json(
        { error: msg, code: 'INTERNAL_ERROR' },
        { status: 500, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
      )
    }
  }

  // ── Pattern B: Legacy batch insert ───────────────────────────────────────

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
    // Amount sanity via the shared, tested integrity guards (single source of truth;
    // behaviour-preserving — same non-negative/positive rejections as before).
    const amountErr =
      safeGuard(() => assertNonNegativeAmount(gross,       `${entry.partner_id}: gross_try`)) ||
      safeGuard(() => assertNonNegativeAmount(withholding, `${entry.partner_id}: withholding_try`)) ||
      safeGuard(() => assertPositiveAmount(net,            `${entry.partner_id}: net_try`))
    if (amountErr) {
      return NextResponse.json({ error: amountErr.message, code: 'VALIDATION_ERROR', type: 'BUSINESS' }, { status: 422 })
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

  // ── Partner ownership pre-validation ────────────────────────────────────────
  // Verify ALL partner IDs belong to this company BEFORE any inserts.
  // The RPC re-validates ownership server-side too, but pre-validation here returns
  // a clear 422 (vs. a 500 rollback) and lists every offending id at once.
  const requestedPartnerIds = (declarations as DeclareEntry[]).map(d => d.partner_id)
  const { data: companyPartners, error: partnerFetchErr } = await supabase
    .from('partners')
    .select('id')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .in('id', requestedPartnerIds)

  if (partnerFetchErr) {
    console.error('[dividend/declare] partner ownership check failed:', partnerFetchErr.message)
    return NextResponse.json({ error: 'Ortak doğrulaması yapılamadı', code: 'DB_READ_FAILED' }, { status: 500 })
  }

  const validPartnerIds = new Set((companyPartners ?? []).map((p: { id: string }) => p.id))
  const invalidPartnerIds = requestedPartnerIds.filter(id => !validPartnerIds.has(id))
  if (invalidPartnerIds.length > 0) {
    return NextResponse.json({
      error:              `Bu şirkete ait olmayan ortak ID'leri: ${invalidPartnerIds.join(', ')}`,
      invalid_partner_ids: invalidPartnerIds,
      code:               'PARTNER_NOT_FOUND',
      type:               'BUSINESS',
    }, { status: 422 })
  }

  // ── Distributable profit guard (TTK 509) — FATAL, always applied ─────────────
  // Distributing more than distributable profit is prohibited by the Turkish
  // Commercial Code. The upper bound is the CANONICAL net income (revenue − COGS −
  // all opex − corporate tax) via FinanceService — the same figure as the Vergi
  // tab and the dividend calculator.
  //
  // DP-3 fixes (this block previously allowed over-distribution):
  //   • used revenue − opex, IGNORING COGS → overstated distributable profit;
  //   • only applied when ytdRevenue > 0 (a zero-revenue escape hatch);
  //   • was non-fatal — proceeded if the check threw.
  // Now: real-COGS net income, guards always applied, and a failure BLOCKS.
  const totalGrossRequested = round2(
    (declarations as DeclareEntry[]).reduce((s, d) => s + Number(d.gross_try ?? 0), 0)
  )
  let ytdNetIncome: number
  try {
    const currentYear = new Date().getFullYear()
    const ytdFrom     = `${currentYear}-01-01`
    const ytdTo       = new Date().toISOString().slice(0, 10)
    const { FinanceService } = await import('@/lib/services/finance.service')
    const summary = await FinanceService.getFinancialSummary(
      uid, companyId, { from: ytdFrom, to: ytdTo }, undefined, ctx, supabase,
    )
    ytdNetIncome = round2(summary.net_after_tax_try)
  } catch (profitCheckErr) {
    console.error('[dividend/declare] distributable profit computation failed:', profitCheckErr instanceof Error ? profitCheckErr.message : String(profitCheckErr))
    return NextResponse.json({
      error: 'Dağıtılabilir kâr doğrulanamadı; temettü beyanı güvenlik gereği engellendi (TTK 509).',
      code:  'DISTRIBUTABLE_UNVERIFIED', type: 'BUSINESS',
    }, { status: 422, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }

  if (ytdNetIncome <= 0) {
    return NextResponse.json({
      error:          'Temettü beyan edilemez: dağıtılabilir kâr yok (TTK 509)',
      detail:         `YTD net gelir (vergi sonrası): ₺${ytdNetIncome.toLocaleString('tr-TR')}`,
      code:           'INSUFFICIENT_PROFIT',
      type:           'BUSINESS',
      ytd_net_income: ytdNetIncome,
    }, { status: 422 })
  }

  if (totalGrossRequested > ytdNetIncome + 0.01) {
    return NextResponse.json({
      error:            'Temettü beyanı dağıtılabilir kârı aşıyor (TTK 509)',
      detail:           `Beyan tutarı: ₺${totalGrossRequested.toLocaleString('tr-TR')} — Dağıtılabilir kâr: ₺${ytdNetIncome.toLocaleString('tr-TR')}`,
      code:             'DIVIDEND_EXCEEDS_PROFIT',
      type:             'BUSINESS',
      gross_requested:  totalGrossRequested,
      ytd_net_income:   ytdNetIncome,
    }, { status: 422 })
  }

  // ── Atomic batch insert via Postgres function ────────────────────────────────
  // A dividend distribution is a single legal act: it must be all-or-nothing. The
  // previous sequential loop (one insert per partner) left
  // rows 1..N-1 committed if row N failed — a partial, unfixable distribution that
  // could understate or overstate what was declared. declare_dividend_atomic inserts
  // every row inside ONE transaction (SECURITY DEFINER, re-validates membership and
  // partner→company ownership server-side), so a failure rolls the whole batch back.
  const rpcDeclarations = (declarations as DeclareEntry[]).map(entry => ({
    partner_id: entry.partner_id,
    net_try:    round2(entry.net_try),
    tx_date:    entry.tx_date,
    notes: [
      `Temettü beyanı`,
      `Brüt: ₺${(entry.gross_try ?? 0).toFixed(2)}`,
      `Stopaj (%10): ₺${(entry.withholding_try ?? 0).toFixed(2)}`,
      `Net: ₺${entry.net_try.toFixed(2)}`,
    ].join(' — '),
  }))

  const { data: insertedRows, error: rpcError } = await supabase.rpc('declare_dividend_atomic', {
    p_company_id:   companyId,
    p_user_id:      uid,
    p_declarations: rpcDeclarations,
  })

  if (rpcError) {
    console.error('[dividend/declare] atomic insert failed (whole batch rolled back):', rpcError.message)
    return NextResponse.json(
      { error: `Temettü beyanı kaydedilemedi (işlemin tamamı geri alındı): ${rpcError.message}`, code: 'DIVIDEND_INSERT_FAILED', type: 'BUSINESS' },
      { status: 500, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }

  // Audit + large-transaction alerts (best-effort, fire-and-forget — mirrors the
  // partner-transaction service). Atomicity is already guaranteed by the RPC above.
  const rows = (insertedRows ?? []) as { tx_id: string; partner_id: string; amount_try: number }[]
  for (const row of rows) {
    logAudit({
      userId:     uid,
      companyId,
      entityType: 'partner_transaction',
      entityId:   row.tx_id,
      action:     'create',
      newData:    { tx_type: 'dividend', amount: row.amount_try, currency: 'TRY', amount_try: row.amount_try },
    })
    if (row.amount_try >= 10_000) {
      logAlert({
        actorUserId: uid,
        entityType:  'partner_transaction',
        entityId:    row.tx_id,
        message:     `Büyük ortak işlemi: dividend ${row.amount_try.toLocaleString('tr-TR')} TRY`,
        severity:    'warning',
      })
    }
  }

  return NextResponse.json(
    { success: true, inserted: rows.length },
    { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
  )
}

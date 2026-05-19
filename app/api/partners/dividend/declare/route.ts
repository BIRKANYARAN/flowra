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
import { round2 } from '@/lib/calc'

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

  // ── Partner ownership pre-validation ────────────────────────────────────────
  // Verify ALL partner IDs belong to this company BEFORE any inserts.
  // PartnerService.addTransaction also validates per-partner, but returns a 500;
  // pre-validation here returns 422 with a clear error and prevents partial writes.
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

  // ── Distributable profit guard (TTK 509) ─────────────────────────────────────
  // Dividend declarations exceeding net profit are prohibited by Turkish Commercial Code.
  // We compute a YTD estimate of net income (revenue - COGS proxy - operational expenses)
  // as the distributable upper bound. This is a lightweight approximation — the precise
  // figure requires PCLEEngine with formal period data — but it prevents gross violations
  // (e.g. declaring ₺5M dividend on ₺500K profit, or declaring with negative YTD income).
  //
  // If the financial data query fails (e.g. tables empty on a new company), we allow the
  // declaration to proceed with a non-blocking warning — startup companies with no revenue
  // history should not be blocked from recording initial dividends from equity.
  const totalGrossRequested = round2(
    (declarations as DeclareEntry[]).reduce((s, d) => s + Number(d.gross_try ?? 0), 0)
  )
  try {
    const currentYear = new Date().getFullYear()
    const ytdFrom     = `${currentYear}-01-01`
    const ytdTo       = new Date().toISOString().slice(0, 10)

    const [revenueRes, expensesRes] = await Promise.all([
      supabase
        .from('sales')
        .select('total_try:total')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', ytdFrom)
        .lte('sale_date', ytdTo),
      supabase
        .from('expenses')
        .select('amount_try, expense_type')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', ytdFrom)
        .lte('expense_date', ytdTo),
    ])

    const FINANCING = new Set(['partner_financing', 'loan_repayment', 'dividend', 'internal_transfer', 'principal', 'partner_loan'])
    const ytdRevenue  = (revenueRes.data  ?? []).reduce((s: number, r: { total_try: number }) => s + Number(r.total_try ?? 0), 0)
    const ytdExpenses = (expensesRes.data ?? []).reduce((s: number, r: { amount_try: number; expense_type?: string | null }) => {
      if (r.expense_type && FINANCING.has(r.expense_type)) return s
      return s + Number(r.amount_try ?? 0)
    }, 0)
    const ytdNetIncome = round2(ytdRevenue - ytdExpenses)

    if (ytdRevenue > 0 && ytdNetIncome < 0) {
      return NextResponse.json({
        error:          'Temettü beyan edilemez: YTD net gelir negatif (TTK 509)',
        detail:         `YTD gelir: ₺${ytdRevenue.toLocaleString('tr-TR')} — YTD gider: ₺${ytdExpenses.toLocaleString('tr-TR')} — Net: ₺${ytdNetIncome.toLocaleString('tr-TR')}`,
        code:           'INSUFFICIENT_PROFIT',
        type:           'BUSINESS',
        ytd_net_income: ytdNetIncome,
      }, { status: 422 })
    }

    if (ytdRevenue > 0 && totalGrossRequested > ytdNetIncome + 0.01) {
      return NextResponse.json({
        error:            'Temettü beyanı net geliri aşıyor (TTK 509)',
        detail:           `Beyan tutarı: ₺${totalGrossRequested.toLocaleString('tr-TR')} — YTD net gelir: ₺${ytdNetIncome.toLocaleString('tr-TR')}`,
        code:             'DIVIDEND_EXCEEDS_PROFIT',
        type:             'BUSINESS',
        gross_requested:  totalGrossRequested,
        ytd_net_income:   ytdNetIncome,
      }, { status: 422 })
    }
  } catch (profitCheckErr) {
    // Non-fatal: if profit check fails, proceed with a logged warning.
    // New companies (no transactions yet) should not be blocked from declaring dividends.
    console.warn('[dividend/declare] distributable profit check failed (non-fatal):', profitCheckErr instanceof Error ? profitCheckErr.message : String(profitCheckErr))
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

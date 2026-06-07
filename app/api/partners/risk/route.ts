// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/partners/risk — Partner Risk Dashboard
//
// Returns a PartnerRiskReport built from the new 6-dimension scoring system
// (partner-risk.service.ts) — distinct from /api/partners/pcle/risk which uses
// the PCLE engine's internal risk model.
//
// Auth: admin only
// Revalidation: 300s
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'
export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }  from '@/lib/api-auth'
import { REQUEST_ID_HEADER } from '@/middleware'
import { round2 } from '@/lib/calc'
import {
  computePartnerRiskReport,
  type PartnerRiskReportInput,
  type PartnerRiskInput,
} from '@/lib/services/pcle/partner-risk.service'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  try {
    // ── 1. Fetch partners ──────────────────────────────────────────────────────
    const { data: partners, error: pErr } = await supabase
      .from('partners')
      .select('id, name, share_ratio, is_active')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })

    if (pErr || !Array.isArray(partners)) {
      return NextResponse.json(
        { error: 'Ortak verisi alınamadı' },
        { status: 500, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
      )
    }

    if (partners.length === 0) {
      const empty = computePartnerRiskReport({
        company_id:          companyId,
        partners:            [],
        total_company_debt:  0,
        avg_monthly_revenue: 0,
      })
      return NextResponse.json(empty, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
    }

    // ── 2. Fetch partner transactions (for net loan + paid equity) ─────────────
    const { data: txs } = await supabase
      .from('partner_transactions')
      .select('partner_id, tx_type, amount_try')
      .eq('company_id', companyId)
      .is('deleted_at', null)

    // ── 3. Fetch PCLE immutable events (EQUITY_COMMITMENT / EQUITY_PAYMENT) ────
    const { data: pcleEvents } = await supabase
      .from('partner_finance_events')
      .select('partner_id, event_type, amount_try')
      .eq('company_id', companyId)

    // ── 4. Fetch loan tranches ─────────────────────────────────────────────────
    const { data: tranchesRaw } = await supabase
      .from('partner_loan_tranches')
      // outstanding computed (no outstanding_try column): principal_try − total_repaid_try
      .select('partner_id, principal_try, total_repaid_try, annual_interest_rate, expected_repayment_date')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .neq('status', 'repaid')

    // ── 5. Compute avg monthly revenue from last 12 months journal entries ─────
    //    (revenue = credit to income accounts, classified as account_class = 'income'
    //     or the common pattern in this codebase: credit entries in the 6xx range)
    //    Fallback: 0 if no revenue data available.
    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
    const twelveMonthsAgoStr = twelveMonthsAgo.toISOString().slice(0, 10)

    // Revenue = credits to gross-sales accounts (60x). debit/credit + account_code
    // live on journal_entry_lines; company/date filter via the parent entry.
    const { data: revenueRows } = await supabase
      .from('journal_entry_lines')
      .select('credit_try, journal_entries!inner(company_id, entry_date, is_voided)')
      .like('account_code', '60%')
      .eq('journal_entries.company_id', companyId)
      .eq('journal_entries.is_voided', false)
      .gte('journal_entries.entry_date', twelveMonthsAgoStr)

    const totalRevenue12m: number = Array.isArray(revenueRows)
      ? revenueRows.reduce((s: number, r: Record<string, unknown>) => s + (Number(r.credit_try) || 0), 0)
      : 0
    const avg_monthly_revenue = round2(totalRevenue12m / 12)

    // ── 6. Aggregate per-partner ───────────────────────────────────────────────
    type Agg = {
      loaned: number; repaid: number
      capital_paid: number; capital_committed: number
      monthly_repayment: number
    }
    const agg = new Map<string, Agg>()
    for (const p of partners) {
      agg.set(p.id, {
        loaned: 0, repaid: 0,
        capital_paid: 0, capital_committed: 0,
        monthly_repayment: 0,
      })
    }

    for (const tx of (txs ?? [])) {
      const a = agg.get(tx.partner_id)
      if (!a) continue
      const amt = Number(tx.amount_try)
      switch (tx.tx_type) {
        case 'capital_in':                              a.capital_paid  += amt; break
        case 'loan_to_company': case 'loan_in':         a.loaned        += amt; break
        case 'loan_repayment':  case 'loan_out':        a.repaid        += amt; break
      }
    }

    for (const ev of (pcleEvents ?? [])) {
      const a = agg.get(ev.partner_id)
      if (!a) continue
      const amt = Number(ev.amount_try)
      switch (ev.event_type) {
        case 'EQUITY_PAYMENT':     a.capital_paid      += amt; break
        case 'EQUITY_COMMITMENT':  a.capital_committed += amt; break
        case 'LOAN_DISBURSEMENT':  a.loaned            += amt; break
        case 'LOAN_REPAYMENT':     a.repaid            += amt; break
      }
    }

    // ── 7. Aggregate tranches per partner ──────────────────────────────────────
    const tranchesByPartner = new Map<string, PartnerRiskInput['tranches']>()
    for (const t of (tranchesRaw ?? [])) {
      const list = tranchesByPartner.get(t.partner_id) ?? []
      list.push({
        principal_try:            Math.max(0, Number(t.principal_try ?? 0) - Number(t.total_repaid_try ?? 0)),
        expected_repayment_date:  t.expected_repayment_date ?? null,
        interest_rate_annual_pct: Number(t.annual_interest_rate) || 0,
      })
      tranchesByPartner.set(t.partner_id, list)
    }

    // ── 8. Compute total company debt ──────────────────────────────────────────
    const total_company_debt = [...agg.values()].reduce(
      (s, a) => s + Math.max(0, a.loaned - a.repaid),
      0,
    )

    // ── 9. Build input for partner-risk.service ────────────────────────────────
    const partnerInputs: PartnerRiskInput[] = partners.map(p => {
      const a          = agg.get(p.id)!
      const net_loan   = Math.max(0, a.loaned - a.repaid)
      const share_pct  = round2(Number(p.share_ratio) * 100)

      // If no EQUITY_COMMITMENT events recorded, treat paid capital as committed
      // (conservative: gap_score stays 100 when no formal commitment recorded)
      const committed  = a.capital_committed > 0 ? a.capital_committed : a.capital_paid

      // Monthly repayment estimate: total repaid / 12 months (rough trailing avg)
      // A finer per-tranche schedule would require amortization data.
      const monthly_repayment = round2(a.repaid / 12)

      return {
        partner_id:            p.id,
        partner_name:          p.name,
        share_pct,
        net_loan_try:          round2(net_loan),
        committed_equity_try:  round2(committed),
        paid_equity_try:       round2(a.capital_paid),
        monthly_repayment_try: monthly_repayment,
        tranches:              tranchesByPartner.get(p.id) ?? [],
      }
    })

    // ── 10. Compute and return ─────────────────────────────────────────────────
    const reportInput: PartnerRiskReportInput = {
      company_id:          companyId,
      partners:            partnerInputs,
      total_company_debt:  round2(total_company_debt),
      avg_monthly_revenue: avg_monthly_revenue,
    }

    const report = computePartnerRiskReport(reportInput)

    return NextResponse.json(report, {
      headers: { [REQUEST_ID_HEADER]: ctx.requestId },
    })
  } catch (err) {
    console.error('[partners/risk] error:', err)
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }
}

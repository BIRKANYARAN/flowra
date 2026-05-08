// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/partners/ledger
//
// Fully auditable partner ledger with strict financial separation:
//   EQUITY     — capital_in (irreversible equity contributions)
//   FINANCING  — loan_to_company / loan_in (repayable debt)
//   REPAYMENT  — loan_repayment / loan_out (debt reduction)
//   OPERATING  — salary + board_fee entries via partner_transactions (legacy)
//   EQUITY_OUT — dividend (profit distributions)
//
// Per-partner breakdown:
//   equity_contributed    — Σ capital_in (equity stake)
//   loans_given           — Σ loan_to_company + loan_in (company debt to partner)
//   loans_repaid          — Σ loan_repayment + loan_out (debt reduction)
//   net_loan_outstanding  — loans_given - loans_repaid (what company still owes)
//   dividends_received    — Σ dividend (after-tax distributions received)
//   salary_received       — Σ salary + board_fee (operational; via legacy tx type)
//   company_total_owed    — equity_contributed + net_loan_outstanding
//     (total obligation: equity is owed on wind-up; loan is owed on demand)
//
// Company-level summary:
//   total_equity_pool    — Σ equity across active partners
//   total_debt_to_partners — Σ net_loan_outstanding
//   total_distributed    — Σ dividends + salaries paid
//   debt_to_equity_ratio — total_debt / total_equity (leverage signal)
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient }     from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import { contextFromHeader } from '@/lib/logger'
import { REQUEST_ID_HEADER } from '@/middleware'

function round2(v: number) { return Math.round((v + Number.EPSILON) * 100) / 100 }

interface PartnerLedgerEntry {
  partner_id:             string
  partner_name:           string
  share_ratio:            number
  is_active:              boolean
  // Equity
  equity_contributed:     number
  // Financing (debt)
  loans_given:            number
  loans_repaid:           number
  net_loan_outstanding:   number
  // Distributions
  dividends_received:     number
  salary_received:        number   // salary + board_fee + huzur_hakki
  equalization_paid:      number   // intra-partner balancing transfers
  // Obligations
  company_total_owed:     number   // equity + net_loan (wind-up liability)
  // Equalization basis (capital only)
  equalization_basis:     number
}

interface LedgerSummary {
  total_equity_pool:       number
  total_debt_to_partners:  number
  total_dividends:         number
  total_salary_legacy:     number
  debt_to_equity_ratio:    number | null
  partner_count:           number
  active_partner_count:    number
}

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }
  const ctx = contextFromHeader(req.headers.get(REQUEST_ID_HEADER), authData.user.id)

  let companyId: string
  try { companyId = await resolveCompanyId(authData.user.id, supabase) }
  catch {
    return NextResponse.json({ error: 'Şirket bilgisi alınamadı', code: 'COMPANY_NOT_RESOLVED' }, { status: 409 })
  }

  try {
    // Fetch partners + all their transactions in parallel
    const [partnersRes, txRes] = await Promise.all([
      supabase
        .from('partners')
        .select('id, name, share_ratio, is_active')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),

      supabase
        .from('partner_transactions')
        .select('partner_id, tx_type, amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null),
    ])

    if (partnersRes.error) throw partnersRes.error

    const partners = partnersRes.data ?? []
    const txs      = txRes.data ?? []

    // Aggregate per partner
    type Agg = {
      equity: number; loanIn: number; loanOut: number
      dividend: number; salary: number; boardFee: number
      huzurHakki: number; equalization: number
    }
    const agg = new Map<string, Agg>()
    for (const p of partners) {
      agg.set(p.id, { equity: 0, loanIn: 0, loanOut: 0, dividend: 0, salary: 0, boardFee: 0, huzurHakki: 0, equalization: 0 })
    }

    for (const tx of txs) {
      const a = agg.get(tx.partner_id)
      if (!a) continue
      const amt = Number(tx.amount_try)
      switch (tx.tx_type) {
        case 'capital_in':      a.equity       += amt; break
        case 'loan_to_company': a.loanIn       += amt; break
        case 'loan_in':         a.loanIn       += amt; break   // legacy
        case 'loan_repayment':  a.loanOut      += amt; break
        case 'loan_out':        a.loanOut      += amt; break   // legacy
        case 'dividend':        a.dividend     += amt; break
        case 'salary':          a.salary       += amt; break
        case 'board_fee':       a.boardFee     += amt; break
        case 'huzur_hakki':     a.huzurHakki   += amt; break
        case 'equalization':    a.equalization += amt; break
      }
    }

    // Build ledger entries
    const entries: PartnerLedgerEntry[] = partners.map(p => {
      const a               = agg.get(p.id)!
      const equity          = round2(a.equity)
      const loansGiven      = round2(a.loanIn)
      const loansRepaid     = round2(a.loanOut)
      const netLoan         = round2(loansGiven - loansRepaid)
      const dividends       = round2(a.dividend)
      // salary_received aggregates salary + board_fee + huzur_hakki (all operational comp)
      const salary          = round2(a.salary + a.boardFee + a.huzurHakki)
      // equalization_paid — intra-partner balancing payments
      const equalizationPaid = round2(a.equalization)
      const totalOwed       = round2(equity + netLoan)

      return {
        partner_id:           p.id,
        partner_name:         p.name,
        share_ratio:          Number(p.share_ratio),
        is_active:            Boolean(p.is_active),
        equity_contributed:   equity,
        loans_given:          loansGiven,
        loans_repaid:         loansRepaid,
        net_loan_outstanding: netLoan,
        dividends_received:   dividends,
        salary_received:      salary,
        equalization_paid:    equalizationPaid,
        company_total_owed:   totalOwed,
        equalization_basis:   equity,   // capital only — NOT equity+loans
      }
    })

    // Company-level summary
    const active = entries.filter(e => e.is_active)
    const totalEquity   = round2(active.reduce((s, e) => s + e.equity_contributed, 0))
    const totalDebt     = round2(active.reduce((s, e) => s + e.net_loan_outstanding, 0))
    const totalDividends = round2(entries.reduce((s, e) => s + e.dividends_received, 0))
    const totalSalary    = round2(entries.reduce((s, e) => s + e.salary_received, 0))

    const summary: LedgerSummary = {
      total_equity_pool:      totalEquity,
      total_debt_to_partners: totalDebt,
      total_dividends:        totalDividends,
      total_salary_legacy:    totalSalary,
      debt_to_equity_ratio:   totalEquity > 0 ? round2(totalDebt / totalEquity) : null,
      partner_count:          entries.length,
      active_partner_count:   active.length,
    }

    return NextResponse.json(
      { entries, summary },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } }
    )
  } catch (err) {
    console.error('[partners/ledger]', err instanceof Error ? err.message : String(err))
    return NextResponse.json(
      { error: 'Ortak defteri alınamadı', code: 'INTERNAL_ERROR' },
      { status: 500, headers: { [REQUEST_ID_HEADER]: ctx.requestId } }
    )
  }
}

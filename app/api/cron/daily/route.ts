import { NextRequest, NextResponse } from 'next/server'
import { getSystemAdminClient }      from '@/lib/admin-db'
import { makeRequestContext }        from '@/lib/logger'
import { runOverdueUpdateJob }       from '@/lib/jobs/overdue-update.job'
import { runInterestAccrualJob }     from '@/lib/jobs/interest-accrual.job'
import { runAlertDigestJob }         from '@/lib/jobs/alert-digest.job'

export const dynamic = 'force-dynamic'

// POST /api/cron/daily
//
// Master daily cron — runs at 01:30 UTC after the individual crons.
// Coordinates all per-company daily maintenance jobs:
//   1. Overdue update  — mark sales past due_date as 'overdue'
//   2. Interest accrual — accrue daily interest on partner loan tranches
//   3. Alert digest     — send email digest for critical/warning alerts
//
// Protected by Bearer token: Authorization: Bearer ${CRON_SECRET}
// Idempotent: each individual job uses runJob() which checks idempotency keys.

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(req: NextRequest) {
  const { requestId: runId } = makeRequestContext()

  const authHeader = req.headers.get('authorization')
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSystemAdminClient()
  const today    = new Date().toISOString().slice(0, 10)

  try {
    // ── Get all active companies ─────────────────────────────────────────────
    const { data: companies, error: coErr } = await supabase
      .from('companies')
      .select('id')
      .is('deleted_at', null)

    if (coErr) {
      console.error('[cron/daily] companies query error:', coErr.message, { runId })
      return NextResponse.json({ error: coErr.message, run_id: runId }, { status: 500 })
    }

    const companyIds: string[] = (companies ?? []).map((c: { id: string }) => c.id)

    if (!companyIds.length) {
      return NextResponse.json({ ok: true, companies: 0, run_id: runId, date: today })
    }

    // ── Run overdue update for all companies ──────────────────────────────────
    const overdueResults = await Promise.allSettled(
      companyIds.map(id => runOverdueUpdateJob(id, supabase, today)),
    )

    const overdueSummary = overdueResults.reduce(
      (acc, r) => {
        if (r.status === 'fulfilled') {
          acc[r.value.status] = (acc[r.value.status] ?? 0) + 1
          acc.total_updated   += r.value.recordsProcessed
        } else {
          acc.failed = (acc.failed ?? 0) + 1
        }
        return acc
      },
      { completed: 0, skipped: 0, failed: 0, total_updated: 0 } as Record<string, number>,
    )

    // ── Get companies that have active loan tranches ───────────────────────────
    const { data: loanCompanies } = await supabase
      .from('partner_loan_tranches')
      // no outstanding_try column to filter on; the accrual job itself skips
      // zero-outstanding tranches, so an interest-bearing active tranche is enough here
      .select('company_id')
      .eq('status', 'active')
      .gt('annual_interest_rate', 0)

    const loanCompanyIds = [
      ...new Set(((loanCompanies ?? []) as Array<{ company_id: string }>).map(r => r.company_id)),
    ]

    // ── Run interest accrual for companies with loan tranches ─────────────────
    const accrualResults = await Promise.allSettled(
      loanCompanyIds.map(id => runInterestAccrualJob(id, supabase, today)),
    )

    const accrualSummary = accrualResults.reduce(
      (acc, r) => {
        if (r.status === 'fulfilled') {
          acc[r.value.status] = (acc[r.value.status] ?? 0) + 1
          acc.total_accrued   += r.value.recordsProcessed
        } else {
          acc.failed = (acc.failed ?? 0) + 1
        }
        return acc
      },
      { completed: 0, skipped: 0, failed: 0, total_accrued: 0 } as Record<string, number>,
    )

    // ── Run alert digest for all companies (graceful — never blocks) ─────────
    const digestResults = await Promise.allSettled(
      companyIds.map(id => runAlertDigestJob(id, supabase, today)),
    )

    const digestSummary = digestResults.reduce(
      (acc, r) => {
        if (r.status === 'fulfilled') {
          acc[r.value.status] = (acc[r.value.status] ?? 0) + 1
          acc.total_sent       += r.value.recordsProcessed
        } else {
          acc.failed = (acc.failed ?? 0) + 1
        }
        return acc
      },
      { completed: 0, skipped: 0, failed: 0, total_sent: 0 } as Record<string, number>,
    )

    // ── Log summary ───────────────────────────────────────────────────────────
    console.info(JSON.stringify({
      level:    'info',
      message:  '[cron/daily] completed',
      run_id:   runId,
      date:     today,
      companies: companyIds.length,
      overdue:  overdueSummary,
      accrual:  accrualSummary,
      digest:   digestSummary,
    }))

    return NextResponse.json({
      ok:      true,
      run_id:  runId,
      date:    today,
      companies: companyIds.length,
      overdue: overdueSummary,
      accrual: {
        ...accrualSummary,
        companies_with_loans: loanCompanyIds.length,
      },
      digest: digestSummary,
    })
  } catch (e) {
    console.error('[cron/daily] unexpected error:', e, { runId })
    return NextResponse.json({ error: 'Internal error', run_id: runId }, { status: 500 })
  }
}

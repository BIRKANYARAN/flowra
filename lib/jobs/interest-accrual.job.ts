// ── Interest Accrual Job ───────────────────────────────────────────────────────
//
// Accrues daily interest on active partner_loan_tranches.
// Called by the daily cron route — wraps runJob() for structured execution.

import { runJob, buildIdempotencyKey, JobResult } from './job-runner'
import { round2 } from '@/lib/calc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any

/**
 * Run the interest accrual job for a single company.
 *
 * @param companyId  - The company to process
 * @param supabase   - Supabase client (service-role recommended for cron use)
 * @param date       - YYYY-MM-DD date to accrue for (defaults to today)
 */
export async function runInterestAccrualJob(
  companyId: string,
  supabase:  AnySupabaseClient,
  date?:     string,
): Promise<JobResult> {
  const today = date ?? new Date().toISOString().slice(0, 10)
  const idempotencyKey = buildIdempotencyKey('interest_accrual', companyId, today)

  return runJob(
    {
      jobType:        'interest_accrual',
      companyId,
      idempotencyKey,
      startedAt:      new Date(),
    },
    async (_ctx) => {
      // ── Query active tranches ──────────────────────────────────────────────
      const { data: tranches, error: tErr } = await supabase
        .from('partner_loan_tranches')
        .select('id, partner_id, outstanding_try, annual_interest_rate, daily_accrual_rate')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .not('annual_interest_rate', 'is', null)
        .gt('annual_interest_rate', 0)
        .gt('outstanding_try', 0)

      if (tErr) {
        // If the table doesn't exist, skip gracefully
        if (
          tErr.code === '42P01' ||
          (typeof tErr.message === 'string' && tErr.message.includes('does not exist'))
        ) {
          return { status: 'skipped', recordsProcessed: 0, metadata: { reason: 'table_missing: partner_loan_tranches' } }
        }
        throw new Error(`Failed to query partner_loan_tranches: ${tErr.message}`)
      }

      if (!tranches?.length) {
        return { status: 'completed', recordsProcessed: 0, metadata: { reason: 'no_active_tranches' } }
      }

      // ── Bulk idempotency check ─────────────────────────────────────────────
      const trancheRefs = tranches.map((t: { id: string }) => `tranche:${t.id}`)

      const { data: alreadyDone } = await supabase
        .from('partner_finance_events')
        .select('reference')
        .eq('event_type', 'LOAN_INTEREST_ACCRUAL')
        .eq('event_date', today)
        .eq('company_id', companyId)
        .in('reference', trancheRefs)

      const doneSet = new Set(((alreadyDone ?? []) as Array<{ reference: string }>).map(r => r.reference))

      // ── Compute accrual rows ───────────────────────────────────────────────
      type Tranche = {
        id: string
        partner_id: string
        outstanding_try: number
        annual_interest_rate: number
        daily_accrual_rate?: number
      }

      const newRows = (tranches as Tranche[])
        .filter(t => !doneSet.has(`tranche:${t.id}`))
        .map(t => {
          // Prefer explicit daily_accrual_rate if provided, otherwise derive from annual
          const dailyInterest = t.daily_accrual_rate && t.daily_accrual_rate > 0
            ? round2(Number(t.outstanding_try) * Number(t.daily_accrual_rate))
            : round2(Number(t.outstanding_try) * (Number(t.annual_interest_rate) / 365))
          return { dailyInterest, t }
        })
        .filter(({ dailyInterest }) => dailyInterest >= 0.01)
        .map(({ dailyInterest, t }) => ({
          company_id:  companyId,
          partner_id:  t.partner_id,
          event_type:  'LOAN_INTEREST_ACCRUAL',
          amount_try:  dailyInterest,
          event_date:  today,
          reference:   `tranche:${t.id}`,
          description: `Günlük faiz tahakkuku — ${today}`,
        }))

      if (!newRows.length) {
        return {
          status:           'completed',
          recordsProcessed: 0,
          metadata:         { skipped_all: true, reason: 'already_accrued_or_below_min' },
        }
      }

      // ── Bulk insert ────────────────────────────────────────────────────────
      const { error: insErr } = await supabase
        .from('partner_finance_events')
        .insert(newRows)

      if (insErr) {
        throw new Error(`partner_finance_events insert failed: ${insErr.message}`)
      }

      return {
        status:           'completed',
        recordsProcessed: newRows.length,
        metadata:         { total_tranches: tranches.length, skipped: tranches.length - newRows.length },
      }
    },
    supabase,
  )
}

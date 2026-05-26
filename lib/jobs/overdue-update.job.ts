// ── Overdue Update Job ────────────────────────────────────────────────────────
//
// Marks sales as 'overdue' where due_date < asOf and payment_status is
// still 'unpaid' or 'partial'. Wraps runJob() for structured execution.

import { runJob, buildIdempotencyKey, JobResult } from './job-runner'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any

// ── Pure logic helper (exported for unit testing) ─────────────────────────────

export interface Sale {
  id:             string
  due_date:       string   // YYYY-MM-DD
  payment_status: string
}

/**
 * Pure function: given a list of sales and a reference date, return the IDs
 * of sales that should be marked overdue.
 *
 * Criteria:
 *   - due_date is strictly BEFORE asOf  (due_date < asOf)
 *   - payment_status is 'unpaid' or 'partial'
 */
export function markOverdue(sales: Sale[], asOf: string): string[] {
  return sales
    .filter(s =>
      s.due_date < asOf &&
      (s.payment_status === 'unpaid' || s.payment_status === 'partial'),
    )
    .map(s => s.id)
}

// ── Job implementation ────────────────────────────────────────────────────────

/**
 * Run the overdue-update job for a single company.
 *
 * @param companyId  - The company to process
 * @param supabase   - Supabase client (service-role recommended for cron use)
 * @param asOf       - YYYY-MM-DD reference date (defaults to today)
 */
export async function runOverdueUpdateJob(
  companyId: string,
  supabase:  AnySupabaseClient,
  asOf?:     string,
): Promise<JobResult> {
  const today = asOf ?? new Date().toISOString().slice(0, 10)
  const idempotencyKey = buildIdempotencyKey('overdue_update', companyId, today)

  return runJob(
    {
      jobType:        'overdue_update',
      companyId,
      idempotencyKey,
      startedAt:      new Date(),
    },
    async (_ctx) => {
      // Find all sales that need marking as overdue
      const { data: stale, error: fetchErr } = await supabase
        .from('sales')
        .select('id, due_date, payment_status')
        .eq('company_id', companyId)
        .in('payment_status', ['unpaid', 'partial'])
        .lt('due_date', today)
        .is('deleted_at', null)
        .not('due_date', 'is', null)

      if (fetchErr) {
        throw new Error(`Failed to query sales: ${fetchErr.message}`)
      }

      if (!stale?.length) {
        return { status: 'completed', recordsProcessed: 0 }
      }

      // Use the pure helper so the logic is independently testable
      const ids = markOverdue(stale as Sale[], today)

      if (!ids.length) {
        return { status: 'completed', recordsProcessed: 0 }
      }

      const { error: updateErr, count } = await supabase
        .from('sales')
        .update({ payment_status: 'overdue' })
        .in('id', ids)
        .eq('company_id', companyId)

      if (updateErr) {
        throw new Error(`Failed to update sales: ${updateErr.message}`)
      }

      return {
        status:           'completed',
        recordsProcessed: count ?? ids.length,
        metadata:         { updated_ids: ids },
      }
    },
    supabase,
  )
}

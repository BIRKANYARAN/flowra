// ── Background Job Worker ─────────────────────────────────────────────────────
// Minimal sequential job processor.
//
// Architecture:
//   • claim_next_job() atomically claims one job using FOR UPDATE SKIP LOCKED
//   • Handler runs the job payload
//   • complete_job() or fail_job() closes the record
//   • Worker re-queues a cleanup job after each purge run
//
// Deployment:
//   • Call processNextJob() from an API route triggered by a CRON (Vercel Cron
//     or Supabase pg_cron) every minute.
//   • The route is /api/jobs/run — protected by a shared secret header.
//
// Currently supported job types:
//   purge_idempotency_keys   — calls purge_expired_idempotency_keys()

import { getSystemAdminClient } from '@/lib/admin-db'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JobRecord {
  id:           string
  type:         string
  payload:      Record<string, unknown>
  status:       'pending' | 'running' | 'success' | 'failed'
  attempts:     number
  max_attempts: number
  run_at:       string
}

export interface JobResult {
  success:  boolean
  jobId:    string
  jobType:  string
  message?: string
  error?:   string
}

// ── Handlers ─────────────────────────────────────────────────────────────────
// Add new job types by adding a case here. Each handler:
//   - receives the job payload (jsonb)
//   - returns { success: true } or throws an error

type JobHandler = (payload: Record<string, unknown>) => Promise<void>

const HANDLERS: Record<string, JobHandler> = {

  // Purge expired idempotency keys and re-schedule the next run
  purge_idempotency_keys: async (_payload) => {
    const supabase = getSystemAdminClient()
    const { data, error } = await supabase.rpc('purge_expired_idempotency_keys')
    if (error) throw new Error('purge RPC failed: ' + error.message)

    // Schedule the next purge in 24 hours
    await supabase.rpc('enqueue_job', {
      p_type:    'purge_idempotency_keys',
      p_payload: {},
      p_run_at:  new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })

    console.log('[job] purge_idempotency_keys: deleted', data, 'rows')
  },

  // Placeholder for future PDF generation jobs
  // generate_pdf: async (payload) => { ... }
}

// ── Worker ────────────────────────────────────────────────────────────────────

/**
 * Claim and process the next pending job.
 * Returns null if no jobs are ready.
 * Never throws — errors are recorded in the jobs table via fail_job().
 */
export async function processNextJob(): Promise<JobResult | null> {
  const supabase = getSystemAdminClient()

  // Atomically claim one job
  const { data: rows, error: claimErr } = await supabase
    .rpc('claim_next_job')

  if (claimErr) {
    console.error('[worker] claim_next_job failed:', claimErr.message)
    return null
  }

  const job = rows?.[0] as JobRecord | undefined
  if (!job) return null  // No jobs ready

  const handler = HANDLERS[job.type]

  try {
    if (!handler) {
      throw new Error(`Unknown job type: ${job.type}`)
    }

    await handler(job.payload)

    // Mark success
    await supabase.rpc('complete_job', { p_job_id: job.id })

    return { success: true, jobId: job.id, jobType: job.type }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[worker] job ${job.id} (${job.type}) failed:`, msg)

    // fail_job re-queues with back-off if attempts remain
    await supabase.rpc('fail_job', {
      p_job_id:               job.id,
      p_error:                msg,
      p_retry_delay_seconds:  60,
    })

    return { success: false, jobId: job.id, jobType: job.type, error: msg }
  }
}

/**
 * Drain all ready jobs sequentially (up to maxJobs).
 * Safe for cron invocations that need to catch up.
 */
export async function drainJobs(maxJobs = 20): Promise<JobResult[]> {
  const results: JobResult[] = []
  for (let i = 0; i < maxJobs; i++) {
    const result = await processNextJob()
    if (!result) break   // Queue empty
    results.push(result)
  }
  return results
}

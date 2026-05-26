// ── Job Runner ────────────────────────────────────────────────────────────────
//
// Provides structured job execution with:
//   • Idempotency check  — same key on the same day → skip
//   • job_runs tracking  — creates/updates a DB row for observability
//   • Graceful degradation — if job_runs table doesn't exist, still runs the job
//   • Structured logging  — start / complete / error via console.info / console.error

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any

export interface JobContext {
  jobType:         string
  companyId?:      string   // undefined / null for platform-wide jobs
  idempotencyKey:  string   // jobType + companyId + date
  startedAt:       Date
}

export interface JobResult {
  status:           'completed' | 'failed' | 'skipped'
  recordsProcessed: number
  error?:           string
  metadata?:        Record<string, unknown>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build today's idempotency key: {jobType}_{companyId}_{date} */
export function buildIdempotencyKey(jobType: string, companyId?: string, date?: string): string {
  const d = date ?? new Date().toISOString().slice(0, 10)
  return companyId ? `${jobType}_${companyId}_${d}` : `${jobType}_platform_${d}`
}

// ── Core runner ───────────────────────────────────────────────────────────────

/**
 * Run a job with idempotency + DB tracking.
 *
 * If the job_runs table does not exist (pre-migration), logs a warning and
 * still executes the job — DB tracking is optional.
 */
export async function runJob(
  context:  JobContext,
  job:      (ctx: JobContext) => Promise<JobResult>,
  supabase: AnySupabaseClient,
): Promise<JobResult> {
  const tag = `[job-runner/${context.jobType}]`
  let runId: string | undefined

  // ── 1. Try to check idempotency + create job_runs row ─────────────────────
  let dbAvailable = true

  try {
    // Check if already ran today
    const { data: existing, error: checkErr } = await supabase
      .from('job_runs')
      .select('id, status')
      .eq('idempotency_key', context.idempotencyKey)
      .maybeSingle()

    if (checkErr) {
      if (isTableMissingError(checkErr)) {
        console.warn(`${tag} job_runs table not found — running without DB tracking`)
        dbAvailable = false
      } else {
        // Non-fatal: log and continue without tracking
        console.warn(`${tag} idempotency check failed (non-fatal):`, checkErr.message)
        dbAvailable = false
      }
    } else if (existing) {
      console.info(JSON.stringify({
        level:           'info',
        message:         `${tag} skipped — already ran today`,
        job_type:        context.jobType,
        company_id:      context.companyId,
        idempotency_key: context.idempotencyKey,
        prior_run_id:    existing.id,
        prior_status:    existing.status,
      }))
      return { status: 'skipped', recordsProcessed: 0, metadata: { reason: 'idempotency', prior_run_id: existing.id } }
    }
  } catch (err) {
    console.warn(`${tag} DB check threw — running without tracking:`, err instanceof Error ? err.message : String(err))
    dbAvailable = false
  }

  // ── 2. Create job_runs row (status='running') ──────────────────────────────
  if (dbAvailable) {
    try {
      const { data: row, error: insertErr } = await supabase
        .from('job_runs')
        .insert({
          job_type:        context.jobType,
          company_id:      context.companyId ?? null,
          idempotency_key: context.idempotencyKey,
          status:          'running',
          started_at:      context.startedAt.toISOString(),
        })
        .select('id')
        .maybeSingle()

      if (insertErr) {
        if (isTableMissingError(insertErr)) {
          console.warn(`${tag} job_runs table not found — running without DB tracking`)
          dbAvailable = false
        } else {
          console.warn(`${tag} job_runs insert failed (non-fatal):`, insertErr.message)
          dbAvailable = false
        }
      } else {
        runId = row?.id
      }
    } catch (err) {
      console.warn(`${tag} job_runs insert threw — running without tracking:`, err instanceof Error ? err.message : String(err))
      dbAvailable = false
    }
  }

  // ── 3. Log start ───────────────────────────────────────────────────────────
  console.info(JSON.stringify({
    level:      'info',
    message:    `${tag} started`,
    job_type:   context.jobType,
    company_id: context.companyId,
    run_id:     runId,
    started_at: context.startedAt.toISOString(),
  }))

  // ── 4. Execute job ─────────────────────────────────────────────────────────
  let result: JobResult
  const startMs = Date.now()

  try {
    result = await job(context)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    result = { status: 'failed', recordsProcessed: 0, error: message }
  }

  const duration_ms = Date.now() - startMs
  const completedAt = new Date().toISOString()

  // ── 5. Update job_runs row ─────────────────────────────────────────────────
  if (dbAvailable && runId) {
    try {
      await supabase
        .from('job_runs')
        .update({
          status:            result.status,
          completed_at:      completedAt,
          records_processed: result.recordsProcessed,
          error:             result.error ?? null,
          metadata:          result.metadata ?? null,
        })
        .eq('id', runId)
    } catch {
      // Non-fatal
    }
  }

  // ── 6. Log end / error ─────────────────────────────────────────────────────
  if (result.status === 'failed') {
    console.error(JSON.stringify({
      level:             'error',
      message:           `${tag} failed`,
      job_type:          context.jobType,
      company_id:        context.companyId,
      run_id:            runId,
      error:             result.error,
      records_processed: result.recordsProcessed,
      duration_ms,
    }))
  } else {
    console.info(JSON.stringify({
      level:             'info',
      message:           `${tag} ${result.status}`,
      job_type:          context.jobType,
      company_id:        context.companyId,
      run_id:            runId,
      status:            result.status,
      records_processed: result.recordsProcessed,
      duration_ms,
      ...(result.metadata ?? {}),
    }))
  }

  return result
}

// ── Private helpers ───────────────────────────────────────────────────────────

function isTableMissingError(err: { message?: string; code?: string }): boolean {
  // Postgres error code 42P01 = undefined_table
  // Supabase surfaces this in error.message as well
  return (
    err?.code === '42P01' ||
    (typeof err?.message === 'string' && err.message.includes('does not exist'))
  )
}

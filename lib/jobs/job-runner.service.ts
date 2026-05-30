// ── Job Runner Service ─────────────────────────────────────────────────────────
//
// Coordination layer for structured job execution.
// Provides types, pure helper functions, and a JobRun interface for tracking.

export type JobType =
  | 'interest_accrual'
  | 'overdue_update'
  | 'alert_evaluation'
  | 'period_close_reminder'
  | 'pdf_generation'

export type JobStatus = 'running' | 'completed' | 'failed' | 'skipped'

export interface JobRun {
  job_type:          JobType
  company_id:        string
  started_at:        string
  ended_at:          string | null
  status:            JobStatus
  records_processed: number
  error:             string | null
  idempotency_key:   string  // job_type + company_id + date
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Build a colon-separated idempotency key for a job run.
 * Format: "interest_accrual:company-uuid:2025-05-30"
 */
export function buildJobKey(jobType: JobType, companyId: string, dateStr: string): string {
  return `${jobType}:${companyId}:${dateStr}`
}

/**
 * Determine whether a job should be skipped based on the last run time.
 *
 * Returns true (skip) when:
 *   - lastRunAt is not null, AND
 *   - the elapsed time since lastRunAt is less than minIntervalMs
 *
 * Returns false (do not skip) when:
 *   - lastRunAt is null (never run before), OR
 *   - the elapsed time since lastRunAt >= minIntervalMs
 */
export function shouldSkipJob(
  lastRunAt:      string | null,
  minIntervalMs:  number,
  nowMs:          number,
): boolean {
  if (lastRunAt === null) return false
  const elapsed = nowMs - new Date(lastRunAt).getTime()
  return elapsed < minIntervalMs
}

/**
 * Classify a job result as completed, failed, or skipped.
 *
 * Rules:
 *   - error !== null  → 'failed'
 *   - records === 0   → 'skipped'
 *   - else            → 'completed'
 */
export function classifyJobResult(
  recordsProcessed: number,
  error:            string | null,
): JobStatus {
  if (error !== null) return 'failed'
  if (recordsProcessed === 0) return 'skipped'
  return 'completed'
}

/**
 * Format a job duration as a human-readable string.
 *
 * Examples:
 *   - "3.2s"     for durations under 60 seconds
 *   - "1m 24s"   for durations >= 60 seconds
 */
export function formatJobDuration(startedAt: string, endedAt: string): string {
  const ms      = new Date(endedAt).getTime() - new Date(startedAt).getTime()
  const seconds = ms / 1000

  if (seconds < 60) {
    return `${Math.round(seconds * 10) / 10}s`
  }

  const minutes    = Math.floor(seconds / 60)
  const remSeconds = Math.round(seconds % 60)
  return `${minutes}m ${remSeconds}s`
}

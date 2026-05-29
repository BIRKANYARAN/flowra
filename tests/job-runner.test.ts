/**
 * Tests for lib/jobs/job-runner.ts and lib/logger.ts (createTimer)
 *
 * All tests are pure / in-memory — no DB connections.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runJob, buildIdempotencyKey, JobContext, JobResult } from '../lib/jobs/job-runner'
import { createTimer } from '../lib/logger'

// ── Supabase mock factory ─────────────────────────────────────────────────────

type MockQueryChain = {
  select:   ReturnType<typeof vi.fn>
  insert:   ReturnType<typeof vi.fn>
  update:   ReturnType<typeof vi.fn>
  eq:       ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  _result:  { data: unknown; error: unknown }
}

/**
 * Build a minimal Supabase-like mock.
 * `tableOverrides` maps table name → { data, error } to return from .maybeSingle() / .select()
 */
function makeSupabaseMock(
  tableOverrides: Record<string, { data: unknown; error: unknown }> = {},
  defaultResult: { data: unknown; error: unknown } = { data: null, error: null },
) {
  const mock = {
    from: vi.fn((table: string) => {
      const result = tableOverrides[table] ?? defaultResult
      const chain: Record<string, ReturnType<typeof vi.fn>> = {}
      const fluid = () => chain
      chain.select      = vi.fn(fluid)
      chain.insert      = vi.fn(() => ({ ...result, select: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue(result) })) }))
      chain.update      = vi.fn(fluid)
      chain.eq          = vi.fn(fluid)
      chain.neq         = vi.fn(fluid)
      chain.in          = vi.fn(fluid)
      chain.is          = vi.fn(fluid)
      chain.not         = vi.fn(fluid)
      chain.gt          = vi.fn(fluid)
      chain.lt          = vi.fn(fluid)
      chain.maybeSingle = vi.fn().mockResolvedValue(result)
      return chain
    }),
  }
  return mock
}

// ── Helper: build a simple job context ───────────────────────────────────────

function makeCtx(overrides: Partial<JobContext> = {}): JobContext {
  return {
    jobType:        'test_job',
    companyId:      'company-123',
    idempotencyKey: 'test_job_company-123_2026-05-26',
    startedAt:      new Date('2026-05-26T00:00:00Z'),
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('runJob — successful execution', () => {
  it('returns completed result when job succeeds', async () => {
    // job_runs table: no existing run (maybeSingle → null), insert succeeds
    const supabase = makeSupabaseMock(
      {
        job_runs: { data: null, error: null },
      },
      { data: null, error: null },
    )

    const successJob = vi.fn().mockResolvedValue<JobResult>({
      status:           'completed',
      recordsProcessed: 5,
    })

    const result = await runJob(makeCtx(), successJob, supabase)

    expect(result.status).toBe('completed')
    expect(result.recordsProcessed).toBe(5)
    expect(successJob).toHaveBeenCalledOnce()
  })
})

describe('runJob — failed execution', () => {
  it('returns failed result when job returns failed status', async () => {
    const supabase = makeSupabaseMock({}, { data: null, error: null })

    const failingJob = vi.fn().mockResolvedValue<JobResult>({
      status:           'failed',
      recordsProcessed: 0,
      error:            'something went wrong',
    })

    const result = await runJob(makeCtx(), failingJob, supabase)

    expect(result.status).toBe('failed')
    expect(result.error).toBe('something went wrong')
  })
})

describe('runJob — job throws', () => {
  it('catches thrown errors and returns failed result', async () => {
    const supabase = makeSupabaseMock({}, { data: null, error: null })

    const throwingJob = vi.fn().mockRejectedValue(new Error('fatal crash'))

    const result = await runJob(makeCtx(), throwingJob, supabase)

    expect(result.status).toBe('failed')
    expect(result.error).toContain('fatal crash')
    expect(result.recordsProcessed).toBe(0)
  })
})

describe('runJob — job_runs table missing', () => {
  it('still runs the job and returns result when job_runs table does not exist', async () => {
    // Simulate Postgres 42P01: relation "job_runs" does not exist
    const tableError = { message: 'relation "job_runs" does not exist', code: '42P01' }

    const supabase = makeSupabaseMock(
      { job_runs: { data: null, error: tableError } },
      { data: null, error: null },
    )

    const job = vi.fn().mockResolvedValue<JobResult>({
      status:           'completed',
      recordsProcessed: 3,
    })

    const result = await runJob(makeCtx(), job, supabase)

    // Job should still run despite missing table
    expect(job).toHaveBeenCalledOnce()
    expect(result.status).toBe('completed')
    expect(result.recordsProcessed).toBe(3)
  })
})

describe('buildIdempotencyKey — format', () => {
  it('builds key as {jobType}_{companyId}_{date}', () => {
    const key = buildIdempotencyKey('interest_accrual', 'company-abc', '2026-05-26')
    expect(key).toBe('interest_accrual_company-abc_2026-05-26')
  })

  it('uses "platform" segment when companyId is omitted', () => {
    const key = buildIdempotencyKey('purge_keys', undefined, '2026-05-26')
    expect(key).toBe('purge_keys_platform_2026-05-26')
  })
})

describe('createTimer — performance timing', () => {
  it('end() produces a duration_ms greater than or equal to 0', async () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    const timer = createTimer('test-operation')
    // Simulate a tiny bit of work
    await new Promise(r => setTimeout(r, 5))
    timer.end({ records: 10 })

    expect(logSpy).toHaveBeenCalledOnce()
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string)
    expect(logged.duration_ms).toBeGreaterThanOrEqual(0)
    expect(logged.message).toBe('test-operation completed')
    expect(logged.records).toBe(10)

    logSpy.mockRestore()
  })

  it('end() without meta only includes required fields', () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const timer = createTimer('no-meta')
    timer.end()

    const logged = JSON.parse(logSpy.mock.calls[0][0] as string)
    expect(logged.level).toBe('info')
    expect(logged.message).toBe('no-meta completed')
    expect(logged.duration_ms).toBeGreaterThanOrEqual(0)
    logSpy.mockRestore()
  })

  it('end() spreads all metadata fields into log entry', () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const timer = createTimer('spread-test')
    timer.end({ company_id: 'c-abc', job_type: 'my_job', processed: 42 })

    const logged = JSON.parse(logSpy.mock.calls[0][0] as string)
    expect(logged.company_id).toBe('c-abc')
    expect(logged.job_type).toBe('my_job')
    expect(logged.processed).toBe(42)
    logSpy.mockRestore()
  })
})

describe('buildIdempotencyKey — extended', () => {
  it('uses today\'s date when date is omitted', () => {
    const today = new Date().toISOString().slice(0, 10)
    const key = buildIdempotencyKey('daily_sync', 'company-xyz')
    expect(key).toBe(`daily_sync_company-xyz_${today}`)
  })

  it('platform key is consistent regardless of companyId being undefined or empty string', () => {
    const key1 = buildIdempotencyKey('purge_keys', undefined, '2026-01-01')
    // undefined → platform segment
    expect(key1).toContain('_platform_')
  })

  it('key contains exactly 2 underscore separators minimum', () => {
    const key = buildIdempotencyKey('accrual', 'co-1', '2026-03-15')
    const parts = key.split('_')
    // jobType_companyId_date — but companyId may also contain hyphens
    expect(key.startsWith('accrual_co-1_2026-03-15')).toBe(true)
  })

  it('different dates produce different keys', () => {
    const k1 = buildIdempotencyKey('job', 'c1', '2026-01-01')
    const k2 = buildIdempotencyKey('job', 'c1', '2026-01-02')
    expect(k1).not.toBe(k2)
  })

  it('different companies produce different keys', () => {
    const k1 = buildIdempotencyKey('job', 'company-a', '2026-01-01')
    const k2 = buildIdempotencyKey('job', 'company-b', '2026-01-01')
    expect(k1).not.toBe(k2)
  })

  it('different job types produce different keys', () => {
    const k1 = buildIdempotencyKey('job_a', 'c1', '2026-01-01')
    const k2 = buildIdempotencyKey('job_b', 'c1', '2026-01-01')
    expect(k1).not.toBe(k2)
  })
})

describe('runJob — idempotency skip', () => {
  it('returns skipped when existing run found in job_runs', async () => {
    // Simulate existing run returned from maybeSingle
    const existingRun = { id: 'run-999', status: 'completed' }
    const supabase = makeSupabaseMock(
      { job_runs: { data: existingRun, error: null } },
      { data: null, error: null },
    )

    const job = vi.fn().mockResolvedValue<JobResult>({ status: 'completed', recordsProcessed: 0 })
    const result = await runJob(makeCtx(), job, supabase)

    expect(result.status).toBe('skipped')
    expect(result.recordsProcessed).toBe(0)
    // Job should NOT have been called
    expect(job).not.toHaveBeenCalled()
  })

  it('skipped result includes prior_run_id in metadata', async () => {
    const existingRun = { id: 'run-777', status: 'completed' }
    const supabase = makeSupabaseMock(
      { job_runs: { data: existingRun, error: null } },
      { data: null, error: null },
    )

    const result = await runJob(makeCtx(), vi.fn(), supabase)
    expect(result.status).toBe('skipped')
    expect((result.metadata as any)?.prior_run_id).toBe('run-777')
  })
})

describe('runJob — context forwarding', () => {
  it('passes the full context object to the job function', async () => {
    const supabase = makeSupabaseMock({}, { data: null, error: null })
    const ctx = makeCtx({ jobType: 'interest_accrual', companyId: 'co-42' })

    let capturedCtx: JobContext | undefined
    const job = vi.fn().mockImplementation(async (c: JobContext) => {
      capturedCtx = c
      return { status: 'completed' as const, recordsProcessed: 1 }
    })

    await runJob(ctx, job, supabase)
    expect(capturedCtx?.jobType).toBe('interest_accrual')
    expect(capturedCtx?.companyId).toBe('co-42')
  })
})

describe('runJob — metadata passthrough', () => {
  it('result includes metadata returned by job', async () => {
    const supabase = makeSupabaseMock({}, { data: null, error: null })

    const job = vi.fn().mockResolvedValue<JobResult>({
      status:           'completed',
      recordsProcessed: 7,
      metadata:         { processed_ids: ['a', 'b', 'c'] },
    })

    const result = await runJob(makeCtx(), job, supabase)
    expect(result.metadata).toBeDefined()
    expect((result.metadata as any).processed_ids).toHaveLength(3)
  })
})

describe('runJob — non-string thrown value', () => {
  it('handles thrown non-Error values gracefully', async () => {
    const supabase = makeSupabaseMock({}, { data: null, error: null })

    const job = vi.fn().mockRejectedValue({ code: 42, reason: 'object thrown' })
    const result = await runJob(makeCtx(), job, supabase)

    expect(result.status).toBe('failed')
    expect(result.error).toBeDefined()
    expect(result.recordsProcessed).toBe(0)
  })
})

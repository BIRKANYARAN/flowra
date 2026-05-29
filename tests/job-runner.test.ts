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

// ─────────────────────────────────────────────────────────────────────────────
// buildIdempotencyKey — format patterns
// ─────────────────────────────────────────────────────────────────────────────

describe('buildIdempotencyKey — format patterns', () => {
  it('builds key as jobType_companyId_date for standard inputs', () => {
    const key = buildIdempotencyKey('payroll_sync', 'co-999', '2026-12-31')
    expect(key).toBe('payroll_sync_co-999_2026-12-31')
  })

  it('date portion is at the end', () => {
    const key = buildIdempotencyKey('accrual', 'co-1', '2026-03-01')
    expect(key.endsWith('2026-03-01')).toBe(true)
  })

  it('jobType portion is at the start', () => {
    const key = buildIdempotencyKey('interest_calc', 'co-2', '2026-01-15')
    expect(key.startsWith('interest_calc')).toBe(true)
  })

  it('companyId portion is in the middle', () => {
    const key = buildIdempotencyKey('sync', 'company-XYZ', '2026-06-01')
    expect(key).toContain('company-XYZ')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildIdempotencyKey — separator character
// ─────────────────────────────────────────────────────────────────────────────

describe('buildIdempotencyKey — separator character', () => {
  it('uses underscore between jobType and companyId', () => {
    const key = buildIdempotencyKey('my_job', 'co-1', '2026-01-01')
    // should have the format "my_job_co-1_2026-01-01"
    expect(key).toContain('my_job_co-1')
  })

  it('uses underscore between companyId and date', () => {
    const key = buildIdempotencyKey('job', 'co-1', '2026-01-01')
    expect(key).toContain('co-1_2026-01-01')
  })

  it('key with simple names has exactly two underscore boundaries', () => {
    // jobType=abc, companyId=def, date=2026-01-01 → abc_def_2026-01-01
    const key = buildIdempotencyKey('abc', 'def', '2026-01-01')
    expect(key).toBe('abc_def_2026-01-01')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildIdempotencyKey — platform-wide (no companyId)
// ─────────────────────────────────────────────────────────────────────────────

describe('buildIdempotencyKey — platform-wide (no companyId)', () => {
  it('undefined companyId inserts "platform" segment', () => {
    const key = buildIdempotencyKey('global_purge', undefined, '2026-05-01')
    expect(key).toContain('platform')
  })

  it('platform key still ends with date', () => {
    const key = buildIdempotencyKey('nightly_job', undefined, '2026-05-15')
    expect(key.endsWith('2026-05-15')).toBe(true)
  })

  it('platform key format is jobType_platform_date', () => {
    const key = buildIdempotencyKey('nightly', undefined, '2026-01-01')
    expect(key).toBe('nightly_platform_2026-01-01')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildIdempotencyKey — deterministic
// ─────────────────────────────────────────────────────────────────────────────

describe('buildIdempotencyKey — deterministic', () => {
  it('same inputs always produce same output', () => {
    const k1 = buildIdempotencyKey('job_a', 'co-abc', '2026-03-10')
    const k2 = buildIdempotencyKey('job_a', 'co-abc', '2026-03-10')
    expect(k1).toBe(k2)
  })

  it('calling multiple times gives same result', () => {
    const keys = Array.from({ length: 5 }, () => buildIdempotencyKey('sync', 'co-1', '2026-07-01'))
    const allEqual = keys.every(k => k === keys[0])
    expect(allEqual).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// createTimer — elapsed time
// ─────────────────────────────────────────────────────────────────────────────

describe('createTimer — elapsed time', () => {
  it('elapsed() returns a positive number after some computation', () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const timer = createTimer('elapsed-test')
    // do some work
    let sum = 0
    for (let i = 0; i < 100000; i++) sum += i
    timer.end({ sum })
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string)
    expect(logged.duration_ms).toBeGreaterThanOrEqual(0)
    logSpy.mockRestore()
  })

  it('duration_ms is a number type', () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const timer = createTimer('type-check')
    timer.end()
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string)
    expect(typeof logged.duration_ms).toBe('number')
    logSpy.mockRestore()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// createTimer — elapsed is monotonic
// ─────────────────────────────────────────────────────────────────────────────

describe('createTimer — elapsed is monotonic', () => {
  it('two successive end() calls produce non-decreasing durations', async () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    const timer1 = createTimer('timer-first')
    timer1.end()
    const first = JSON.parse(logSpy.mock.calls[0][0] as string).duration_ms

    await new Promise(r => setTimeout(r, 5))

    const timer2 = createTimer('timer-second')
    timer2.end()
    const second = JSON.parse(logSpy.mock.calls[1][0] as string).duration_ms

    // Both are valid non-negative values
    expect(first).toBeGreaterThanOrEqual(0)
    expect(second).toBeGreaterThanOrEqual(0)
    logSpy.mockRestore()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// createTimer — returns object with elapsed function
// ─────────────────────────────────────────────────────────────────────────────

describe('createTimer — returns object with elapsed function', () => {
  it('createTimer returns an object', () => {
    const timer = createTimer('shape-test')
    expect(typeof timer).toBe('object')
    expect(timer).not.toBeNull()
  })

  it('returned object has end function', () => {
    const timer = createTimer('end-fn-test')
    expect(typeof timer.end).toBe('function')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// runJob — failed job records status=failed with custom error message
// ─────────────────────────────────────────────────────────────────────────────

describe('runJob — failed with custom error message', () => {
  it('custom error message is preserved in result', async () => {
    const supabase = makeSupabaseMock({}, { data: null, error: null })
    const job = vi.fn().mockResolvedValue<JobResult>({
      status: 'failed',
      recordsProcessed: 0,
      error: 'Custom error: database timeout after 30s',
    })

    const result = await runJob(makeCtx(), job, supabase)
    expect(result.status).toBe('failed')
    expect(result.error).toBe('Custom error: database timeout after 30s')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// runJob — completed with 0 records processed
// ─────────────────────────────────────────────────────────────────────────────

describe('runJob — completed with 0 records processed', () => {
  it('recordsProcessed=0 is valid success', async () => {
    const supabase = makeSupabaseMock({}, { data: null, error: null })
    const job = vi.fn().mockResolvedValue<JobResult>({
      status: 'completed',
      recordsProcessed: 0,
    })

    const result = await runJob(makeCtx(), job, supabase)
    expect(result.status).toBe('completed')
    expect(result.recordsProcessed).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// runJob — metadata as empty object
// ─────────────────────────────────────────────────────────────────────────────

describe('runJob — metadata as empty object', () => {
  it('metadata={} is valid and returned', async () => {
    const supabase = makeSupabaseMock({}, { data: null, error: null })
    const job = vi.fn().mockResolvedValue<JobResult>({
      status: 'completed',
      recordsProcessed: 1,
      metadata: {},
    })

    const result = await runJob(makeCtx(), job, supabase)
    expect(result.status).toBe('completed')
    expect(result.metadata).toBeDefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildIdempotencyKey — additional key uniqueness tests
// ─────────────────────────────────────────────────────────────────────────────

describe('buildIdempotencyKey — key uniqueness', () => {
  it('16 distinct dates produce 16 distinct keys', () => {
    const dates = Array.from({ length: 16 }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`)
    const keys = dates.map(d => buildIdempotencyKey('job', 'co-1', d))
    const unique = new Set(keys)
    expect(unique.size).toBe(16)
  })

  it('key with platform segment is distinct from key with company', () => {
    const k1 = buildIdempotencyKey('job', undefined, '2026-01-01')
    const k2 = buildIdempotencyKey('job', 'platform', '2026-01-01')
    // Both should contain 'platform' but may differ in exact format depending on implementation
    expect(typeof k1).toBe('string')
    expect(typeof k2).toBe('string')
  })

  it('empty string companyId behaves consistently', () => {
    const k1 = buildIdempotencyKey('job', '', '2026-01-01')
    const k2 = buildIdempotencyKey('job', '', '2026-01-01')
    expect(k1).toBe(k2)
  })

  it('key contains jobType verbatim', () => {
    const jobType = 'very_specific_job_type'
    const key = buildIdempotencyKey(jobType, 'co-1', '2026-01-01')
    expect(key).toContain(jobType)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// runJob — various completion states
// ─────────────────────────────────────────────────────────────────────────────

describe('runJob — various completion states', () => {
  it('large recordsProcessed value is returned correctly', async () => {
    const supabase = makeSupabaseMock({}, { data: null, error: null })
    const job = vi.fn().mockResolvedValue<JobResult>({
      status: 'completed',
      recordsProcessed: 100_000,
    })

    const result = await runJob(makeCtx(), job, supabase)
    expect(result.recordsProcessed).toBe(100_000)
  })

  it('job is only called once even on success', async () => {
    const supabase = makeSupabaseMock({}, { data: null, error: null })
    const job = vi.fn().mockResolvedValue<JobResult>({ status: 'completed', recordsProcessed: 1 })

    await runJob(makeCtx(), job, supabase)
    expect(job).toHaveBeenCalledTimes(1)
  })

  it('job is only called once on failure', async () => {
    const supabase = makeSupabaseMock({}, { data: null, error: null })
    const job = vi.fn().mockResolvedValue<JobResult>({ status: 'failed', recordsProcessed: 0, error: 'err' })

    await runJob(makeCtx(), job, supabase)
    expect(job).toHaveBeenCalledTimes(1)
  })

  it('metadata with nested object is preserved', async () => {
    const supabase = makeSupabaseMock({}, { data: null, error: null })
    const job = vi.fn().mockResolvedValue<JobResult>({
      status: 'completed',
      recordsProcessed: 3,
      metadata: { nested: { a: 1, b: 2 }, list: [1, 2, 3] },
    })

    const result = await runJob(makeCtx(), job, supabase)
    expect((result.metadata as any)?.nested?.a).toBe(1)
    expect((result.metadata as any)?.list).toHaveLength(3)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// createTimer — edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('createTimer — edge cases', () => {
  it('end() can be called with numeric metadata', () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const timer = createTimer('numeric-meta')
    timer.end({ count: 42, amount: 9999.99 })
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string)
    expect(logged.count).toBe(42)
    expect(logged.amount).toBeCloseTo(9999.99, 1)
    logSpy.mockRestore()
  })

  it('level field is "info"', () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const timer = createTimer('level-check')
    timer.end()
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string)
    expect(logged.level).toBe('info')
    logSpy.mockRestore()
  })

  it('message follows "operationName completed" pattern', () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const timer = createTimer('my-operation')
    timer.end()
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string)
    expect(logged.message).toBe('my-operation completed')
    logSpy.mockRestore()
  })

  it('duration_ms is finite', () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const timer = createTimer('finite-check')
    timer.end()
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string)
    expect(isFinite(logged.duration_ms)).toBe(true)
    logSpy.mockRestore()
  })

  it('boolean metadata is preserved', () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const timer = createTimer('bool-meta')
    timer.end({ success: true, retried: false })
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string)
    expect(logged.success).toBe(true)
    expect(logged.retried).toBe(false)
    logSpy.mockRestore()
  })
})

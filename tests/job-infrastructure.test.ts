/**
 * Tests for lib/jobs/job-runner.service.ts
 *
 * Pure function tests — no DB connections, no mocks required.
 * Covers: buildJobKey, shouldSkipJob, classifyJobResult, formatJobDuration
 */
import { describe, it, expect } from 'vitest'
import {
  buildJobKey,
  shouldSkipJob,
  classifyJobResult,
  formatJobDuration,
  type JobType,
} from '../lib/jobs/job-runner.service'

// ── buildJobKey ───────────────────────────────────────────────────────────────

describe('buildJobKey — format', () => {
  it('produces colon-separated key: jobType:companyId:date', () => {
    const key = buildJobKey('interest_accrual', 'company-uuid-123', '2025-05-30')
    expect(key).toBe('interest_accrual:company-uuid-123:2025-05-30')
  })

  it('starts with the job type', () => {
    const key = buildJobKey('overdue_update', 'co-1', '2026-01-15')
    expect(key.startsWith('overdue_update')).toBe(true)
  })

  it('ends with the date string', () => {
    const key = buildJobKey('pdf_generation', 'co-99', '2026-03-31')
    expect(key.endsWith('2026-03-31')).toBe(true)
  })

  it('contains the company ID in the middle', () => {
    const key = buildJobKey('alert_evaluation', 'company-xyz', '2026-06-01')
    expect(key).toContain('company-xyz')
  })

  it('uses colon as separator (not underscore)', () => {
    const key = buildJobKey('interest_accrual', 'co-1', '2026-01-01')
    const parts = key.split(':')
    expect(parts).toHaveLength(3)
  })

  it('all three segments are present and non-empty', () => {
    const key = buildJobKey('period_close_reminder', 'co-abc', '2026-07-04')
    const [jt, cid, d] = key.split(':')
    expect(jt).toBe('period_close_reminder')
    expect(cid).toBe('co-abc')
    expect(d).toBe('2026-07-04')
  })
})

describe('buildJobKey — idempotency', () => {
  it('same args always produce the same key', () => {
    const k1 = buildJobKey('interest_accrual', 'company-uuid', '2025-05-30')
    const k2 = buildJobKey('interest_accrual', 'company-uuid', '2025-05-30')
    expect(k1).toBe(k2)
  })

  it('calling multiple times returns identical results', () => {
    const keys = Array.from({ length: 10 }, () =>
      buildJobKey('overdue_update', 'co-42', '2026-02-28'),
    )
    const allSame = keys.every(k => k === keys[0])
    expect(allSame).toBe(true)
  })

  it('different dates produce different keys', () => {
    const k1 = buildJobKey('interest_accrual', 'co-1', '2026-01-01')
    const k2 = buildJobKey('interest_accrual', 'co-1', '2026-01-02')
    expect(k1).not.toBe(k2)
  })

  it('different companies produce different keys', () => {
    const k1 = buildJobKey('interest_accrual', 'co-a', '2026-01-01')
    const k2 = buildJobKey('interest_accrual', 'co-b', '2026-01-01')
    expect(k1).not.toBe(k2)
  })

  it('different job types produce different keys', () => {
    const k1 = buildJobKey('interest_accrual', 'co-1', '2026-01-01')
    const k2 = buildJobKey('overdue_update', 'co-1', '2026-01-01')
    expect(k1).not.toBe(k2)
  })

  it('16 unique dates produce 16 unique keys', () => {
    const dates = Array.from({ length: 16 }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`)
    const keys = dates.map(d => buildJobKey('pdf_generation', 'co-1', d))
    expect(new Set(keys).size).toBe(16)
  })
})

// ── shouldSkipJob ─────────────────────────────────────────────────────────────

describe('shouldSkipJob — never run before', () => {
  it('returns false when lastRunAt is null', () => {
    const result = shouldSkipJob(null, 60_000, Date.now())
    expect(result).toBe(false)
  })

  it('returns false for null lastRunAt regardless of interval', () => {
    expect(shouldSkipJob(null, 0, Date.now())).toBe(false)
    expect(shouldSkipJob(null, 99_999_999, Date.now())).toBe(false)
  })
})

describe('shouldSkipJob — within interval', () => {
  it('returns true when elapsed time is less than minIntervalMs', () => {
    const now = Date.now()
    const lastRunAt = new Date(now - 30_000).toISOString()  // 30s ago
    const result = shouldSkipJob(lastRunAt, 60_000, now)    // interval = 60s
    expect(result).toBe(true)
  })

  it('returns true when job just ran 1ms ago', () => {
    const now = Date.now()
    const lastRunAt = new Date(now - 1).toISOString()
    expect(shouldSkipJob(lastRunAt, 60_000, now)).toBe(true)
  })

  it('returns true when barely within interval', () => {
    const now = Date.now()
    const lastRunAt = new Date(now - 59_999).toISOString()  // 1ms shy of 60s
    expect(shouldSkipJob(lastRunAt, 60_000, now)).toBe(true)
  })
})

describe('shouldSkipJob — after interval', () => {
  it('returns false when elapsed time exceeds minIntervalMs', () => {
    const now = Date.now()
    const lastRunAt = new Date(now - 90_000).toISOString()  // 90s ago
    const result = shouldSkipJob(lastRunAt, 60_000, now)    // interval = 60s
    expect(result).toBe(false)
  })

  it('returns false when exactly at interval boundary', () => {
    const now = Date.now()
    const lastRunAt = new Date(now - 60_000).toISOString()  // exactly 60s ago
    expect(shouldSkipJob(lastRunAt, 60_000, now)).toBe(false)
  })

  it('returns false when well past interval (daily check after 25h)', () => {
    const now = Date.now()
    const lastRunAt = new Date(now - 25 * 60 * 60 * 1000).toISOString()
    expect(shouldSkipJob(lastRunAt, 24 * 60 * 60 * 1000, now)).toBe(false)
  })
})

// ── classifyJobResult ─────────────────────────────────────────────────────────

describe('classifyJobResult — error case', () => {
  it('returns "failed" when error is non-null', () => {
    expect(classifyJobResult(0, 'something went wrong')).toBe('failed')
  })

  it('returns "failed" when error is non-null even if records > 0', () => {
    expect(classifyJobResult(5, 'partial failure')).toBe('failed')
  })

  it('returns "failed" for any non-null error string', () => {
    expect(classifyJobResult(100, 'timeout')).toBe('failed')
    expect(classifyJobResult(0, 'DB error')).toBe('failed')
    expect(classifyJobResult(0, '')).toBe('failed')  // empty string is non-null
  })
})

describe('classifyJobResult — skipped case', () => {
  it('returns "skipped" when records=0 and no error', () => {
    expect(classifyJobResult(0, null)).toBe('skipped')
  })

  it('returns "skipped" for 0 records with null error', () => {
    const status = classifyJobResult(0, null)
    expect(status).toBe('skipped')
  })
})

describe('classifyJobResult — completed case', () => {
  it('returns "completed" when records > 0 and no error', () => {
    expect(classifyJobResult(1, null)).toBe('completed')
  })

  it('returns "completed" for any positive record count', () => {
    expect(classifyJobResult(5, null)).toBe('completed')
    expect(classifyJobResult(100, null)).toBe('completed')
    expect(classifyJobResult(10_000, null)).toBe('completed')
  })

  it('error takes priority over records count', () => {
    // error !== null → always failed, even with records
    const status = classifyJobResult(50, 'network error')
    expect(status).toBe('failed')
    expect(status).not.toBe('completed')
  })
})

// ── formatJobDuration ─────────────────────────────────────────────────────────

describe('formatJobDuration — seconds', () => {
  it('formats sub-minute duration with "s" suffix', () => {
    const start = '2026-01-01T10:00:00.000Z'
    const end   = '2026-01-01T10:00:03.200Z'   // 3.2 seconds
    expect(formatJobDuration(start, end)).toBe('3.2s')
  })

  it('formats 0 elapsed as "0s"', () => {
    const ts = '2026-01-01T10:00:00.000Z'
    const result = formatJobDuration(ts, ts)
    expect(result).toBe('0s')
  })

  it('formats 10.5 seconds correctly', () => {
    const start = '2026-01-01T10:00:00.000Z'
    const end   = '2026-01-01T10:00:10.500Z'
    expect(formatJobDuration(start, end)).toBe('10.5s')
  })

  it('formats just under 1 minute (59.9s)', () => {
    const start = '2026-01-01T10:00:00.000Z'
    const end   = '2026-01-01T10:00:59.900Z'
    const result = formatJobDuration(start, end)
    expect(result.endsWith('s')).toBe(true)
    expect(result).not.toContain('m ')
  })
})

describe('formatJobDuration — minutes', () => {
  it('formats 84 seconds as "1m 24s"', () => {
    const start = '2026-01-01T10:00:00.000Z'
    const end   = '2026-01-01T10:01:24.000Z'   // 84 seconds
    expect(formatJobDuration(start, end)).toBe('1m 24s')
  })

  it('formats 2 minutes exactly as "2m 0s"', () => {
    const start = '2026-01-01T10:00:00.000Z'
    const end   = '2026-01-01T10:02:00.000Z'   // 120 seconds
    expect(formatJobDuration(start, end)).toBe('2m 0s')
  })

  it('formats 65 seconds as "1m 5s"', () => {
    const start = '2026-01-01T10:00:00.000Z'
    const end   = '2026-01-01T10:01:05.000Z'
    expect(formatJobDuration(start, end)).toBe('1m 5s')
  })

  it('formats large duration correctly (10m 30s)', () => {
    const start = '2026-01-01T10:00:00.000Z'
    const end   = '2026-01-01T10:10:30.000Z'   // 630 seconds
    expect(formatJobDuration(start, end)).toBe('10m 30s')
  })

  it('result contains "m " for durations >= 60 seconds', () => {
    const start = '2026-01-01T10:00:00.000Z'
    const end   = '2026-01-01T10:01:00.000Z'   // exactly 60 seconds
    const result = formatJobDuration(start, end)
    expect(result).toContain('m ')
  })
})

describe('formatJobDuration — return type', () => {
  it('always returns a string', () => {
    const start = '2026-01-01T00:00:00.000Z'
    const end   = '2026-01-01T00:00:05.000Z'
    expect(typeof formatJobDuration(start, end)).toBe('string')
  })

  it('result is non-empty', () => {
    const start = '2026-05-01T00:00:00.000Z'
    const end   = '2026-05-01T00:01:00.000Z'
    expect(formatJobDuration(start, end).length).toBeGreaterThan(0)
  })
})

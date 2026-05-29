/**
 * Tests for lib/rate-limit.ts
 *
 * Tests the in-memory token bucket adapter via the public rateLimit() API.
 * Uses the adapter-swap hook (setRateLimitAdapter) to isolate state between tests.
 *
 * Run with: npx vitest run tests/rate-limit.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  rateLimit,
  setRateLimitAdapter,
  RATE_LIMIT_PRESETS,
  type RateLimitAdapter,
  type RateLimitOptions,
  type RateLimitResult,
} from '../lib/rate-limit'

// ── Fresh adapter per test ──────────────────────────────────────────────────
//
// The default adapter is a singleton; we reset it to a fresh InMemoryAdapter
// before each test so counts don't bleed across test cases.
//
// We do this by replacing it with a copy that implements the same logic.

class FreshInMemoryAdapter implements RateLimitAdapter {
  private readonly store = new Map<string, { count: number; resetAt: number }>()

  check(identifier: string, opts: RateLimitOptions): RateLimitResult {
    const now   = Date.now()
    let   entry = this.store.get(identifier)
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + opts.windowMs }
      this.store.set(identifier, entry)
    }
    entry.count++
    this.store.set(identifier, entry)
    return {
      allowed:   entry.count <= opts.limit,
      remaining: Math.max(0, opts.limit - entry.count),
      resetAt:   entry.resetAt,
    }
  }
}

beforeEach(() => {
  setRateLimitAdapter(new FreshInMemoryAdapter())
})

// ── RATE_LIMIT_PRESETS — shape and values ────────────────────────────────────

describe('RATE_LIMIT_PRESETS', () => {
  it('has auth, pdf, api_write, api_read keys', () => {
    expect(RATE_LIMIT_PRESETS).toHaveProperty('auth')
    expect(RATE_LIMIT_PRESETS).toHaveProperty('pdf')
    expect(RATE_LIMIT_PRESETS).toHaveProperty('api_write')
    expect(RATE_LIMIT_PRESETS).toHaveProperty('api_read')
  })

  it('auth limit is 10 per 60s', () => {
    expect(RATE_LIMIT_PRESETS.auth.limit).toBe(10)
    expect(RATE_LIMIT_PRESETS.auth.windowMs).toBe(60_000)
  })

  it('api_read has higher limit than api_write', () => {
    expect(RATE_LIMIT_PRESETS.api_read.limit).toBeGreaterThan(RATE_LIMIT_PRESETS.api_write.limit)
  })

  it('all presets have positive limit and windowMs', () => {
    for (const [, opts] of Object.entries(RATE_LIMIT_PRESETS)) {
      expect(opts.limit).toBeGreaterThan(0)
      expect(opts.windowMs).toBeGreaterThan(0)
    }
  })
})

// ── rateLimit() — first call is always allowed ────────────────────────────────

describe('rateLimit — first request always allowed', () => {
  it('first call to any identifier is allowed', () => {
    const result = rateLimit('user-abc', { limit: 5, windowMs: 60_000 })
    expect(result.allowed).toBe(true)
  })

  it('remaining decrements on each call', () => {
    const r1 = rateLimit('user-x', { limit: 3, windowMs: 60_000 })
    const r2 = rateLimit('user-x', { limit: 3, windowMs: 60_000 })
    expect(r1.remaining).toBe(2)
    expect(r2.remaining).toBe(1)
  })

  it('returns allowed=true until limit is hit', () => {
    const opts = { limit: 3, windowMs: 60_000 }
    expect(rateLimit('u1', opts).allowed).toBe(true)
    expect(rateLimit('u1', opts).allowed).toBe(true)
    expect(rateLimit('u1', opts).allowed).toBe(true)
  })

  it('returns allowed=false on the (limit+1)th call', () => {
    const opts = { limit: 2, windowMs: 60_000 }
    rateLimit('u2', opts) // 1
    rateLimit('u2', opts) // 2
    const result = rateLimit('u2', opts) // 3 — exceeds limit
    expect(result.allowed).toBe(false)
  })

  it('remaining is 0 when limit is exactly hit', () => {
    const opts = { limit: 1, windowMs: 60_000 }
    const result = rateLimit('u3', opts)
    expect(result.remaining).toBe(0)
    expect(result.allowed).toBe(true)
  })

  it('remaining is 0 (not negative) when over limit', () => {
    const opts = { limit: 1, windowMs: 60_000 }
    rateLimit('u4', opts) // uses the 1 allowance
    const result = rateLimit('u4', opts) // over limit
    expect(result.remaining).toBe(0)
    expect(result.allowed).toBe(false)
  })
})

// ── rateLimit() — identifier isolation ─────────────────────────────────────

describe('rateLimit — identifier isolation', () => {
  it('different identifiers have independent counts', () => {
    const opts = { limit: 1, windowMs: 60_000 }
    rateLimit('user-A', opts) // A: 1/1 — hits limit
    const result = rateLimit('user-B', opts) // B: 1/1 — fresh, allowed
    expect(result.allowed).toBe(true)
  })

  it('preset string identifier is namespaced (does not collide with custom)', () => {
    // Call with string preset first, then custom opts for same logical user
    // They should use different internal keys
    const customOpts = { limit: 100, windowMs: 60_000 }
    const r1 = rateLimit('myuser', 'api_read')
    const r2 = rateLimit('myuser', customOpts)
    // Both should be allowed (separate keys)
    expect(r1.allowed).toBe(true)
    expect(r2.allowed).toBe(true)
  })
})

// ── rateLimit() — resetAt field ───────────────────────────────────────────────

describe('rateLimit — resetAt timestamp', () => {
  it('resetAt is in the future (within the window)', () => {
    const now = Date.now()
    const result = rateLimit('ts-test', { limit: 5, windowMs: 60_000 })
    expect(result.resetAt).toBeGreaterThan(now)
    expect(result.resetAt).toBeLessThanOrEqual(now + 60_000 + 10)
  })

  it('resetAt is consistent across calls within the same window', () => {
    const opts = { limit: 5, windowMs: 60_000 }
    const r1 = rateLimit('ts-test2', opts)
    const r2 = rateLimit('ts-test2', opts)
    expect(r1.resetAt).toBe(r2.resetAt)
  })
})

// ── rateLimit() — string preset names ────────────────────────────────────────

describe('rateLimit — preset name usage', () => {
  it('accepts string preset "auth"', () => {
    const result = rateLimit('ip-1.2.3.4', 'auth')
    expect(result.allowed).toBe(true)
  })

  it('accepts string preset "api_write"', () => {
    const result = rateLimit('company-abc', 'api_write')
    expect(result.allowed).toBe(true)
  })

  it('auth preset enforces limit=10', () => {
    // Make 10 calls — all allowed
    for (let i = 0; i < 10; i++) {
      expect(rateLimit('ip-limit-test', 'auth').allowed).toBe(true)
    }
    // 11th call — denied
    expect(rateLimit('ip-limit-test', 'auth').allowed).toBe(false)
  })
})

// ── setRateLimitAdapter — custom adapter works ────────────────────────────────

describe('setRateLimitAdapter — custom adapter', () => {
  it('a "always allow" adapter makes rateLimit() always return allowed=true', () => {
    const alwaysAllow: RateLimitAdapter = {
      check: () => ({ allowed: true, remaining: 999, resetAt: Date.now() + 60_000 }),
    }
    setRateLimitAdapter(alwaysAllow)
    for (let i = 0; i < 100; i++) {
      expect(rateLimit('spam', { limit: 1, windowMs: 1 }).allowed).toBe(true)
    }
  })

  it('a "always deny" adapter makes rateLimit() always return allowed=false', () => {
    const alwaysDeny: RateLimitAdapter = {
      check: () => ({ allowed: false, remaining: 0, resetAt: Date.now() + 1 }),
    }
    setRateLimitAdapter(alwaysDeny)
    expect(rateLimit('any', { limit: 1000, windowMs: 60_000 }).allowed).toBe(false)
  })
})

// ── RATE_LIMIT_PRESETS — extended shape checks ────────────────────────────────

describe('RATE_LIMIT_PRESETS — extended checks', () => {
  it('pdf preset has limit=20 per 60s', () => {
    expect(RATE_LIMIT_PRESETS.pdf.limit).toBe(20)
    expect(RATE_LIMIT_PRESETS.pdf.windowMs).toBe(60_000)
  })

  it('api_write preset has limit=60 per 60s', () => {
    expect(RATE_LIMIT_PRESETS.api_write.limit).toBe(60)
    expect(RATE_LIMIT_PRESETS.api_write.windowMs).toBe(60_000)
  })

  it('api_read preset has limit=300 per 60s', () => {
    expect(RATE_LIMIT_PRESETS.api_read.limit).toBe(300)
    expect(RATE_LIMIT_PRESETS.api_read.windowMs).toBe(60_000)
  })

  it('all presets use 60_000ms window (1 minute)', () => {
    for (const [, opts] of Object.entries(RATE_LIMIT_PRESETS)) {
      expect(opts.windowMs).toBe(60_000)
    }
  })

  it('api_read limit is 5x higher than api_write', () => {
    expect(RATE_LIMIT_PRESETS.api_read.limit / RATE_LIMIT_PRESETS.api_write.limit).toBe(5)
  })

  it('object keys match expected preset names exactly', () => {
    const keys = Object.keys(RATE_LIMIT_PRESETS).sort()
    expect(keys).toEqual(['api_read', 'api_write', 'auth', 'pdf'].sort())
  })
})

// ── rateLimit() — key namespacing behaviour ─────────────────────────────────

describe('rateLimit — key namespacing', () => {
  it('same user with different presets do not share counters', () => {
    const opts = { limit: 1, windowMs: 60_000 }
    rateLimit('shared-user', 'auth')     // uses key "auth:shared-user"
    rateLimit('shared-user', 'pdf')      // uses key "pdf:shared-user"
    const r = rateLimit('shared-user', opts)  // uses key "custom:shared-user"
    // All three are different keys — none should be rate-limited yet
    expect(r.allowed).toBe(true)
  })

  it('custom opts with identical identifiers share the "custom:" namespace', () => {
    const opts = { limit: 2, windowMs: 60_000 }
    rateLimit('ns-test', opts) // 1
    rateLimit('ns-test', opts) // 2
    const r = rateLimit('ns-test', opts) // 3 — over limit
    expect(r.allowed).toBe(false)
  })
})

// ── rateLimit() — high-volume stress ──────────────────────────────────────────

describe('rateLimit — high-volume requests', () => {
  it('exactly limit requests are allowed, limit+1 is denied', () => {
    const limit = 50
    const opts = { limit, windowMs: 60_000 }
    const id = 'hv-test'
    for (let i = 0; i < limit; i++) {
      expect(rateLimit(id, opts).allowed).toBe(true)
    }
    expect(rateLimit(id, opts).allowed).toBe(false)
  })

  it('remaining decrements monotonically from limit-1 to 0', () => {
    const limit = 5
    const opts = { limit, windowMs: 60_000 }
    const id = 'mono-test'
    let prev = limit
    for (let i = 0; i < limit; i++) {
      const r = rateLimit(id, opts)
      expect(r.remaining).toBe(prev - 1)
      prev = r.remaining
    }
  })

  it('remaining never goes below 0 after limit is exceeded', () => {
    const opts = { limit: 2, windowMs: 60_000 }
    const id = 'floor-test'
    rateLimit(id, opts)
    rateLimit(id, opts)
    rateLimit(id, opts)
    const r = rateLimit(id, opts)
    expect(r.remaining).toBe(0)
  })
})

// ── rateLimit() — result shape ─────────────────────────────────────────────────

describe('rateLimit — result shape', () => {
  it('result has allowed, remaining, resetAt fields', () => {
    const r = rateLimit('shape-test', { limit: 5, windowMs: 60_000 })
    expect(r).toHaveProperty('allowed')
    expect(r).toHaveProperty('remaining')
    expect(r).toHaveProperty('resetAt')
  })

  it('allowed is boolean', () => {
    const r = rateLimit('bool-test', { limit: 5, windowMs: 60_000 })
    expect(typeof r.allowed).toBe('boolean')
  })

  it('remaining is a non-negative integer', () => {
    const r = rateLimit('int-test', { limit: 5, windowMs: 60_000 })
    expect(typeof r.remaining).toBe('number')
    expect(r.remaining).toBeGreaterThanOrEqual(0)
    expect(Number.isInteger(r.remaining)).toBe(true)
  })

  it('resetAt is a positive Unix timestamp in milliseconds', () => {
    const r = rateLimit('ts-shape-test', { limit: 5, windowMs: 60_000 })
    expect(typeof r.resetAt).toBe('number')
    expect(r.resetAt).toBeGreaterThan(1_000_000_000_000)  // > Jan 2001 in ms
  })
})

// ── rateLimit() — preset pdf enforcement ──────────────────────────────────────

describe('rateLimit — pdf preset enforcement', () => {
  it('pdf preset allows exactly 20 requests', () => {
    for (let i = 0; i < 20; i++) {
      expect(rateLimit('pdf-user', 'pdf').allowed).toBe(true)
    }
    expect(rateLimit('pdf-user', 'pdf').allowed).toBe(false)
  })
})

// ── rateLimit() — api_write preset enforcement ────────────────────────────────

describe('rateLimit — api_write preset enforcement', () => {
  it('api_write preset allows exactly 60 requests', () => {
    for (let i = 0; i < 60; i++) {
      expect(rateLimit('writer', 'api_write').allowed).toBe(true)
    }
    expect(rateLimit('writer', 'api_write').allowed).toBe(false)
  })
})

// ── setRateLimitAdapter — counting adapter ────────────────────────────────────

describe('setRateLimitAdapter — custom counting adapter', () => {
  it('custom adapter receives the correct namespaced identifier', () => {
    const received: string[] = []
    const recordingAdapter: RateLimitAdapter = {
      check: (id, opts) => {
        received.push(id)
        return { allowed: true, remaining: opts.limit, resetAt: Date.now() + opts.windowMs }
      },
    }
    setRateLimitAdapter(recordingAdapter)
    rateLimit('my-company', 'auth')
    expect(received[0]).toBe('auth:my-company')
  })

  it('custom adapter with fixed remaining returns that value', () => {
    const fixedAdapter: RateLimitAdapter = {
      check: () => ({ allowed: true, remaining: 42, resetAt: Date.now() + 60_000 }),
    }
    setRateLimitAdapter(fixedAdapter)
    const r = rateLimit('any-id', 'api_read')
    expect(r.remaining).toBe(42)
  })
})

// ── RATE_LIMIT_PRESETS — key existence and field types ────────────────────────

describe('RATE_LIMIT_PRESETS — key existence', () => {
  it('has exactly 4 preset keys', () => {
    expect(Object.keys(RATE_LIMIT_PRESETS).length).toBe(4)
  })

  it('each preset has a "limit" field that is a number', () => {
    for (const [, opts] of Object.entries(RATE_LIMIT_PRESETS)) {
      expect(typeof opts.limit).toBe('number')
    }
  })

  it('each preset has a "windowMs" field that is a number', () => {
    for (const [, opts] of Object.entries(RATE_LIMIT_PRESETS)) {
      expect(typeof opts.windowMs).toBe('number')
    }
  })

  it('auth limit is strictly less than api_write limit', () => {
    expect(RATE_LIMIT_PRESETS.auth.limit).toBeLessThan(RATE_LIMIT_PRESETS.api_write.limit)
  })

  it('pdf limit is strictly less than api_write limit', () => {
    expect(RATE_LIMIT_PRESETS.pdf.limit).toBeLessThan(RATE_LIMIT_PRESETS.api_write.limit)
  })

  it('auth preset limit value is reasonable (> 0, < 1000)', () => {
    expect(RATE_LIMIT_PRESETS.auth.limit).toBeGreaterThan(0)
    expect(RATE_LIMIT_PRESETS.auth.limit).toBeLessThan(1000)
  })

  it('all windowMs values are positive', () => {
    for (const [, opts] of Object.entries(RATE_LIMIT_PRESETS)) {
      expect(opts.windowMs).toBeGreaterThan(0)
    }
  })

  it('all limit values are at least 1', () => {
    for (const [, opts] of Object.entries(RATE_LIMIT_PRESETS)) {
      expect(opts.limit).toBeGreaterThanOrEqual(1)
    }
  })
})

// ── rateLimit — custom adapter that always allows ─────────────────────────────

describe('rateLimit — custom adapter always-allow', () => {
  it('always-allow adapter permits 1000 consecutive requests', () => {
    const alwaysAllow: RateLimitAdapter = {
      check: (_id, opts) => ({ allowed: true, remaining: opts.limit, resetAt: Date.now() + opts.windowMs }),
    }
    setRateLimitAdapter(alwaysAllow)
    for (let i = 0; i < 1000; i++) {
      expect(rateLimit('flood', { limit: 1, windowMs: 1 }).allowed).toBe(true)
    }
  })

  it('always-allow adapter returns remaining equal to limit on each call', () => {
    const alwaysAllow: RateLimitAdapter = {
      check: (_id, opts) => ({ allowed: true, remaining: opts.limit, resetAt: Date.now() + opts.windowMs }),
    }
    setRateLimitAdapter(alwaysAllow)
    const limit = 5
    const r = rateLimit('test', { limit, windowMs: 60_000 })
    expect(r.remaining).toBe(limit)
  })

  it('always-allow adapter allows even with limit=1 after many calls', () => {
    let callCount = 0
    const countingAlwaysAllow: RateLimitAdapter = {
      check: () => {
        callCount++
        return { allowed: true, remaining: 99, resetAt: Date.now() + 60_000 }
      },
    }
    setRateLimitAdapter(countingAlwaysAllow)
    for (let i = 0; i < 20; i++) {
      rateLimit('counter-test', { limit: 1, windowMs: 1 })
    }
    expect(callCount).toBe(20)
  })
})

// ── rateLimit — burst behaviour ───────────────────────────────────────────────

describe('rateLimit — burst behaviour', () => {
  it('allows first N requests and denies N+1', () => {
    const N = 7
    const opts = { limit: N, windowMs: 60_000 }
    const id = 'burst-test'
    for (let i = 0; i < N; i++) {
      expect(rateLimit(id, opts).allowed).toBe(true)
    }
    expect(rateLimit(id, opts).allowed).toBe(false)
  })

  it('after limit+1 is denied, remaining is still 0', () => {
    const opts = { limit: 3, windowMs: 60_000 }
    const id = 'burst-remaining'
    rateLimit(id, opts) // 1
    rateLimit(id, opts) // 2
    rateLimit(id, opts) // 3 — limit hit
    const r = rateLimit(id, opts) // 4 — over
    expect(r.remaining).toBe(0)
    expect(r.allowed).toBe(false)
  })

  it('requests beyond 2× limit still return remaining=0', () => {
    const opts = { limit: 2, windowMs: 60_000 }
    const id = 'burst-deep'
    for (let i = 0; i < 10; i++) {
      rateLimit(id, opts)
    }
    const r = rateLimit(id, opts)
    expect(r.remaining).toBe(0)
  })

  it('burst with limit=1: second call is always denied', () => {
    const opts = { limit: 1, windowMs: 60_000 }
    rateLimit('burst-one', opts)
    expect(rateLimit('burst-one', opts).allowed).toBe(false)
  })
})

// ── rateLimit — key independence ──────────────────────────────────────────────

describe('rateLimit — different keys are independent', () => {
  it('filling key A does not affect key B', () => {
    const opts = { limit: 2, windowMs: 60_000 }
    rateLimit('key-A', opts)
    rateLimit('key-A', opts)
    rateLimit('key-A', opts) // over limit for A
    const r = rateLimit('key-B', opts) // B is fresh
    expect(r.allowed).toBe(true)
  })

  it('100 unique keys each allow their own first request', () => {
    const opts = { limit: 1, windowMs: 60_000 }
    for (let i = 0; i < 100; i++) {
      expect(rateLimit(`unique-key-${i}`, opts).allowed).toBe(true)
    }
  })

  it('exhausting one preset key does not affect a different preset key for same user', () => {
    // Exhaust auth for 'shared'
    for (let i = 0; i < 10; i++) {
      rateLimit('shared', 'auth')
    }
    rateLimit('shared', 'auth') // over
    // pdf for same user should still be unaffected
    const r = rateLimit('shared', 'pdf')
    expect(r.allowed).toBe(true)
  })

  it('two users with same custom opts do not share counters', () => {
    const opts = { limit: 1, windowMs: 60_000 }
    rateLimit('alice', opts) // Alice: 1/1 — limit hit
    const r = rateLimit('bob', opts) // Bob: 1/1 — fresh
    expect(r.allowed).toBe(true)
  })
})

// ── RATE_LIMIT_PRESETS — reasonable values ────────────────────────────────────

describe('RATE_LIMIT_PRESETS — value reasonableness', () => {
  it('auth limit is 10 (brute-force protection should be strict)', () => {
    expect(RATE_LIMIT_PRESETS.auth.limit).toBe(10)
  })

  it('pdf limit is 20', () => {
    expect(RATE_LIMIT_PRESETS.pdf.limit).toBe(20)
  })

  it('api_write limit is 60', () => {
    expect(RATE_LIMIT_PRESETS.api_write.limit).toBe(60)
  })

  it('api_read limit is 300', () => {
    expect(RATE_LIMIT_PRESETS.api_read.limit).toBe(300)
  })

  it('auth windowMs is 60 seconds', () => {
    expect(RATE_LIMIT_PRESETS.auth.windowMs).toBe(60_000)
  })

  it('preset limits form a strictly ascending sequence: auth < pdf < api_write < api_read', () => {
    const { auth, pdf, api_write, api_read } = RATE_LIMIT_PRESETS
    expect(auth.limit).toBeLessThan(pdf.limit)
    expect(pdf.limit).toBeLessThan(api_write.limit)
    expect(api_write.limit).toBeLessThan(api_read.limit)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Inline custom RateLimitOptions (not a preset string)
// ─────────────────────────────────────────────────────────────────────────────

describe('rateLimit() with inline RateLimitOptions', () => {
  beforeEach(() => setRateLimitAdapter(new FreshInMemoryAdapter()))

  it('custom limit=1 — first call allowed, second blocked', () => {
    const opts = { limit: 1, windowMs: 60_000 }
    const r1 = rateLimit('id-custom-1', opts)
    const r2 = rateLimit('id-custom-1', opts)
    expect(r1.allowed).toBe(true)
    expect(r2.allowed).toBe(false)
  })

  it('custom limit=5 — 5 calls allowed, 6th blocked', () => {
    const opts = { limit: 5, windowMs: 60_000 }
    const id = 'id-custom-5'
    for (let i = 0; i < 5; i++) {
      expect(rateLimit(id, opts).allowed).toBe(true)
    }
    expect(rateLimit(id, opts).allowed).toBe(false)
  })

  it('different identifiers with same options are independent', () => {
    const opts = { limit: 1, windowMs: 60_000 }
    const r1 = rateLimit('id-a', opts)
    const r2 = rateLimit('id-b', opts)
    expect(r1.allowed).toBe(true)
    expect(r2.allowed).toBe(true)
  })

  it('remaining decrements on each call', () => {
    const opts = { limit: 3, windowMs: 60_000 }
    const id = 'id-rem'
    const r1 = rateLimit(id, opts)
    const r2 = rateLimit(id, opts)
    const r3 = rateLimit(id, opts)
    expect(r1.remaining).toBe(2)
    expect(r2.remaining).toBe(1)
    expect(r3.remaining).toBe(0)
  })

  it('remaining never goes below 0', () => {
    const opts = { limit: 1, windowMs: 60_000 }
    const id = 'id-floor'
    rateLimit(id, opts)  // 1st — allowed, remaining=0
    const r = rateLimit(id, opts)  // 2nd — blocked, remaining=0
    expect(r.remaining).toBe(0)
    expect(r.remaining).toBeGreaterThanOrEqual(0)
  })

  it('resetAt is in the future', () => {
    const opts = { limit: 5, windowMs: 60_000 }
    const r = rateLimit('id-reset', opts)
    expect(r.resetAt).toBeGreaterThan(Date.now())
  })

  it('resetAt is within windowMs of now', () => {
    const opts = { limit: 5, windowMs: 30_000 }
    const before = Date.now()
    const r = rateLimit('id-reset2', opts)
    expect(r.resetAt).toBeLessThanOrEqual(before + 30_000 + 100)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Adapter swap — setRateLimitAdapter
// ─────────────────────────────────────────────────────────────────────────────

describe('setRateLimitAdapter() — custom adapter', () => {
  beforeEach(() => setRateLimitAdapter(new FreshInMemoryAdapter()))

  it('custom adapter returning allowed=false is respected', () => {
    const alwaysDeny: RateLimitAdapter = {
      check: () => ({ allowed: false, remaining: 0, resetAt: Date.now() + 1000 }),
    }
    setRateLimitAdapter(alwaysDeny)
    const r = rateLimit('any-id', 'api_read')
    expect(r.allowed).toBe(false)
    expect(r.remaining).toBe(0)
  })

  it('custom adapter always allowing is respected', () => {
    const alwaysAllow: RateLimitAdapter = {
      check: () => ({ allowed: true, remaining: 999, resetAt: Date.now() + 1000 }),
    }
    setRateLimitAdapter(alwaysAllow)
    const r = rateLimit('any-id', 'auth')
    expect(r.allowed).toBe(true)
    expect(r.remaining).toBe(999)
  })

  it('swapping back to a FreshInMemoryAdapter restores counting', () => {
    const alwaysDeny: RateLimitAdapter = {
      check: () => ({ allowed: false, remaining: 0, resetAt: Date.now() + 1000 }),
    }
    setRateLimitAdapter(alwaysDeny)
    expect(rateLimit('x', 'auth').allowed).toBe(false)

    setRateLimitAdapter(new FreshInMemoryAdapter())
    expect(rateLimit('x', 'auth').allowed).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// rateLimit() — all 4 presets by name
// ─────────────────────────────────────────────────────────────────────────────

describe('rateLimit() — named presets allowed on first call', () => {
  beforeEach(() => setRateLimitAdapter(new FreshInMemoryAdapter()))

  it('auth preset: first call is allowed', () => {
    expect(rateLimit('uid-auth', 'auth').allowed).toBe(true)
  })

  it('pdf preset: first call is allowed', () => {
    expect(rateLimit('uid-pdf', 'pdf').allowed).toBe(true)
  })

  it('api_write preset: first call is allowed', () => {
    expect(rateLimit('uid-write', 'api_write').allowed).toBe(true)
  })

  it('api_read preset: first call is allowed', () => {
    expect(rateLimit('uid-read', 'api_read').allowed).toBe(true)
  })

  it('auth preset: 10th call allowed, 11th blocked', () => {
    const id = 'brute-force-uid'
    for (let i = 0; i < 10; i++) {
      expect(rateLimit(id, 'auth').allowed).toBe(true)
    }
    expect(rateLimit(id, 'auth').allowed).toBe(false)
  })

  it('pdf preset: 20th call allowed, 21st blocked', () => {
    const id = 'pdf-heavy-uid'
    for (let i = 0; i < 20; i++) {
      expect(rateLimit(id, 'pdf').allowed).toBe(true)
    }
    expect(rateLimit(id, 'pdf').allowed).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// RATE_LIMIT_PRESETS — window sizes
// ─────────────────────────────────────────────────────────────────────────────

describe('RATE_LIMIT_PRESETS — window sizes all 60s', () => {
  it('pdf windowMs is 60 seconds', () => {
    expect(RATE_LIMIT_PRESETS.pdf.windowMs).toBe(60_000)
  })

  it('api_write windowMs is 60 seconds', () => {
    expect(RATE_LIMIT_PRESETS.api_write.windowMs).toBe(60_000)
  })

  it('api_read windowMs is 60 seconds', () => {
    expect(RATE_LIMIT_PRESETS.api_read.windowMs).toBe(60_000)
  })

  it('all presets share the same windowMs', () => {
    const windows = Object.values(RATE_LIMIT_PRESETS).map(p => p.windowMs)
    const unique = new Set(windows)
    expect(unique.size).toBe(1)
    expect([...unique][0]).toBe(60_000)
  })
})

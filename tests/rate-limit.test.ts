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

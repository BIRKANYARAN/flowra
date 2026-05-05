// ── Rate Limit Adapter — upgradeable architecture ─────────────────────────────
//
// Current backend: in-memory token bucket (single-instance, Edge-compatible).
// Future backend:  Redis/Upstash via @upstash/ratelimit.
//
// To switch backends:
//   1. Implement RateLimitAdapter interface
//   2. Set the active adapter: setRateLimitAdapter(new RedisAdapter(...))
//   3. No changes needed in middleware or callers
//
// The adapter interface is intentionally minimal so Redis implementation
// is a straightforward drop-in.

// ── Public interface (stable — DO NOT change without migration) ───────────────

export interface RateLimitResult {
  allowed:   boolean
  remaining: number
  resetAt:   number    // Unix ms when the window resets
}

export interface RateLimitOptions {
  limit:    number   // max requests in window
  windowMs: number   // window duration in milliseconds
}

/** Any backend must implement this single method. */
export interface RateLimitAdapter {
  check(identifier: string, opts: RateLimitOptions): RateLimitResult
}

// ── Built-in presets (shared across adapters) ─────────────────────────────────

export const RATE_LIMIT_PRESETS: Record<string, RateLimitOptions> = {
  auth:      { limit: 10,  windowMs: 60_000 },   // 10 req / min — brute force guard
  pdf:       { limit: 20,  windowMs: 60_000 },   // 20 req / min — CPU-heavy
  api_write: { limit: 60,  windowMs: 60_000 },   // 60 writes / min
  api_read:  { limit: 300, windowMs: 60_000 },   // 300 reads / min
}

// ── In-memory token bucket adapter (default) ─────────────────────────────────

interface BucketEntry { count: number; resetAt: number }

class InMemoryAdapter implements RateLimitAdapter {
  private readonly store = new Map<string, BucketEntry>()

  check(identifier: string, opts: RateLimitOptions): RateLimitResult {
    const now   = Date.now()
    let   entry = this.store.get(identifier)

    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + opts.windowMs }
      this.store.set(identifier, entry)
    }

    entry.count++
    this.store.set(identifier, entry)

    // Periodic GC — prevent unbounded growth
    if (this.store.size > 10_000) {
      for (const [k, v] of this.store.entries()) {
        if (now >= v.resetAt) this.store.delete(k)
      }
    }

    return {
      allowed:   entry.count <= opts.limit,
      remaining: Math.max(0, opts.limit - entry.count),
      resetAt:   entry.resetAt,
    }
  }
}

// ── Active adapter (swap this to switch backends) ─────────────────────────────

let _adapter: RateLimitAdapter = new InMemoryAdapter()

/**
 * Replace the active adapter at startup.
 * Example (future Redis):
 *   import { RedisRateLimitAdapter } from '@/lib/rate-limit-redis'
 *   setRateLimitAdapter(new RedisRateLimitAdapter(redis))
 */
export function setRateLimitAdapter(adapter: RateLimitAdapter): void {
  _adapter = adapter
}

// ── Public API (unchanged from callers' perspective) ─────────────────────────

export function rateLimit(
  identifier: string,
  preset:     keyof typeof RATE_LIMIT_PRESETS | RateLimitOptions
): RateLimitResult {
  const opts = typeof preset === 'string' ? RATE_LIMIT_PRESETS[preset] : preset
  const key  = `${typeof preset === 'string' ? preset : 'custom'}:${identifier}`
  return _adapter.check(key, opts)
}

// ── Future Redis adapter stub (compile-time contract, NOT implemented here) ───
//
// When ready, create lib/rate-limit-redis.ts with:
//
//   import type { RateLimitAdapter, RateLimitResult, RateLimitOptions } from './rate-limit'
//   import { Ratelimit } from '@upstash/ratelimit'
//   import { Redis }     from '@upstash/redis'
//
//   export class RedisRateLimitAdapter implements RateLimitAdapter {
//     private ratelimit: Ratelimit
//     constructor(redis: Redis) {
//       this.ratelimit = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '1 m') })
//     }
//     async check(id: string, opts: RateLimitOptions): Promise<RateLimitResult> {
//       const { success, remaining, reset } = await this.ratelimit.limit(id)
//       return { allowed: success, remaining, resetAt: reset }
//     }
//   }
//
// Then in app startup (e.g. instrumentation.ts):
//   setRateLimitAdapter(new RedisRateLimitAdapter(redis))

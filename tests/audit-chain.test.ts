/**
 * Tests for lib/services/audit-chain.service.ts
 *
 * Tests the SHA-256 tamper-evident hash chain verification.
 * Uses a lightweight supabase mock that returns in-memory row arrays.
 *
 * Key functions:
 *   verifyAuditChain(companyId, from, to, supabase) → ChainVerifyResult
 *   stampAuditRow(rowId, companyId, row, supabase)   → void (side-effect)
 *
 * Run with: npx vitest run tests/audit-chain.test.ts
 */
import { describe, it, expect, vi } from 'vitest'
import { verifyAuditChain, stampAuditRow } from '../lib/services/audit-chain.service'
import type { ChainVerifyResult } from '../lib/services/audit-chain.service'

// ── SHA-256 helper (mirrors the service's sha256hex) ─────────────────────────

async function sha256hex(input: string): Promise<string> {
  const data    = new TextEncoder().encode(input)
  const hashBuf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// rowPayload mirrors the service's private rowPayload()
function rowPayload(row: {
  action: string; resource_type: string; resource_id: string
  old_values: unknown; new_values: unknown; created_at: string
}): string {
  return [
    row.action        ?? '',
    row.resource_type ?? '',
    row.resource_id   ?? '',
    JSON.stringify(row.old_values ?? null),
    JSON.stringify(row.new_values ?? null),
    row.created_at    ?? '',
  ].join('|')
}

// Build a valid chain of N rows, computing correct content_hash + prev_hash
async function buildChain(n: number) {
  const rows: Array<{
    id: string; action: string; resource_type: string; resource_id: string
    old_values: unknown; new_values: unknown; created_at: string
    content_hash: string; prev_hash: string | null
  }> = []

  let prevHash: string | null = null

  for (let i = 0; i < n; i++) {
    const row = {
      id:            `row-${i}`,
      action:        'create',
      resource_type: 'sale',
      resource_id:   `sale-${i}`,
      old_values:    null,
      new_values:    { amount: i * 1000 },
      created_at:    `2025-01-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
    }
    const contentHash = await sha256hex(rowPayload(row) + (prevHash ?? ''))
    rows.push({ ...row, content_hash: contentHash, prev_hash: prevHash })
    prevHash = contentHash
  }
  return rows
}

// ── Supabase mock factory ─────────────────────────────────────────────────────

function makeMockSupabase(rows: unknown[]) {
  // Simulates the chained query builder used in verifyAuditChain
  const builder = {
    data: rows,
    error: null as null | { message: string },
    select:  () => builder,
    eq:      () => builder,
    gte:     () => builder,
    lte:     () => builder,
    neq:     () => builder,
    order:   () => builder,
    limit:   () => builder,
    update:  () => builder,
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    then:    (fn: (v: unknown) => unknown) => Promise.resolve(fn({ data: rows, error: null })),
  }
  return { from: () => builder }
}

function makeErrorSupabase() {
  const builder = {
    data: null,
    error: { message: 'DB error' },
    select:  () => builder,
    eq:      () => builder,
    gte:     () => builder,
    lte:     () => builder,
    neq:     () => builder,
    order:   () => builder,
    limit:   () => builder,
    then:    (fn: (v: unknown) => unknown) => Promise.resolve(fn({ data: null, error: { message: 'DB error' } })),
  }
  return { from: () => builder }
}

// ── verifyAuditChain — empty set ──────────────────────────────────────────────

describe('verifyAuditChain — empty result set', () => {
  it('returns ok=true, total_checked=0 when no rows', async () => {
    const result = await verifyAuditChain('co1', '2025-01-01', '2025-01-31', makeMockSupabase([]))
    expect(result.ok).toBe(true)
    expect(result.total_checked).toBe(0)
    expect(result.broken_links).toBe(0)
    expect(result.is_supported).toBe(true)
  })
})

// ── verifyAuditChain — DB error ───────────────────────────────────────────────

describe('verifyAuditChain — DB error handling', () => {
  it('returns is_supported=false on DB error', async () => {
    const result = await verifyAuditChain('co1', '2025-01-01', '2025-01-31', makeErrorSupabase())
    expect(result.is_supported).toBe(false)
    expect(result.ok).toBe(true)    // no broken links found (no data)
    expect(result.total_checked).toBe(0)
  })
})

// ── verifyAuditChain — pre-migration (no content_hash column) ────────────────

describe('verifyAuditChain — pre-migration rows', () => {
  it('returns is_supported=false when rows have no content_hash field', async () => {
    const rows = [
      { id: 'r1', action: 'create', resource_type: 'sale', resource_id: 's1',
        old_values: null, new_values: {}, created_at: '2025-01-01T10:00:00Z',
        // No content_hash or prev_hash — pre-migration state
      },
    ]
    const result = await verifyAuditChain('co1', '2025-01-01', '2025-01-31', makeMockSupabase(rows))
    expect(result.is_supported).toBe(false)
    expect(result.ok).toBe(true)
  })
})

// ── verifyAuditChain — valid chain ────────────────────────────────────────────

describe('verifyAuditChain — valid intact chain', () => {
  it('reports ok=true, broken_links=0 for a correctly chained 3-row set', async () => {
    const rows = await buildChain(3)
    const result = await verifyAuditChain('co1', '2025-01-01', '2025-01-31', makeMockSupabase(rows))
    expect(result.ok).toBe(true)
    expect(result.is_supported).toBe(true)
    expect(result.total_checked).toBe(3)
    expect(result.broken_links).toBe(0)
    expect(result.first_broken).toBeUndefined()
  })

  it('single row with no prev_hash is valid', async () => {
    const rows = await buildChain(1)
    expect(rows[0].prev_hash).toBeNull()
    const result = await verifyAuditChain('co1', '2025-01-01', '2025-01-31', makeMockSupabase(rows))
    expect(result.ok).toBe(true)
    expect(result.total_checked).toBe(1)
    expect(result.broken_links).toBe(0)
  })

  it('10-row chain is fully valid', async () => {
    const rows = await buildChain(10)
    const result = await verifyAuditChain('co1', '2025-01-01', '2025-01-31', makeMockSupabase(rows))
    expect(result.ok).toBe(true)
    expect(result.total_checked).toBe(10)
    expect(result.broken_links).toBe(0)
  })
})

// ── verifyAuditChain — tampered rows ─────────────────────────────────────────

describe('verifyAuditChain — tampered chain detection', () => {
  it('detects single tampered row (content_hash changed)', async () => {
    const rows = await buildChain(5)
    // Tamper: change the content_hash of row 2 to something invalid
    rows[2] = { ...rows[2], content_hash: 'deadbeef'.repeat(8) }
    const result = await verifyAuditChain('co1', '2025-01-01', '2025-01-31', makeMockSupabase(rows))
    expect(result.ok).toBe(false)
    expect(result.is_supported).toBe(true)
    expect(result.broken_links).toBeGreaterThan(0)
    expect(result.first_broken).toBeDefined()
    expect(result.first_broken?.id).toBe('row-2')
  })

  it('detects tampered row data (new_values changed)', async () => {
    const rows = await buildChain(4)
    // Tamper: change the new_values of row 1 but keep original content_hash
    rows[1] = { ...rows[1], new_values: { amount: 99999 } }
    // content_hash still reflects old new_values → mismatch
    const result = await verifyAuditChain('co1', '2025-01-01', '2025-01-31', makeMockSupabase(rows))
    expect(result.ok).toBe(false)
    expect(result.first_broken?.id).toBe('row-1')
  })

  it('detects when first row is tampered', async () => {
    const rows = await buildChain(3)
    rows[0] = { ...rows[0], content_hash: 'aaaa' + 'bb'.repeat(30) }
    const result = await verifyAuditChain('co1', '2025-01-01', '2025-01-31', makeMockSupabase(rows))
    expect(result.ok).toBe(false)
    expect(result.first_broken?.id).toBe('row-0')
  })

  it('chain after tampered row may have cascading broken links', async () => {
    const rows = await buildChain(5)
    // Tamper first row's content_hash only — subsequent prev_hash references break
    rows[0] = { ...rows[0], content_hash: 'tampered-hash' }
    const result = await verifyAuditChain('co1', '2025-01-01', '2025-01-31', makeMockSupabase(rows))
    // At minimum row-0 is broken; subsequent rows' expected hashes also won't match
    expect(result.ok).toBe(false)
    expect(result.broken_links).toBeGreaterThanOrEqual(1)
  })
})

// ── verifyAuditChain — rows with null content_hash ───────────────────────────

describe('verifyAuditChain — mixed stamped/unstamped rows', () => {
  it('skips rows with null content_hash gracefully', async () => {
    const rows = await buildChain(3)
    // Set middle row's content_hash to null (unstamped row)
    const nullRow = { ...rows[1], content_hash: null as unknown as string }
    const mixedRows = [rows[0], nullRow, rows[2]]
    // Should not throw; just skip the null-hash row
    await expect(
      verifyAuditChain('co1', '2025-01-01', '2025-01-31', makeMockSupabase(mixedRows))
    ).resolves.toBeDefined()
  })
})

// ── sha256hex purity ──────────────────────────────────────────────────────────

describe('SHA-256 determinism (via service output)', () => {
  it('same input always produces same hash', async () => {
    const h1 = await sha256hex('test|sale|id1|null|null|2025-01-01T10:00:00Z')
    const h2 = await sha256hex('test|sale|id1|null|null|2025-01-01T10:00:00Z')
    expect(h1).toBe(h2)
  })

  it('different inputs produce different hashes', async () => {
    const h1 = await sha256hex('create|sale|id1|null|null|2025-01-01T10:00:00Z')
    const h2 = await sha256hex('delete|sale|id1|null|null|2025-01-01T10:00:00Z')
    expect(h1).not.toBe(h2)
  })

  it('hash is 64 hex characters (256 bits)', async () => {
    const h = await sha256hex('any input')
    expect(h).toHaveLength(64)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })

  it('empty input produces a valid hash', async () => {
    const h = await sha256hex('')
    expect(h).toHaveLength(64)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })
})

// ── stampAuditRow — mock interaction ─────────────────────────────────────────

describe('stampAuditRow', () => {
  it('calls supabase update with a 64-char content_hash', async () => {
    let capturedUpdate: unknown = null

    const mockSupabase = {
      from: () => ({
        select:   () => ({
          eq:         () => ({
            neq:      () => ({
              order:  () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
        update:   (vals: unknown) => {
          capturedUpdate = vals
          return {
            eq: () => Promise.resolve({ error: null }),
          }
        },
      }),
    }

    const row = {
      action: 'create', resource_type: 'sale', resource_id: 'sale-001',
      old_values: null, new_values: { total: 1000 }, created_at: '2025-01-15T10:00:00Z',
    }

    await stampAuditRow('row-uuid', 'company-uuid', row, mockSupabase)

    expect(capturedUpdate).not.toBeNull()
    const update = capturedUpdate as { content_hash: string; prev_hash: null }
    expect(update.content_hash).toHaveLength(64)
    expect(update.content_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(update.prev_hash).toBeNull()  // no previous row → null
  })

  it('does not throw when supabase update fails (non-fatal)', async () => {
    const mockFailing = {
      from: () => ({
        select:   () => ({ eq: () => ({ neq: () => ({ order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) }) }),
        update:   () => { throw new Error('Network error') },
      }),
    }

    const row = {
      action: 'create', resource_type: 'sale', resource_id: 'sale-002',
      old_values: null, new_values: {}, created_at: '2025-01-16T10:00:00Z',
    }

    // Should not throw — errors are caught internally
    await expect(
      stampAuditRow('row-uuid-2', 'company-uuid', row, mockFailing)
    ).resolves.not.toThrow()
  })
})

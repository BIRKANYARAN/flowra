// Behavioral test for verifyAuditChain — the tamper-evidence verifier that
// USED to return ok:true on any error (it queried non-existent columns, so it
// ALWAYS reported the chain healthy). Verifies the real-column path + that a
// query error or tamper now reports ok:false.
import { describe, it, expect } from 'vitest'
import { verifyAuditChain } from '@/lib/services/audit-chain.service'

async function sha256hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}
// Replicates rowPayload(row) mapped from the real columns (must match the service).
function payload(r: { action: string; entity_type: string; entity_id: string; old_data: unknown; new_data: unknown; created_at: string }): string {
  return [r.action, r.entity_type, r.entity_id, JSON.stringify(r.old_data ?? null), JSON.stringify(r.new_data ?? null), r.created_at].join('|')
}

// Minimal thenable query-builder mock: every chained method returns `this`;
// awaiting resolves to { data, error }.
function mockClient(result: { data: unknown; error: unknown }) {
  const qb: Record<string, unknown> = {}
  for (const m of ['from', 'select', 'eq', 'gte', 'lte', 'order']) qb[m] = () => qb
  ;(qb as { then: unknown }).then = (res: (v: unknown) => unknown) => res(result)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return qb as any
}

const base = { action: 'update', entity_id: 'e1', old_data: { a: 1 }, new_data: { a: 2 }, created_at: '2026-06-01T00:00:00Z' }

async function stampedChain() {
  const r1 = { id: '1', entity_type: 'sale', ...base }
  const h1 = await sha256hex(payload(r1) + '')          // genesis: prevHash ''
  const r2 = { id: '2', entity_type: 'expense', ...base, created_at: '2026-06-01T01:00:00Z' }
  const h2 = await sha256hex(payload(r2) + h1)           // links to h1
  return [
    { ...r1, content_hash: h1, prev_hash: null },
    { ...r2, content_hash: h2, prev_hash: h1 },
  ]
}

describe('verifyAuditChain — tamper-evidence (real audit_logs columns)', () => {
  it('reports ok:false on a query error (was the always-OK bug)', async () => {
    const r = await verifyAuditChain('co', '2026-06-01', '2026-06-30', mockClient({ data: null, error: { code: '42703' } }))
    expect(r.ok).toBe(false)
    expect(r.is_supported).toBe(false)
  })

  it('reports ok:true with broken_links 0 for a correctly-stamped chain', async () => {
    const rows = await stampedChain()
    const r = await verifyAuditChain('co', '2026-06-01', '2026-06-30', mockClient({ data: rows, error: null }))
    expect(r.ok).toBe(true)
    expect(r.total_checked).toBe(2)
    expect(r.broken_links).toBe(0)
  })

  it('detects tampering (mutated old_data) → ok:false with a broken link', async () => {
    const rows = await stampedChain()
    // Tamper row 1's data WITHOUT re-stamping → recomputed hash no longer matches.
    rows[0].old_data = { a: 999 }
    const r = await verifyAuditChain('co', '2026-06-01', '2026-06-30', mockClient({ data: rows, error: null }))
    expect(r.ok).toBe(false)
    expect(r.broken_links).toBeGreaterThanOrEqual(1)
    expect(r.first_broken?.id).toBe('1')
  })

  it('vacuously ok when there are no rows', async () => {
    const r = await verifyAuditChain('co', '2026-06-01', '2026-06-30', mockClient({ data: [], error: null }))
    expect(r.ok).toBe(true)
    expect(r.total_checked).toBe(0)
  })
})

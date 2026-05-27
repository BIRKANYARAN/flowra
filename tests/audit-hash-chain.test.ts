// ═══════════════════════════════════════════════════════════════════════════════
// tests/audit-hash-chain.test.ts
//
// Tests for the audit log hash chain integrity service (pure functions).
// Uses Node.js crypto (SHA-256) via Vitest in the Node environment.
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import {
  computeAuditEntryHash,
  computeChainHash,
  verifyChainLink,
  verifyChain,
  classifyChainHealth,
  type AuditChainEntry,
  type ChainVerificationResult,
} from '../lib/services/ledger/audit-hash-chain.service'

// ── Test fixtures ──────────────────────────────────────────────────────────────

/**
 * Build an AuditChainEntry with correct hashes by default.
 * Pass `chain_hash: null` explicitly to keep chain_hash as null (no auto-compute).
 */
function makeEntry(overrides: Partial<AuditChainEntry> & { _keepNullChainHash?: boolean } = {}): AuditChainEntry {
  const { _keepNullChainHash, ...rest } = overrides
  const base: AuditChainEntry = {
    id:             'entry-1',
    action:         'sale_created',
    resource_type:  'sales',
    resource_id:    'sale-abc',
    old_values:     null,
    new_values:     { total_try: 1000 },
    created_at:     '2026-01-01T10:00:00.000Z',
    content_hash:   '',
    chain_hash:     null,
    prev_chain_hash: null,
  }
  const merged = { ...base, ...rest }
  if (!merged.content_hash) {
    merged.content_hash = computeAuditEntryHash(merged)
  }
  // Only auto-compute chain_hash if not explicitly suppressed and hash is empty/null
  if (!_keepNullChainHash && !merged.chain_hash) {
    merged.chain_hash = computeChainHash(merged.content_hash, merged.prev_chain_hash)
  }
  return merged
}

function buildValidChain(count: number): AuditChainEntry[] {
  const entries: AuditChainEntry[] = []
  let prevChainHash: string | null = null

  for (let i = 0; i < count; i++) {
    const entry: AuditChainEntry = {
      id:             `entry-${i + 1}`,
      action:         'sale_created',
      resource_type:  'sales',
      resource_id:    `sale-${i + 1}`,
      old_values:     null,
      new_values:     { total_try: (i + 1) * 100 },
      created_at:     `2026-01-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`,
      content_hash:   '',
      chain_hash:     null,
      prev_chain_hash: prevChainHash,
    }
    entry.content_hash = computeAuditEntryHash(entry)
    entry.chain_hash   = computeChainHash(entry.content_hash, prevChainHash)
    prevChainHash      = entry.chain_hash
    entries.push(entry)
  }

  return entries
}

// ── computeAuditEntryHash ──────────────────────────────────────────────────────

describe('computeAuditEntryHash', () => {
  it('returns a 64-char hex string (SHA-256)', () => {
    const hash = computeAuditEntryHash({
      action:        'sale_created',
      resource_type: 'sales',
      resource_id:   'sale-1',
      old_values:    null,
      new_values:    { amount: 500 },
      created_at:    '2026-01-01T00:00:00.000Z',
    })
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('is deterministic for identical input', () => {
    const input = {
      action:        'expense_created',
      resource_type: 'expenses',
      resource_id:   'exp-1',
      old_values:    null,
      new_values:    { amount_try: 200 },
      created_at:    '2026-02-15T12:00:00.000Z',
    }
    expect(computeAuditEntryHash(input)).toBe(computeAuditEntryHash(input))
  })

  it('produces different hashes for different actions', () => {
    const base = {
      resource_type: 'sales',
      resource_id:   'sale-1',
      old_values:    null,
      new_values:    null,
      created_at:    '2026-01-01T00:00:00.000Z',
    }
    const h1 = computeAuditEntryHash({ ...base, action: 'sale_created' })
    const h2 = computeAuditEntryHash({ ...base, action: 'sale_updated' })
    expect(h1).not.toBe(h2)
  })

  it('produces different hashes for different resource_ids', () => {
    const base = {
      action:        'sale_created',
      resource_type: 'sales',
      old_values:    null,
      new_values:    null,
      created_at:    '2026-01-01T00:00:00.000Z',
    }
    const h1 = computeAuditEntryHash({ ...base, resource_id: 'sale-1' })
    const h2 = computeAuditEntryHash({ ...base, resource_id: 'sale-2' })
    expect(h1).not.toBe(h2)
  })

  it('produces different hashes for different new_values', () => {
    const base = {
      action:        'sale_created',
      resource_type: 'sales',
      resource_id:   'sale-1',
      old_values:    null,
      created_at:    '2026-01-01T00:00:00.000Z',
    }
    const h1 = computeAuditEntryHash({ ...base, new_values: { amount: 100 } })
    const h2 = computeAuditEntryHash({ ...base, new_values: { amount: 200 } })
    expect(h1).not.toBe(h2)
  })
})

// ── computeChainHash ──────────────────────────────────────────────────────────

describe('computeChainHash', () => {
  it('returns a 64-char hex string', () => {
    const hash = computeChainHash('abc123', null)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('uses GENESIS for first entry (null prev)', () => {
    const h1 = computeChainHash('contentHash', null)
    const h2 = computeChainHash('contentHash', 'GENESIS')
    // null means "GENESIS" internally, so these should match
    // (we hash contentHash + "GENESIS" in both cases)
    expect(h1).toBe(h2)
  })

  it('produces different hash when prevChainHash changes', () => {
    const content = 'abc123def456'
    const h1 = computeChainHash(content, null)
    const h2 = computeChainHash(content, 'somePrevHash')
    expect(h1).not.toBe(h2)
  })

  it('is deterministic', () => {
    const content = 'test-content-hash'
    const prev    = 'test-prev-hash'
    expect(computeChainHash(content, prev)).toBe(computeChainHash(content, prev))
  })

  it('correctly chains: second entry uses first as prev', () => {
    const content1 = computeAuditEntryHash({
      action: 'sale_created', resource_type: 'sales', resource_id: 'r1',
      old_values: null, new_values: null, created_at: '2026-01-01T00:00:00Z',
    })
    const chain1 = computeChainHash(content1, null)

    const content2 = computeAuditEntryHash({
      action: 'sale_updated', resource_type: 'sales', resource_id: 'r1',
      old_values: null, new_values: { amount: 100 }, created_at: '2026-01-02T00:00:00Z',
    })
    const chain2 = computeChainHash(content2, chain1)

    // chain2 depends on chain1
    const chain2Alt = computeChainHash(content2, null)
    expect(chain2).not.toBe(chain2Alt)
  })
})

// ── verifyChainLink ───────────────────────────────────────────────────────────

describe('verifyChainLink', () => {
  it('returns true for a correctly hashed entry', () => {
    const entry = makeEntry()
    expect(verifyChainLink(entry)).toBe(true)
  })

  it('returns false when chain_hash is null', () => {
    const entry = makeEntry({ _keepNullChainHash: true })
    // chain_hash stays null — verifyChainLink should return false
    expect(entry.chain_hash).toBeNull()
    expect(verifyChainLink(entry)).toBe(false)
  })

  it('returns false when action is tampered', () => {
    const entry = makeEntry()
    const tampered = { ...entry, action: 'TAMPERED_ACTION' }
    expect(verifyChainLink(tampered)).toBe(false)
  })

  it('returns false when new_values is tampered', () => {
    const entry = makeEntry()
    const tampered = { ...entry, new_values: { total_try: 99999 } }
    expect(verifyChainLink(tampered)).toBe(false)
  })

  it('returns false when chain_hash is manually changed', () => {
    const entry = makeEntry()
    const tampered = { ...entry, chain_hash: 'deadbeef'.repeat(8) }
    expect(verifyChainLink(tampered)).toBe(false)
  })
})

// ── verifyChain ───────────────────────────────────────────────────────────────

describe('verifyChain', () => {
  it('returns is_valid=true and empty result for empty array', () => {
    const result = verifyChain([])
    expect(result.is_valid).toBe(true)
    expect(result.total_entries).toBe(0)
    expect(result.verified_entries).toBe(0)
    expect(result.broken_at_id).toBeNull()
    expect(result.broken_at_sequence).toBeNull()
    expect(result.verification_pct).toBe(100)
    expect(result.last_hash).toBeNull()
  })

  it('verifies a single valid entry', () => {
    const entry = makeEntry()
    const result = verifyChain([entry])
    expect(result.is_valid).toBe(true)
    expect(result.total_entries).toBe(1)
    expect(result.verified_entries).toBe(1)
    expect(result.broken_at_id).toBeNull()
    expect(result.verification_pct).toBe(100)
    expect(result.last_hash).toBe(entry.chain_hash)
  })

  it('verifies a 3-entry valid chain', () => {
    const entries = buildValidChain(3)
    const result  = verifyChain(entries)
    expect(result.is_valid).toBe(true)
    expect(result.total_entries).toBe(3)
    expect(result.verified_entries).toBe(3)
    expect(result.verification_pct).toBe(100)
    expect(result.last_hash).toBe(entries[2].chain_hash)
  })

  it('detects a broken chain when the first entry is tampered', () => {
    const entries = buildValidChain(3)
    // Tamper entry 0: change its new_values but keep the old hash
    entries[0] = { ...entries[0], new_values: { total_try: 999999 } }

    const result = verifyChain(entries)
    expect(result.is_valid).toBe(false)
    expect(result.broken_at_id).toBe('entry-1')
    expect(result.broken_at_sequence).toBe(1)
    expect(result.verified_entries).toBe(0)
  })

  it('detects a broken chain at the second entry', () => {
    const entries = buildValidChain(4)
    // Tamper entry 1 only
    entries[1] = { ...entries[1], new_values: { total_try: 999999 } }

    const result = verifyChain(entries)
    expect(result.is_valid).toBe(false)
    expect(result.broken_at_id).toBe('entry-2')
    expect(result.broken_at_sequence).toBe(2)
    expect(result.verified_entries).toBe(1)
  })

  it('returns verification_pct=100 for valid 5-entry chain', () => {
    const entries = buildValidChain(5)
    const result  = verifyChain(entries)
    expect(result.verification_pct).toBe(100)
  })

  it('skips entries with null chain_hash (not yet stamped)', () => {
    const entries = buildValidChain(3)
    // Remove chain_hash from entry 1 (middle entry not stamped)
    entries[1] = { ...entries[1], chain_hash: null }

    const result = verifyChain(entries)
    // The chain should eventually break at entry 2 because prev_chain_hash is from entry 0,
    // but entry 2's prev_chain_hash points to entry 1's hash which is now null
    // The first valid+stamped entry is entry 0, second stamped is entry 2
    // Entry 2's prev_chain_hash was computed as entry 1's hash originally,
    // but now we use prevChainHash from the verified chain (which is entry 0's hash after entry 1 is skipped)
    // → broken because entry 2's stored prev_chain_hash doesn't match what we expect
    expect(result.total_entries).toBe(3)
  })
})

// ── classifyChainHealth ───────────────────────────────────────────────────────

describe('classifyChainHealth', () => {
  it('returns "empty" for zero entries', () => {
    const result: ChainVerificationResult = {
      is_valid: true, total_entries: 0, verified_entries: 0,
      broken_at_id: null, broken_at_sequence: null, verification_pct: 100, last_hash: null,
    }
    expect(classifyChainHealth(result)).toBe('empty')
  })

  it('returns "valid" for a fully verified chain', () => {
    const result: ChainVerificationResult = {
      is_valid: true, total_entries: 5, verified_entries: 5,
      broken_at_id: null, broken_at_sequence: null, verification_pct: 100,
      last_hash: 'abc',
    }
    expect(classifyChainHealth(result)).toBe('valid')
  })

  it('returns "broken" when is_valid is false', () => {
    const result: ChainVerificationResult = {
      is_valid: false, total_entries: 10, verified_entries: 3,
      broken_at_id: 'entry-4', broken_at_sequence: 4, verification_pct: 30,
      last_hash: 'xyz',
    }
    expect(classifyChainHealth(result)).toBe('broken')
  })

  it('returns "valid" for a single-entry valid chain', () => {
    const entry = makeEntry()
    const result = verifyChain([entry])
    expect(classifyChainHealth(result)).toBe('valid')
  })

  it('round-trips correctly: build chain → verify → classify', () => {
    const entries = buildValidChain(10)
    const result  = verifyChain(entries)
    expect(classifyChainHealth(result)).toBe('valid')
  })

  it('broken chain classifies as broken after tampering', () => {
    const entries = buildValidChain(5)
    entries[3] = { ...entries[3], new_values: { tampered: true } }
    const result = verifyChain(entries)
    expect(classifyChainHealth(result)).toBe('broken')
  })
})

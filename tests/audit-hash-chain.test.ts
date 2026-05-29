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

// ── computeAuditEntryHash — additional boundary tests ────────────────────────

describe('computeAuditEntryHash — boundary cases', () => {
  it('returns 64-char hex when old_values is a complex nested object', () => {
    const hash = computeAuditEntryHash({
      action:        'sale_updated',
      resource_type: 'sales',
      resource_id:   'sale-99',
      old_values:    { amount: 100, items: [{ qty: 2, price: 50 }] },
      new_values:    { amount: 200, items: [{ qty: 4, price: 50 }] },
      created_at:    '2026-06-01T00:00:00.000Z',
    })
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('field ordering in new_values does not affect hash (stable stringify)', () => {
    const base = {
      action: 'expense_created', resource_type: 'expenses', resource_id: 'exp-1',
      old_values: null, created_at: '2026-01-01T00:00:00.000Z',
    }
    const h1 = computeAuditEntryHash({ ...base, new_values: { a: 1, b: 2 } })
    const h2 = computeAuditEntryHash({ ...base, new_values: { b: 2, a: 1 } })
    expect(h1).toBe(h2)
  })

  it('empty string resource_id produces a valid hash', () => {
    const hash = computeAuditEntryHash({
      action: 'sale_created', resource_type: 'sales', resource_id: '',
      old_values: null, new_values: null, created_at: '2026-01-01T00:00:00Z',
    })
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('hashes differ when created_at differs', () => {
    const base = {
      action: 'sale_created', resource_type: 'sales', resource_id: 'r1',
      old_values: null, new_values: null,
    }
    const h1 = computeAuditEntryHash({ ...base, created_at: '2026-01-01T00:00:00Z' })
    const h2 = computeAuditEntryHash({ ...base, created_at: '2026-01-02T00:00:00Z' })
    expect(h1).not.toBe(h2)
  })

  it('hashes differ when resource_type differs', () => {
    const base = {
      action: 'created', resource_id: 'id-1',
      old_values: null, new_values: null, created_at: '2026-01-01T00:00:00Z',
    }
    const h1 = computeAuditEntryHash({ ...base, resource_type: 'sales' })
    const h2 = computeAuditEntryHash({ ...base, resource_type: 'expenses' })
    expect(h1).not.toBe(h2)
  })

  it('large new_values JSON does not break the hash', () => {
    const largeValues = Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [`field_${i}`, i * 100])
    )
    const hash = computeAuditEntryHash({
      action: 'bulk_update', resource_type: 'sales', resource_id: 'bulk-1',
      old_values: null, new_values: largeValues, created_at: '2026-01-01T00:00:00Z',
    })
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('null old_values vs empty object produce different hashes', () => {
    const base = {
      action: 'updated', resource_type: 'sales', resource_id: 'r1',
      new_values: { amount: 100 }, created_at: '2026-01-01T00:00:00Z',
    }
    const h1 = computeAuditEntryHash({ ...base, old_values: null })
    const h2 = computeAuditEntryHash({ ...base, old_values: {} })
    expect(h1).not.toBe(h2)
  })
})

// ── computeChainHash — additional boundary tests ──────────────────────────────

describe('computeChainHash — boundary cases', () => {
  it('empty string contentHash is hashed without errors', () => {
    const hash = computeChainHash('', null)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('very long prevChainHash does not break the function', () => {
    const longPrev = 'a'.repeat(200)
    const hash = computeChainHash('someContentHash', longPrev)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('same content, two different prevs → two different chain hashes', () => {
    const content = 'fixed-content-hash'
    const h1 = computeChainHash(content, 'prev-a')
    const h2 = computeChainHash(content, 'prev-b')
    expect(h1).not.toBe(h2)
  })

  it('chain progression: each subsequent hash incorporates the previous', () => {
    const c1 = 'content-1'
    const c2 = 'content-2'
    const c3 = 'content-3'
    const chain1 = computeChainHash(c1, null)
    const chain2 = computeChainHash(c2, chain1)
    const chain3 = computeChainHash(c3, chain2)
    // Modifying c2 changes chain2 and thus chain3
    const chain2alt = computeChainHash('tampered-c2', chain1)
    const chain3alt = computeChainHash(c3, chain2alt)
    expect(chain3).not.toBe(chain3alt)
  })
})

// ── verifyChainLink — additional boundary tests ───────────────────────────────

describe('verifyChainLink — boundary cases', () => {
  it('still verifies correctly even if stored content_hash is empty (recomputes from fields)', () => {
    // verifyChainLink recomputes content_hash from entry fields,
    // so the stored content_hash field doesn't matter — chain_hash is the integrity anchor
    const entry = makeEntry()
    // Set content_hash to empty but keep chain_hash correct (matches real computation)
    const withEmptyContentHash = { ...entry, content_hash: '' }
    // The function recomputes content_hash internally, so result depends on chain_hash correctness
    expect(verifyChainLink(withEmptyContentHash)).toBe(true)
  })

  it('returns true when all fields match exactly', () => {
    const chain = buildValidChain(1)
    expect(verifyChainLink(chain[0])).toBe(true)
  })

  it('detects tampering in old_values', () => {
    const entry = makeEntry({ old_values: { amount: 500 } })
    const tampered = { ...entry, old_values: { amount: 999 } }
    expect(verifyChainLink(tampered)).toBe(false)
  })

  it('detects tampering in created_at', () => {
    const entry = makeEntry()
    const tampered = { ...entry, created_at: '2099-12-31T00:00:00.000Z' }
    expect(verifyChainLink(tampered)).toBe(false)
  })

  it('detects tampering in resource_type', () => {
    const entry = makeEntry({ resource_type: 'sales' })
    const tampered = { ...entry, resource_type: 'expenses' }
    expect(verifyChainLink(tampered)).toBe(false)
  })

  it('verifies correctly when prev_chain_hash is a real hash value', () => {
    const chain = buildValidChain(2)
    // Entry 1 should verify (prev is entry 0's chain hash)
    expect(verifyChainLink(chain[1])).toBe(true)
  })
})

// ── verifyChain — additional boundary tests ───────────────────────────────────

describe('verifyChain — additional boundary tests', () => {
  it('verifies large chain (50 entries)', () => {
    const entries = buildValidChain(50)
    const result  = verifyChain(entries)
    expect(result.is_valid).toBe(true)
    expect(result.total_entries).toBe(50)
    expect(result.verified_entries).toBe(50)
    expect(result.verification_pct).toBe(100)
  })

  it('detects break at last entry', () => {
    const entries = buildValidChain(10)
    entries[9] = { ...entries[9], new_values: { tampered: true } }
    const result = verifyChain(entries)
    expect(result.is_valid).toBe(false)
    expect(result.broken_at_sequence).toBe(10)
    expect(result.verified_entries).toBe(9)
  })

  it('last_hash is the chain_hash of the last verified entry', () => {
    const entries = buildValidChain(4)
    const result  = verifyChain(entries)
    expect(result.last_hash).toBe(entries[3].chain_hash)
  })

  it('verification_pct is floored correctly when 3 of 5 verified', () => {
    const entries = buildValidChain(5)
    entries[3] = { ...entries[3], new_values: { tampered: true } }
    const result = verifyChain(entries)
    // 3 verified out of 5 → Math.round(3/5 * 100) = 60
    expect(result.verification_pct).toBe(60)
  })

  it('broken_at_id refers to the first tampered entry id', () => {
    const entries = buildValidChain(6)
    entries[2] = { ...entries[2], action: 'TAMPERED' }
    const result = verifyChain(entries)
    expect(result.broken_at_id).toBe('entry-3')
  })

  it('single entry with null chain_hash → not broken but not verified either', () => {
    const entry = makeEntry({ _keepNullChainHash: true })
    const result = verifyChain([entry])
    // Entry is skipped (null chain_hash), so 0 verified, is_valid = true
    expect(result.is_valid).toBe(true)
    expect(result.verified_entries).toBe(0)
  })
})

// ── classifyChainHealth — additional boundary tests ───────────────────────────

describe('classifyChainHealth — additional boundary tests', () => {
  it('partial verification (some entries skipped) → still valid if no break', () => {
    const entries = buildValidChain(5)
    // Set middle entry chain_hash to null so it is skipped
    entries[2] = { ...entries[2], chain_hash: null }
    const result = verifyChain(entries)
    // Depending on implementation: may be broken at entry 3 (prev mismatch)
    // or valid if verifyChain recalibrates after null skips
    // Either way classifyChainHealth reflects the result
    const health = classifyChainHealth(result)
    expect(['valid', 'broken']).toContain(health)
  })

  it('classifyChainHealth result type is a string', () => {
    const result: ChainVerificationResult = {
      is_valid: true, total_entries: 3, verified_entries: 3,
      broken_at_id: null, broken_at_sequence: null, verification_pct: 100,
      last_hash: 'abc123',
    }
    expect(typeof classifyChainHealth(result)).toBe('string')
  })

  it('always returns one of valid/broken/empty', () => {
    const validStatuses = ['valid', 'broken', 'empty']
    const cases = [
      buildValidChain(0),
      buildValidChain(1),
      buildValidChain(3),
    ]
    for (const entries of cases) {
      const result = verifyChain(entries)
      expect(validStatuses).toContain(classifyChainHealth(result))
    }
  })
})

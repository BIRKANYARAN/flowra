// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/ledger/audit-hash-chain.service.ts
//
// Tamper-evidence system for the audit log.
// Each audit log entry has a content hash and a chain hash (SHA-256 of
// content hash + previous chain hash). The service verifies chain integrity
// using pure functions — no DB access in the core logic.
// ═══════════════════════════════════════════════════════════════════════════════

import crypto                 from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AuditChainEntry {
  id: string
  action: string
  resource_type: string
  resource_id: string
  old_values: unknown
  new_values: unknown
  created_at: string
  content_hash: string          // stored in DB (may or may not exist yet)
  chain_hash: string | null     // stored in DB (may not exist yet)
  prev_chain_hash: string | null
}

export interface ChainVerificationResult {
  is_valid: boolean
  total_entries: number
  verified_entries: number
  broken_at_id: string | null       // first entry ID where chain breaks
  broken_at_sequence: number | null // 1-based index of the broken entry
  verification_pct: number          // verified / total × 100
  last_hash: string | null          // last valid chain hash
}

export interface AuditChainStatus {
  health: 'valid' | 'broken' | 'empty' | 'unhashed' | 'no_hash_columns'
  entries_count: number
  verified_entries?: number
  verification_pct?: number
  broken_at_id?: string | null
  last_hash?: string | null
  message?: string
}

// ── Internal stable-stringify ──────────────────────────────────────────────────

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  return `{${Object.keys(obj).sort().map(k =>
    `${JSON.stringify(k)}:${stableStringify(obj[k])}`
  ).join(',')}}`
}

// ── Pure functions ─────────────────────────────────────────────────────────────

/**
 * Compute a SHA-256 content hash for a single audit log entry.
 * Input: action + resource_type + resource_id + old_values + new_values + created_at.
 * Output: lowercase hex string.
 */
export function computeAuditEntryHash(entry: {
  action: string
  resource_type: string
  resource_id: string
  old_values: unknown
  new_values: unknown
  created_at: string
}): string {
  const payload = stableStringify({
    action:        entry.action,
    resource_type: entry.resource_type,
    resource_id:   entry.resource_id,
    old_values:    entry.old_values,
    new_values:    entry.new_values,
    created_at:    entry.created_at,
  })
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex')
}

/**
 * Compute chain hash: SHA-256(content_hash + prev_chain_hash).
 * If prev_chain_hash is null (first entry): SHA-256(content_hash + "GENESIS").
 */
export function computeChainHash(
  contentHash: string,
  prevChainHash: string | null,
): string {
  const prev = prevChainHash ?? 'GENESIS'
  return crypto.createHash('sha256').update(contentHash + prev, 'utf8').digest('hex')
}

/**
 * Verify a single entry's chain link.
 * Returns true if the computed chain_hash matches the stored chain_hash.
 */
export function verifyChainLink(entry: AuditChainEntry): boolean {
  if (!entry.chain_hash) return false
  const computedContent = computeAuditEntryHash(entry)
  const computedChain   = computeChainHash(computedContent, entry.prev_chain_hash)
  return computedChain === entry.chain_hash
}

/**
 * Verify full chain: check each entry's chain_hash is correct given previous.
 * Entries must be sorted by created_at ASC (oldest first).
 */
export function verifyChain(entries: AuditChainEntry[]): ChainVerificationResult {
  const total = entries.length

  if (total === 0) {
    return {
      is_valid:           true,
      total_entries:      0,
      verified_entries:   0,
      broken_at_id:       null,
      broken_at_sequence: null,
      verification_pct:   100,
      last_hash:          null,
    }
  }

  let verifiedEntries = 0
  let prevChainHash: string | null = null
  let broken_at_id:       string | null = null
  let broken_at_sequence: number | null = null
  let lastHash: string | null = null

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]

    // Skip entries that have no chain_hash (not yet stamped)
    if (!entry.chain_hash) continue

    const computedContent = computeAuditEntryHash(entry)
    const expectedPrev    = prevChainHash  // null for first stamped entry
    const computedChain   = computeChainHash(computedContent, expectedPrev)

    if (computedChain !== entry.chain_hash) {
      broken_at_id       = entry.id
      broken_at_sequence = i + 1
      break
    }

    verifiedEntries++
    prevChainHash = entry.chain_hash
    lastHash      = entry.chain_hash
  }

  const is_valid       = broken_at_id === null
  const verification_pct = total > 0
    ? Math.round((verifiedEntries / total) * 100)
    : 100

  return {
    is_valid,
    total_entries:      total,
    verified_entries:   verifiedEntries,
    broken_at_id,
    broken_at_sequence,
    verification_pct,
    last_hash:          lastHash,
  }
}

/**
 * Classify chain health from a verification result.
 */
export function classifyChainHealth(
  result: ChainVerificationResult,
): 'valid' | 'broken' | 'empty' {
  if (result.total_entries === 0) return 'empty'
  if (!result.is_valid)           return 'broken'
  return 'valid'
}

// ── Service class ──────────────────────────────────────────────────────────────

export class AuditHashChainService {
  constructor(private readonly supabase: AnyClient) {}

  /**
   * Get the current chain status for a company's audit log.
   * Queries the last `limit` entries (default 200) ordered by created_at ASC.
   * Gracefully handles the case where hash columns don't exist yet.
   */
  async getChainStatus(
    companyId: string,
    limit = 200,
  ): Promise<AuditChainStatus> {
    // Try querying with hash columns
    const { data, error } = await this.supabase
      .from('audit_logs')
      .select('id, action, entity_type, entity_id, old_data, new_data, created_at, content_hash, chain_hash, prev_chain_hash')
      .eq('company_id', companyId)
      .order('created_at', { ascending: true })
      .limit(limit)

    if (error) {
      // Check if the error is due to missing columns (Postgres code 42703)
      const msg = (error.message ?? '').toLowerCase()
      const isColumnMissing =
        msg.includes('content_hash') ||
        msg.includes('chain_hash')   ||
        msg.includes('prev_chain_hash') ||
        msg.includes('column') ||
        (error as { code?: string }).code === '42703'

      if (isColumnMissing) {
        // Fallback: count entries without hash columns
        const { count } = await this.supabase
          .from('audit_logs')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)

        return {
          health:        'no_hash_columns',
          entries_count: count ?? 0,
          message:       'Hash sütunları henüz eklenmemiş',
        }
      }

      // Other DB error — treat as empty
      return { health: 'empty', entries_count: 0 }
    }

    const rows = data ?? []

    if (rows.length === 0) {
      return { health: 'empty', entries_count: 0 }
    }

    // Check if any row has content_hash populated
    const hasHashes = rows.some(
      (r: Record<string, unknown>) => r.content_hash != null
    )

    if (!hasHashes) {
      return { health: 'unhashed', entries_count: rows.length }
    }

    // Build AuditChainEntry array from DB rows
    const entries: AuditChainEntry[] = rows.map((r: Record<string, unknown>) => ({
      id:             String(r.id),
      action:         String(r.action ?? ''),
      resource_type:  String(r.entity_type ?? ''),
      resource_id:    String(r.entity_id ?? ''),
      old_values:     r.old_data ?? null,
      new_values:     r.new_data ?? null,
      created_at:     String(r.created_at),
      content_hash:   String(r.content_hash ?? ''),
      chain_hash:     r.chain_hash != null ? String(r.chain_hash) : null,
      prev_chain_hash: r.prev_chain_hash != null ? String(r.prev_chain_hash) : null,
    }))

    const result = verifyChain(entries)
    const health = classifyChainHealth(result)

    return {
      health,
      entries_count:    result.total_entries,
      verified_entries: result.verified_entries,
      verification_pct: result.verification_pct,
      broken_at_id:     result.broken_at_id,
      last_hash:        result.last_hash,
    }
  }

  /**
   * Stamp a single audit log entry with content_hash and chain_hash.
   * Computes chain_hash using the last entry's chain_hash as prev.
   * Silently no-ops if the hash columns don't exist.
   */
  async stampEntry(companyId: string, entryId: string): Promise<void> {
    try {
      // Fetch the entry to stamp
      const { data: entryRow, error: entryErr } = await this.supabase
        .from('audit_logs')
        .select('id, action, entity_type, entity_id, old_data, new_data, created_at')
        .eq('id', entryId)
        .eq('company_id', companyId)
        .maybeSingle()

      if (entryErr || !entryRow) return

      // Get the chain_hash of the most recent previous entry
      const { data: prevRow } = await this.supabase
        .from('audit_logs')
        .select('chain_hash')
        .eq('company_id', companyId)
        .lt('created_at', entryRow.created_at)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const prevChainHash = prevRow?.chain_hash ?? null

      const content_hash = computeAuditEntryHash({
        action:        String(entryRow.action ?? ''),
        resource_type: String(entryRow.entity_type ?? ''),
        resource_id:   String(entryRow.entity_id ?? ''),
        old_values:    entryRow.old_data ?? null,
        new_values:    entryRow.new_data ?? null,
        created_at:    String(entryRow.created_at),
      })

      const chain_hash = computeChainHash(content_hash, prevChainHash)

      await this.supabase
        .from('audit_logs')
        .update({ content_hash, chain_hash, prev_chain_hash: prevChainHash })
        .eq('id', entryId)
        .eq('company_id', companyId)
    } catch {
      // Silently no-op — hash columns may not exist yet
    }
  }
}

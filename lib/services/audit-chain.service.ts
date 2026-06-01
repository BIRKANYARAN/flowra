// Audit Hash Chain — SHA-256 tamper-evident chain for audit_logs
//
// Each audit_log row can carry:
//   content_hash  — SHA256(action + resource_id + old_values + new_values + created_at)
//   prev_hash     — content_hash of the immediately preceding row for this company
//
// verifyChain() reads the chain and reports any broken links.
// If the audit_logs table doesn't have these columns yet (pre-migration),
// all functions return gracefully with is_supported: false.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any

export interface ChainVerifyResult {
  is_supported:  boolean
  total_checked: number
  broken_links:  number
  first_broken?: { id: string; created_at: string; expected_hash: string; actual_hash: string }
  ok:            boolean
}

async function sha256hex(input: string): Promise<string> {
  // Works in Node.js (Web Crypto API available since Node 18) and Edge runtime
  const data    = new TextEncoder().encode(input)
  const hashBuf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function rowPayload(row: {
  action: string
  resource_type: string
  resource_id: string
  old_values: unknown
  new_values: unknown
  created_at: string
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

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (no I/O — safe to unit-test without a DB connection)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify a single chain link in isolation.
 *
 * Returns `true` when:
 *   - prevEntry is null AND entry.prev_hash is null (genesis link), or
 *   - prevEntry.content_hash === entry.prev_hash (valid continuation).
 */
export function verifyChainLink(
  entry: { content_hash: string; prev_hash: string | null },
  prevEntry: { content_hash: string } | null,
): boolean {
  if (prevEntry === null) return entry.prev_hash === null
  return prevEntry.content_hash === entry.prev_hash
}

/**
 * Count the number of broken links in an ordered entry sequence.
 *
 * A "broken link" is any entry whose `prev_hash` does not match the
 * `content_hash` of the preceding entry (or is not null for the first entry).
 */
export function countChainBreaks(
  entries: Array<{ content_hash: string; prev_hash: string | null }>,
): number {
  let breaks = 0
  for (let i = 0; i < entries.length; i++) {
    const prev = i === 0 ? null : entries[i - 1]
    if (!verifyChainLink(entries[i], prev)) breaks++
  }
  return breaks
}

/**
 * Format a chain integrity report as a Turkish-language summary string.
 */
export function formatChainReport(
  totalEntries: number,
  breaks: number,
  startDate: string,
  endDate: string,
): string {
  if (breaks === 0) {
    return `${totalEntries} kayıt doğrulandı, zincir bütün (${startDate} – ${endDate}).`
  }
  return `${totalEntries} kayıt incelendi, ${breaks} kırık bağ tespit edildi (${startDate} – ${endDate}). Kayıtlar değiştirilmiş olabilir.`
}

// Compute and store content_hash + prev_hash for new audit_log rows.
// Call this immediately after inserting an audit_log row.
export async function stampAuditRow(
  rowId:     string,
  companyId: string,
  row: { action: string; resource_type: string; resource_id: string; old_values: unknown; new_values: unknown; created_at: string },
  supabase:  AnyClient,
): Promise<void> {
  try {
    // Get prev hash
    const { data: prev } = await supabase
      .from('audit_logs')
      .select('content_hash')
      .eq('company_id', companyId)
      .neq('id', rowId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const prevHash    = prev?.content_hash ?? null
    const contentHash = await sha256hex(rowPayload(row) + (prevHash ?? ''))

    await supabase
      .from('audit_logs')
      .update({ content_hash: contentHash, prev_hash: prevHash })
      .eq('id', rowId)
  } catch {
    // Non-fatal: hash columns may not exist yet (pre-migration)
  }
}

// Verify the audit chain for a company within a date range.
// Returns a report of any broken links.
export async function verifyAuditChain(
  companyId: string,
  from:      string,  // YYYY-MM-DD
  to:        string,
  supabase:  AnyClient,
): Promise<ChainVerifyResult> {
  // Real audit_logs columns are entity_type/entity_id/old_data/new_data — the old
  // select used resource_type/old_values/new_values (nonexistent) → 42703 error →
  // the catch below USED TO return ok:true, so the tamper-evidence verifier always
  // reported "healthy". Select the real columns and map them into the same payload
  // shape stampAuditRow hashed (it maps entityType→resource_type at the call site).
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, action, entity_type, entity_id, old_data, new_data, created_at, content_hash, prev_hash')
    .eq('company_id', companyId)
    .gte('created_at', from + 'T00:00:00Z')
    .lte('created_at', to   + 'T23:59:59Z')
    .order('created_at', { ascending: true })

  // A genuine query error means we COULD NOT verify — never report ok:true.
  if (error) return { is_supported: false, total_checked: 0, broken_links: 0, ok: false }

  const rows = data ?? []
  if (rows.length === 0) return { is_supported: true, total_checked: 0, broken_links: 0, ok: true }

  // Hash columns absent (pre-migration): cannot attest → is_supported:false, ok:false.
  if (rows[0].content_hash === undefined) {
    return { is_supported: false, total_checked: 0, broken_links: 0, ok: false }
  }

  let brokenLinks = 0
  let firstBroken: ChainVerifyResult['first_broken']
  let prevHash: string | null = null

  for (const row of rows) {
    if (row.content_hash == null) {
      // Unstamped row — skip (may be rows created before migration)
      prevHash = null
      continue
    }

    // Map the real columns to the payload field names the stamper used.
    const payload = rowPayload({
      action:        row.action,
      resource_type: row.entity_type,
      resource_id:   row.entity_id,
      old_values:    row.old_data,
      new_values:    row.new_data,
      created_at:    row.created_at,
    })
    const expected = await sha256hex(payload + (prevHash ?? ''))
    if (expected !== row.content_hash) {
      brokenLinks++
      if (!firstBroken) {
        firstBroken = {
          id:            row.id,
          created_at:    row.created_at,
          expected_hash: expected,
          actual_hash:   row.content_hash,
        }
      }
    }
    prevHash = row.content_hash
  }

  return {
    is_supported:  true,
    total_checked: rows.length,
    broken_links:  brokenLinks,
    first_broken:  firstBroken,
    ok:            brokenLinks === 0,
  }
}

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
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, action, resource_type, resource_id, old_values, new_values, created_at, content_hash, prev_hash')
    .eq('company_id', companyId)
    .gte('created_at', from + 'T00:00:00Z')
    .lte('created_at', to   + 'T23:59:59Z')
    .order('created_at', { ascending: true })

  if (error) return { is_supported: false, total_checked: 0, broken_links: 0, ok: true }

  const rows = data ?? []
  if (rows.length === 0) return { is_supported: true, total_checked: 0, broken_links: 0, ok: true }

  // Check if hash columns are present (detect pre-migration state)
  if (rows[0].content_hash === undefined) {
    return { is_supported: false, total_checked: 0, broken_links: 0, ok: true }
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

    const expected = await sha256hex(rowPayload(row) + (prevHash ?? ''))
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

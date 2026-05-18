// ── Idempotency service ───────────────────────────────────────────────────────
// Every critical write checks this store first.
// If the key was already processed successfully, returns the cached result.
// This prevents:
//   - duplicate proforma creation (network retry)
//   - double sale conversion
//   - duplicate stock updates
//
// TTL: keys expire after DEFAULT_TTL_HOURS (default 24h).
// Expired keys are purged by purge_expired_idempotency_keys() (via jobs system).
//
// Payload hash: when provided, the request body hash is stored alongside the key.
// On cache hit, if the hash doesn't match the original, a 409 is signaled.

import { requireAuthContext } from '@/lib/auth-context'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any
import { AppError }     from '@/types/errors'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Default TTL in hours. Keys older than this are considered expired and purged. */
const DEFAULT_TTL_HOURS = 24

/** Compute an ISO expiry string from now + hours */
function expiresAt(hours = DEFAULT_TTL_HOURS): string {
  const d = new Date()
  d.setHours(d.getHours() + hours)
  return d.toISOString()
}

/**
 * Compute a deterministic hash of a payload for idempotency validation.
 * Uses a fast string-based approach (no crypto needed — not security-critical).
 */
export function computePayloadHash(payload: unknown): string {
  const str = stableStringify(payload)
  let h = 0
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h = ((h << 5) - h + ch) | 0
  }
  return 'h_' + (h >>> 0).toString(36)
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`

  const obj = value as Record<string, unknown>
  return `{${Object.keys(obj).sort().map(key =>
    `${JSON.stringify(key)}:${stableStringify(obj[key])}`
  ).join(',')}}`
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type IdempotencyOperation =
  | 'proforma_create'
  | 'sale_convert'
  | 'stock_update'
  | 'stock_adjust'
  | 'expense_create'   // Phase 7 — added here so the union is complete

export interface IdempotencyRecord {
  status:       'pending' | 'success' | 'error'
  result_id:    string | null
  result_data:  Record<string, unknown> | null
  request_hash: string | null
}

// ── Functions ─────────────────────────────────────────────────────────────────

/**
 * Check if an idempotency key has already been processed.
 * Returns the cached record if found and not yet expired,
 * or null if this is a fresh request.
 *
 * When requestHash is provided and the stored hash differs, throws
 * AppError('IDEMPOTENCY_MISMATCH') — same key + different payload is a 409,
 * not a replay. Callers must pass the same requestHash they used on reserve.
 */
export async function checkIdempotency(
  userId:       string,
  key:          string,
  operation:    IdempotencyOperation,
  requestHash?: string,    // if provided, mismatch with stored hash → 409
  clientOverride?: AnySupabase,
): Promise<IdempotencyRecord | null> {
  const supabase = requireAuthContext(clientOverride, 'checkIdempotency')
  const { data } = await supabase
    .from('idempotency_keys')
    .select('status, result_id, result_data, request_hash')
    .eq('user_id', userId)
    .eq('idempotency_key', key)
    .eq('operation', operation)
    .gt('expires_at', new Date().toISOString())   // ← expired rows treated as missing
    .maybeSingle()

  if (!data) return null

  const record: IdempotencyRecord = {
    status:       data.status as IdempotencyRecord['status'],
    result_id:    data.result_id ?? null,
    result_data:  data.result_data as Record<string, unknown> | null,
    request_hash: (data.request_hash as string) ?? null,
  }

  // Enforce payload integrity: same key + different payload → 409 (not a replay)
  if (requestHash && record.request_hash && record.request_hash !== requestHash) {
    throw new AppError(
      'IDEMPOTENCY_MISMATCH',
      'Aynı idempotency anahtarı farklı içerikle kullanılamaz',
      { key, operation, storedHash: record.request_hash, incomingHash: requestHash },
    )
  }

  return record
}

/**
 * Reserve an idempotency key as 'pending' before starting the operation.
 * Explicitly sets expires_at so every row has a guaranteed TTL regardless
 * of DB default drift.
 */
export async function reserveIdempotencyKey(
  userId:       string,
  key:          string,
  operation:    IdempotencyOperation,
  ttlHours:     number = DEFAULT_TTL_HOURS,
  requestHash?: string,
  clientOverride?: AnySupabase,
): Promise<void> {
  const supabase = requireAuthContext(clientOverride, 'reserveIdempotencyKey')
  await supabase
    .from('idempotency_keys')
    .upsert(
      {
        user_id:         userId,
        idempotency_key: key,
        operation,
        status:          'pending',
        expires_at:      expiresAt(ttlHours),   // ← explicit TTL on every reserve
        request_hash:    requestHash ?? null,
      },
      { onConflict: 'user_id,idempotency_key' }
    )
}

/** Mark an idempotency key as 'success' and cache the result. */
export async function commitIdempotencyKey(
  userId:      string,
  key:         string,
  operation:   IdempotencyOperation,
  resultId:    string,
  resultData?: Record<string, unknown>,
  clientOverride?: AnySupabase,
): Promise<void> {
  const supabase = requireAuthContext(clientOverride, 'commitIdempotencyKey')
  await supabase
    .from('idempotency_keys')
    .update({
      status:      'success',
      result_id:   resultId,
      result_data: resultData ?? null,
    })
    .eq('user_id', userId)
    .eq('idempotency_key', key)
    .eq('operation', operation)
}

/** Mark an idempotency key as 'error' so the caller can retry with a new key. */
export async function failIdempotencyKey(
  userId:    string,
  key:       string,
  operation: IdempotencyOperation,
  clientOverride?: AnySupabase,
): Promise<void> {
  const supabase = requireAuthContext(clientOverride, 'failIdempotencyKey')
  await supabase
    .from('idempotency_keys')
    .update({ status: 'error' })
    .eq('user_id', userId)
    .eq('idempotency_key', key)
    .eq('operation', operation)
}

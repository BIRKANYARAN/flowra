// ── safeQuery — universal safe DB access wrapper ──────────────────────────────
// Wraps any Supabase query or async operation.
// NEVER throws. ALWAYS returns data or fallback.
// Use for all dashboard / server-component data loading.

export async function safeQuery<T>(
  fn:       () => Promise<{ data: T | null; error: unknown }>,
  fallback: T
): Promise<T> {
  try {
    const { data, error } = await fn()
    if (error) {
      console.error('[safeQuery]', error)
      return fallback
    }
    return data ?? fallback
  } catch (e) {
    console.error('[safeQuery] threw:', e instanceof Error ? e.message : String(e))
    return fallback
  }
}

// Variant for raw async functions that don't return { data, error }
export async function safeFetch<T>(
  fn:       () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    console.error('[safeFetch]', e instanceof Error ? e.message : String(e))
    return fallback
  }
}

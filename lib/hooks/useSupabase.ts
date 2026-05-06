'use client'
import { useRef } from 'react'
import { createClient, type SupabaseClient } from '@/lib/supabase-client'

/**
 * Returns a stable, non-null Supabase browser client for use inside React
 * components.
 *
 * Initialization strategy:
 *  - During SSR  : the ref stays null at the JS level. The return value is
 *    typed as SupabaseClient (non-null) via a non-null assertion. This is safe
 *    because React never executes effects or event handlers on the server, so
 *    the null ref is never actually reached by any Supabase call site.
 *  - In the browser: the ref is populated on first render by calling
 *    createClient(), which returns the module-level singleton. All subsequent
 *    renders return the same reference — no recreation, no dependency-array
 *    churn.
 *
 * Throws in the browser if NEXT_PUBLIC_SUPABASE_* env vars are missing so the
 * error surfaces immediately rather than silently producing a broken client.
 *
 * Usage rules:
 *  ✅  const supabase = useSupabase()               (top of component)
 *  ✅  inside useEffect / useCallback / event handler
 *  ❌  do NOT call supabase methods during render
 */
export function useSupabase(): SupabaseClient {
  const ref = useRef<SupabaseClient | null>(null)

  // Lazy initialization — runs once in the browser, skipped on the server.
  // Writing to a ref during render is an accepted React pattern for one-time
  // lazy setup (see React docs on "useRef — avoiding recreating the ref value").
  if (typeof window !== 'undefined' && ref.current === null) {
    ref.current = createClient()
  }

  // Non-null assertion: the value is null only during SSR, where it is never
  // accessed. In the browser it is always the real SupabaseClient.
  return ref.current!
}

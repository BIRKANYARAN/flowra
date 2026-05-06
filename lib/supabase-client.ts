'use client'
import { createBrowserClient } from '@supabase/ssr'

export type SupabaseClient = ReturnType<typeof createBrowserClient>

// Module-level singleton — created once per browser session, reused everywhere.
// Never touched on the server (createClient() throws if called outside browser).
let singleton: SupabaseClient | null = null

/**
 * Returns the singleton Supabase browser client.
 *
 * Throws:
 *  - if called during SSR / build-time (window is undefined)
 *  - if NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY are missing
 *
 * Do NOT call this directly in React components — use useSupabase() instead.
 */
export function createClient(): SupabaseClient {
  if (typeof window === 'undefined') {
    throw new Error(
      '[Flowra] createClient() was called during SSR. ' +
      'Use useSupabase() in components — it is safe during SSR.'
    )
  }

  if (singleton) return singleton

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      '[Flowra] Missing Supabase environment variables.\n' +
      'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY ' +
      'in your .env.local file (or deployment environment).'
    )
  }

  singleton = createBrowserClient(url, key)
  return singleton
}

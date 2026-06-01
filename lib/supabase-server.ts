// NOTE: this module is already server-only — it imports `cookies` from
// 'next/headers', which the Next.js App Router refuses to bundle into a client
// ('use client') module, so a client import fails the build. (No separate
// `server-only` package import is needed for that guarantee.)
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      '[Flowra] Missing Supabase environment variables.\n' +
      'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY ' +
      'in your .env.local file (or deployment environment).'
    )
  }

  const cookieStore = cookies()
  return createServerClient(url, key, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch { /* Server component — ignore */ }
      },
    },
  })
}

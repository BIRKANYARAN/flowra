export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'

const REDIRECT_DIGEST = 'NEXT_REDIRECT'

export default async function RootPage() {
  try {
    const supabase = createClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) redirect('/auth')
    redirect('/dashboard')
  } catch (err) {
    // Re-throw Next.js redirect signals — they are not real errors.
    if (err instanceof Error && (err as Error & { digest?: string }).digest?.startsWith(REDIRECT_DIGEST)) {
      throw err
    }
    // Any other failure (e.g. missing Supabase env vars) must not 500 the
    // landing page. Fall back to the public auth route.
    console.error('[RootPage] Falling back to /auth due to:', err instanceof Error ? err.message : String(err))
    redirect('/auth')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// app/dashboard/admin/layout.tsx — Server-side role guard for all admin pages
//
// Every route under /dashboard/admin/* is wrapped by this layout.
// If the authenticated user does not have the 'admin' role in their primary
// company, they are redirected to /dashboard before any page content renders.
//
// This is a SERVER COMPONENT — no client-side check, no flash of content.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

import { redirect }     from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import { requireAdmin } from '@/lib/require-role'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()

  // ── 1. Verify authentication ───────────────────────────────────────────────
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    redirect('/auth')
  }
  const user = authData.user

  // ── 2. Enforce active admin role ────────────────────────────────────────────
  // No accepted membership or non-admin role → redirect to main dashboard.
  // redirect() throws internally — Next.js handles it as a navigation.
  try {
    const companyId = await resolveCompanyId(user.id, supabase)
    await requireAdmin(user.id, companyId, supabase)
  } catch {
    redirect('/dashboard')
  }

  return <>{children}</>
}

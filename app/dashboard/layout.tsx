export const dynamic = 'force-dynamic'

import { createClient }            from '@/lib/supabase-server'
import { redirect }                from 'next/navigation'
import { Sidebar }                 from '@/components/layout/Sidebar'
import { Header }                  from '@/components/layout/Header'
import { resolveUserRole }         from '@/lib/require-role'
import type { UserSettings, MemberRole } from '@/types'
import { resolveCompanyId }        from '@/lib/resolve-company'
import { safeSystemQuery }         from '@/lib/admin-db'
import { WorkspaceProvider }       from '@/lib/workspace-context'
import { QueryProvider }           from '@/lib/query-provider'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  try {
    const supabase = createClient()

    let user: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null = null
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError || !authData?.user) redirect('/auth')
      user = authData.user
    } catch (e) {
      if (e && typeof e === 'object' && 'digest' in e) throw e
      redirect('/auth')
    }

    let companyId: string | null = null
    try {
      companyId = await resolveCompanyId(user.id, supabase)
    } catch {
      companyId = null
    }

    let settings: UserSettings | null = null
    try {
      if (companyId) {
        const { data } = await safeSystemQuery('user_settings')
          .select('*')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        settings = (data as UserSettings | null) ?? null
      }
    } catch {
      // Non-fatal — render with defaults
    }

    let userRole: MemberRole | null = null
    try {
      if (companyId) {
        userRole = await resolveUserRole(user.id, companyId, supabase)
      }
    } catch {
      // Non-fatal — sidebar renders without admin items
    }

    const meta         = user.user_metadata ?? {}
    const firstName    = (String(meta.first_name ?? '')).slice(0, 50)
    const lastName     = (String(meta.last_name  ?? '')).slice(0, 50)
    const userName     = [firstName, lastName].filter(Boolean).join(' ') || user.email?.split('@')[0] || 'Kullanıcı'
    const userInitials = [firstName.slice(0,1), lastName.slice(0,1)].filter(Boolean).join('').toUpperCase() || 'K'

    // Resolve logo URL (signed URL for private storage, or direct URL for public)
    let logoUrl: string | null = settings?.logo_url ?? null
    if (logoUrl && !logoUrl.startsWith('http')) {
      try {
        const { data: signed } = await supabase.storage
          .from('logos')
          .createSignedUrl(logoUrl, 3600)
        logoUrl = signed?.signedUrl ?? null
      } catch {
        logoUrl = null
      }
    }

    return (
      <QueryProvider>
        <WorkspaceProvider
          companyId={companyId}
          companyName={settings?.company_name ?? null}
          logoUrl={logoUrl}
          userRole={userRole}
          userId={user.id}
          userEmail={user.email ?? null}
          userName={userName}
          userInitials={userInitials}
        >
          <div className="flex min-h-screen bg-gray-50">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
              <Header
                companyName={settings?.company_name ?? null}
                userName={userName}
                userEmail={user.email ?? ''}
                logoUrl={logoUrl}
              />
              <main className="flex-1 px-5 py-4 overflow-auto">
                {children}
              </main>
            </div>
          </div>
        </WorkspaceProvider>
      </QueryProvider>
    )
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
    console.error('[layout] CRASH:', e instanceof Error ? e.message : String(e))
    return (
      <div className="flex min-h-screen bg-gray-50">
        <div className="flex-1 flex flex-col min-w-0">
          <main className="flex-1 px-5 py-4 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    )
  }
}

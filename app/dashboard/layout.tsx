export const dynamic = 'force-dynamic'

import { createClient }     from '@/lib/supabase-server'
import { redirect }         from 'next/navigation'
import { Sidebar }          from '@/components/layout/Sidebar'
import { Header }           from '@/components/layout/Header'
import { resolveUserRole }  from '@/lib/require-role'
import type { UserSettings, MemberRole } from '@/types'
import { resolveCompanyId } from '@/lib/resolve-company'
import { safeSystemQuery }  from '@/lib/admin-db'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  try {
    const supabase = createClient()

    let user: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null = null
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError || !authData?.user) redirect('/auth')
      user = authData.user
    } catch (e) {
      // redirect() throws internally — re-throw it
      if (e && typeof e === 'object' && 'digest' in e) throw e
      redirect('/auth')
    }

    let companyId: string | null = null
    try {
      companyId = await resolveCompanyId(user.id, supabase)
    } catch {
      companyId = null
    }

    // Load company settings for sidebar + header
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

    // Resolve user role for the primary company (used by Sidebar to show admin items)
    let userRole: MemberRole | null = null
    try {
      if (companyId) {
        userRole = await resolveUserRole(user.id, companyId, supabase)
      }
    } catch {
      // Non-fatal — sidebar renders without admin items
    }

    const meta       = user.user_metadata ?? {}
    const firstName  = (String(meta.first_name ?? '')).slice(0, 50)
    const lastName   = (String(meta.last_name  ?? '')).slice(0, 50)
    const userName   = [firstName, lastName].filter(Boolean).join(' ') || user.email?.split('@')[0] || 'Kullanıcı'
    const userInitials = [firstName.slice(0,1), lastName.slice(0,1)].filter(Boolean).join('').toUpperCase() || 'K'

    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar
          companyName={settings?.company_name ?? null}
          logoUrl={settings?.logo_url ?? null}
          userInitials={userInitials}
          userName={userName}
          userEmail={user.email ?? ''}
          userRole={userRole}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <Header
            companyName={settings?.company_name ?? null}
            userName={userName}
            userEmail={user.email ?? ''}
            logoUrl={settings?.logo_url ?? null}
          />
          <main className="flex-1 px-4 md:px-5 py-4 pb-20 md:pb-4 overflow-auto">
            {children}
          </main>
          {/* Mobile bottom nav — visible only on small screens */}
          <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex items-center justify-around px-2 py-2 z-50">
            {([
              { href: '/dashboard', label: 'Genel', emoji: '🏠' },
              { href: '/dashboard/sales-flow', label: 'Satış', emoji: '💰' },
              { href: '/dashboard/collections', label: 'Tahsilat', emoji: '📥' },
              { href: '/dashboard/expenses', label: 'Gider', emoji: '📤' },
              { href: '/dashboard/proformas', label: 'Proforma', emoji: '📄' },
            ] as const).map(item => (
              <a
                key={item.href}
                href={item.href}
                className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl text-gray-500 hover:text-primary-600 hover:bg-primary-50 transition-colors"
              >
                <span className="text-lg leading-none">{item.emoji}</span>
                <span className="text-[10px] font-semibold">{item.label}</span>
              </a>
            ))}
          </nav>
        </div>
      </div>
    )
  } catch (e) {
    // Re-throw redirect errors (Next.js internal mechanism)
    if (e && typeof e === 'object' && 'digest' in e) throw e
    // Any other error — log and render minimal shell
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

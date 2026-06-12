export const dynamic = 'force-dynamic'

// ── /dashboard/accounting/cockpit — CFO Kokpiti (relocated from Finance) ──────
// Refoundation W3 — the CFO cockpit is accountant depth, so it lives in the
// Muhasebe zone, not the owner's Finance hub. finance?tab=cfo redirects here.

import { Suspense }          from 'react'
import Link                  from 'next/link'
import { createClient }      from '@/lib/supabase-server'
import { resolveCompanyId }  from '@/lib/resolve-company'
import { getGlMode }         from '@/lib/middleware/period-guard'
import { CFOTab }            from '@/app/dashboard/finance/_tabs/CFOTab'

function AuthError() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
      <div className="text-3xl">⚠️</div>
      <p className="text-sm text-[#64748b]">Oturum bilgisi alınamadı. Lütfen sayfayı yenileyin.</p>
      <a href="/dashboard/accounting/cockpit" className="text-sm text-brand-light font-semibold hover:underline">Yeniden Dene</a>
    </div>
  )
}

export default async function CockpitPage() {
  const supabase = createClient()
  let userId: string | null = null
  try {
    const { data, error } = await supabase.auth.getUser()
    if (!error && data?.user) userId = data.user.id
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
  }
  if (!userId) return <AuthError />

  let companyId: string | null = null
  try { companyId = await resolveCompanyId(userId, supabase) } catch { /* non-fatal */ }
  if (!companyId) return <AuthError />

  let glMode: string = 'shadow'
  try { glMode = await getGlMode(companyId, supabase) } catch { /* non-fatal */ }

  const tabProps = { userId, companyId, glMode }

  return (
    <div className="flex flex-col gap-5 w-full">
      <div>
        <Link href="/dashboard/accounting" className="text-[11px] text-[#94a3b8] hover:text-brand-light font-semibold">← Muhasebe</Link>
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1 mt-1">Muhasebe Merkezi</div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0f172a] leading-tight">CFO Kokpiti</h1>
        <p className="text-sm text-[#94a3b8] mt-1">Muhasebe doğruluğu · çeyreklik · dönem yönetimi · mizan</p>
      </div>
      <Suspense fallback={<div className="fl-shimmer rounded-lg h-48" />}>
        <CFOTab {...tabProps} />
      </Suspense>
    </div>
  )
}

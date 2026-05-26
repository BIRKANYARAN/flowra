// ── /dashboard/orders — Satın Alma Siparişleri ────────────────────────────────
//
// Server component. Auth + companyId resolved once.
// Renders the full purchase orders UI via OrdersClient (client component).

export const dynamic = 'force-dynamic'

import { createClient }       from '@/lib/supabase-server'
import { resolveCompanyId }   from '@/lib/resolve-company'
import { OrdersClient }       from './OrdersClient'

export default async function OrdersPage() {
  const supabase = createClient()

  let userId: string | null = null
  try {
    const { data, error } = await supabase.auth.getUser()
    if (!error && data?.user) userId = data.user.id
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
  }

  if (!userId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
        <div className="text-3xl">⚠️</div>
        <p className="text-sm text-[#64748b]">Oturum bilgisi alınamadı. Lütfen sayfayı yenileyin.</p>
        <a href="/dashboard/orders" className="text-sm text-brand-light font-semibold hover:underline">Yeniden Dene</a>
      </div>
    )
  }

  let companyId: string | null = null
  try { companyId = await resolveCompanyId(userId, supabase) } catch { /* non-fatal */ }

  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
        <div className="text-3xl">⚠️</div>
        <p className="text-sm text-[#64748b]">Şirket bilgisi yüklenemedi. Lütfen sayfayı yenileyin.</p>
        <a href="/dashboard/orders" className="text-sm text-brand-light font-semibold hover:underline">Yeniden Dene</a>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      {/* PAGE HERO */}
      <div>
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Operasyon</div>
        <h1 className="text-2xl font-black tracking-tight text-[#0f172a] leading-tight">
          Satın Alma Siparişleri
        </h1>
        <p className="text-sm text-[#94a3b8] mt-1">
          Sipariş takibi · Tedarikçi süreçleri · Teslimat durumu
        </p>
      </div>

      <OrdersClient companyId={companyId} />
    </div>
  )
}

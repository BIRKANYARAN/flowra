export const dynamic = 'force-dynamic'

import { createClient }     from '@/lib/supabase-server'
import { redirect }         from 'next/navigation'
import { resolveCompanyId } from '@/lib/resolve-company'
import Link                 from 'next/link'

export default async function CeoPage() {
  const supabase = createClient()
  let uid: string
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error || !data?.user) redirect('/auth')
    uid = data.user.id
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
    redirect('/auth')
  }

  let companyId: string
  try { companyId = await resolveCompanyId(uid!, supabase) }
  catch {
    redirect('/auth')
  }
  void companyId

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-black text-gray-900 tracking-tight">CEO Özeti</h1>
        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
          Yakında
        </span>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
        <div className="text-4xl mb-3">👑</div>
        <h2 className="text-base font-bold text-gray-800 mb-1">CEO Yönetim Paneli</h2>
        <p className="text-sm text-gray-500 mb-4 max-w-sm mx-auto">
          Tek bakışta şirket sağlığı: gelir trendi, nakit pozisyonu, kritik riskler ve
          önerilen aksiyonlar. Bu sayfa geliştirme aşamasındadır.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/dashboard"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700 transition-colors">
            ← Dashboard&apos;a Dön
          </Link>
          <Link href="/dashboard/analytics"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 transition-colors">
            Finansal Analitik
          </Link>
        </div>
      </div>
    </div>
  )
}

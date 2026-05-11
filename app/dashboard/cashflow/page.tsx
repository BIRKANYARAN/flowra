export const dynamic = 'force-dynamic'

import { createClient }     from '@/lib/supabase-server'
import { redirect }         from 'next/navigation'
import { resolveCompanyId } from '@/lib/resolve-company'
import { CashflowChart }    from '@/components/dashboard/CashflowChart'
import Link                 from 'next/link'
import { FinanceNavTabs }   from '@/components/dashboard/FinanceNavTabs'

export default async function CashflowPage() {
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
  catch { redirect('/auth') }

  void companyId

  return (
    <div className="max-w-5xl space-y-4">
      <FinanceNavTabs active="cashflow" />
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-black text-gray-900 tracking-tight">Nakit Akışı</h1>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <CashflowChart className="w-full" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Link href="/dashboard/collections"
          className="bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-primary-300 transition-colors">
          <div className="text-xs text-gray-400 mb-1">Hızlı Erişim</div>
          <div className="text-sm font-bold text-gray-800">Tahsilatlar</div>
          <div className="text-xs text-gray-500 mt-0.5">Ödeme takibi ve tahsilat</div>
        </Link>
        <Link href="/dashboard/expenses"
          className="bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-primary-300 transition-colors">
          <div className="text-xs text-gray-400 mb-1">Hızlı Erişim</div>
          <div className="text-sm font-bold text-gray-800">Gider Yönetimi</div>
          <div className="text-xs text-gray-500 mt-0.5">Gider kaydı ve takibi</div>
        </Link>
        <Link href="/dashboard/partners"
          className="bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-primary-300 transition-colors">
          <div className="text-xs text-gray-400 mb-1">Hızlı Erişim</div>
          <div className="text-sm font-bold text-gray-800">Ortaklar</div>
          <div className="text-xs text-gray-500 mt-0.5">Ortak bakiye ve dağıtım</div>
        </Link>
      </div>
    </div>
  )
}

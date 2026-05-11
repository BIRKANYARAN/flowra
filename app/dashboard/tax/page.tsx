export const dynamic = 'force-dynamic'

import { createClient }     from '@/lib/supabase-server'
import { redirect }         from 'next/navigation'
import { resolveCompanyId } from '@/lib/resolve-company'
import Link                 from 'next/link'
import { FinanceNavTabs }   from '@/components/dashboard/FinanceNavTabs'
import { FinanceService }   from '@/lib/services/finance.service'

const TRY = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function fmt(n: number) { return TRY.format(Number(n || 0)) + ' TL' }

export default async function TaxPage() {
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

  const now  = new Date()
  const year = now.getFullYear()
  const mon  = String(now.getMonth() + 1).padStart(2, '0')
  const from = `${year}-${mon}-01`
  const to   = now.toISOString().slice(0, 10)

  // ── Direct service call — no self-HTTP ──────────────────────────────────────
  let finSummary = null
  try { finSummary = await FinanceService.getFinancialSummary(uid!, companyId, { from, to }) }
  catch { /* non-fatal */ }

  const vat = {
    sales_vat:    Number(finSummary?.sales_vat_try    ?? 0),
    purchase_vat: Number(finSummary?.purchase_vat_try ?? 0),
    expense_vat:  Number(finSummary?.expense_vat_try  ?? 0),
    net_vat:      Number(finSummary?.net_vat_try      ?? 0),
  }

  return (
    <div className="max-w-3xl space-y-4">
      <FinanceNavTabs active="tax" />
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-black text-gray-900 tracking-tight">Vergi Projeksiyonu</h1>
        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-semibold capitalize">
          {now.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}
        </span>
      </div>

      {/* KDV panel */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800">KDV Özeti</h2>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${
            vat.net_vat > 0 ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'
          }`}>
            {vat.net_vat > 0 ? '⬆ Ödenecek KDV' : '⬇ Devredilen KDV'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-emerald-50 rounded-xl px-4 py-3">
            <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mb-1">
              Satış KDV (Alınan)
            </div>
            <div className="text-lg font-black tabular-nums text-emerald-700">
              {fmt(vat.sales_vat)}
            </div>
          </div>
          <div className="bg-red-50 rounded-xl px-4 py-3">
            <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mb-1">
              Alış KDV (İndirim)
            </div>
            <div className="text-lg font-black tabular-nums text-red-700">
              {fmt(vat.purchase_vat + vat.expense_vat)}
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">
              Alış: {fmt(vat.purchase_vat)} · Gider: {fmt(vat.expense_vat)}
            </div>
          </div>
        </div>

        <div className={`rounded-xl px-4 py-3 border-2 ${
          vat.net_vat > 0 ? 'border-orange-300 bg-orange-50' : 'border-emerald-300 bg-emerald-50'
        }`}>
          <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mb-1">
            Net KDV (Ödenecek / Devredilecek)
          </div>
          <div className={`text-2xl font-black tabular-nums ${
            vat.net_vat > 0 ? 'text-orange-700' : 'text-emerald-700'
          }`}>
            {fmt(Math.abs(vat.net_vat))}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {vat.net_vat > 0
              ? 'Bu dönemde beyanname ile ödenecek KDV tutarı'
              : 'Fazla KDV bir sonraki döneme devredilecek'}
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/dashboard/analytics"
          className="bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-primary-300 transition-colors">
          <div className="text-sm font-bold text-gray-800">Finansal Analitik</div>
          <div className="text-xs text-gray-500 mt-0.5">P&amp;L ve kurumlar vergisi tahmini</div>
        </Link>
        <Link href="/dashboard/expenses"
          className="bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-primary-300 transition-colors">
          <div className="text-sm font-bold text-gray-800">Gider KDV</div>
          <div className="text-xs text-gray-500 mt-0.5">KDV&apos;li gider girişleri</div>
        </Link>
      </div>
    </div>
  )
}

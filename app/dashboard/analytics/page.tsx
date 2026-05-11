export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase-server'
import { normalizeAnalytics, type NormalizedAnalytics } from '@/lib/normalize'
import { resolveCompanyId } from '@/lib/resolve-company'
import { FinanceNavTabs } from '@/components/dashboard/FinanceNavTabs'

function fmt(n: number) {
  return '₺' + Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function pct(a: number, b: number) {
  if (!b) return '—'
  return '%' + Math.round((a / b) * 100)
}

export default async function AnalyticsPage() {
  const supabase = createClient()

  let user: { id: string } | null = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch {
    return <div className="py-16 text-center text-gray-400 text-sm">Oturum yüklenemedi. Sayfayı yenileyin.</div>
  }
  if (!user) return <div className="py-16 text-center text-gray-400 text-sm">Lütfen giriş yapın.</div>

  let a: NormalizedAnalytics = normalizeAnalytics(null)
  try {
    const companyId = await resolveCompanyId(user.id, supabase)
    const { data: raw, error: rpcErr } = await supabase.rpc('get_sales_analytics', {
      p_user_id: user.id,
      p_company_id: companyId,
    })
    if (rpcErr) console.error('[analytics] RPC error:', rpcErr.message)
    a = normalizeAnalytics(raw)
  } catch (err) {
    console.error('[analytics] RPC failed:', err instanceof Error ? err.message : String(err))
  }

  const monthly = a.monthly_sales
  const convRate = a.total_proformas > 0
    ? Math.round((a.converted_proformas / a.total_proformas) * 100) : 0

  return (
    <div className="max-w-4xl space-y-8">
      <FinanceNavTabs active="analytics" />
      <div>
        <h1 className="text-2xl font-black">Genel Finans</h1>
        <p className="text-sm text-gray-500 mt-1">Finansal performans özeti</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Teklif Sayısı',  value: a.total_proformas ?? 0,   color: 'text-primary-600' },
          { label: 'Satış Sayısı',   value: a.total_sales ?? 0,       color: 'text-emerald-600' },
          { label: 'Dönüşüm Oranı', value: '%' + convRate,            color: 'text-blue-600'   },
          { label: 'TRY Ciro',       value: fmt(a.total_revenue_try ?? 0), color: 'text-gray-700' },
        ].map(k => (
          <div key={k.label} className="bg-white border border-gray-200 rounded-xl p-5">
            <div className={`text-xs font-semibold uppercase tracking-wide mb-1 ${k.color}`}>{k.label}</div>
            <div className="text-2xl font-black tabular-nums">{k.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Kâr Analizi</h2>
        <div className="grid grid-cols-3 gap-6">
          {[
            { label: 'Toplam Maliyet', value: fmt(a.total_cost ?? 0),     muted: true  },
            { label: 'Nominal Kâr',    value: fmt(a.nominal_profit ?? 0), muted: false },
            { label: 'Reel Kâr',       value: fmt(a.real_profit ?? 0),    muted: false },
          ].map(r => (
            <div key={r.label}>
              <div className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">{r.label}</div>
              <div className={`text-xl font-black tabular-nums ${
                r.muted ? 'text-gray-500'
                : Number(a.nominal_profit ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-600'
              }`}>
                {r.value}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-400">
          Kâr marjı: {pct(a.nominal_profit ?? 0, a.total_revenue_try ?? 0)} &nbsp;·&nbsp;
          Reel kâr marjı: {pct(a.real_profit ?? 0, a.total_revenue_try ?? 0)}
        </div>
      </div>

      {monthly.length > 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Aylık Satışlar</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50 border-b border-gray-100">
                <th className="text-left px-6 py-3">Ay</th>
                <th className="text-center px-4 py-3">Satış</th>
                <th className="text-right px-6 py-3">Ciro (TRY)</th>
                <th className="text-right px-6 py-3">Kâr (TRY)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[...monthly].reverse().map(m => (
                <tr key={m.month} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-6 py-3 text-sm font-semibold text-gray-800">{m.month}</td>
                  <td className="px-4 py-3 text-center text-sm text-gray-600 tabular-nums">{m.count}</td>
                  <td className="px-6 py-3 text-right text-sm font-medium tabular-nums">{fmt(m.revenue_try)}</td>
                  <td className={`px-6 py-3 text-right text-sm font-bold tabular-nums ${m.profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {fmt(m.profit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl text-center py-16">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-gray-500 font-medium">Henüz satış verisi yok.</p>
        </div>
      )}
    </div>
  )
}

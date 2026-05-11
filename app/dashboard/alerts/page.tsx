export const dynamic = 'force-dynamic'

import { createClient }     from '@/lib/supabase-server'
import { redirect }         from 'next/navigation'
import { resolveCompanyId } from '@/lib/resolve-company'
import Link                 from 'next/link'

export default async function AlertsPage() {
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

  // Scope to company — all members of the same company see all company alerts.
  // actor_user_id is for audit attribution only; the display scope is company-wide.
  const { data: alerts } = await supabase
    .from('alerts')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-black text-gray-900 tracking-tight">Kritik Uyarılar</h1>
        {(alerts ?? []).length > 0 && (
          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">
            {(alerts ?? []).filter(a => !a.is_read).length} okunmamış
          </span>
        )}
      </div>

      {(alerts ?? []).length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <div className="text-3xl mb-2">✅</div>
          <p className="text-sm font-semibold text-gray-700">Tüm sistemler normal</p>
          <p className="text-xs text-gray-400 mt-1">Kritik uyarı bulunmuyor.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(alerts ?? []).map((a) => (
            <div
              key={a.id}
              className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${
                a.is_read
                  ? 'bg-white border-gray-200 text-gray-600'
                  : a.severity === 'critical'
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : a.severity === 'warning'
                      ? 'bg-amber-50 border-amber-200 text-amber-800'
                      : 'bg-blue-50 border-blue-200 text-blue-800'
              }`}
            >
              <span className="mt-0.5 text-base shrink-0">
                {a.severity === 'critical' ? '🔴' : a.severity === 'warning' ? '⚠️' : 'ℹ️'}
              </span>
              <div className="min-w-0">
                <div className="font-semibold truncate">{a.message}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  {new Date(a.created_at as string).toLocaleDateString('tr-TR', {
                    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                  })}
                </div>
              </div>
              {!a.is_read && (
                <span className="ml-auto shrink-0 w-2 h-2 rounded-full bg-current mt-1.5" />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="pt-2">
        <Link href="/dashboard"
          className="text-xs text-primary-600 font-semibold hover:text-primary-700">
          ← Dashboard&apos;a Dön
        </Link>
      </div>
    </div>
  )
}

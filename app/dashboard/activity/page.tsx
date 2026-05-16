export const dynamic = 'force-dynamic'

import { createClient }     from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import Link                 from 'next/link'

interface AuditLog {
  id: string
  entity_type: string
  entity_id: string
  action: string
  created_at: string
  new_data?: Record<string, unknown> | null
}

export default async function ActivityPage() {
  // Auth gate is layout.tsx — no redirect here to prevent /auth ↔ /dashboard loop.
  const supabase = createClient()
  let uid: string | null = null
  try {
    const { data, error } = await supabase.auth.getUser()
    if (!error && data?.user) uid = data.user.id
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
  }
  if (!uid) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
      <div className="text-3xl">⚠️</div>
      <p className="text-sm text-gray-500">Oturum bilgisi alınamadı. Lütfen sayfayı yenileyin.</p>
      <a href="/dashboard/activity" className="text-sm text-violet-600 font-semibold hover:underline">Yeniden Dene</a>
    </div>
  )

  let companyId: string | null = null
  try { companyId = await resolveCompanyId(uid, supabase) } catch { /* non-fatal */ }
  if (!companyId) return <div className="p-8 text-gray-500">Şirket bulunamadı.</div>

  const { data: logs } = await supabase
    .from('audit_logs')
    .select('id, entity_type, entity_id, action, created_at, new_data')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(100)

  const ACTION_LABEL: Record<string, string> = {
    create: 'Oluşturuldu',
    update: 'Güncellendi',
    delete: 'Silindi',
    restore: 'Geri Yüklendi',
  }
  const ENTITY_LABEL: Record<string, string> = {
    sale: 'Satış', expense: 'Gider', product: 'Ürün', customer: 'Müşteri',
    partner: 'Ortak', partner_transaction: 'Ortak İşlemi',
    stock_lot: 'Stok Lot', proforma: 'Proforma',
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-black text-gray-900 tracking-tight">Aktivite Geçmişi</h1>
        <span className="text-xs text-gray-400">Son 100 işlem</span>
      </div>

      {(logs ?? []).length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
          <div className="text-3xl mb-2">📋</div>
          <p className="text-sm text-gray-500">Henüz kayıt bulunmuyor.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
          {(logs as AuditLog[]).map((log) => (
            <div key={log.id} className="flex items-start gap-3 px-4 py-3">
              <span className={`mt-0.5 text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                log.action === 'create'  ? 'bg-emerald-100 text-emerald-700' :
                log.action === 'delete'  ? 'bg-red-100 text-red-700'         :
                log.action === 'restore' ? 'bg-blue-100 text-blue-700'       :
                                           'bg-gray-100 text-gray-600'
              }`}>
                {ACTION_LABEL[log.action] ?? log.action}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-gray-800">
                  {ENTITY_LABEL[log.entity_type] ?? log.entity_type}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {new Date(log.created_at).toLocaleDateString('tr-TR', {
                    day: 'numeric', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="pt-2 flex gap-4">
        <Link href="/dashboard/admin/audit"
          className="text-xs text-primary-600 font-semibold hover:text-primary-700">
          Gelişmiş Denetim Kaydı →
        </Link>
        <Link href="/dashboard"
          className="text-xs text-gray-400 font-semibold hover:text-gray-600">
          ← Dashboard&apos;a Dön
        </Link>
      </div>
    </div>
  )
}

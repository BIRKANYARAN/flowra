export const dynamic = 'force-dynamic'

import { createClient }     from '@/lib/supabase-server'
import { redirect }         from 'next/navigation'
import { resolveCompanyId } from '@/lib/resolve-company'
import { resolveUserRole }  from '@/lib/require-role'
import Link                 from 'next/link'

export default async function RolesPage() {
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
      <a href="/dashboard/admin/roles" className="text-sm text-violet-600 font-semibold hover:underline">Yeniden Dene</a>
    </div>
  )

  let companyId: string | null = null
  try { companyId = await resolveCompanyId(uid, supabase) } catch { /* non-fatal */ }
  if (!companyId) return <div className="p-8 text-gray-500">Şirket bulunamadı.</div>

  const role = await resolveUserRole(uid, companyId, supabase).catch(() => null)
  if (role !== 'admin') {
    redirect('/dashboard')
  }

  const { data: members } = await supabase
    .from('company_members')
    .select('user_id, role, created_at')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  const ROLE_LABEL: Record<string, string> = {
    admin: 'Yönetici', manager: 'Satış', viewer: 'İzleyici',
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-black text-gray-900 tracking-tight">Yetkilendirme</h1>
        <Link href="/dashboard/admin/users"
          className="text-xs text-primary-600 font-semibold hover:text-primary-700">
          Ekip Yönetimi →
        </Link>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <h2 className="text-xs font-bold text-gray-600 uppercase tracking-wide">
            Şirket Üyeleri ve Roller
          </h2>
        </div>
        {(members ?? []).length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            Henüz üye yok.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {(members ?? []).map((m) => (
              <div key={m.user_id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-primary-700 font-bold text-xs">
                    {(m.role as string).slice(0, 1).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-gray-800 truncate">
                    {m.user_id}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    Üye: {new Date(m.created_at as string).toLocaleDateString('tr-TR')}
                  </div>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                  m.role === 'admin'   ? 'bg-primary-100 text-primary-700' :
                  m.role === 'manager' ? 'bg-blue-100 text-blue-700'       :
                                         'bg-gray-100 text-gray-500'
                }`}>
                  {ROLE_LABEL[m.role as string] ?? m.role}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
        <strong>Not:</strong> Rol düzenleme ve üye davet özellikleri geliştirme aşamasındadır.
        Mevcut roller sadece görüntüleme modundadır.
      </div>
    </div>
  )
}

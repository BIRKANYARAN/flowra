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
      <p className="text-sm text-[#64748b]">Oturum bilgisi alınamadı. Lütfen sayfayı yenileyin.</p>
      <a href="/dashboard/admin/roles" className="text-sm text-brand-light font-semibold hover:underline">Yeniden Dene</a>
    </div>
  )

  let companyId: string | null = null
  try { companyId = await resolveCompanyId(uid, supabase) } catch { /* non-fatal */ }
  if (!companyId) return <div className="p-8 text-[#64748b]">Şirket bulunamadı.</div>

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
      <div>
        <Link href="/dashboard/admin" className="text-xs text-[#94a3b8] hover:text-[#64748b]">← Yönetim</Link>
        <div className="flex items-center gap-3 mt-1">
          <h1 className="text-2xl font-black text-[#0f172a] tracking-tight">Yetkilendirme</h1>
          <Link href="/dashboard/admin/users"
            className="text-xs text-brand-light font-semibold hover:text-brand">
            Ekip Yönetimi →
          </Link>
        </div>
      </div>

      <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#e2e8f0] bg-[#f8fafc]">
          <h2 className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Şirket Üyeleri ve Roller
          </h2>
        </div>
        {(members ?? []).length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-[#94a3b8]">
            Henüz üye yok.
          </div>
        ) : (
          <div className="divide-y divide-[#e2e8f0]">
            {(members ?? []).map((m) => (
              <div key={m.user_id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded bg-brand-subtle flex items-center justify-center flex-shrink-0">
                  <span className="text-brand font-bold text-xs">
                    {(m.role as string).slice(0, 1).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-[#1e293b] truncate">
                    {m.user_id}
                  </div>
                  <div className="text-xs text-[#94a3b8] mt-0.5">
                    Üye: {new Date(m.created_at as string).toLocaleDateString('tr-TR')}
                  </div>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded flex-shrink-0 ${
                  m.role === 'admin'   ? 'bg-brand-subtle text-brand' :
                  m.role === 'manager' ? 'bg-info-light text-info-text'       :
                                         'bg-[#f1f5f9] text-[#64748b]'
                }`}>
                  {ROLE_LABEL[m.role as string] ?? m.role}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-warn-light border border-warn-light rounded px-4 py-3 text-sm text-warn-text">
        <strong>Not:</strong> Rol düzenleme ve üye davet özellikleri geliştirme aşamasındadır.
        Mevcut roller sadece görüntüleme modundadır.
      </div>
    </div>
  )
}

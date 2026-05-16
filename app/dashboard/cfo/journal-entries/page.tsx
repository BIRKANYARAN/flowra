import { createClient }        from '@/lib/supabase-server'
import { redirect }            from 'next/navigation'
import { resolveCompanyId }    from '@/lib/resolve-company'
import Link                    from 'next/link'
import { fmtDate, fmtTRY }    from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function JournalEntriesPage() {
  // Auth gate is layout.tsx — no redirect here to prevent /auth ↔ /dashboard loop.
  const supabase = createClient()
  let userId: string | null = null
  let companyId: string | null = null
  try {
    const { data: authData } = await supabase.auth.getUser()
    if (authData?.user) userId = authData.user.id
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
  }
  if (userId) {
    try { companyId = await resolveCompanyId(userId, supabase) } catch { /* non-fatal */ }
  }
  if (!userId) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
      <div className="text-3xl">⚠️</div>
      <p className="text-sm text-gray-500">Oturum bilgisi alınamadı. Lütfen sayfayı yenileyin.</p>
      <a href="/dashboard/cfo/journal-entries" className="text-sm text-violet-600 font-semibold hover:underline">Yeniden Dene</a>
    </div>
  )
  if (!companyId) return <div className="p-8 text-gray-500">Şirket bulunamadı.</div>

  const { data: entries } = await supabase
    .from('journal_entries')
    .select(`
      id, entry_date, description, reference, source_type,
      journal_entry_lines ( account_code, account_name, debit_try, credit_try )
    `)
    .eq('company_id', companyId)
    .order('entry_date', { ascending: false })
    .limit(100)

  const rows = entries ?? []

  return (
    <div className="flex flex-col gap-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight">Journal Kayıtları</h1>
          <p className="text-xs text-gray-400 mt-0.5">Çift taraflı muhasebe denetim izi — son 100 kayıt</p>
        </div>
        <Link href="/dashboard/cfo" className="text-xs text-gray-400 hover:text-primary-600 font-semibold">← CFO</Link>
      </div>

      {rows.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-6 text-sm text-amber-700 text-center">
          <div className="font-bold mb-1">Journal kaydı bulunamadı</div>
          <div className="text-xs text-amber-600">
            GL modu shadow olarak çalışıyorsa kayıtlar otomatik oluşturulmaz.
            Aktif etmek için şirket ayarlarında <code className="bg-amber-100 px-1 rounded">gl_mode = &apos;parallel&apos;</code> olarak güncelleyin.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((entry) => {
            const lines = (entry.journal_entry_lines as Array<{
              account_code: string; account_name: string; debit_try: number; credit_try: number
            }>) ?? []
            const totalDebit  = lines.reduce((s, l) => s + Number(l.debit_try  ?? 0), 0)
            const totalCredit = lines.reduce((s, l) => s + Number(l.credit_try ?? 0), 0)
            const balanced    = Math.abs(totalDebit - totalCredit) < 0.01

            return (
              <div key={entry.id as string} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-black text-gray-500">{fmtDate(entry.entry_date as string)}</span>
                    {entry.reference && (
                      <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded font-mono">
                        {entry.reference as string}
                      </span>
                    )}
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      entry.source_type === 'sale'     ? 'bg-blue-100 text-blue-700'    :
                      entry.source_type === 'expense'  ? 'bg-orange-100 text-orange-700' :
                      entry.source_type === 'purchase' ? 'bg-purple-100 text-purple-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {(entry.source_type as string)?.toUpperCase() ?? 'MANUEL'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      balanced ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {balanced ? '✓ DENGELI' : '✗ FARK VAR'}
                    </span>
                  </div>
                </div>
                {entry.description && (
                  <div className="px-4 pt-2 text-xs text-gray-500">{entry.description as string}</div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400 w-16">Hesap</th>
                        <th className="text-left px-2 py-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Hesap Adı</th>
                        <th className="text-right px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400 w-32">Borç (DR)</th>
                        <th className="text-right px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-gray-400 w-32">Alacak (CR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {lines.map((line, i) => (
                        <tr key={i}>
                          <td className="px-4 py-1.5 font-mono text-gray-600">{line.account_code}</td>
                          <td className="px-2 py-1.5 text-gray-700">{line.account_name}</td>
                          <td className="px-4 py-1.5 text-right tabular-nums text-blue-700 font-semibold">
                            {Number(line.debit_try) > 0 ? fmtTRY(Number(line.debit_try)) : '—'}
                          </td>
                          <td className="px-4 py-1.5 text-right tabular-nums text-emerald-700 font-semibold">
                            {Number(line.credit_try) > 0 ? fmtTRY(Number(line.credit_try)) : '—'}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t border-gray-200 bg-gray-50">
                        <td colSpan={2} className="px-4 py-1.5 text-xs font-black text-gray-600 uppercase tracking-wide">Toplam</td>
                        <td className="px-4 py-1.5 text-right tabular-nums font-black text-blue-700">{fmtTRY(totalDebit)}</td>
                        <td className="px-4 py-1.5 text-right tabular-nums font-black text-emerald-700">{fmtTRY(totalCredit)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

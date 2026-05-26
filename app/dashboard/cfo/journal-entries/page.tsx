import { createClient }        from '@/lib/supabase-server'
import { redirect }            from 'next/navigation'
import { resolveCompanyId }    from '@/lib/resolve-company'
import Link                    from 'next/link'
import { fmtDate, fmtTRY }    from '@/lib/format'

export const dynamic = 'force-dynamic'

// Local row shape — voucher_number is optional (migration may be pending)
interface JournalEntryRow {
  id:                  string
  entry_date:          string
  description:         string | null
  reference:           string | null
  source_type:         string | null
  voucher_number?:     string | null
  journal_entry_lines: Array<{
    account_code: string
    account_name: string
    debit_try:    number
    credit_try:   number
  }>
}

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
      <p className="text-sm text-[#64748b]">Oturum bilgisi alınamadı. Lütfen sayfayı yenileyin.</p>
      <a href="/dashboard/cfo/journal-entries" className="text-sm text-brand-light font-semibold hover:underline">Yeniden Dene</a>
    </div>
  )
  if (!companyId) return <div className="p-8 text-[#64748b]">Şirket bulunamadı.</div>

  // Try selecting with voucher_number; fall back gracefully if migration is pending.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let entries: JournalEntryRow[] | null = null
  try {
    const { data: d1, error: e1 } = await supabase
      .from('journal_entries')
      .select(`
        id, entry_date, description, reference, source_type, voucher_number,
        journal_entry_lines ( account_code, account_name, debit_try, credit_try )
      `)
      .eq('company_id', companyId)
      .order('entry_date', { ascending: false })
      .limit(100)
    if (e1 && e1.message?.includes('voucher_number')) {
      const { data: d2 } = await supabase
        .from('journal_entries')
        .select(`
          id, entry_date, description, reference, source_type,
          journal_entry_lines ( account_code, account_name, debit_try, credit_try )
        `)
        .eq('company_id', companyId)
        .order('entry_date', { ascending: false })
        .limit(100)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      entries = d2 as any
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      entries = d1 as any
    }
  } catch {
    entries = null
  }

  const rows = entries ?? []

  return (
    <div className="flex flex-col gap-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-[#0f172a] tracking-tight">Journal Kayıtları</h1>
          <p className="text-xs text-[#94a3b8] mt-0.5">Çift taraflı muhasebe denetim izi — son 100 kayıt</p>
        </div>
        <Link href="/dashboard/finance?tab=cfo" className="text-xs text-[#94a3b8] hover:text-brand-light font-semibold">← CFO Cockpit</Link>
      </div>

      {rows.length === 0 ? (
        <div className="bg-warn-light border border-warn-light rounded px-4 py-6 text-sm text-warn-text text-center">
          <div className="font-bold mb-1">Journal kaydı bulunamadı</div>
          <div className="text-xs text-warn-text">
            GL modu <strong>shadow</strong> modunda çalışıyorsa journal kayıtları otomatik oluşturulmaz.
            Kayıt oluşturmaya başlamak için{' '}
            <Link href="/dashboard/admin/settings" className="underline font-semibold hover:text-warn-text">
              Şirket Ayarları
            </Link>{' '}
            sayfasından <code className="bg-warn-light px-1 rounded">gl_mode</code> değerini{' '}
            <code className="bg-warn-light px-1 rounded">parallel</code> olarak güncelleyin.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((entry) => {
            const lines       = entry.journal_entry_lines ?? []
            const totalDebit  = lines.reduce((s, l) => s + Number(l.debit_try  ?? 0), 0)
            const totalCredit = lines.reduce((s, l) => s + Number(l.credit_try ?? 0), 0)
            const balanced    = Math.abs(totalDebit - totalCredit) < 0.01

            return (
              <div key={entry.id} className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
                <div className="flex items-center justify-between px-4 py-2.5 bg-[#f8fafc] border-b border-[#e2e8f0]">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-black text-[#64748b]">{fmtDate(entry.entry_date)}</span>
                    {entry.voucher_number && (
                      <span className="text-[10px] bg-brand-subtle text-brand font-mono px-1.5 py-0.5 rounded font-semibold tracking-wide">
                        {entry.voucher_number}
                      </span>
                    )}
                    {entry.reference && (
                      <span className="text-[10px] bg-[#e2e8f0] text-[#64748b] px-1.5 py-0.5 rounded font-mono">
                        {entry.reference}
                      </span>
                    )}
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      entry.source_type === 'sale'     ? 'bg-info-light text-info-text'    :
                      entry.source_type === 'expense'  ? 'bg-warn-light text-warn-text' :
                      entry.source_type === 'purchase' ? 'bg-purple-100 text-purple-700' :
                      'bg-[#f1f5f9] text-[#64748b]'
                    }`}>
                      {entry.source_type?.toUpperCase() ?? 'MANUEL'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      balanced ? 'bg-pos-light text-pos-text' : 'bg-neg-light text-neg-text'
                    }`}>
                      {balanced ? '✓ DENGELI' : '✗ FARK VAR'}
                    </span>
                  </div>
                </div>
                {entry.description && (
                  <div className="px-4 pt-2 text-xs text-[#64748b]">{entry.description}</div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#e2e8f0]">
                        <th className="text-left px-4 py-1.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] w-16">Hesap</th>
                        <th className="text-left px-2 py-1.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Hesap Adı</th>
                        <th className="text-right px-4 py-1.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] w-32">Borç (DR)</th>
                        <th className="text-right px-4 py-1.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] w-32">Alacak (CR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f1f5f9]">
                      {lines.map((line, i) => (
                        <tr key={i}>
                          <td className="px-4 py-1.5 font-mono text-[#64748b]">{line.account_code}</td>
                          <td className="px-2 py-1.5 text-[#334155]">{line.account_name}</td>
                          <td className="px-4 py-1.5 text-right tabular-nums text-info-text font-semibold">
                            {Number(line.debit_try) > 0 ? fmtTRY(Number(line.debit_try)) : '—'}
                          </td>
                          <td className="px-4 py-1.5 text-right tabular-nums text-pos-text font-semibold">
                            {Number(line.credit_try) > 0 ? fmtTRY(Number(line.credit_try)) : '—'}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t border-[#e2e8f0] bg-[#f8fafc]">
                        <td colSpan={2} className="px-4 py-1.5 text-xs font-black text-[#64748b] uppercase tracking-wide">Toplam</td>
                        <td className="px-4 py-1.5 text-right tabular-nums font-black text-info-text">{fmtTRY(totalDebit)}</td>
                        <td className="px-4 py-1.5 text-right tabular-nums font-black text-pos-text">{fmtTRY(totalCredit)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Cross-navigation */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] text-[#94a3b8] leading-relaxed">
          Journal kayıtları mizan ve dönem kapanışıyla birlikte değerlendirilmeli.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link href="/dashboard/cfo/trial-balance" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Mizan →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/cfo/period-close" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Dönem Kapat →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/finance?tab=balance" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Bilanço →
          </Link>
        </div>
      </div>
    </div>
  )
}

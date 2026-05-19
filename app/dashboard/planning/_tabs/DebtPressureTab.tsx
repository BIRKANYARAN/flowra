// ── DebtPressureTab — Partner Debt Pressure & Runway ──────────────────────────
// Server component. Fetches active loan tranches, computes DSR + upcoming
// payment schedule, renders tranche ladder and concentration analysis.

import { createClient }    from '@/lib/supabase-server'
import { FinanceService }  from '@/lib/services/finance.service'
import Link                from 'next/link'

const FMT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })
function fmt(n: number) {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₺${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `₺${(n / 1_000).toFixed(1)}K`
  return `₺${FMT.format(Math.round(n))}`
}
function fmtPct(v: number) { return `%${(v * 100).toFixed(1).replace('.', ',')}` }
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return iso }
}

const TR_MONTHS = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara']
function monthLabel(year: number, month: number) { return `${TR_MONTHS[month - 1]} ${year}` }
function nextMonth(y: number, m: number) { return m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 } }

interface Props { companyId: string; userId: string }

export async function DebtPressureTab({ companyId, userId }: Props) {
  const supabase = createClient()
  const now    = new Date()
  const year   = now.getFullYear()
  const month  = now.getMonth() + 1
  const from   = `${year}-${String(month).padStart(2, '0')}-01`
  const to     = now.toISOString().slice(0, 10)
  const nowMs  = now.getTime()

  // ── Fetch tranches + partner names ─────────────────────────────────────────
  type TrancheRow = {
    id: string
    outstanding_try: number
    amount_try: number
    annual_interest_rate: number | null
    due_date: string | null
    status: string
    partner_id: string
    partner_name: string | null
  }
  let tranches: TrancheRow[] = []
  try {
    const { data } = await supabase
      .from('partner_loan_tranches')
      .select(`
        id, outstanding_try, amount_try, annual_interest_rate,
        due_date, status, partner_id,
        partners ( name )
      `)
      .eq('company_id', companyId)
      .eq('status', 'active')
      .order('due_date', { ascending: true, nullsFirst: false })
    tranches = (data ?? []).map((t: Record<string, unknown>) => ({
      id:                   String(t.id),
      outstanding_try:      Number(t.outstanding_try ?? 0),
      amount_try:           Number(t.amount_try ?? 0),
      annual_interest_rate: t.annual_interest_rate != null ? Number(t.annual_interest_rate) : null,
      due_date:             (t.due_date as string | null) ?? null,
      status:               String(t.status ?? ''),
      partner_id:           String(t.partner_id ?? ''),
      partner_name:         ((t.partners as { name?: string } | null)?.name) ?? null,
    }))
  } catch { /* fallback empty */ }

  // ── Current month net income for DSR ──────────────────────────────────────
  let monthlyNet = 0
  try {
    const fs = await FinanceService.getFinancialSummary(userId, companyId, { from, to }, undefined, undefined, supabase)
    monthlyNet = fs.net_after_tax_try
  } catch { /* zero */ }

  // ── Aggregate metrics ─────────────────────────────────────────────────────
  const totalOutstanding = tranches.reduce((s, t) => s + t.outstanding_try, 0)
  const monthlyService   = tranches.reduce((s, t) => {
    const rate = t.annual_interest_rate ?? 0
    return s + (rate > 0 ? t.outstanding_try * rate / 12 : t.outstanding_try * 0.015)
  }, 0)
  const dsr = monthlyNet > 0
    ? Math.min(1, monthlyService / monthlyNet)
    : (monthlyService > 0 ? 1.0 : 0)

  // Partner concentration
  const byPartner: Record<string, { name: string; outstanding: number }> = {}
  for (const t of tranches) {
    const pid = t.partner_id
    if (!byPartner[pid]) byPartner[pid] = { name: t.partner_name ?? pid.slice(0, 8), outstanding: 0 }
    byPartner[pid].outstanding += t.outstanding_try
  }
  const sorted = Object.values(byPartner).sort((a, b) => b.outstanding - a.outstanding)
  const maxConc = sorted[0]?.outstanding ?? 0
  const concentration = totalOutstanding > 0 ? maxConc / totalOutstanding : 0

  // Next due tranche
  const nextDue = tranches.find(t => t.due_date && new Date(t.due_date + 'T00:00:00').getTime() > nowMs - 86_400_000)
  const nextDueDays = nextDue?.due_date
    ? Math.round((new Date(nextDue.due_date + 'T00:00:00').getTime() - nowMs) / 86_400_000)
    : null

  // ── 12-month interest schedule ─────────────────────────────────────────────
  const schedule: Array<{ label: string; interest: number }> = []
  let { y: sy, m: sm } = { y: year, m: month }
  for (let i = 0; i < 12; i++) {
    const label    = monthLabel(sy, sm)
    const interest = tranches.reduce((s, t) => {
      const rate = t.annual_interest_rate ?? 0
      return s + (rate > 0 ? t.outstanding_try * rate / 12 : t.outstanding_try * 0.015)
    }, 0)
    schedule.push({ label, interest })
    const next = nextMonth(sy, sm)
    sy = next.y; sm = next.m
  }
  const maxService = Math.max(...schedule.map(s => s.interest), 1)

  const hasTranches = tranches.length > 0

  // ── DSR color ─────────────────────────────────────────────────────────────
  const dsrColor    = dsr <= 0.30 ? 'text-pos-text'
    : dsr <= 0.60 ? 'text-warn-text'
    : 'text-neg-text'
  const dsrBarColor = dsr <= 0.30 ? 'bg-pos'
    : dsr <= 0.60 ? 'bg-warn'
    : 'bg-neg-light'
  const dsrLabel    = dsr === 0 ? 'Borç yok' : dsr <= 0.30 ? 'Sağlıklı' : dsr <= 0.60 ? 'Dikkat' : 'Kritik'

  return (
    <div className="space-y-5">

      {/* ── KPI STRIP ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

        <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3">
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Toplam Borç</div>
          <div className={`text-lg font-black tabular-nums ${totalOutstanding > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
            {totalOutstanding > 0 ? fmt(totalOutstanding) : '—'}
          </div>
          <div className="text-[9px] text-gray-400 mt-0.5">{tranches.length} aktif tranche</div>
        </div>

        <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3">
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Aylık Borç Servisi</div>
          <div className={`text-lg font-black tabular-nums ${monthlyService > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
            {monthlyService > 0 ? fmt(monthlyService) : '—'}
          </div>
          <div className="text-[9px] text-gray-400 mt-0.5">faiz tahmini / ay</div>
        </div>

        <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3">
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1">DSR (Borç/Gelir)</div>
          <div className={`text-lg font-black tabular-nums ${dsrColor}`}>
            {monthlyService > 0 ? fmtPct(dsr) : '—'}
          </div>
          <div className={`text-[9px] mt-0.5 font-semibold ${dsrColor}`}>{dsrLabel}</div>
          {monthlyService > 0 && (
            <div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${dsrBarColor}`} style={{ width: `${Math.min(100, dsr * 100)}%` }} />
            </div>
          )}
        </div>

        <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3">
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Sonraki Vade</div>
          {nextDue ? (
            <>
              <div className={`text-lg font-black tabular-nums ${nextDueDays !== null && nextDueDays <= 14 ? 'text-neg' : 'text-gray-900'}`}>
                {nextDueDays !== null && nextDueDays <= 0 ? 'GECIKTI' : nextDueDays !== null ? `${nextDueDays}g` : '—'}
              </div>
              <div className="text-[9px] text-gray-400 mt-0.5">{fmtDate(nextDue.due_date)}</div>
            </>
          ) : (
            <div className="text-lg font-black text-gray-400">—</div>
          )}
        </div>
      </div>

      {/* ── EMPTY STATE ───────────────────────────────────────────────────── */}
      {!hasTranches && (
        <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-6 py-10 text-center">
          <div className="text-2xl mb-2">🏦</div>
          <div className="text-sm font-semibold text-gray-700 mb-1">Aktif ortak borcu yok</div>
          <div className="text-xs text-gray-400 mb-4">Ortak borçları Ortaklar → Trancheler bölümünden girilir.</div>
          <Link href="/dashboard/partners?tab=tranches"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700 border border-primary-200 px-3 py-1.5 rounded hover:bg-primary-50 transition-colors">
            Tranche Ekle →
          </Link>
        </div>
      )}

      {hasTranches && (
        <>
          {/* ── 12-MONTH SERVICE SCHEDULE ──────────────────────────────────── */}
          <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#f1f5f9]">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#94a3b8]">12 Aylık Faiz Yük Takvimi</span>
              <span className="text-[9px] text-gray-400">Outstanding × yıllık faiz / 12</span>
            </div>
            <div className="px-5 pt-4 pb-3">
              <div className="flex items-end gap-1 h-14">
                {schedule.map((s, i) => {
                  const h       = Math.max(3, Math.round((s.interest / maxService) * 56))
                  const isPast  = i === 0
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                      <div
                        className={`w-full rounded-t-sm ${isPast ? 'bg-primary-400' : 'bg-orange-200'}`}
                        style={{ height: `${h}px` }}
                        title={`${s.label}: ${fmt(s.interest)}`}
                      />
                      <span className="text-[7px] text-gray-400 leading-none">{s.label.split(' ')[0]}</span>
                    </div>
                  )
                })}
              </div>
              <div className="mt-2 text-[9px] text-gray-400 text-right">
                Yıllık toplam tahmini: {fmt(schedule.reduce((s, m) => s + m.interest, 0))}
              </div>
            </div>
          </div>

          {/* ── TRANCHE TABLE ─────────────────────────────────────────────── */}
          <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#f1f5f9]">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#94a3b8]">Aktif Trancheler</span>
              <Link href="/dashboard/partners?tab=tranches"
                className="text-[10px] text-primary-600 font-semibold hover:underline">
                Yönet →
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="bg-[#f8fafc]/60">
                    <th className="text-left px-5 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Ortak</th>
                    <th className="text-right px-3 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Kalan</th>
                    <th className="text-right px-3 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Oran</th>
                    <th className="text-right px-3 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8] hidden sm:table-cell">Aylık Faiz</th>
                    <th className="text-right px-5 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Vade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {tranches.map(t => {
                    const rate      = t.annual_interest_rate ?? 0
                    const monthly   = rate > 0 ? t.outstanding_try * rate / 12 : t.outstanding_try * 0.015
                    const isOverdue = t.due_date && new Date(t.due_date + 'T00:00:00').getTime() < nowMs
                    const share     = totalOutstanding > 0 ? t.outstanding_try / totalOutstanding : 0
                    return (
                      <tr key={t.id} className="hover:bg-[#f8fafc]/40">
                        <td className="px-5 py-2.5">
                          <div className="font-semibold text-gray-800">{t.partner_name ?? 'Ortak'}</div>
                          <div className="text-[9px] text-gray-400">{fmtPct(share)} toplam</div>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-black text-gray-900">
                          {fmt(t.outstanding_try)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">
                          {rate > 0 ? `%${(rate * 100).toFixed(1)}` : <span className="text-warn-text font-semibold">Faizsiz*</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-orange-600 font-semibold hidden sm:table-cell">
                          {fmt(monthly)}
                        </td>
                        <td className="px-5 py-2.5 text-right whitespace-nowrap">
                          <span className={`font-semibold ${isOverdue ? 'text-neg' : 'text-gray-700'}`}>
                            {fmtDate(t.due_date)}
                          </span>
                          {isOverdue && <div className="text-[9px] text-neg font-bold">GECIKTI</div>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── CONCENTRATION ─────────────────────────────────────────────── */}
          {sorted.length > 1 && (
            <div className="bg-white border border-[#e2e8f0] rounded px-5 py-4">
              <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
                Borç Konsantrasyonu
              </div>
              <div className="space-y-2">
                {sorted.map(p => {
                  const share = totalOutstanding > 0 ? p.outstanding / totalOutstanding : 0
                  const barColor = share > 0.8 ? 'bg-neg' : share > 0.5 ? 'bg-warn' : 'bg-primary-400'
                  return (
                    <div key={p.name}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-semibold text-gray-700">{p.name}</span>
                        <span className="text-[10px] tabular-nums text-gray-500">
                          {fmt(p.outstanding)} · {fmtPct(share)}
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${share * 100}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              {concentration > 0.8 && (
                <div className="mt-3 text-[10px] text-warn-text bg-warn-light border border-warn-light rounded px-3 py-2">
                  <span className="font-bold">Yüksek konsantrasyon:</span> {sorted[0].name} toplam borcun{' '}
                  {fmtPct(concentration)}&apos;ini oluşturuyor. Refinansman riski gözlemlenmeli.
                </div>
              )}
            </div>
          )}

          {/* Interest-free warning */}
          {tranches.some(t => !t.annual_interest_rate || t.annual_interest_rate === 0) && (
            <div className="px-4 py-3 bg-warn-light border border-warn-light rounded text-[10px] text-warn-text">
              <span className="font-bold">* Faizsiz tranche uyarısı:</span>{' '}
              Oran girilmemiş tranchelerde aylık %1,5 proxy faiz hesaplanmıştır.
              VUK + KVK 13 kapsamında örtülü kazanç dağıtımı riski değerlendirilebilir.
            </div>
          )}
        </>
      )}

      {/* Cross-navigation */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] text-gray-400 leading-relaxed">
          Borç baskısı ortak dengesi ve nakit projeksiyonuyla birlikte değerlendirilmeli.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link href="/dashboard/partners?tab=tranches" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Trancheler →
          </Link>
          <span className="text-gray-200">|</span>
          <Link href="/dashboard/planning?tab=cash-projection" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Nakit Projeksiyonu →
          </Link>
          <span className="text-gray-200">|</span>
          <Link href="/dashboard/finance?tab=risks" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Risk Analizi →
          </Link>
        </div>
      </div>
    </div>
  )
}

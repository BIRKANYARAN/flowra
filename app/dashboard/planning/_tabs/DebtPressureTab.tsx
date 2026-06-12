// ── DebtPressureTab — Partner Debt Pressure & Runway ──────────────────────────
// Server component. Fetches active loan tranches, computes DSR + upcoming
// payment schedule, renders tranche ladder and concentration analysis.

import { createClient }         from '@/lib/supabase-server'
import { InfoTip }              from '@/components/ui/InfoTip'
import { FinanceService }       from '@/lib/services/finance.service'
import Link                     from 'next/link'
import { NarrativeFooter }      from '@/components/ds'
import { fmtTRY as fmt, fmtPct as fmtPctLib, fmtDateMed as fmtDate } from '@/lib/format'

// fmtPct in this file takes a 0-1 ratio → percentage
function fmtPct(v: number) { return fmtPctLib(v * 100) }

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
      // outstanding_try / amount_try / due_date are not columns — derive below
      .select(`
        id, principal_try, total_repaid_try, annual_interest_rate,
        expected_repayment_date, status, partner_id,
        partners ( name )
      `)
      .eq('company_id', companyId)
      .eq('status', 'active')
      .order('expected_repayment_date', { ascending: true, nullsFirst: false })
    tranches = (data ?? []).map((t: Record<string, unknown>) => ({
      id:                   String(t.id),
      outstanding_try:      Math.max(0, Number(t.principal_try ?? 0) - Number(t.total_repaid_try ?? 0)),
      amount_try:           Number(t.principal_try ?? 0),
      annual_interest_rate: t.annual_interest_rate != null ? Number(t.annual_interest_rate) : null,
      due_date:             (t.expected_repayment_date as string | null) ?? null,
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
  const dsrLabel    = dsr === 0 ? 'Borç yok' : dsr <= 0.30 ? 'Sağlıklı · Bu ay' : dsr <= 0.60 ? 'Baskı altında · Dikkat' : 'Kritik · Aksiyon gerekli'

  // ── C3: Treasury Pressure Narrative — causal debt-service → runway lines ──
  const annualService   = monthlyService * 12
  const pressureLines: string[] = []

  if (monthlyService > 0) {
    pressureLines.push(
      `Aylık ${fmt(monthlyService)} borç servisi — yıllık ${fmt(annualService)} kesinleşmiş nakit çıkışı.`
    )
  }
  if (dsr > 0) {
    if (dsr <= 0.30) {
      pressureLines.push(
        `Borç/gelir oranı ${fmtPct(dsr)} — sürdürülebilir. Temettü ve yatırım kapasitesi korunuyor.`
      )
    } else if (dsr <= 0.60) {
      pressureLines.push(
        `Borç/gelir oranı ${fmtPct(dsr)} — nakit üretimi baskı altında. Büyüme yatırımı ve temettü kapasitesi daralıyor.`
      )
    } else {
      pressureLines.push(
        `Borç/gelir oranı ${fmtPct(dsr)} — kritik. Nakit açığı ve operasyonel rezerv tehdit altında; acil yapılandırma değerlendirilebilir.`
      )
    }
  }
  if (nextDueDays !== null && nextDueDays < 0) {
    pressureLines.push(
      `${fmt(nextDue?.outstanding_try ?? 0)} vadesi geçmiş — gecikme ortak ilişkisini ve refinansman koşullarını etkiliyor.`
    )
  } else if (nextDueDays !== null && nextDueDays <= 30) {
    const daysText = nextDueDays === 0 ? 'Bugün' : `${nextDueDays} gün içinde`
    pressureLines.push(
      `${daysText} ${fmt(nextDue?.outstanding_try ?? 0)} vade — bu hafta nakit hazırlığı tamamlanmalı.`
    )
  }
  if (concentration > 0.80) {
    pressureLines.push(
      `${sorted[0]?.name ?? 'Dominant ortak'} toplam borcun ${fmtPct(concentration)}'ini tutuyor — tek taraflı geri çağrı şirkete özgü bir kırılganlık yaratıyor.`
    )
  } else if (concentration > 0.50 && sorted.length > 1) {
    pressureLines.push(
      `${sorted[0]?.name ?? 'Dominant ortak'} borçların ${fmtPct(concentration)}'ini oluşturuyor — konsantrasyon kademeli olarak dengelenmeli.`
    )
  }

  return (
    <div className="space-y-5">

      {/* ── KPI STRIP ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3">
          <div className="text-[9px] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">Toplam Borç</div>
          <div className={`text-xl font-black tabular-nums ${totalOutstanding > 0 ? 'text-[#0f172a]' : 'text-[#94a3b8]'}`}>
            {totalOutstanding > 0 ? fmt(totalOutstanding) : '—'}
          </div>
          <div className="text-[9px] text-[#94a3b8] mt-0.5">{tranches.length} aktif borç dilimi</div>
        </div>

        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3">
          <div className="text-[9px] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">Aylık Borç Servisi</div>
          <div className={`text-xl font-black tabular-nums ${monthlyService > 0 ? 'text-warn' : 'text-[#94a3b8]'}`}>
            {monthlyService > 0 ? fmt(monthlyService) : '—'}
          </div>
          <div className="text-[9px] text-[#94a3b8] mt-0.5">aylık nakit çıkışı · mevcut hızda</div>
        </div>

        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3">
          <div className="text-[9px] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">DSR (Borç/Gelir) <InfoTip k="DSR" /></div>
          <div className={`text-xl font-black tabular-nums ${dsrColor}`}>
            {monthlyService > 0 ? fmtPct(dsr) : '—'}
          </div>
          <div className={`text-[9px] mt-0.5 font-semibold ${dsrColor}`}>{dsrLabel}</div>
          {monthlyService > 0 && (
            <div className="mt-1.5 h-1 bg-[#f1f5f9] rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${dsrBarColor}`} style={{ width: `${Math.min(100, dsr * 100)}%` }} />
            </div>
          )}
        </div>

        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3">
          <div className="text-[9px] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">Sonraki Vade</div>
          {nextDue ? (
            <>
              <div className={`text-xl font-black tabular-nums ${nextDueDays !== null && nextDueDays <= 14 ? 'text-neg' : 'text-[#0f172a]'}`}>
                {nextDueDays !== null && nextDueDays <= 0 ? 'GECIKTI' : nextDueDays !== null ? `${nextDueDays}g` : '—'}
              </div>
              <div className="text-[9px] text-[#94a3b8] mt-0.5">{fmtDate(nextDue.due_date)}</div>
              {nextDueDays !== null && nextDueDays <= 30 && nextDueDays > 0 && (
                <div className="text-[9px] text-neg font-semibold mt-0.5">30 gün içinde · Hazırlık gerekli</div>
              )}
            </>
          ) : (
            <div className="text-xl font-black text-[#94a3b8]">—</div>
          )}
        </div>
      </div>

      {/* ── HAZINE BASKI DEĞERLENDİRMESİ ─────────────────────────────────── */}
      {hasTranches && pressureLines.length > 0 && (
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[9px] font-bold uppercase tracking-wider text-[#94a3b8]">Hazine Baskı Değerlendirmesi</span>
            <span className="text-[9px] text-[#94a3b8]">Borç servisi · Nakit ömrü · Konsantrasyon</span>
          </div>
          <div className="space-y-0.5">
            {pressureLines.map((line, i) => (
              <div key={i} className="text-[11px] text-[#64748b] leading-snug">
                <span className="text-[#cbd5e1] mr-1.5">—</span>{line}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── EMPTY STATE ───────────────────────────────────────────────────── */}
      {!hasTranches && (
        <div className="bg-[#f8fafc] border border-[#e8eaef] rounded px-6 py-10 text-center">
          <div className="text-xs font-medium text-[#334155] mb-1">Aktif ortak borcu yok</div>
          <div className="text-xs text-[#94a3b8] mb-4">Ortak borçları Ortaklar → Borç Dilimleri bölümünden girilir.</div>
          <Link href="/dashboard/partners?tab=tranches"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-light hover:text-brand border border-[#e8eaef] px-3 py-1.5 rounded hover:bg-brand-subtle transition-colors">
            Borç Dilimi Ekle →
          </Link>
        </div>
      )}

      {hasTranches && (
        <>
          {/* ── 12-MONTH SERVICE SCHEDULE ──────────────────────────────────── */}
          <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9]">
              <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">12 Aylık Faiz Yük Takvimi</span>
              <span className="text-[9px] text-[#94a3b8]">Varsayım: mevcut borç bakiyesi sabit kalıyor</span>
            </div>
            <div className="px-4 pt-3 pb-2">
              <div className="flex items-end gap-1 h-14">
                {schedule.map((s, i) => {
                  const h       = Math.max(3, Math.round((s.interest / maxService) * 56))
                  const isPast  = i === 0
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                      <div
                        className={`w-full rounded-t-sm ${isPast ? 'bg-brand-light' : 'bg-warn-light'}`}
                        style={{ height: `${h}px` }}
                        title={`${s.label}: ${fmt(s.interest)}`}
                      />
                      <span className="text-[7px] text-[#94a3b8] leading-none">{s.label.split(' ')[0]}</span>
                    </div>
                  )
                })}
              </div>
              <div className="mt-2 text-[9px] text-[#94a3b8] text-right">
                Yıllık toplam tahmini: {fmt(schedule.reduce((s, m) => s + m.interest, 0))}
              </div>
            </div>
          </div>

          {/* ── TRANCHE TABLE ─────────────────────────────────────────────── */}
          <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9]">
              <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Aktif Borç Dilimleri</span>
              <Link href="/dashboard/partners?tab=tranches"
                className="text-[10px] text-brand-light font-semibold hover:underline">
                Yönet →
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="bg-[#f8fafc]/60">
                    <th className="text-left px-4 py-2.5 text-[9px] font-bold uppercase tracking-wider text-[#94a3b8]">Ortak</th>
                    <th className="text-right px-4 py-2.5 text-[9px] font-bold uppercase tracking-wider text-[#94a3b8]">Kalan</th>
                    <th className="text-right px-4 py-2.5 text-[9px] font-bold uppercase tracking-wider text-[#94a3b8]">Oran</th>
                    <th className="text-right px-4 py-2.5 text-[9px] font-bold uppercase tracking-wider text-[#94a3b8] hidden sm:table-cell">Aylık Faiz</th>
                    <th className="text-right px-4 py-2.5 text-[9px] font-bold uppercase tracking-wider text-[#94a3b8]">Vade</th>
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
                        <td className="px-4 py-3">
                          <div className="font-semibold text-[#1e293b]">{t.partner_name ?? 'Ortak'}</div>
                          <div className="text-[9px] text-[#94a3b8]">{fmtPct(share)} toplam</div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-black text-[#0f172a]">
                          {fmt(t.outstanding_try)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[#64748b]">
                          {rate > 0 ? `%${(rate * 100).toFixed(1)}` : <span className="text-warn-text font-semibold">Faizsiz*</span>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-warn font-semibold hidden sm:table-cell">
                          {fmt(monthly)}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <span className={`font-semibold ${isOverdue ? 'text-neg' : 'text-[#334155]'}`}>
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
            <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3">
              <div className="text-[9px] font-bold uppercase tracking-wider text-[#94a3b8] mb-3">
                Borç Konsantrasyonu
              </div>
              <div className="space-y-2">
                {sorted.map(p => {
                  const share = totalOutstanding > 0 ? p.outstanding / totalOutstanding : 0
                  const barColor = share > 0.8 ? 'bg-neg' : share > 0.5 ? 'bg-warn' : 'bg-brand-light'
                  return (
                    <div key={p.name}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-semibold text-[#334155]">{p.name}</span>
                        <span className="text-[10px] tabular-nums text-[#64748b]">
                          {fmt(p.outstanding)} · {fmtPct(share)}
                        </span>
                      </div>
                      <div className="h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
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
              <span className="font-bold">* Faizsiz borç dilimi uyarısı:</span>{' '}
              Oran girilmemiş dilimlerde aylık %1,5 proxy faiz hesaplanmıştır.
              VUK + KVK 13 kapsamında örtülü kazanç dağıtımı riski değerlendirilebilir.
            </div>
          )}
        </>
      )}

      {/* Cross-navigation */}
      <NarrativeFooter
        narrative="Borç servisi nakit dışına çıkınca runway direkt kısalır — borç baskısı ve nakit projeksiyonu aynı anda izlenmeli."
        links={[
          { label: 'Borç Dilimleri',     href: '/dashboard/partners?tab=tranches' },
          { label: 'Nakit Projeksiyonu', href: '/dashboard/planning?tab=cash-projection' },
          { label: 'Risk Analizi',       href: '/dashboard/finance?tab=risks' },
        ]}
      />
    </div>
  )
}

// Zone 3b — Beyan Takvimi (Turkish tax compliance calendar, next 12 months).
// Extracted verbatim from TaxTab.tsx. Pure presentational server component:
// renders the obligations list from a TaxCalendar prop (no hooks/fetch).
import { type TaxCalendar, type TaxObligation } from '@/lib/services/tax/tax-calendar.service'
import { fmtTRY as fmt, fmtDateMed as fmtDate } from '@/lib/format'

export function BeyanTakvimi({ taxCalendar }: { taxCalendar: TaxCalendar | null }) {
  return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#e8eaef] flex items-center justify-between">
          <div>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Beyan Takvimi</div>
            <p className="text-[10px] text-[#94a3b8] mt-0.5">Sonraki 12 ay · KDV · Muhtasar · Geçici Vergi · SGK · KV</p>
          </div>
          {taxCalendar && (
            <div className="flex items-center gap-2 shrink-0">
              {taxCalendar.overdue_count > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-neg-light text-neg-text border-neg-light">
                  {taxCalendar.overdue_count} vadesi geçmiş
                </span>
              )}
              {taxCalendar.due_soon_count > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-warn-light text-warn-text border-warn-light">
                  {taxCalendar.due_soon_count} yaklaşan
                </span>
              )}
              {taxCalendar.total_estimated_tax_try > 0 && (
                <span className="text-[10px] text-[#64748b] font-semibold">
                  Tahmini: {fmt(taxCalendar.total_estimated_tax_try)}
                </span>
              )}
            </div>
          )}
        </div>

        {!taxCalendar ? (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-[#94a3b8]">Beyan takvimi yüklenemedi</p>
          </div>
        ) : taxCalendar.obligations.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-[#94a3b8]">Yaklaşan yükümlülük bulunamadı</p>
          </div>
        ) : (
          <div className="divide-y divide-[#f1f5f9]">
            {taxCalendar.obligations.slice(0, 20).map((ob: TaxObligation) => {
              const isOverdue  = ob.status === 'overdue'
              const isDueSoon  = ob.status === 'due_soon'
              const rowBg = isOverdue ? 'bg-neg-light/20' : isDueSoon ? 'bg-warn-light/20' : ''
              const dateTone = isOverdue ? 'text-neg-text font-black' : isDueSoon ? 'text-warn-text font-bold' : 'text-[#64748b]'
              const badgeCls = isOverdue
                ? 'bg-neg-light text-neg-text border-neg-light'
                : isDueSoon
                ? 'bg-warn-light text-warn-text border-warn-light'
                : 'bg-[#f1f5f9] text-[#64748b] border-[#e8eaef]'
              const badgeText = isOverdue
                ? `${Math.abs(ob.days_remaining)} gün gecikti`
                : isDueSoon
                ? `${ob.days_remaining} gün kaldı`
                : `${ob.days_remaining} gün`
              return (
                <div key={ob.id} className={`px-4 py-2.5 flex items-center justify-between gap-3 ${rowBg}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-[#1e293b]">{ob.label}</span>
                      <span className="text-[10px] text-[#94a3b8]">{ob.filing_period}</span>
                    </div>
                    <div className={`text-[10px] mt-0.5 ${dateTone}`}>
                      Son gün: {fmtDate(ob.due_date)}
                      {ob.notes && <span className="text-[#94a3b8] font-normal ml-2">· {ob.notes}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {ob.estimated_amount_try !== null ? (
                      <span className={`text-sm font-black tabular-nums ${isOverdue ? 'text-neg' : isDueSoon ? 'text-warn-text' : 'text-[#1e293b]'}`}>
                        {fmt(ob.estimated_amount_try)}
                      </span>
                    ) : (
                      <span className="text-xs text-[#94a3b8] italic">Hesaplanıyor</span>
                    )}
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${badgeCls}`}>
                      {badgeText}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
  )
}

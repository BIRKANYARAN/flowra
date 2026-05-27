'use client'
// ── TaxCalendarClient — Vergi Takvimi section ─────────────────────────────────
// Client island: fetches /api/tax/calendar?year=YYYY via TanStack Query.
// Shows:
//   - Next due chip (red if due_soon/overdue)
//   - Next-60-days obligations table
//   - Total upcoming amount chip

import { useQuery } from '@tanstack/react-query'
import type { TaxCalendarReport, TaxCalendarObligation, ObligationStatus } from '@/lib/services/tax/tax-calendar.service'
import { fmtTRY as fmt, fmtDateMed as fmtDate } from '@/lib/format'

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusChipCls(status: ObligationStatus): string {
  switch (status) {
    case 'overdue':  return 'bg-neg-light text-neg-text border-neg-light'
    case 'due_soon': return 'bg-warn-light text-warn-text border-warn-light'
    case 'upcoming': return 'bg-[#f1f5f9] text-[#64748b] border-[#e2e8f0]'
    default:         return 'bg-[#f1f5f9] text-[#94a3b8] border-[#e2e8f0]'
  }
}

function statusLabel(ob: TaxCalendarObligation): string {
  switch (ob.status) {
    case 'overdue':  return `${Math.abs(ob.days_until_due)} gün gecikti`
    case 'due_soon': return `${ob.days_until_due} gün kaldı`
    case 'upcoming': return `${ob.days_until_due} gün`
    default:         return '—'
  }
}

function rowBg(status: ObligationStatus): string {
  if (status === 'overdue')  return 'bg-neg-light/20'
  if (status === 'due_soon') return 'bg-warn-light/10'
  return ''
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  year: number
}

export function TaxCalendarClient({ year }: Props) {
  const { data, isLoading, isError } = useQuery<{ report: TaxCalendarReport }>({
    queryKey: ['tax-calendar', year],
    queryFn: async () => {
      const res = await fetch(`/api/tax/calendar?year=${year}`)
      if (!res.ok) throw new Error('Vergi takvimi yüklenemedi')
      return res.json()
    },
    staleTime: 1000 * 60 * 60, // 1 hour — deadlines don't change
  })

  const report = data?.report

  if (isLoading) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#e2e8f0]">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Vergi Takvimi {year}</div>
        </div>
        <div className="px-4 py-6 text-center">
          <p className="text-xs text-[#94a3b8]">Yükleniyor…</p>
        </div>
      </div>
    )
  }

  if (isError || !report) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#e2e8f0]">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Vergi Takvimi {year}</div>
        </div>
        <div className="px-4 py-6 text-center">
          <p className="text-xs text-[#94a3b8]">Vergi takvimi yüklenemedi</p>
        </div>
      </div>
    )
  }

  const { next_due, upcoming, overdue, total_upcoming_try } = report

  // Determine chip color for next_due
  const nextChipCls = next_due && (next_due.status === 'due_soon' || next_due.status === 'overdue')
    ? 'bg-neg-light text-neg-text border-neg-light'
    : 'bg-warn-light text-warn-text border-warn-light'

  return (
    <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#e2e8f0] flex items-center justify-between">
        <div>
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Vergi Takvimi {year}</div>
          <p className="text-[10px] text-[#94a3b8] mt-0.5">Sonraki 60 gün · KDV · Geçici Vergi · SGK · Stopaj · KV</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {overdue.length > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-neg-light text-neg-text border-neg-light">
              {overdue.length} vadesi geçmiş
            </span>
          )}
          {total_upcoming_try > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-warn-light text-warn-text border-warn-light">
              {fmt(total_upcoming_try)} 60 günde
            </span>
          )}
        </div>
      </div>

      {/* Next due chip */}
      {next_due && (
        <div className="px-4 py-2.5 border-b border-[#e2e8f0] flex items-center gap-2">
          <span className="text-[10px] text-[#94a3b8] font-semibold">Bir sonraki vergi:</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${nextChipCls}`}>
            {next_due.type_label} — {fmtDate(next_due.due_date)} — {statusLabel(next_due)}
          </span>
        </div>
      )}

      {/* Obligations table — next 60 days */}
      {upcoming.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-xs text-[#94a3b8]">Sonraki 60 günde yaklaşan yükümlülük bulunamadı</p>
        </div>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#f8fafc] border-b border-[#e2e8f0]">
              <th className="text-left px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Vergi Türü</th>
              <th className="text-left px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Dönem</th>
              <th className="text-left px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Son Gün</th>
              <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Tahmini</th>
              <th className="text-center px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Durum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f5f9]">
            {upcoming.map((ob) => {
              const isOverdue  = ob.status === 'overdue'
              const isDueSoon  = ob.status === 'due_soon'
              const dateTone   = isOverdue ? 'text-neg-text font-black' : isDueSoon ? 'text-warn-text font-bold' : 'text-[#64748b]'
              return (
                <tr
                  key={ob.id}
                  className={`hover:bg-[#f8fafc]/60 transition-colors ${rowBg(ob.status)}`}
                >
                  <td className="px-4 py-2.5 font-bold text-[#1e293b]">{ob.type_label}</td>
                  <td className="px-4 py-2.5 text-[#64748b]">{ob.period_label}</td>
                  <td className={`px-4 py-2.5 ${dateTone}`}>{fmtDate(ob.due_date)}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#1e293b]">
                    {ob.estimated_amount_try > 0
                      ? fmt(ob.estimated_amount_try)
                      : <span className="text-[#cbd5e1] italic text-[10px]">{ob.notes ?? '—'}</span>
                    }
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${statusChipCls(ob.status)}`}>
                      {statusLabel(ob)}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

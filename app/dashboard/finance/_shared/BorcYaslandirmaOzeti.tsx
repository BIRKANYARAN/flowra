// ── BorcYaslandirmaOzeti — AP Aging summary for CFO cockpit ──────────────────
//
// Server component — calls APAgingService directly.
// Shows: total outstanding, critical amount, 5-bucket table, link to operations.

import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { APAgingService } from '@/lib/services/finance/ap-aging.service'
import { fmtTRY } from '@/lib/format'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

interface Props {
  companyId: string
  supabase:  AnyClient
}

export async function BorcYaslandirmaOzeti({ companyId, supabase }: Props) {
  let report = null
  try {
    report = await APAgingService.getReport(companyId, supabase)
  } catch {
    // silent — show empty state
  }

  const fmt = (n: number) => fmtTRY(n)

  if (!report || report.total_count === 0) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
            Borç Yaşlandırma Özeti
          </div>
          <Link
            href="/dashboard/operations?tab=expenses"
            className="text-xs font-semibold text-brand-light hover:text-brand"
          >
            Operasyonlar →
          </Link>
        </div>
        <div className="text-xs text-[#94a3b8]">Bekleyen veya kısmi ödemeli gider bulunamadı.</div>
      </div>
    )
  }

  const criticalPct = report.total_outstanding_try > 0
    ? (report.critical_try / report.total_outstanding_try) * 100
    : 0

  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
            Borç Yaşlandırma Özeti
          </div>
          <div className="text-[10px] text-[#94a3b8] mt-0.5">
            {report.as_of_date} itibarıyla · {report.total_count} bekleyen gider
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-extrabold tabular-nums text-[#0f172a]">{fmt(report.total_outstanding_try)}</div>
          {report.critical_try > 0 && (
            <div className="text-[10px] font-semibold text-[#991b1b]">
              {fmt(report.critical_try)} kritik (%{criticalPct.toFixed(0)} &gt;30 gün)
            </div>
          )}
        </div>
      </div>

      {/* Bucket summary table */}
      <div className="border border-[#e8eaef] rounded overflow-hidden mb-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#f8fafc] border-b border-[#e8eaef]">
              <th className="text-left px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Vade</th>
              <th className="text-right px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Tutar</th>
              <th className="text-right px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Kayıt</th>
              <th className="text-right px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Pay</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f8fafc]">
            {report.buckets.map(b => {
              const isCritical = ['days_31_60', 'days_61_90', 'days_91_plus'].includes(b.bucket)
              return (
                <tr key={b.bucket} className={`${isCritical && b.total_try > 0 ? 'bg-neg-light/30' : 'bg-white'} hover:bg-[#f8fafc]/60`}>
                  <td className={`px-3 py-1.5 font-semibold ${isCritical && b.total_try > 0 ? 'text-neg-text' : 'text-[#334155]'}`}>
                    {b.label}
                  </td>
                  <td className={`px-3 py-1.5 text-right font-mono tabular-nums ${isCritical && b.total_try > 0 ? 'font-bold text-neg-text' : 'text-[#64748b]'}`}>
                    {fmt(b.total_try)}
                  </td>
                  <td className="px-3 py-1.5 text-right text-[#94a3b8]">{b.count}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${isCritical && b.total_try > 0 ? 'text-neg-text font-semibold' : 'text-[#94a3b8]'}`}>
                    %{b.pct_of_total.toFixed(0)}
                  </td>
                </tr>
              )
            })}
            <tr className="bg-[#f8fafc] border-t-2 border-[#e8eaef]">
              <td className="px-3 py-1.5 font-black text-[#0f172a]">Toplam</td>
              <td className="px-3 py-1.5 text-right font-mono font-extrabold tabular-nums text-[#0f172a]">
                {fmt(report.total_outstanding_try)}
              </td>
              <td className="px-3 py-1.5 text-right font-semibold text-[#64748b]">{report.total_count}</td>
              <td className="px-3 py-1.5 text-right text-[#94a3b8]">%100</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        {report.avg_days_outstanding !== null && (
          <span className="text-[10px] text-[#94a3b8]">
            Ortalama: <strong className="text-[#334155]">{Math.round(report.avg_days_outstanding)} gün</strong>
            {report.oldest_entry_days !== null && (
              <> · En eski: <strong className={`${report.oldest_entry_days > 90 ? 'text-neg-text' : 'text-[#334155]'}`}>{report.oldest_entry_days} gün</strong></>
            )}
          </span>
        )}
        <Link
          href="/dashboard/operations?tab=expenses"
          className="text-xs font-semibold text-brand-light hover:text-brand"
        >
          Tam borç listesi →
        </Link>
      </div>
    </div>
  )
}

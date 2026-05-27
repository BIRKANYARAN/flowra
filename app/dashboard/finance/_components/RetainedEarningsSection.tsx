'use client'

// ─────────────────────────────────────────────────────────────────────────────
// RetainedEarningsSection — Kâr/Zarar Dağılımı (Equity Roll-Forward)
//
// Shows the formal retained earnings statement:
//   Opening RE → +Net Income → -Legal Reserve → -Dividends → Closing RE
//
// Updated to use new RetainedEarningsStatement shape (multi-period rollforward).
// Uses TanStack Query for data fetching.
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import { fmtTRY } from '@/lib/format'
import type { RetainedEarningsStatement } from '@/lib/services/finance/retained-earnings.service'

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

interface Props {
  year?: number
}

export function RetainedEarningsSection({ year }: Props) {
  const currentYear = year ?? new Date().getFullYear()

  const { data, isLoading, isError } = useQuery<RetainedEarningsStatement>({
    queryKey: ['retained-earnings', null, currentYear],
    queryFn: async () => {
      const res = await fetch(`/api/finance/retained-earnings?year=${currentYear}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm animate-pulse">
        <div className="h-3 bg-[#f1f5f9] rounded w-48 mb-4" />
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 bg-[#f1f5f9] rounded" />
          ))}
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
          Kâr/Zarar Dağılımı — {currentYear}
        </div>
        <div className="text-xs text-neg-text bg-neg-light border border-neg-light rounded px-3 py-2">
          Veriler yüklenemedi. Lütfen sayfayı yenileyin.
        </div>
      </div>
    )
  }

  const rows: Array<{ label: string; value: number; sign?: 'positive' | 'negative' | 'neutral'; bold?: boolean; separator?: boolean }> = [
    {
      label: 'Açılış Geçmiş Yıl Karı',
      value: data.opening_total,
      sign: 'neutral',
    },
    {
      label: `Toplam Net Kâr / (Zarar) — ${currentYear}`,
      value: data.total_net_income,
      sign: data.total_net_income >= 0 ? 'positive' : 'negative',
    },
    {
      label: 'Yasal Yedek Akçe Ayrımı (TTK 519 — %5)',
      value: -data.total_legal_reserves,
      sign: data.total_legal_reserves > 0 ? 'negative' : 'neutral',
    },
    {
      label: 'Kâr Payı Dağıtımı (Onaylanmış)',
      value: -data.total_dividends,
      sign: data.total_dividends > 0 ? 'negative' : 'neutral',
    },
    {
      label: 'Kapanış Geçmiş Yıl Karı',
      value: data.closing_total,
      sign: data.closing_total >= 0 ? 'positive' : 'negative',
      bold: true,
      separator: true,
    },
  ]

  return (
    <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Kâr/Zarar Dağılımı — Özkaynak Roll-Forward
          </div>
          <div className="text-[10px] text-[#94a3b8] mt-0.5">
            {currentYear} Yılı · TTK 519 Yasal Yedek Akçe
          </div>
        </div>
        {/* Equity coverage ratio badge */}
        {data.equity_coverage_ratio !== null && (
          <span className={cn(
            'text-[10px] font-bold px-2 py-1 rounded border',
            data.equity_coverage_ratio >= 1
              ? 'bg-pos-light border-pos-light text-pos-text'
              : 'bg-warn-light border-warn-light text-warn-text',
          )}>
            Kapsama: {data.equity_coverage_ratio.toFixed(2)}x
          </span>
        )}
      </div>

      {/* Statement table */}
      <div className="border border-[#e2e8f0] rounded overflow-hidden">
        <table className="w-full text-xs">
          <tbody className="divide-y divide-[#f1f5f9]">
            {rows.map((row, i) => (
              <tr
                key={i}
                className={cn(
                  row.bold ? 'bg-[#f8fafc] font-bold' : 'bg-white',
                  row.separator ? 'border-t-2 border-[#e2e8f0]' : '',
                )}
              >
                <td className="px-4 py-2.5 text-[#334155]">{row.label}</td>
                <td className={cn(
                  'px-4 py-2.5 text-right font-mono tabular-nums',
                  row.sign === 'positive' ? 'text-pos-text' :
                  row.sign === 'negative' ? 'text-neg-text' :
                  'text-[#0f172a]',
                  row.bold ? 'font-black' : '',
                )}>
                  {fmtTRY(row.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legal reserve note */}
      {data.total_legal_reserves > 0 && (
        <div className="mt-2 text-[10px] text-[#94a3b8]">
          TTK 519: Net kârın %5&apos;i yasal yedek akçe olarak ayrılır (sermayenin %20&apos;sine ulaşana kadar).
          Bu dönem: {fmtTRY(data.total_legal_reserves)} ayrılmıştır.
        </div>
      )}
    </div>
  )
}

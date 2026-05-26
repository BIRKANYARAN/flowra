'use client'

// ─────────────────────────────────────────────────────────────────────────────
// RetainedEarningsSection — Kâr/Zarar Dağılımı (Equity Roll-Forward)
//
// Shows the formal retained earnings statement:
//   Opening RE → +Net Income → -Legal Reserve → -Dividends → Closing RE
//
// Cross-checks vs balance sheet equity (green ✓ within 100 TRY, amber ⚠ otherwise).
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
    queryKey: ['retained-earnings', currentYear],
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

  const discrepancyOk = data.discrepancy_try !== null && Math.abs(data.discrepancy_try) <= 100
  const discrepancyWarn = data.discrepancy_try !== null && Math.abs(data.discrepancy_try) > 100

  const rows: Array<{ label: string; value: number; sign?: 'positive' | 'negative' | 'neutral'; bold?: boolean; separator?: boolean }> = [
    {
      label: 'Açılış Geçmiş Yıl Karı',
      value: data.opening_retained_earnings_try,
      sign: 'neutral',
    },
    {
      label: `Dönem Net Karı / (Zararı) — ${data.period_from.slice(0, 4)}`,
      value: data.net_income_try,
      sign: data.net_income_try >= 0 ? 'positive' : 'negative',
    },
    {
      label: 'Yasal Yedek Akçe Ayrımı (TTK 519 — %5)',
      value: -data.legal_reserve_transfer_try,
      sign: data.legal_reserve_transfer_try > 0 ? 'negative' : 'neutral',
    },
    {
      label: 'Kâr Payı Dağıtımı (Onaylanmış)',
      value: -data.dividends_declared_try,
      sign: data.dividends_declared_try > 0 ? 'negative' : 'neutral',
    },
    {
      label: 'Kapanış Geçmiş Yıl Karı',
      value: data.closing_retained_earnings_try,
      sign: data.closing_retained_earnings_try >= 0 ? 'positive' : 'negative',
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
            {data.period_from} — {data.period_to} · TTK 519 Yasal Yedek Akçe
          </div>
        </div>
        {/* Cross-check badge */}
        {data.balance_sheet_equity_try !== null && (
          <span className={cn(
            'text-[10px] font-bold px-2 py-1 rounded border',
            discrepancyOk
              ? 'bg-pos-light border-pos-light text-pos-text'
              : 'bg-warn-light border-warn-light text-warn-text',
          )}>
            {discrepancyOk ? '✓ Bilanço ile uyumlu' : '⚠ Fark var'}
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

      {/* Cross-check detail */}
      {data.balance_sheet_equity_try !== null && (
        <div className={cn(
          'mt-3 rounded px-3 py-2 border text-xs',
          discrepancyOk
            ? 'bg-pos-light border-pos-light text-pos-text'
            : 'bg-warn-light border-warn-light text-warn-text',
        )}>
          <div className="flex items-center justify-between">
            <span className="font-semibold">Bilanço Özkaynak Kontrolü</span>
            <span className="font-mono font-bold tabular-nums">
              {discrepancyOk ? '✓ Fark ≤ ₺100' : `Fark: ${fmtTRY(data.discrepancy_try ?? 0)}`}
            </span>
          </div>
          <div className="text-[10px] mt-1 opacity-80">
            Bilanço Özkaynak: {fmtTRY(data.balance_sheet_equity_try)}
            {' · '}
            Kapanış GYK: {fmtTRY(data.closing_retained_earnings_try)}
          </div>
          {discrepancyWarn && (
            <div className="text-[10px] mt-1 font-semibold">
              Nakit tahmini yöntemi nedeniyle fark oluşabilir — dönem kapanışında manuel kontrol yapın.
            </div>
          )}
        </div>
      )}

      {/* Legal reserve note */}
      {data.legal_reserve_transfer_try > 0 && (
        <div className="mt-2 text-[10px] text-[#94a3b8]">
          TTK 519: Net kârın %5'i yasal yedek akçe olarak ayrılır (sermayenin %20'sine ulaşana kadar).
          Bu dönem: {fmtTRY(data.legal_reserve_ytd_try)} ayrılmıştır.
        </div>
      )}
    </div>
  )
}

'use client'

// ─────────────────────────────────────────────────────────────────────────────
// RetainedEarningsClient
//
// Retained Earnings Rollforward Statement — equity movement period by period.
//
// Features:
//   - Year filter dropdown (all time + last 5 years)
//   - Summary header: Opening Balance / Total Net Income / Total Dividends / Closing Balance
//   - Rollforward table with columns:
//       Dönem | Açılış | Net Kâr | Yasal Yedek | Temettü | Huzur H. | Kapanış
//   - Closing balance: bold, red if deficit
//   - Equity coverage ratio display
//   - Warning banner if any line has accumulated deficit
//   - Empty state: "Kapatılmış dönem bulunamadı"
//   - TanStack Query with queryKey: ['retained-earnings', companyId, year]
// ─────────────────────────────────────────────────────────────────────────────

import { useState }   from 'react'
import { useQuery }   from '@tanstack/react-query'
import { fmtTRY }     from '@/lib/format'
import type {
  RetainedEarningsStatement,
  RetainedEarningsLine,
} from '@/lib/services/finance/retained-earnings.service'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

// ── Year options ──────────────────────────────────────────────────────────────

function buildYearOptions(): { label: string; value: number | null }[] {
  const current = new Date().getFullYear()
  const opts: { label: string; value: number | null }[] = [
    { label: 'Tüm Dönemler', value: null },
  ]
  for (let y = current; y >= current - 4; y--) {
    opts.push({ label: `${y} Yılı`, value: y })
  }
  return opts
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, tone }: { label: string; value: string; tone?: 'positive' | 'negative' | 'neutral' }) {
  const color =
    tone === 'positive' ? 'text-[#16a34a]' :
    tone === 'negative' ? 'text-[#dc2626]' :
    'text-[#0f172a]'
  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3 shadow-sm">
      <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">{label}</div>
      <div className={`text-lg font-black tabular-nums leading-none ${color}`}>{value}</div>
    </div>
  )
}

function TableRow({ line }: { line: RetainedEarningsLine }) {
  return (
    <tr className="border-b border-[#f1f5f9] hover:bg-[#f8fafc] transition-colors">
      <td className="px-3 py-2.5 text-xs font-semibold text-[#334155] whitespace-nowrap">
        {line.period_label}
      </td>
      <td className="px-3 py-2.5 text-xs tabular-nums text-right text-[#475569]">
        {fmtTRY(line.opening_try, 0)}
      </td>
      <td className={`px-3 py-2.5 text-xs tabular-nums text-right font-semibold ${
        line.net_income_try >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'
      }`}>
        {fmtTRY(line.net_income_try, 0)}
      </td>
      <td className="px-3 py-2.5 text-xs tabular-nums text-right text-[#64748b]">
        {line.legal_reserve_try > 0 ? `(${fmtTRY(line.legal_reserve_try, 0)})` : '—'}
      </td>
      <td className="px-3 py-2.5 text-xs tabular-nums text-right text-[#64748b]">
        {line.dividends_try > 0 ? `(${fmtTRY(line.dividends_try, 0)})` : '—'}
      </td>
      <td className="px-3 py-2.5 text-xs tabular-nums text-right text-[#64748b]">
        {line.compensation_try > 0 ? `(${fmtTRY(line.compensation_try, 0)})` : '—'}
      </td>
      <td className={`px-3 py-2.5 text-xs tabular-nums text-right font-black ${
        line.is_deficit ? 'text-[#dc2626]' : 'text-[#0f172a]'
      }`}>
        {fmtTRY(line.closing_try, 0)}
        {line.is_deficit && (
          <span className="ml-1 text-[9px] font-black text-[#dc2626] uppercase">ZARAR</span>
        )}
      </td>
    </tr>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function RetainedEarningsClient({ companyId }: Props) {
  const yearOptions = buildYearOptions()
  const [selectedYear, setSelectedYear] = useState<number | null>(null)

  const { data, isLoading, isError } = useQuery<RetainedEarningsStatement>({
    queryKey: ['retained-earnings', companyId, selectedYear],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (selectedYear !== null) params.set('year', String(selectedYear))
      const res = await fetch(`/api/finance/retained-earnings?${params}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? 'Veri yüklenemedi')
      }
      return res.json()
    },
    staleTime: 60 * 60 * 1000,  // 1 hour
  })

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-6 space-y-3">
        <div className="h-4 bg-[#f1f5f9] rounded animate-pulse w-48" />
        <div className="h-32 bg-[#f1f5f9] rounded animate-pulse" />
      </div>
    )
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (isError || !data) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3 text-xs text-[#ef4444]">
        Özkaynaklar tablosu yüklenemedi. Lütfen sayfayı yenileyin.
      </div>
    )
  }

  const hasDeficit   = data.lines.some(l => l.is_deficit)
  const hasLines     = data.lines.length > 0
  const closingTone  = data.closing_total < 0 ? 'negative' : data.closing_total > 0 ? 'positive' : 'neutral'
  const openingTone  = data.opening_total < 0 ? 'negative' : 'neutral'

  return (
    <div className="space-y-4">

      {/* Section header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748b]">
            Özkaynaklar Değişim Tablosu
          </div>
          <div className="text-[10px] text-[#94a3b8] mt-0.5">
            TTK 519 yasal yedek · Geçmiş yıllar kâr/zararı rollforward
          </div>
        </div>

        {/* Year filter */}
        <select
          value={selectedYear ?? ''}
          onChange={e => setSelectedYear(e.target.value === '' ? null : Number(e.target.value))}
          className="text-xs border border-[#e8eaef] rounded px-2.5 py-1.5 bg-white text-[#334155] font-semibold focus:outline-none focus:ring-1 focus:ring-[#6366f1]"
        >
          {yearOptions.map(opt => (
            <option key={opt.value ?? 'all'} value={opt.value ?? ''}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Accumulated deficit warning */}
      {hasDeficit && (
        <div className="bg-[#fef2f2] border border-[#fecaca] rounded px-4 py-3 flex items-start gap-3">
          <span className="w-1.5 h-1.5 rounded-full bg-[#dc2626] shrink-0 mt-1.5" />
          <div className="flex-1">
            <div className="text-[11px] font-bold uppercase tracking-wide text-[#dc2626]">
              Birikmiş zarar tespit edildi
            </div>
            <div className="text-xs text-[#b91c1c] mt-0.5">
              Bir veya daha fazla dönemde birikmiş zarar oluşmuştur. Sermaye artırımı değerlendirilmeli.
            </div>
          </div>
        </div>
      )}

      {/* KPI summary header */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          label="Açılış Bakiyesi"
          value={fmtTRY(data.opening_total, 0)}
          tone={openingTone}
        />
        <KpiCard
          label="Toplam Net Kâr"
          value={fmtTRY(data.total_net_income, 0)}
          tone={data.total_net_income >= 0 ? 'positive' : 'negative'}
        />
        <KpiCard
          label="Toplam Temettü"
          value={data.total_dividends > 0 ? `(${fmtTRY(data.total_dividends, 0)})` : '—'}
          tone={data.total_dividends > 0 ? 'negative' : 'neutral'}
        />
        <KpiCard
          label="Kapanış Bakiyesi"
          value={fmtTRY(data.closing_total, 0)}
          tone={closingTone}
        />
      </div>

      {/* Equity coverage ratio */}
      {data.equity_coverage_ratio !== null && (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded text-xs font-semibold border ${
          data.equity_coverage_ratio >= 1
            ? 'bg-[#f0fdf4] border-[#bbf7d0] text-[#16a34a]'
            : data.equity_coverage_ratio >= 0
            ? 'bg-[#fffbeb] border-[#fde68a] text-[#92400e]'
            : 'bg-[#fef2f2] border-[#fecaca] text-[#dc2626]'
        }`}>
          <span className="font-black">Özkaynak Kapsama Oranı:</span>
          <span className="tabular-nums">{data.equity_coverage_ratio.toFixed(2)}x</span>
          <span className="text-[10px] opacity-75">
            {data.equity_coverage_ratio >= 1 ? '— Borçlar özkaynak ile karşılanıyor' :
             data.equity_coverage_ratio >= 0 ? '— Kısmen karşılanıyor' :
             '— Negatif özkaynak'}
          </span>
        </div>
      )}

      {/* Rollforward table */}
      {!hasLines ? (
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-8 text-center">
          <div className="text-xs font-semibold text-[#94a3b8]">Kapatılmış dönem bulunamadı</div>
          <div className="text-[10px] text-[#cbd5e1] mt-1">
            Dönem kapama işlemi tamamlandıktan sonra bu tablo güncellenir.
          </div>
        </div>
      ) : (
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
          <div className="px-4 py-3 border-b border-[#e8eaef] bg-[#f8fafc] flex items-center justify-between">
            <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#64748b]">
              Geçmiş Yıllar Kârı Rollforward
            </span>
            <span className="text-[0.6rem] text-[#94a3b8] font-medium">
              Ödenmiş Sermaye: {fmtTRY(data.paid_in_capital_try, 0)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-[#e8eaef] bg-[#f8fafc]">
                  {[
                    { label: 'Dönem',        align: 'left'  },
                    { label: 'Açılış',       align: 'right' },
                    { label: 'Net Kâr',      align: 'right' },
                    { label: 'Yasal Yedek',  align: 'right' },
                    { label: 'Temettü',      align: 'right' },
                    { label: 'Huzur H.',     align: 'right' },
                    { label: 'Kapanış',      align: 'right' },
                  ].map(col => (
                    <th
                      key={col.label}
                      className={`px-3 py-2 text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8] text-${col.align}`}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.lines.map(line => (
                  <TableRow key={line.period_key} line={line} />
                ))}
              </tbody>
              {/* Totals footer */}
              {data.lines.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-[#e8eaef] bg-[#f8fafc]">
                    <td className="px-3 py-2.5 text-xs font-black text-[#0f172a]">Toplam</td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-right font-bold text-[#475569]">
                      {fmtTRY(data.opening_total, 0)}
                    </td>
                    <td className={`px-3 py-2.5 text-xs tabular-nums text-right font-black ${
                      data.total_net_income >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'
                    }`}>
                      {fmtTRY(data.total_net_income, 0)}
                    </td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-right font-bold text-[#64748b]">
                      {data.total_legal_reserves > 0 ? `(${fmtTRY(data.total_legal_reserves, 0)})` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs tabular-nums text-right font-bold text-[#64748b]">
                      {data.total_dividends > 0 ? `(${fmtTRY(data.total_dividends, 0)})` : '—'}
                    </td>
                    <td className="px-3 py-2.5" />
                    <td className={`px-3 py-2.5 text-xs tabular-nums text-right font-black ${
                      data.closing_total < 0 ? 'text-[#dc2626]' : 'text-[#0f172a]'
                    }`}>
                      {fmtTRY(data.closing_total, 0)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Legal reserve footnote */}
          {data.total_legal_reserves > 0 && (
            <div className="px-4 py-2.5 border-t border-[#f1f5f9] bg-[#f8fafc]">
              <span className="text-[10px] text-[#94a3b8]">
                Yasal Yedek: TTK 519 — Net kârın %5&apos;i, ödenmiş sermayenin %20&apos;sine ulaşana kadar.
                Mevcut yasal yedek: {fmtTRY(data.current_legal_reserves_try, 0)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

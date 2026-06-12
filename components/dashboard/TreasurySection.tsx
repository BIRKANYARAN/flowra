'use client'

// ── TreasurySection — Hazine Yönetimi Paneli ──────────────────────────────────
// Client island: fetches /api/finance/treasury and renders:
//   - Total cash chip (prominent)
//   - Account list with idle badges
//   - Concentration warning
//   - 30-day daily cash waterfall chart
//   - Coverage ratio chips (runway + obligation coverage)
//   - Turkish recommendations

import { useQuery } from '@tanstack/react-query'
import { Skeleton } from '@/components/ds'
import { fmtTRY } from '@/lib/format'
import type { TreasuryReport, BankAccountSummary, DailyCashPoint } from '@/lib/services/finance/treasury.service'
import { InfoTip } from '@/components/ui/InfoTip'

// ── API response shape ────────────────────────────────────────────────────────

interface TreasuryApiResponse {
  report: TreasuryReport
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AccountRow({ account }: { account: BankAccountSummary }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-[#f8fafc]/60 border-b border-[#f1f5f9] last:border-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-[#f1f5f9] flex items-center justify-center text-[11px] font-black text-[#64748b]">
          {account.bank_name.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div className="text-xs font-semibold text-[#334155]">{account.account_name}</div>
          <div className="text-[10px] text-[#94a3b8]">
            {account.bank_name}
            {account.last_transaction_date && (
              <> · Son hareket: {account.last_transaction_date}</>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {account.is_idle && (
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-warn-light text-warn-text uppercase tracking-wider">
            Atıl · {account.idle_days}g
          </span>
        )}
        <div className="text-right">
          <div className="text-sm font-extrabold tabular-nums text-[#0f172a]">{fmtTRY(account.balance_try)}</div>
          <div className="text-[10px] text-[#94a3b8]">{account.currency}</div>
        </div>
      </div>
    </div>
  )
}

function DailyWaterfall({ positions }: { positions: DailyCashPoint[] }) {
  if (positions.length === 0) return null

  const maxInflow  = Math.max(1, ...positions.map(p => p.inflows))
  const maxOutflow = Math.max(1, ...positions.map(p => p.outflows))
  const maxBar     = Math.max(maxInflow, maxOutflow)
  const closings   = positions.map(p => p.closing)
  const minClose   = Math.min(...closings)
  const maxClose   = Math.max(...closings)
  const rangeClose = Math.max(1, maxClose - minClose)

  // Show every 5th day label for readability
  return (
    <div>
      {/* Bar chart: inflows green, outflows red */}
      <div className="flex items-end gap-0.5 h-20 mb-1">
        {positions.map((p, i) => {
          const inH  = maxBar > 0 ? Math.max(1, Math.round((p.inflows  / maxBar) * 64)) : 1
          const outH = maxBar > 0 ? Math.max(1, Math.round((p.outflows / maxBar) * 64)) : 1
          return (
            <div key={p.date} className="flex-1 flex flex-col-reverse items-stretch gap-0.5 min-w-0">
              <div
                className="bg-pos opacity-80 rounded-sm"
                style={{ height: `${inH}px` }}
                title={`${p.date} gelen: ${fmtTRY(p.inflows)}`}
              />
              <div
                className="bg-neg opacity-70 rounded-sm"
                style={{ height: `${outH}px` }}
                title={`${p.date} giden: ${fmtTRY(p.outflows)}`}
              />
            </div>
          )
        })}
      </div>

      {/* Net closing balance line (SVG sparkline) */}
      <svg className="w-full h-10" viewBox={`0 0 ${positions.length} 40`} preserveAspectRatio="none">
        <polyline
          points={positions.map((p, i) => {
            const x = i + 0.5
            const y = rangeClose > 0 ? 38 - Math.round(((p.closing - minClose) / rangeClose) * 36) : 20
            return `${x},${y}`
          }).join(' ')}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="0.8"
          strokeLinejoin="round"
        />
      </svg>

      {/* Date labels */}
      <div className="flex justify-between mt-0.5">
        {[0, Math.floor(positions.length / 4), Math.floor(positions.length / 2), Math.floor(3 * positions.length / 4), positions.length - 1].map(i => (
          <span key={i} className="text-[9px] text-[#94a3b8]">
            {positions[i]?.date?.slice(5) ?? ''}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-4 mt-2">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-pos opacity-80" />
          <span className="text-[10px] text-[#64748b]">Gelen</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm bg-neg opacity-70" />
          <span className="text-[10px] text-[#64748b]">Giden</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-6 h-0.5 bg-[#3b82f6]" />
          <span className="text-[10px] text-[#64748b]">Net Bakiye</span>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function TreasurySection() {
  const { data, isLoading, error } = useQuery<TreasuryApiResponse>({
    queryKey: ['treasury'],
    queryFn: async () => {
      const res = await fetch('/api/finance/treasury')
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Veri alınamadı' })) as { error?: string }
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      return res.json() as Promise<TreasuryApiResponse>
    },
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4 shadow-sm space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (error || !data?.report) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3 shadow-sm">
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">Hazine Yönetimi</div>
        <p className="text-xs text-neg">Hazine verileri yüklenemedi.</p>
      </div>
    )
  }

  const r = data.report

  const runwayTone = r.cash_runway_months === null
    ? 'text-[#94a3b8]'
    : r.cash_runway_months <= 2
      ? 'text-neg'
      : r.cash_runway_months <= 4
        ? 'text-warn-text'
        : 'text-pos-text'

  const coverageTone = r.obligation_coverage_ratio === null
    ? 'text-[#94a3b8]'
    : r.obligation_coverage_ratio < 1
      ? 'text-neg'
      : r.obligation_coverage_ratio < 2
        ? 'text-warn-text'
        : 'text-pos-text'

  return (
    <div className="space-y-3">

      {/* Header + Total Cash chip */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#e8eaef] flex items-center justify-between">
          <div>
            <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Hazine Yönetimi</div>
            <p className="text-[10px] text-[#94a3b8] mt-0.5">{r.as_of_date} tarihi itibarıyla</p>
          </div>
          <div className="text-right">
            <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-0.5">Toplam Nakit</div>
            <div className="text-2xl font-extrabold tabular-nums text-[#0f172a] leading-none">
              {fmtTRY(r.total_cash_try)}
            </div>
          </div>
        </div>

        {/* Coverage ratio chips */}
        <div className="grid grid-cols-2 divide-x divide-[#e8eaef]">
          <div className="px-4 py-3">
            <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">Nakit Ömrü <InfoTip k="Runway" /></div>
            <div className={`text-lg font-extrabold tabular-nums leading-none ${runwayTone}`}>
              {r.cash_runway_months !== null ? `${r.cash_runway_months.toFixed(1)} ay` : '—'}
            </div>
            <div className="text-[10px] text-[#94a3b8] mt-0.5">Aylık gider bazında</div>
          </div>
          <div className="px-4 py-3">
            <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">30G Yükümlülük Karşılama</div>
            <div className={`text-lg font-extrabold tabular-nums leading-none ${coverageTone}`}>
              {r.obligation_coverage_ratio !== null ? `${r.obligation_coverage_ratio.toFixed(1)}x` : '—'}
            </div>
            <div className="text-[10px] text-[#94a3b8] mt-0.5">Nakit / 30 günlük yükümlülük</div>
          </div>
        </div>
      </div>

      {/* Concentration warning */}
      {r.is_concentrated && (
        <div className="bg-warn-light border border-warn-light rounded px-4 py-3 text-xs text-warn-text font-semibold">
          Nakit yoğunluğu yüksek: %{r.largest_account_pct.toFixed(0)} tek hesapta toplanmış. Finansal risk açısından dağıtım önerilir.
        </div>
      )}

      {/* Account list */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#e8eaef] flex items-center justify-between">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
            Banka Hesapları ({r.account_count})
          </div>
          {r.idle_cash_try > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-warn-light text-warn-text">
              {fmtTRY(r.idle_cash_try)} atıl
            </span>
          )}
        </div>
        <div>
          {r.accounts.map(acc => (
            <AccountRow key={acc.account_id} account={acc} />
          ))}
        </div>
      </div>

      {/* Daily cash waterfall — last 30 days */}
      {r.daily_positions.length > 0 && (
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-[#e8eaef]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Günlük Nakit Pozisyonu (Son 30 Gün)</div>
                <p className="text-[10px] text-[#94a3b8] mt-0.5">Gelen / giden akışlar ve net bakiye eğrisi</p>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-[#94a3b8]">Min: {fmtTRY(r.min_balance_30d)}</div>
                <div className="text-[10px] text-[#94a3b8]">Maks: {fmtTRY(r.max_balance_30d)}</div>
                <div className="text-[10px] text-[#64748b] font-semibold">Ort: {fmtTRY(r.avg_balance_30d)}</div>
              </div>
            </div>
          </div>
          <div className="px-4 py-4">
            <DailyWaterfall positions={r.daily_positions} />
          </div>
        </div>
      )}

      {/* Recommendations */}
      {r.recommendations.length > 0 && (
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-[#e8eaef]">
            <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Hazine Önerileri</div>
          </div>
          <ul className="divide-y divide-[#f1f5f9]">
            {r.recommendations.map((rec, i) => (
              <li key={i} className="px-4 py-3 flex items-start gap-2">
                <div className="mt-1 w-1.5 h-1.5 rounded-full bg-[#3b82f6] flex-shrink-0" />
                <p className="text-xs text-[#334155]">{rec}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

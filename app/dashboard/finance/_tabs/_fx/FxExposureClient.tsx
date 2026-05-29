'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FxExposureClient
//
// Kur Riski Analizi — FX Exposure & Currency Risk dashboard panel.
//
// Features:
//   - FX risk ratio + risk class badge
//   - Hedge recommendation chip
//   - Per-currency table: currency, receivables, payables, net exposure, risk %
//   - Scenario analysis: 3 TRY depreciation scenarios
//   - Diversification section (HHI, dominant currency, TRY/foreign split)
//   - TRY-only empty state
//
// TanStack Query key: ['fx-exposure', companyId]
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }        from '@tanstack/react-query'
import { fmtTRY, fmtPct } from '@/lib/format'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

// ── Report shape (mirrors FxExposureService.getReport return type) ────────────

interface FxReport {
  currencies: Array<{
    currency: string
    receivables_foreign: number
    payables_foreign: number
    net_exposure_foreign: number
    receivables_try: number
    payables_try: number
    net_exposure_try: number
    fx_risk_ratio_pct: number | null
  }>
  overall: {
    total_receivables_try: number
    total_payables_try: number
    net_exposure_try: number
    fx_risk_ratio_pct: number | null
    risk_class: string
    hedge_recommendation: string
    diversification: {
      hhi: number
      dominant_currency: string | null
      try_pct: number
      foreign_pct: number
    }
  }
  scenarios: {
    depreciation_10pct_loss: number
    depreciation_20pct_loss: number
    depreciation_30pct_loss: number
  }
  total_revenue_ytd: number
}

// ── Badge configs ─────────────────────────────────────────────────────────────

const RISK_BADGE: Record<string, { label: string; cls: string }> = {
  minimal:           { label: 'Minimal',          cls: 'bg-green-100  text-green-800  border-green-200'  },
  low:               { label: 'Düşük',            cls: 'bg-blue-100   text-blue-800   border-blue-200'   },
  moderate:          { label: 'Orta',             cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  significant:       { label: 'Önemli',           cls: 'bg-orange-100 text-orange-800 border-orange-200' },
  critical:          { label: 'Kritik',           cls: 'bg-red-100    text-red-800    border-red-200'    },
  insufficient_data: { label: 'Veri Yetersiz',    cls: 'bg-gray-100   text-gray-600   border-gray-200'   },
}

const HEDGE_BADGE: Record<string, { label: string; cls: string }> = {
  no_action:        { label: 'Aksiyon Gerekmez',   cls: 'bg-green-100  text-green-800  border-green-200'  },
  monitor:          { label: 'İzle',               cls: 'bg-blue-100   text-blue-800   border-blue-200'   },
  natural_hedge:    { label: 'Doğal Hedge',        cls: 'bg-teal-100   text-teal-800   border-teal-200'   },
  forward_contract: { label: 'Vadeli Kontrat',     cls: 'bg-orange-100 text-orange-800 border-orange-200' },
  urgent_hedge:     { label: 'Acil Hedge!',        cls: 'bg-red-100    text-red-800    border-red-200'    },
}

function fmtForeign(amount: number, currency: string): string {
  if (amount === 0) return '—'
  const symbols: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' }
  const sym = symbols[currency] ?? (currency + ' ')
  return `${sym}${amount.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function fmtScenarioLoss(loss: number): { text: string; cls: string } {
  if (loss > 0) return { text: `-${fmtTRY(loss)}`,    cls: 'text-red-600 font-bold' }
  if (loss < 0) return { text: `+${fmtTRY(-loss)}`,   cls: 'text-green-600 font-bold' }
  return { text: '—', cls: 'text-gray-400' }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Badge({ config }: { config: { label: string; cls: string } }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-bold ${config.cls}`}>
      {config.label}
    </span>
  )
}

function SummaryCard({
  label,
  value,
  sub,
  valueColor = 'text-[#0f172a]',
}: {
  label: string
  value: string
  sub?: string
  valueColor?: string
}) {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm">
      <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{label}</div>
      <div className={`text-xl font-black tabular-nums leading-none ${valueColor}`}>{value}</div>
      {sub && <div className="text-[10px] text-[#94a3b8] mt-1 leading-tight">{sub}</div>}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function FxExposureClient({ companyId }: Props) {
  const { data: raw, isLoading, isError } = useQuery<{ report: FxReport }>({
    queryKey: ['fx-exposure', companyId],
    queryFn:  async () => {
      const res = await fetch('/api/finance/fx-exposure')
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-5 bg-[#f1f5f9] rounded w-40" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-20 bg-[#f1f5f9] rounded" />)}
        </div>
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────────
  if (isError || !raw) {
    return (
      <div className="text-[11px] text-[#94a3b8] py-3">
        Kur riski verileri yüklenemedi.
      </div>
    )
  }

  const data = raw.report

  // ── TRY-only empty state ─────────────────────────────────────────────────────
  if (data.currencies.length === 0) {
    return (
      <div className="space-y-3">
        <h3 className="text-xs font-black uppercase tracking-widest text-[#64748b]">
          Kur Riski Analizi
        </h3>
        <div className="bg-[#f0f9ff] border border-[#bae6fd] rounded-lg p-4 text-sm text-[#0369a1] font-semibold">
          Yabancı para maruziyeti tespit edilmedi — şirketiniz TL bazlı faaliyet gösteriyor.
        </div>
      </div>
    )
  }

  const { overall, scenarios } = data
  const riskBadge  = RISK_BADGE[overall.risk_class]  ?? RISK_BADGE.insufficient_data
  const hedgeBadge = HEDGE_BADGE[overall.hedge_recommendation] ?? HEDGE_BADGE.monitor
  const netColor   = overall.net_exposure_try > 0 ? 'text-green-600' : overall.net_exposure_try < 0 ? 'text-red-600' : 'text-[#0f172a]'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="text-xs font-black uppercase tracking-widest text-[#64748b]">
          Kur Riski Analizi
        </h3>
        <Badge config={riskBadge} />
        <Badge config={hedgeBadge} />
      </div>

      {/* Summary KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Kur Risk Oranı"
          value={overall.fx_risk_ratio_pct != null ? fmtPct(overall.fx_risk_ratio_pct) : '—'}
          sub="Net maruziyet / YTD gelir"
          valueColor={overall.risk_class === 'critical' ? 'text-red-600' : overall.risk_class === 'significant' ? 'text-orange-600' : 'text-[#0f172a]'}
        />
        <SummaryCard
          label="Net Maruziyet (TRY)"
          value={fmtTRY(overall.net_exposure_try)}
          sub="Alacaklar - Borçlar"
          valueColor={netColor}
        />
        <SummaryCard
          label="Toplam Alacaklar"
          value={fmtTRY(overall.total_receivables_try)}
          sub="Tahsil edilmemiş döviz satışları"
        />
        <SummaryCard
          label="Toplam Borçlar"
          value={fmtTRY(overall.total_payables_try)}
          sub="Ödenmemiş döviz giderleri"
        />
      </div>

      {/* Per-currency table */}
      <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#e2e8f0] bg-[#f8fafc]">
          <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#64748b]">
            Para Birimi Dağılımı
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#f1f5f9] bg-[#f8fafc]">
                {['Para Birimi', 'Alacaklar (FX)', 'Borçlar (FX)', 'Net Maruziyet (FX)', 'Alacaklar (TRY)', 'Borçlar (TRY)', 'Net Maruziyet (TRY)', 'Risk %'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[0.6rem] font-black uppercase tracking-wide text-[#94a3b8] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {data.currencies.map(row => {
                const netFxColor = row.net_exposure_try > 0 ? 'text-green-600' : row.net_exposure_try < 0 ? 'text-red-600' : 'text-[#334155]'
                return (
                  <tr key={row.currency} className="hover:bg-[#f8fafc] transition-colors">
                    <td className="px-3 py-2 font-bold text-[#0f172a]">{row.currency}</td>
                    <td className="px-3 py-2 tabular-nums text-[#334155]">{fmtForeign(row.receivables_foreign, row.currency)}</td>
                    <td className="px-3 py-2 tabular-nums text-[#334155]">{row.payables_foreign > 0 ? fmtForeign(row.payables_foreign, row.currency) : '—'}</td>
                    <td className="px-3 py-2 tabular-nums font-semibold">{fmtForeign(row.net_exposure_foreign, row.currency)}</td>
                    <td className="px-3 py-2 tabular-nums text-[#334155]">{fmtTRY(row.receivables_try)}</td>
                    <td className="px-3 py-2 tabular-nums text-[#334155]">{row.payables_try > 0 ? fmtTRY(row.payables_try) : '—'}</td>
                    <td className={`px-3 py-2 tabular-nums font-bold ${netFxColor}`}>{fmtTRY(row.net_exposure_try)}</td>
                    <td className="px-3 py-2 tabular-nums text-[#64748b]">
                      {row.fx_risk_ratio_pct != null ? fmtPct(row.fx_risk_ratio_pct) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Scenario analysis */}
      <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#e2e8f0] bg-[#f8fafc]">
          <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#64748b]">
            Senaryo Analizi — TRY Değer Kaybı
          </span>
        </div>
        <div className="grid grid-cols-3 divide-x divide-[#f1f5f9]">
          {[
            { label: 'TRY %10 Değer Kaybı', loss: scenarios.depreciation_10pct_loss },
            { label: 'TRY %20 Değer Kaybı', loss: scenarios.depreciation_20pct_loss },
            { label: 'TRY %30 Değer Kaybı', loss: scenarios.depreciation_30pct_loss },
          ].map(s => {
            const { text, cls } = fmtScenarioLoss(s.loss)
            return (
              <div key={s.label} className="px-4 py-3 text-center">
                <div className="text-[0.6rem] font-black uppercase tracking-wide text-[#94a3b8] mb-1">{s.label}</div>
                <div className={`text-base tabular-nums ${cls}`}>{text}</div>
                <div className="text-[9px] text-[#94a3b8] mt-0.5">
                  {s.loss > 0 ? 'Zarar' : s.loss < 0 ? 'Kazanç' : ''}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Diversification section */}
      <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 space-y-2">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#64748b] mb-2">
          Para Birimi Çeşitlendirmesi
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
          <div>
            <div className="text-[#94a3b8] font-semibold mb-0.5">HHI Endeksi</div>
            <div className="font-bold tabular-nums text-[#0f172a]">
              {overall.diversification.hhi.toFixed(3)}
            </div>
            <div className="text-[9px] text-[#94a3b8]">
              {overall.diversification.hhi > 0.6 ? 'Yoğun' : overall.diversification.hhi > 0.25 ? 'Orta' : 'Çeşitli'}
            </div>
          </div>
          <div>
            <div className="text-[#94a3b8] font-semibold mb-0.5">Dominant Döviz</div>
            <div className="font-bold text-[#0f172a]">
              {overall.diversification.dominant_currency ?? '—'}
            </div>
          </div>
          <div>
            <div className="text-[#94a3b8] font-semibold mb-0.5">TRY Payı</div>
            <div className="font-bold tabular-nums text-[#0f172a]">
              {fmtPct(overall.diversification.try_pct)}
            </div>
          </div>
          <div>
            <div className="text-[#94a3b8] font-semibold mb-0.5">Döviz Payı</div>
            <div className="font-bold tabular-nums text-[#0f172a]">
              {fmtPct(overall.diversification.foreign_pct)}
            </div>
          </div>
        </div>
        {/* TRY/Foreign bar */}
        <div className="h-2 rounded-full bg-[#f1f5f9] overflow-hidden flex mt-2">
          <div
            className="h-full bg-blue-400 transition-all duration-500"
            style={{ width: `${Math.min(100, overall.diversification.try_pct)}%` }}
          />
          <div
            className="h-full bg-orange-400 transition-all duration-500"
            style={{ width: `${Math.min(100, overall.diversification.foreign_pct)}%` }}
          />
        </div>
        <div className="flex gap-4 text-[9px] text-[#94a3b8]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />TRY</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />Döviz</span>
        </div>
      </div>
    </div>
  )
}

// Default export alias for backward compatibility
export default FxExposureClient

'use client'

// ─────────────────────────────────────────────────────────────────────────────
// CashForecastClient
//
// 13-Haftalık Nakit Projeksiyonu (13-Week Cash Flow Forecast)
//
// Features:
//   - Confidence badge + inputs summary (DSO, DPO, avg flows)
//   - 4 summary KPIs: Başlangıç Nakit / 13. Hafta / Min. Nakit / Kriz Haftası
//   - 13-row weekly forecast table with health-coded rows
//   - Known obligations section below table
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }                 from '@tanstack/react-query'
import { fmtTRY }                   from '@/lib/format'
import {
  classifyWeeklyCashHealth,
  computeMinimumCashBuffer,
  type CashForecastReport,
  type ForecastConfidence,
  type CashHealthLevel,
} from '@/lib/services/finance/cash-forecast.service'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

// ── Confidence badge ──────────────────────────────────────────────────────────

function ConfidenceBadge({ level }: { level: ForecastConfidence }) {
  const map: Record<ForecastConfidence, { label: string; cls: string }> = {
    high:   { label: 'Yüksek Güven',    cls: 'bg-green-100 text-green-800'  },
    medium: { label: 'Orta Güven',      cls: 'bg-yellow-100 text-yellow-800' },
    low:    { label: 'Düşük Güven',     cls: 'bg-[#f1f5f9] text-[#475569]'    },
  }
  const cfg = map[level]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

// ── Health row colors ─────────────────────────────────────────────────────────

const HEALTH_ROW_CLS: Record<CashHealthLevel, string> = {
  strong:   'hover:bg-[#f8fafc]/60',
  adequate: 'hover:bg-[#f8fafc]/60',
  tight:    'bg-yellow-50/60 hover:bg-yellow-50',
  critical: 'bg-orange-50/60 hover:bg-orange-50',
  negative: 'bg-red-50/70 hover:bg-red-50',
}

const HEALTH_TEXT_CLS: Record<CashHealthLevel, string> = {
  strong:   'text-[#0f172a]',
  adequate: 'text-[#334155]',
  tight:    'text-yellow-800',
  critical: 'text-orange-800',
  negative: 'text-red-700 font-black',
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CashForecastClient({ companyId }: Props) {
  const { data, isLoading, isError } = useQuery<{ report: CashForecastReport }>({
    queryKey:  ['cash-forecast', companyId],
    queryFn:   async () => {
      const res = await fetch('/api/finance/cash-forecast', { cache: 'no-store' })
      if (!res.ok) throw new Error('Nakit projeksiyonu verisi alınamadı')
      return res.json()
    },
    staleTime: 1000 * 60 * 3, // 3 minutes
  })

  const report = data?.report

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#e8eaef]">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
            13 Haftalık Nakit Projeksiyonu
          </div>
        </div>
        <div className="px-4 py-8 text-center text-xs text-[#94a3b8]">Yükleniyor…</div>
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (isError || !report) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#e8eaef]">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
            13 Haftalık Nakit Projeksiyonu
          </div>
        </div>
        <div className="px-4 py-8 text-center text-xs text-[#94a3b8]">
          Projeksiyon verisi yüklenemedi. Lütfen daha sonra tekrar deneyin.
        </div>
      </div>
    )
  }

  const { summary, inputs_used, forecast, known_obligations } = report
  const minimumBuffer = computeMinimumCashBuffer(inputs_used.avg_weekly_outflow)

  // ── KPI cards ────────────────────────────────────────────────────────────
  const kpis = [
    {
      label: 'Başlangıç Nakit',
      value: fmtTRY(summary.start_cash),
      tone:  'text-[#0f172a]',
    },
    {
      label: '13. Hafta Nakit',
      value: fmtTRY(summary.week_13_cash),
      tone:  summary.week_13_cash < 0
        ? 'text-red-700'
        : summary.week_13_cash < minimumBuffer
          ? 'text-yellow-700'
          : 'text-green-700',
    },
    {
      label: 'Min. Nakit',
      value: fmtTRY(summary.min_cash_amount),
      tone:  summary.min_cash_amount < 0
        ? 'text-red-700'
        : summary.min_cash_amount < minimumBuffer
          ? 'text-yellow-700'
          : 'text-[#0f172a]',
    },
    {
      label: 'Kriz Haftası',
      value: summary.crisis_week !== null ? `Hafta ${summary.crisis_week}` : 'Yok',
      tone:  summary.crisis_week !== null ? 'text-red-700' : 'text-green-700',
    },
  ]

  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">

      {/* Header */}
      <div className="px-4 py-3 border-b border-[#e8eaef]">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
              13 Haftalık Nakit Projeksiyonu
            </div>
            <p className="text-[10px] text-[#94a3b8] mt-0.5">
              Haftalık tahsilat ve ödeme projeksiyonu — son 3 ay ortalama baz
            </p>
          </div>
          <ConfidenceBadge level={summary.confidence} />
        </div>
      </div>

      {/* Inputs summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-[#e8eaef] border-b border-[#e8eaef] bg-[#f8fafc]">
        {[
          { label: 'Haftalık Tahsilat',  value: fmtTRY(inputs_used.avg_weekly_inflow)  },
          { label: 'Haftalık Ödeme',     value: fmtTRY(inputs_used.avg_weekly_outflow) },
          { label: `DSO (${inputs_used.dso} gün)`,  value: `${inputs_used.dso} gün`   },
          { label: `DPO (${inputs_used.dpo} gün)`,  value: `${inputs_used.dpo} gün`   },
        ].map(item => (
          <div key={item.label} className="px-3 py-2">
            <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8]">{item.label}</div>
            <div className="text-xs font-bold text-[#334155] tabular-nums">{item.value}</div>
          </div>
        ))}
      </div>

      {/* 4 KPI summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-[#e8eaef] border-b border-[#e8eaef]">
        {kpis.map(kpi => (
          <div key={kpi.label} className="px-4 py-3">
            <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
              {kpi.label}
            </div>
            <div className={`text-lg font-black tabular-nums leading-none ${kpi.tone}`}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* Crisis alert */}
      {summary.crisis_week !== null && (
        <div className="border-b border-[#e8eaef] px-4 py-2.5 bg-red-50 text-xs text-red-700 font-semibold">
          Hafta {summary.crisis_week}&apos;da nakit negatife düşüyor.
          Tahsilatlar hızlandırılmalı veya giderler ertelenmeli.
        </div>
      )}

      {/* Minimum buffer info */}
      <div className="border-b border-[#e8eaef] px-4 py-2 bg-[#f8fafc] text-[10px] text-[#64748b]">
        Minimum nakit tamponu (4 haftalık gider): <strong className="text-[#0f172a]">{fmtTRY(minimumBuffer)}</strong>
      </div>

      {/* 13-week table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[520px]">
          <thead>
            <tr className="bg-[#f8fafc] border-b border-[#e8eaef]">
              <th className="text-left px-4 py-2.5 text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Hafta</th>
              <th className="text-right px-4 py-2.5 text-[0.65rem] font-bold uppercase tracking-wider text-green-700">Gelen</th>
              <th className="text-right px-4 py-2.5 text-[0.65rem] font-bold uppercase tracking-wider text-red-600">Giden</th>
              <th className="text-right px-4 py-2.5 text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Net</th>
              <th className="text-right px-4 py-2.5 text-[0.65rem] font-bold uppercase tracking-wider text-[#475569]">Kapanış Nakit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f5f9]">
            {forecast.map(row => {
              const health  = classifyWeeklyCashHealth(row.closing_cash, minimumBuffer)
              const rowCls  = HEALTH_ROW_CLS[health]
              const cashCls = HEALTH_TEXT_CLS[health]
              return (
                <tr key={row.week} className={rowCls}>
                  <td className="px-4 py-2 font-semibold text-[#334155]">
                    Hafta {row.week}
                    {row.has_obligation && (
                      <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-info-light text-info-text">
                        Taahhüt
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-green-700 tabular-nums">
                    {row.inflow > 0 ? fmtTRY(row.inflow) : <span className="text-[#cbd5e1]">—</span>}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-red-600 tabular-nums">
                    {row.outflow > 0 ? fmtTRY(row.outflow) : <span className="text-[#cbd5e1]">—</span>}
                  </td>
                  <td className={`px-4 py-2 text-right font-mono font-bold tabular-nums ${row.net >= 0 ? 'text-[#334155]' : 'text-red-600'}`}>
                    {fmtTRY(row.net)}
                  </td>
                  <td className={`px-4 py-2 text-right font-black tabular-nums ${cashCls}`}>
                    {fmtTRY(row.closing_cash)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="border-t border-[#e8eaef] px-4 py-2.5 flex flex-wrap gap-3 bg-[#f8fafc]">
        <span className="text-[9px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded">Güçlü</span>
        <span className="text-[9px] font-bold text-[#475569] bg-slate-100 px-2 py-0.5 rounded">Yeterli</span>
        <span className="text-[9px] font-bold text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded">Dar</span>
        <span className="text-[9px] font-bold text-orange-700 bg-orange-50 px-2 py-0.5 rounded">Kritik</span>
        <span className="text-[9px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded">Negatif</span>
      </div>

      {/* Known obligations */}
      {known_obligations.length > 0 && (
        <div className="border-t border-[#e8eaef]">
          <div className="px-4 py-2.5 bg-[#f8fafc] border-b border-[#e8eaef]">
            <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
              Planlı Taahhütler ({known_obligations.length} adet)
            </div>
          </div>
          <div className="divide-y divide-[#f1f5f9]">
            {known_obligations.map((ob, idx) => (
              <div key={idx} className="px-4 py-2.5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-semibold text-[#334155]">{ob.label}</span>
                  <span className="ml-2 text-[9px] text-[#94a3b8]">Hafta {ob.week}</span>
                </div>
                <span className={`text-xs font-bold tabular-nums ${ob.amount >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {fmtTRY(ob.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── CashflowTab — Nakit Baskı Analizi ────────────────────────────────────────
//
// Content from /dashboard/cashflow:
//   Zone 1 — Command strip (4 KPIs)
//   Zone 2 — Cashflow chart (client component)
//   Zone 3 — Baskı haritası (pressure signals)
//   Zone 4 — Scenario panel (client island)

import { CashflowChart }   from '@/components/dashboard/CashflowChart'
import { ScenarioPanel }   from '@/components/dashboard/ScenarioPanel'
import { getCashflowTimeline, getRunwayForecast } from '@/lib/finance/financial-core'
import { fmtTRY as fmt }  from '@/lib/format'
function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const names  = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
  return `${names[m - 1] ?? ym} ${y}`
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { userId: string; companyId: string }

export async function CashflowTab({ userId: _userId, companyId }: Props) {
  function sq<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    return fn().catch(() => fallback)
  }

  const ZERO_RUNWAY = {
    months: [] as never[], exhaustion_month: null, exhaustion_date: null, safe_months: 0,
    inputs: { starting_cash: 0, monthly_burn: 0, outstanding_total: 0, horizon_months: 12 },
  }

  const [timeline, runway] = await Promise.all([
    sq(() => getCashflowTimeline(companyId, { pastMonths: 6, futureMonths: 6 }), {
      months: [], pressureSignals: [], firstDangerMonth: null, totalReceivables: 0,
    }),
    sq(() => getRunwayForecast(companyId, { months: 12 }), ZERO_RUNWAY),
  ])

  const lastMonth  = timeline.months[timeline.months.length - 1]
  const finalCumul = lastMonth?.cumulative ?? 0

  return (
    <div className="space-y-4">

      {/* Zone 1 — Command strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          {
            label: '12 Ay Kümülatif',
            value: fmt(finalCumul),
            tone: finalCumul >= 0 ? 'text-emerald-700' : 'text-red-600',
          },
          {
            label: 'Toplam Alacak',
            value: fmt(timeline.totalReceivables),
            tone: timeline.totalReceivables > 0 ? 'text-amber-600' : 'text-gray-400',
          },
          {
            label: 'Runway',
            value: runway.safe_months > 0 ? `${runway.safe_months} ay` : '—',
            tone: runway.safe_months <= 2 ? 'text-red-600' : runway.safe_months <= 6 ? 'text-amber-600' : 'text-emerald-600',
          },
          {
            label: timeline.firstDangerMonth ? 'İlk Tehlike Ayı' : 'Nakit Durumu',
            value: timeline.firstDangerMonth ? fmtMonth(timeline.firstDangerMonth) : 'Sağlıklı ✓',
            tone: timeline.firstDangerMonth ? 'text-red-600' : 'text-emerald-700',
          },
        ].map(c => (
          <div key={c.label} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">{c.label}</div>
            <div className={`text-xl font-black tabular-nums leading-none ${c.tone}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Danger alert */}
      {timeline.firstDangerMonth && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 font-semibold">
          🔴 {fmtMonth(timeline.firstDangerMonth)} ayında kümülatif nakit negatife düşüyor.
          Tahsilatlar hızlandırılmalı veya giderler kısılmalıdır.
        </div>
      )}

      {/* Zone 2 — Chart */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <CashflowChart className="w-full" />
      </div>

      {/* Zone 3 — Pressure timeline */}
      {timeline.pressureSignals.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black text-gray-800">Baskı Haritası</h2>
              <p className="text-[10px] text-gray-400 mt-0.5">Negatif nakit akışı veya kümülatif tehlike olan gelecek aylar</p>
            </div>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
              timeline.pressureSignals.some(s => s.severity === 'critical')
                ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {timeline.pressureSignals.filter(s => s.severity === 'critical').length} kritik ·{' '}
              {timeline.pressureSignals.filter(s => s.severity === 'warn').length} uyarı
            </span>
          </div>
          <div className="divide-y divide-gray-50">
            {timeline.pressureSignals.map(sig => {
              const isCritical = sig.severity === 'critical'
              return (
                <div key={sig.month} className={`px-4 py-3 flex items-start gap-3 ${isCritical ? 'bg-red-50/50' : 'bg-amber-50/30'}`}>
                  <div className={`mt-0.5 flex-shrink-0 w-2 h-2 rounded-full ${isCritical ? 'bg-red-500' : 'bg-amber-400'}`} />
                  <div>
                    <div className={`text-xs font-black ${isCritical ? 'text-red-700' : 'text-amber-700'}`}>
                      {fmtMonth(sig.month)}
                    </div>
                    <ul className="mt-0.5 space-y-0.5">
                      {sig.reasons.map((r, i) => (
                        <li key={i} className="text-[11px] text-gray-600">{r}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {timeline.pressureSignals.length === 0 && timeline.months.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700 font-semibold">
          ✓ Önümüzdeki 6 ayda nakit baskı sinyali tespit edilmedi.
        </div>
      )}

      {/* Zone 4 — Scenario panel */}
      <ScenarioPanel
        inputs={runway.inputs}
        baseRunwayMonths={runway.safe_months > 0 ? runway.safe_months : null}
      />
    </div>
  )
}

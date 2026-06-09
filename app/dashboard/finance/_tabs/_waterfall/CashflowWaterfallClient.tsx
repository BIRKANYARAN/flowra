'use client'

// ─────────────────────────────────────────────────────────────────────────────
// CashflowWaterfallClient
//
// 12-Month Forward Cash Flow Waterfall Projection.
//
// Features:
//   - Scenario toggle: Base / Muhafazakâr / İyimser
//   - Summary header: Opening Balance / 12M Inflows / Outflows / Ending Cash / Runway
//   - Crisis alert banner if cash goes negative
//   - Monthly table (12 rows) with position badges
//   - Waterfall outflow layer bars (CSS proportional widths)
//   - TanStack Query with scenario in queryKey
// ─────────────────────────────────────────────────────────────────────────────

import { useState }   from 'react'
import { useQuery }   from '@tanstack/react-query'
import { fmtTRY }     from '@/lib/format'
import type { CashflowWaterfallProjection, WaterfallMonth } from '@/lib/services/finance/cashflow-waterfall.service'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

// ── Scenario config ───────────────────────────────────────────────────────────

type Scenario = 'base' | 'conservative' | 'optimistic'

const SCENARIOS: { key: Scenario; label: string }[] = [
  { key: 'base',         label: 'Baz' },
  { key: 'conservative', label: 'Muhafazakâr' },
  { key: 'optimistic',   label: 'İyimser' },
]

// ── Position badge ────────────────────────────────────────────────────────────

function PositionBadge({ position }: { position: WaterfallMonth['cash_position'] }) {
  const map = {
    strong:   { text: 'Güçlü',     cls: 'bg-green-100 text-green-800' },
    adequate: { text: 'Yeterli',   cls: 'bg-info-light text-info-text' },
    tight:    { text: 'Sınırlı',   cls: 'bg-yellow-100 text-yellow-800' },
    negative: { text: 'Negatif',   cls: 'bg-red-100 text-red-800' },
  }
  const cfg = map[position]
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${cfg.cls}`}>
      {cfg.text}
    </span>
  )
}

// ── Waterfall layer bar ───────────────────────────────────────────────────────

interface LayerBarProps {
  layer1: number
  layer2: number
  layer3: number
  layer4: number
  layer5: number
}

function LayerBars({ layer1, layer2, layer3, layer4, layer5 }: LayerBarProps) {
  const total = layer1 + layer2 + layer3 + layer4 + layer5
  if (total <= 0) return <div className="text-[10px] text-[#94a3b8]">—</div>

  const pct = (v: number) => `${Math.max(1, Math.round((v / total) * 100))}%`

  return (
    <div className="flex gap-0.5 h-3 w-full min-w-[80px]" title={`OpEx/Vergi/Borç/YatırımDiğer`}>
      {layer1 > 0 && (
        <div
          className="bg-slate-400 rounded-sm h-full"
          style={{ width: pct(layer1) }}
          title={`OpEx: ${fmtTRY(layer1, 0)}`}
        />
      )}
      {layer2 > 0 && (
        <div
          className="bg-amber-400 rounded-sm h-full"
          style={{ width: pct(layer2) }}
          title={`Vergi/SGK: ${fmtTRY(layer2, 0)}`}
        />
      )}
      {layer3 > 0 && (
        <div
          className="bg-red-400 rounded-sm h-full"
          style={{ width: pct(layer3) }}
          title={`Borç Servisi: ${fmtTRY(layer3, 0)}`}
        />
      )}
      {layer4 > 0 && (
        <div
          className="bg-blue-400 rounded-sm h-full"
          style={{ width: pct(layer4) }}
          title={`CapEx: ${fmtTRY(layer4, 0)}`}
        />
      )}
      {layer5 > 0 && (
        <div
          className="bg-purple-300 rounded-sm h-full"
          style={{ width: pct(layer5) }}
          title={`Diğer: ${fmtTRY(layer5, 0)}`}
        />
      )}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CashflowWaterfallClient({ companyId }: Props) {
  const [scenario, setScenario] = useState<Scenario>('base')

  const { data, isLoading, isError } = useQuery<{ projection: CashflowWaterfallProjection }>({
    queryKey: ['cashflow-waterfall-projection', companyId, scenario],
    queryFn: async () => {
      const res = await fetch(
        `/api/finance/cashflow-waterfall?scenario=${scenario}`,
        { cache: 'no-store' },
      )
      if (!res.ok) throw new Error('Projeksiyon verisi alınamadı')
      return res.json()
    },
    staleTime: 1000 * 60 * 15, // 15 minutes
  })

  const proj = data?.projection

  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#e8eaef] flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            12 Aylık Nakit Akış Şelalesi
          </div>
          <p className="text-[10px] text-[#94a3b8] mt-0.5">
            Öncelik sırasına göre: Faaliyet → Vergi → Borç → Yatırım → Diğer
          </p>
        </div>

        {/* Scenario toggle */}
        <div className="flex gap-1">
          {SCENARIOS.map(s => (
            <button
              key={s.key}
              onClick={() => setScenario(s.key)}
              className={`px-2.5 py-1 text-[10px] font-bold rounded transition-colors ${
                scenario === s.key
                  ? 'bg-[#0f172a] text-white'
                  : 'bg-[#f1f5f9] text-[#64748b] hover:bg-[#e2e8f0]'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="px-4 py-8 text-center text-xs text-[#94a3b8]">
          Projeksiyon hesaplanıyor...
        </div>
      )}

      {isError && (
        <div className="px-4 py-4 text-xs text-red-600 font-semibold">
          Veri yüklenemedi. Lütfen sayfayı yenileyin.
        </div>
      )}

      {proj && (
        <>
          {/* Summary strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 divide-x-0 sm:divide-x divide-[#e8eaef] border-b border-[#e8eaef]">
            {[
              {
                label: 'Açılış Bakiyesi',
                value: fmtTRY(proj.opening_balance_try, 0),
                tone:  proj.opening_balance_try >= 0 ? 'text-[#0f172a]' : 'text-red-600',
              },
              {
                label: '12 Ay Toplam Giriş',
                value: fmtTRY(proj.total_inflows_12m_try, 0),
                tone:  'text-green-700',
              },
              {
                label: '12 Ay Toplam Çıkış',
                value: fmtTRY(proj.total_outflows_12m_try, 0),
                tone:  'text-red-600',
              },
              {
                label: 'Kapanış Bakiyesi',
                value: proj.months.length > 0
                  ? fmtTRY(proj.months[proj.months.length - 1].ending_cash_try, 0)
                  : '—',
                tone: (() => {
                  const ending = proj.months[proj.months.length - 1]?.ending_cash_try ?? 0
                  return ending < 0 ? 'text-red-600' : ending === 0 ? 'text-[#94a3b8]' : 'text-[#0f172a]'
                })(),
              },
              {
                label: 'Runway',
                value: proj.months_of_runway !== null
                  ? `${proj.months_of_runway.toFixed(1)} ay`
                  : proj.opening_balance_try < 0 ? 'Negatif' : '∞',
                tone: proj.months_of_runway === null
                  ? (proj.opening_balance_try < 0 ? 'text-red-600' : 'text-[#94a3b8]')
                  : proj.months_of_runway <= 3 ? 'text-red-600'
                  : proj.months_of_runway <= 6 ? 'text-amber-600'
                  : 'text-green-700',
              },
            ].map(item => (
              <div key={item.label} className="px-4 py-3">
                <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
                  {item.label}
                </div>
                <div className={`text-base font-black tabular-nums leading-none ${item.tone}`}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          {/* Crisis alert */}
          {proj.crisis_month !== null && (
            <div className="bg-red-50 border-b border-red-200 px-4 py-3 flex items-center gap-2">
              <span className="text-red-500 font-black text-sm">!</span>
              <p className="text-xs font-bold text-red-700">
                {proj.crisis_month_label} ayında nakit negatife düşme riski — senaryo ve tahsilat planını gözden geçirin.
              </p>
            </div>
          )}

          {/* Layer legend */}
          <div className="px-4 py-2 bg-[#f8fafc] border-b border-[#e8eaef] flex flex-wrap gap-3">
            {[
              { color: 'bg-slate-400',   label: 'Faaliyet Giderleri (L1)' },
              { color: 'bg-amber-400',   label: 'Vergi / SGK (L2)' },
              { color: 'bg-red-400',     label: 'Borç Servisi (L3)' },
              { color: 'bg-blue-400',    label: 'CapEx (L4)' },
              { color: 'bg-purple-300',  label: 'Diğer (L5)' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-1">
                <div className={`w-2.5 h-2.5 rounded-sm ${l.color}`} />
                <span className="text-[9px] text-[#64748b]">{l.label}</span>
              </div>
            ))}
          </div>

          {/* Monthly table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[700px]">
              <thead>
                <tr className="bg-[#f8fafc] border-b border-[#e8eaef]">
                  <th className="text-left px-3 py-2.5 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">Ay</th>
                  <th className="text-right px-3 py-2.5 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">Açılış</th>
                  <th className="text-right px-3 py-2.5 text-[0.6rem] font-black uppercase tracking-widest text-green-700">Tahsilat</th>
                  <th className="text-right px-3 py-2.5 text-[0.6rem] font-black uppercase tracking-widest text-slate-500">Faaliyet</th>
                  <th className="text-right px-3 py-2.5 text-[0.6rem] font-black uppercase tracking-widest text-amber-600">Vergi</th>
                  <th className="text-right px-3 py-2.5 text-[0.6rem] font-black uppercase tracking-widest text-red-600">Borç</th>
                  <th className="text-right px-3 py-2.5 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">Net</th>
                  <th className="text-right px-3 py-2.5 text-[0.6rem] font-black uppercase tracking-widest text-[#0f172a]">Kapanış</th>
                  <th className="px-3 py-2.5 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">Durum</th>
                  <th className="px-3 py-2.5 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">Katmanlar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {proj.months.map((mo, idx) => {
                  const isNeg     = mo.ending_cash_try < 0
                  const isCrisis  = proj.crisis_month === idx
                  const rowBg     = isNeg ? 'bg-red-50/60' : ''
                  return (
                    <tr key={mo.month_key} className={`hover:bg-[#f8fafc]/60 ${rowBg}`}>
                      <td className={`px-3 py-2.5 font-semibold ${isCrisis ? 'text-red-700' : 'text-[#334155]'}`}>
                        {mo.month_label}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-mono text-[#64748b]">
                        {fmtTRY(mo.opening_cash_try, 0)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-mono text-green-700">
                        {mo.operating_receipts_try > 0 ? fmtTRY(mo.operating_receipts_try, 0) : <span className="text-[#cbd5e1]">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-mono text-[#64748b]">
                        {mo.layer1_opex_try > 0 ? fmtTRY(mo.layer1_opex_try, 0) : <span className="text-[#cbd5e1]">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-mono text-amber-700">
                        {mo.layer2_tax_try > 0 ? fmtTRY(mo.layer2_tax_try, 0) : <span className="text-[#cbd5e1]">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-mono text-red-600">
                        {mo.layer3_debt_service_try > 0 ? fmtTRY(mo.layer3_debt_service_try, 0) : <span className="text-[#cbd5e1]">—</span>}
                      </td>
                      <td className={`px-3 py-2.5 text-right tabular-nums font-mono font-bold ${mo.net_cash_try >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {fmtTRY(mo.net_cash_try, 0)}
                      </td>
                      <td className={`px-3 py-2.5 text-right tabular-nums font-black ${isNeg ? 'text-red-700' : 'text-[#0f172a]'}`}>
                        {fmtTRY(mo.ending_cash_try, 0)}
                      </td>
                      <td className="px-3 py-2.5">
                        <PositionBadge position={mo.cash_position} />
                      </td>
                      <td className="px-3 py-2.5">
                        <LayerBars
                          layer1={mo.layer1_opex_try}
                          layer2={mo.layer2_tax_try}
                          layer3={mo.layer3_debt_service_try}
                          layer4={mo.layer4_capex_try}
                          layer5={mo.layer5_discretionary_try}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Footer note */}
          <div className="px-4 py-2.5 border-t border-[#e8eaef] bg-[#f8fafc]">
            <p className="text-[10px] text-[#94a3b8]">
              Projeksiyon son 6 aylık ortalama nakit akış kalıplarına dayalı tahmindir.
              {scenario === 'conservative' && ' Muhafazakâr: gelirler %15 düşük, giderler %10 yüksek varsayılmıştır.'}
              {scenario === 'optimistic'   && ' İyimser: gelirler %15 yüksek, giderler %5 düşük varsayılmıştır.'}
            </p>
          </div>
        </>
      )}
    </div>
  )
}

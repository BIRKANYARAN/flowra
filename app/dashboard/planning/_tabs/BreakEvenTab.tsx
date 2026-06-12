// ── BreakEvenTab — Başabaş Analizi ─────────────────────────────────────────────
//
// Server component: loads break-even analysis for current YTD period.
// Shows:
//   - Break-even revenue vs actual (prominent comparison)
//   - Margin of safety %
//   - Fixed vs variable cost breakdown
//   - Contribution margin
//   - Target profit scenario (10% net margin)
//   - Above/below break-even indicator

import { createClient }    from '@/lib/supabase-server'
import { BreakEvenService } from '@/lib/services/finance/breakeven.service'
import { fmtTRY, fmtPct }  from '@/lib/format'
import { NarrativeFooter } from '@/components/ds'

interface Props { companyId: string; userId: string }

async function sq<T>(p: Promise<T>): Promise<T | null> {
  try { return await p } catch { return null }
}

export async function BreakEvenTab({ companyId, userId }: Props) {
  const supabase = createClient()
  const today    = new Date().toISOString().slice(0, 10)
  const from     = today.slice(0, 4) + '-01-01'

  const analysis = await sq(
    BreakEvenService.getAnalysis(companyId, userId, supabase, { from, to: today })
  )

  if (!analysis) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-6 text-center text-xs text-[#94a3b8]">
        Başabaş analizi yüklenemedi. Lütfen sayfayı yenileyin.
      </div>
    )
  }

  const {
    actual_revenue_try,
    breakeven_revenue_try,
    is_above_breakeven,
    margin_of_safety_pct,
    contribution_margin_rate,
    contribution_margin_try,
    estimated_fixed_costs_try,
    estimated_variable_costs_try,
    variable_cost_rate,
    revenue_vs_breakeven_try,
    target_profit_inputs,
    period_from,
    period_to,
  } = analysis

  const beFinite = isFinite(breakeven_revenue_try)
  const cmrPct   = contribution_margin_rate * 100
  const vcrPct   = variable_cost_rate * 100

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-black text-[#0f172a]">Başabaş Analizi</h2>
          <p className="text-xs text-[#94a3b8] mt-0.5">{period_from} — {period_to}</p>
        </div>
        {/* Above / Below break-even badge */}
        <span className={`text-xs font-black px-3 py-1.5 rounded border ${
          is_above_breakeven
            ? 'bg-pos-light border-pos-light text-pos-text'
            : 'bg-neg-light border-neg-light text-neg-text'
        }`}>
          {is_above_breakeven ? '✓ Başabaş üzerinde' : '⚠ Başabaşın altında'}
        </span>
      </div>

      {/* Main comparison: actual vs breakeven */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-4 shadow-sm">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
            Gerçek Ciro (YTD)
          </div>
          <div className={`text-2xl font-extrabold tabular-nums ${
            actual_revenue_try > 0 ? 'text-[#0f172a]' : 'text-[#94a3b8]'
          }`}>
            {fmtTRY(actual_revenue_try)}
          </div>
        </div>
        <div className={`border rounded px-4 py-4 shadow-sm ${
          beFinite
            ? is_above_breakeven
              ? 'bg-pos-light border-pos-light'
              : 'bg-neg-light border-neg-light'
            : 'bg-white border-[#e8eaef]'
        }`}>
          <div className={`text-[0.65rem] font-bold uppercase tracking-wider mb-1 ${
            is_above_breakeven ? 'text-pos-text' : 'text-neg-text'
          }`}>
            Başabaş Noktası
          </div>
          <div className={`text-2xl font-extrabold tabular-nums ${
            is_above_breakeven ? 'text-pos-text' : 'text-neg-text'
          }`}>
            {beFinite ? fmtTRY(breakeven_revenue_try) : '—'}
          </div>
          {beFinite && (
            <div className={`text-xs font-bold mt-1 ${
              revenue_vs_breakeven_try >= 0 ? 'text-pos-text' : 'text-neg-text'
            }`}>
              {revenue_vs_breakeven_try >= 0 ? '+' : ''}{fmtTRY(revenue_vs_breakeven_try)} fark
            </div>
          )}
        </div>
      </div>

      {/* Margin of safety + contribution margin */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3 shadow-sm">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
            Güvenlik Marjı
          </div>
          <div className={`text-xl font-extrabold tabular-nums ${
            margin_of_safety_pct === null ? 'text-[#94a3b8]' :
            margin_of_safety_pct >= 20 ? 'text-pos-text' :
            margin_of_safety_pct >= 0  ? 'text-warn-text' :
            'text-neg-text'
          }`}>
            {margin_of_safety_pct !== null
              ? fmtPct(margin_of_safety_pct)
              : '—'}
          </div>
          <div className="text-[10px] text-[#94a3b8] mt-0.5">
            (Ciro − BE) / Ciro
          </div>
        </div>
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3 shadow-sm">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
            Katkı Payı Oranı
          </div>
          <div className={`text-xl font-extrabold tabular-nums ${
            cmrPct >= 40 ? 'text-pos-text' :
            cmrPct >= 20 ? 'text-warn-text' :
            'text-neg-text'
          }`}>
            {fmtPct(cmrPct)}
          </div>
          <div className="text-[10px] text-[#94a3b8] mt-0.5">
            {fmtTRY(contribution_margin_try)}
          </div>
        </div>
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3 shadow-sm">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
            Değişken Maliyet Oranı
          </div>
          <div className={`text-xl font-extrabold tabular-nums ${
            vcrPct <= 40 ? 'text-pos-text' :
            vcrPct <= 60 ? 'text-warn-text' :
            'text-neg-text'
          }`}>
            {fmtPct(vcrPct)}
          </div>
          <div className="text-[10px] text-[#94a3b8] mt-0.5">
            Değişken gider / ciro
          </div>
        </div>
      </div>

      {/* Fixed vs Variable cost breakdown */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4 shadow-sm">
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-3">
          Maliyet Yapısı Analizi
        </div>
        <div className="space-y-2">
          {[
            {
              label:  'Sabit Giderler',
              sub:    'Maaş · Kira · Yazılım · Faturalar · Genel gider · Operasyonel',
              value:  estimated_fixed_costs_try,
              color:  'bg-warn-light',
              textColor: 'text-warn-text',
            },
            {
              label:  'Değişken Giderler (Gider)',
              sub:    'Pazarlama · Lojistik · Vergi · Diğer değişken',
              value:  estimated_variable_costs_try - (analysis.estimated_variable_costs_try - (actual_revenue_try > 0 ? estimated_variable_costs_try : 0)),
              color:  'bg-neg-light',
              textColor: 'text-neg-text',
            },
          ].map(row => {
            const total = estimated_fixed_costs_try + estimated_variable_costs_try
            const pct   = total > 0 ? (row.value / total) * 100 : 0
            return (
              <div key={row.label}>
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <div className="text-xs font-semibold text-[#334155]">{row.label}</div>
                    <div className="text-[10px] text-[#94a3b8]">{row.sub}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-xs font-extrabold tabular-nums ${row.textColor}`}>{fmtTRY(row.value)}</div>
                    <div className="text-[10px] text-[#94a3b8]">{fmtPct(pct, 0)} pay</div>
                  </div>
                </div>
                <div className="bg-[#f1f5f9] rounded-full h-1.5">
                  <div
                    className={`${row.color} h-1.5 rounded-full`}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-3 pt-3 border-t border-[#e8eaef] flex items-center justify-between text-xs">
          <span className="font-black text-[#0f172a]">Toplam Maliyet Tahmini</span>
          <span className="font-extrabold tabular-nums">{fmtTRY(estimated_fixed_costs_try + estimated_variable_costs_try)}</span>
        </div>
      </div>

      {/* Target profit scenario */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4 shadow-sm">
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-3">
          Hedef Kâr Senaryosu — %10 Net Marj
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] text-[#94a3b8] mb-0.5">Hedef Kâr (%10)</div>
            <div className="text-base font-extrabold tabular-nums text-pos-text">
              {fmtTRY(target_profit_inputs.target_profit_try)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#94a3b8] mb-0.5">Gerekli Ciro</div>
            <div className={`text-base font-extrabold tabular-nums ${
              isFinite(target_profit_inputs.revenue_needed_try) ? 'text-info-text' : 'text-[#94a3b8]'
            }`}>
              {isFinite(target_profit_inputs.revenue_needed_try)
                ? fmtTRY(target_profit_inputs.revenue_needed_try)
                : '—'}
            </div>
          </div>
        </div>
        {isFinite(target_profit_inputs.revenue_needed_try) && (
          <div className="mt-2 text-[10px] text-[#94a3b8]">
            Formül: (Sabit Gider {fmtTRY(estimated_fixed_costs_try)} + Hedef Kâr {fmtTRY(target_profit_inputs.target_profit_try)}) ÷ Katkı Payı Oranı {fmtPct(cmrPct)}
          </div>
        )}
      </div>

      {/* No data or infinite breakeven warning */}
      {!beFinite && (
        <div className="bg-warn-light border border-warn-light rounded px-4 py-3 text-xs text-warn-text">
          <strong>Dikkat:</strong> Katkı payı oranı sıfır veya negatif — başabaş noktası hesaplanamıyor.
          Değişken maliyetler gelirin tamamını aşıyor olabilir.
        </div>
      )}

      <NarrativeFooter
        narrative="Başabaş analizini nakit projeksiyonu ve senaryo analizi ile birlikte değerlendirin."
        links={[
          { label: 'Senaryo Analizi',     href: '/dashboard/planning?tab=scenarios'       },
          { label: 'Nakit Projeksiyonu',  href: '/dashboard/planning?tab=cash-projection' },
          { label: 'P&L Detayı',          href: '/dashboard/finance?tab=pnl'              },
        ]}
      />
    </div>
  )
}

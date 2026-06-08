'use client'

// ─────────────────────────────────────────────────────────────────────────────
// ScenarioPanel — Runway scenario branching client island
//
// Pure client-side math — no API calls.
// Receives base runway inputs from server component as props.
// User adjusts sliders → instant recalculation.
//
// Scenarios:
//   A. Tahsilat gecikmesi — outstanding receivables collected later (delay %)
//   B. Ek ortak borç     — partner injects additional capital
//   C. Gider kesintisi   — burn rate reduced by X%
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'

export interface RunwayInputs {
  starting_cash:     number   // distributable cash
  monthly_burn:      number   // avg monthly operational burn
  outstanding_total: number   // receivables
  horizon_months:    number
}

interface Props {
  inputs: RunwayInputs
  baseRunwayMonths: number | null
}

function calcRunway(cash: number, burn: number): number | null {
  if (burn <= 0) return null
  return Math.max(0, cash / burn)
}

function fmt(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₺${(abs / 1_000_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}M`
  if (abs >= 10_000)    return `₺${(abs / 1_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`
  return `₺${Math.round(abs).toLocaleString('tr-TR')}`
}

function runwayLabel(months: number | null): string {
  if (months === null) return '∞ ay'
  if (months === 0)    return 'Tükendi'
  return `${months.toFixed(1)} ay`
}

function deltaLabel(base: number | null, scenario: number | null): { text: string; color: string } {
  if (base === null || scenario === null) return { text: '—', color: 'text-[#94a3b8]' }
  const delta = scenario - base
  if (Math.abs(delta) < 0.1) return { text: 'Değişim yok', color: 'text-[#94a3b8]' }
  const sign = delta > 0 ? '+' : ''
  const color = delta > 0 ? 'text-pos-text' : 'text-neg'
  return { text: `${sign}${delta.toFixed(1)} ay`, color }
}

export function ScenarioPanel({ inputs, baseRunwayMonths }: Props) {
  const { starting_cash, monthly_burn, outstanding_total } = inputs

  // Scenario A: tahsilat gecikmesi — receivables only partially collected
  const [collectionPct, setCollectionPct] = useState(100)
  // Scenario B: ek ortak borç (TL)
  const [extraLoan, setExtraLoan] = useState(0)
  // Scenario C: burn kesintisi
  const [burnCutPct, setBurnCutPct] = useState(0)

  // Base is already computed server-side; recalculate to be consistent with scenarios
  const base_cash  = starting_cash + outstanding_total
  const base_r     = baseRunwayMonths

  // Scenario A only
  const a_cash    = starting_cash + outstanding_total * (collectionPct / 100)
  const a_runway  = calcRunway(a_cash, monthly_burn)

  // Scenario B only
  const b_cash    = starting_cash + outstanding_total + extraLoan
  const b_runway  = calcRunway(b_cash, monthly_burn)

  // Scenario C only
  const c_burn    = monthly_burn * (1 - burnCutPct / 100)
  const c_runway  = calcRunway(base_cash, c_burn)

  // Combined
  const comb_cash  = starting_cash + outstanding_total * (collectionPct / 100) + extraLoan
  const comb_burn  = monthly_burn * (1 - burnCutPct / 100)
  const comb_runway = calcRunway(comb_cash, comb_burn)

  const SL = 'flex flex-col gap-1'
  const SLabel = 'text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]'
  const SValue = 'text-xs text-[#94a3b8] tabular-nums'

  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
      <div className="px-4 py-3 border-b border-[#e8eaef]">
        <h2 className="text-sm font-black text-[#1e293b]">Senaryo Analizi</h2>
        <p className="text-[10px] text-[#94a3b8] mt-0.5">
          Parametreleri değiştir — runway anında güncellenir
        </p>
      </div>

      {/* Sliders */}
      <div className="px-4 py-4 space-y-5">

        {/* A: Tahsilat gecikmesi */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={SLabel}>A — Tahsilat Oranı</label>
            <span className="text-xs font-black text-brand-light">%{collectionPct}</span>
          </div>
          <input
            type="range" min={0} max={100} step={5} value={collectionPct}
            onChange={e => setCollectionPct(Number(e.target.value))}
            className="w-full accent-brand-light h-1.5"
          />
          <div className="flex justify-between mt-0.5">
            <span className={SValue}>%0 — hiç tahsilat yok</span>
            <span className={SValue}>%100 — tam tahsilat</span>
          </div>
          {collectionPct < 100 && (
            <div className="mt-1.5 text-[10px] text-warn-text font-semibold">
              {fmt(outstanding_total * (1 - collectionPct / 100))} alacak gecikirse runway %{Math.round((1 - (a_runway ?? 0) / (base_r ?? 1)) * 100)} düşer
            </div>
          )}
        </div>

        {/* B: Ek ortak borç */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={SLabel}>B — Ek Finansman (₺)</label>
            <span className="text-xs font-black text-brand-light">{fmt(extraLoan)}</span>
          </div>
          <input
            type="range" min={0} max={Math.max(500_000, monthly_burn * 12)} step={10_000}
            value={extraLoan}
            onChange={e => setExtraLoan(Number(e.target.value))}
            className="w-full accent-brand-light h-1.5"
          />
          <div className="flex justify-between mt-0.5">
            <span className={SValue}>₺0</span>
            <span className={SValue}>{fmt(Math.max(500_000, monthly_burn * 12))}</span>
          </div>
        </div>

        {/* C: Burn kesintisi */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={SLabel}>C — Gider Kesintisi</label>
            <span className="text-xs font-black text-brand-light">%{burnCutPct}</span>
          </div>
          <input
            type="range" min={0} max={50} step={5} value={burnCutPct}
            onChange={e => setBurnCutPct(Number(e.target.value))}
            className="w-full accent-brand-light h-1.5"
          />
          <div className="flex justify-between mt-0.5">
            <span className={SValue}>%0 — kesinti yok</span>
            <span className={SValue}>%50 — yarı gider</span>
          </div>
          {burnCutPct > 0 && (
            <div className="mt-1.5 text-[10px] text-pos-text font-semibold">
              {fmt(monthly_burn * burnCutPct / 100)}/ay tasarruf → yeni burn {fmt(comb_burn)}/ay
            </div>
          )}
        </div>
      </div>

      {/* Results grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-[#e8eaef] border-t border-[#e8eaef]">
        {[
          { label: 'Baz Senaryo',  runway: base_r,    delta: null },
          { label: 'A Senaryosu', runway: a_runway,   delta: deltaLabel(base_r, a_runway) },
          { label: 'B Senaryosu', runway: b_runway,   delta: deltaLabel(base_r, b_runway) },
          { label: 'A+B+C Hepsi', runway: comb_runway, delta: deltaLabel(base_r, comb_runway) },
        ].map((s, i) => {
          const months = s.runway
          const tone = months === null ? 'text-[#94a3b8]'
            : months <= 2  ? 'text-neg'
            : months <= 6  ? 'text-warn'
            : months <= 12 ? 'text-warn-text'
            : 'text-pos-text'
          return (
            <div key={s.label} className={`px-4 py-3 ${i === 3 ? 'col-span-2 sm:col-span-1' : ''}`}>
              <div className="text-[9px] font-bold uppercase tracking-widest text-[#94a3b8] mb-1">{s.label}</div>
              <div className={`text-base font-black tabular-nums leading-tight ${tone}`}>
                {runwayLabel(months)}
              </div>
              {s.delta && (
                <div className={`text-[10px] font-bold mt-0.5 ${s.delta.color}`}>{s.delta.text}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

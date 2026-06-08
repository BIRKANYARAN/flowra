'use client'

import { fmtC, fmtMonth } from '@/app/dashboard/simulation/_components/types'
import { MiniBar } from '@/app/dashboard/simulation/_components/MiniBar'

export interface ProjectionRow {
  month:      number
  ym:         string
  revenue:    number
  cogs:       number
  holding:    number
  grossProfit: number
  expense:    number
  netProfit:  number
  cumProfit:  number
}

interface ProjectionTableProps {
  projection: ProjectionRow[]
  toDisplay:  (v: number) => number
  S:          string
  hasInputs:  boolean
}

export function ProjectionTable({ projection, toDisplay, S, hasInputs }: ProjectionTableProps) {
  const maxRevenue = Math.max(...projection.map(r => r.revenue), 1)

  return (
    <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft p-4 shadow-sm">
      <h2 className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">Aylık Projeksiyon (12 Ay)</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[#f8fafc]">
            <tr className="border-b border-[#e2e8f0] text-left text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
              <th className="py-1.5 pr-3">Ay</th>
              <th className="py-1.5 pr-3 text-right">Gelir</th>
              <th className="py-1.5 pr-3 text-right">SMM</th>
              <th className="py-1.5 pr-3 text-right">Finansman</th>
              <th className="py-1.5 pr-3 text-right">Brüt Kâr</th>
              <th className="py-1.5 pr-3 text-right">Tekrarlı Gider</th>
              <th className="py-1.5 pr-3 text-right">Net Kâr</th>
              <th className="py-1.5 text-right">Kümülatif</th>
            </tr>
          </thead>
          <tbody>
            {projection.map(r => (
              <tr key={r.month} className="border-b border-[#f1f5f9] hover:bg-[#f8fafc]/50">
                <td className="py-1.5 pr-3 font-medium text-[#64748b]">{r.month}. Ay</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {fmtC(toDisplay(r.revenue), S)}
                  <MiniBar value={r.revenue} max={maxRevenue} color="bg-info-light" />
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-[#64748b]">{fmtC(toDisplay(r.cogs), S)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-[#64748b]">{fmtC(toDisplay(r.holding), S)}</td>
                <td className={`py-1.5 pr-3 text-right tabular-nums font-semibold ${r.grossProfit >= 0 ? 'text-pos-text' : 'text-neg'}`}>
                  {fmtC(toDisplay(r.grossProfit), S)}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-neg">{fmtC(toDisplay(r.expense), S)}</td>
                <td className={`py-1.5 pr-3 text-right tabular-nums font-semibold ${r.netProfit >= 0 ? 'text-pos-text' : 'text-neg'}`}>
                  {fmtC(toDisplay(r.netProfit), S)}
                </td>
                <td className={`py-1.5 text-right tabular-nums font-semibold ${r.cumProfit >= 0 ? 'text-pos-text' : 'text-neg'}`}>
                  {fmtC(toDisplay(r.cumProfit), S)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

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
    <div className="bg-white border border-gray-100 rounded p-4 shadow-sm">
      <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Aylık Projeksiyon (12 Ay)</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-gray-50">
            <tr className="border-b border-gray-100 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">
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
              <tr key={r.month} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="py-1.5 pr-3 font-medium text-gray-600">{r.month}. Ay</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {fmtC(toDisplay(r.revenue), S)}
                  <MiniBar value={r.revenue} max={maxRevenue} color="bg-blue-200" />
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-gray-500">{fmtC(toDisplay(r.cogs), S)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-gray-500">{fmtC(toDisplay(r.holding), S)}</td>
                <td className={`py-1.5 pr-3 text-right tabular-nums font-semibold ${r.grossProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {fmtC(toDisplay(r.grossProfit), S)}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-red-600">{fmtC(toDisplay(r.expense), S)}</td>
                <td className={`py-1.5 pr-3 text-right tabular-nums font-semibold ${r.netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {fmtC(toDisplay(r.netProfit), S)}
                </td>
                <td className={`py-1.5 text-right tabular-nums font-semibold ${r.cumProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
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

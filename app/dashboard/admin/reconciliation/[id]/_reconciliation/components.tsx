// ── reconciliation detail — presentational components ─────────────────────────
// Extracted from [id]/page.tsx. Pure presentational (props → JSX), no hooks.

import type { ReactNode } from 'react'
import { fmtTRY } from '@/lib/format'

// ── Helpers ───────────────────────────────────────────────────────────────────

export function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  return fmtTRY(n, 0)
}
export function pct(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toFixed(2) + '%'
}

// ── SectionBlock helper ───────────────────────────────────────────────────────

export function SectionBlock({
  number, title, children,
}: {
  number: number
  title: string
  children: ReactNode
}) {
  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-[#e8eaef] bg-[#f8fafc]">
        <div className="w-6 h-6 rounded bg-[#0f172a] flex items-center justify-center flex-shrink-0">
          <span className="text-[10px] font-black text-white">
            {String(number).padStart(2, '0')}
          </span>
        </div>
        <span className="text-xs font-black text-[#0f172a] uppercase tracking-widest">{title}</span>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

// ── KV row for labeled field pairs ───────────────────────────────────────────

export function KV({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex gap-2 py-1.5 border-b border-[#f1f5f9] last:border-0">
      <span className="text-xs text-[#94a3b8] w-40 flex-shrink-0">{label}</span>
      <span className="text-xs font-medium text-[#0f172a]">{value ?? '—'}</span>
    </div>
  )
}

// ── Simple table ──────────────────────────────────────────────────────────────

export function SimpleTable({
  cols, rows,
}: {
  cols: string[]
  rows: (string | number | null | undefined)[][]
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-[#0f172a]">
            {cols.map((c, i) => (
              <th key={i} className="px-3 py-2 text-left text-[10px] font-black text-white uppercase tracking-wide first:rounded-tl last:rounded-tr">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-[#f8fafc]'}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-[#334155] border-b border-[#f1f5f9]">
                  {cell ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Aging sub-table ───────────────────────────────────────────────────────────

export function AgingTable({ aging }: { aging: { bucket_0_30: number; bucket_31_60: number; bucket_61_90: number; bucket_90plus: number } }) {
  return (
    <SimpleTable
      cols={['0-30 Gün', '31-60 Gün', '61-90 Gün', '90+ Gün']}
      rows={[[fmt(aging.bucket_0_30), fmt(aging.bucket_31_60), fmt(aging.bucket_61_90), fmt(aging.bucket_90plus)]]}
    />
  )
}

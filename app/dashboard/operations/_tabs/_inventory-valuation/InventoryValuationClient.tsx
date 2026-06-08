'use client'
// ── InventoryValuationClient — FIFO inventory valuation section ───────────────
// Client island: fetches /api/inventory/valuation via TanStack Query,
// renders summary strip + dead stock warning + product table.

import { useQuery }        from '@tanstack/react-query'
import type { ProductValuation, InventoryValuationReport } from '@/lib/services/inventory/inventory-valuation.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

const FMT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })
function fmtTRY(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₺${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `₺${(n / 1_000).toFixed(1)}K`
  return `₺${FMT.format(Math.round(n))}`
}

function fmtTurnover(rate: number): string {
  return `${rate.toFixed(1)}x / yıl`
}

// ── Margin color ──────────────────────────────────────────────────────────────

function marginColor(pct: number | null): string {
  if (pct === null) return 'text-[#94a3b8]'
  if (pct >= 30)    return 'text-pos-text'
  if (pct >= 15)    return 'text-warn-text'
  return 'text-neg'
}

// ── Days of stock color ───────────────────────────────────────────────────────

function daysColor(days: number | null): string {
  if (days === null) return 'text-[#94a3b8]'
  if (days < 30)    return 'text-pos-text'
  if (days < 90)    return 'text-warn-text'
  return 'text-neg'
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-16 bg-[#f1f5f9] rounded" />
      <div className="h-4 bg-[#f1f5f9] rounded w-3/4" />
      <div className="h-32 bg-[#f1f5f9] rounded" />
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ApiResponse {
  report: InventoryValuationReport
}

export function InventoryValuationClient() {
  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['inventory-valuation'],
    queryFn:  () => fetch('/api/inventory/valuation').then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    }),
    staleTime: 5 * 60 * 1_000,
  })

  if (isLoading) return <Skeleton />
  if (error || !data?.report) return null

  const report = data.report

  if (report.products.length === 0) return null

  return (
    <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9]">
        <div>
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Envanter Değerleme</div>
          <div className="text-xs text-[#64748b] mt-0.5">FIFO maliyet · devir analizi · atıl stok</div>
        </div>
        <div className="text-[10px] text-[#94a3b8]">
          {report.as_of_date}
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-0 border-b border-[#f1f5f9]">
        {[
          {
            label: 'Toplam Stok Değeri',
            value: fmtTRY(report.total_inventory_value),
            sub:   `${report.total_products} ürün`,
            color: 'text-[#0f172a]',
          },
          {
            label: 'Atıl Stok',
            value: report.total_dead_stock_value > 0 ? fmtTRY(report.total_dead_stock_value) : '—',
            sub:   `%${report.dead_stock_pct.toFixed(1)} · ${report.dead_stock_products} ürün`,
            color: report.dead_stock_pct > 20 ? 'text-neg' : report.dead_stock_pct > 0 ? 'text-warn-text' : 'text-[#94a3b8]',
          },
          {
            label: 'Ağ. Ort. Devir',
            value: report.weighted_avg_turnover > 0 ? fmtTurnover(report.weighted_avg_turnover) : '—',
            sub:   report.slow_moving_products > 0
              ? `${report.slow_moving_products} yavaş hareketli`
              : 'Hızlı hareketli envanter',
            color: report.weighted_avg_turnover >= 4 ? 'text-pos-text'
              : report.weighted_avg_turnover >= 2 ? 'text-warn-text'
              : 'text-neg',
          },
        ].map((card, i) => (
          <div key={card.label} className={`p-3 ${i < 2 ? 'border-r border-[#e2e8f0]' : ''}`}>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{card.label}</div>
            <div className={`text-base font-black tabular-nums leading-none ${card.color}`}>{card.value}</div>
            <div className="text-[10px] text-[#94a3b8] mt-1 truncate">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Dead stock warning banner */}
      {report.dead_stock_pct > 20 && (
        <div className="px-4 py-2.5 bg-neg-light border-b border-neg/20 flex items-start gap-2">
          <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-neg shrink-0" />
          <div>
            <span className="text-xs font-black text-neg">Yüksek Atıl Stok Riski</span>
            <span className="text-[10px] text-neg ml-2">
              Envanter değerinin %{report.dead_stock_pct.toFixed(1)}&apos;i son 60 günde hareket etmedi —
              indirim, iade veya stok düzenleme değerlendirin.
            </span>
          </div>
        </div>
      )}

      {/* Product table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#f1f5f9]">
              <th className="text-left px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Ürün</th>
              <th className="text-right px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Stok Adedi</th>
              <th className="text-right px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Stok Değeri</th>
              <th className="text-right px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Devir Hızı</th>
              <th className="text-right px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Brüt Marj</th>
              <th className="text-right px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Stok Günü</th>
              <th className="text-center px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Durum</th>
            </tr>
          </thead>
          <tbody>
            {report.products.map((p: ProductValuation) => (
              <tr key={p.product_id} className="border-b border-[#f8fafc] hover:bg-[#fafafa]">
                <td className="px-4 py-2">
                  <div className="font-semibold text-[#0f172a]">{p.product_name}</div>
                  {p.category && <div className="text-[10px] text-[#94a3b8]">{p.category}</div>}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-[#334155]">
                  {p.total_qty.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-semibold text-[#0f172a]">
                  {fmtTRY(p.total_value)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-[#334155]">
                  {p.turnover_rate > 0 ? fmtTurnover(p.turnover_rate) : '—'}
                </td>
                <td className={`px-4 py-2 text-right tabular-nums font-bold ${marginColor(p.gross_margin_pct)}`}>
                  {p.gross_margin_pct !== null ? `%${p.gross_margin_pct.toFixed(1)}` : '—'}
                </td>
                <td className={`px-4 py-2 text-right tabular-nums ${daysColor(p.days_of_stock)}`}>
                  {p.days_of_stock !== null ? `${Math.round(p.days_of_stock)} gün` : '—'}
                </td>
                <td className="px-4 py-2 text-center">
                  <div className="flex items-center justify-center gap-1 flex-wrap">
                    {p.is_dead_stock && (
                      <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-black bg-neg-light text-neg border border-neg/20">
                        Atıl
                      </span>
                    )}
                    {p.is_slow_moving && (
                      <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-black bg-orange-50 text-orange-700 border border-orange-200">
                        Yavaş
                      </span>
                    )}
                    {!p.is_dead_stock && !p.is_slow_moving && p.total_qty > 0 && (
                      <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-black bg-pos-light text-pos-text border border-pos-light">
                        Normal
                      </span>
                    )}
                    {p.total_qty === 0 && (
                      <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-black bg-[#f1f5f9] text-[#94a3b8]">
                        Tükenmiş
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Fastest / slowest callout */}
      {(report.fastest_mover || report.slowest_mover) && (
        <div className="flex gap-6 px-4 py-2 border-t border-[#f1f5f9] text-[10px] text-[#64748b]">
          {report.fastest_mover && (
            <span>
              <span className="font-black text-pos-text">En hızlı:</span>{' '}
              {report.fastest_mover.product_name} · {fmtTurnover(report.fastest_mover.turnover_rate)}
            </span>
          )}
          {report.slowest_mover && (
            <span>
              <span className="font-black text-warn-text">En yavaş:</span>{' '}
              {report.slowest_mover.product_name} · {fmtTurnover(report.slowest_mover.turnover_rate)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

'use client'
// ─────────────────────────────────────────────────────────────────────────────
// InventoryTurnoverClient — Stok Devir Analizi panel
//
// Fetches /api/inventory/inventory-turnover via TanStack Query.
// Displays:
//   • Header: Stok Devir Analizi
//   • 4 KPI cards: Devir Hızı / DIO / Ölü Stok Değeri / Kritik Stok Sayısı
//   • Shrinkage section with level badge
//   • Dead stock top-5 items table
//   • Reorder alerts table (critical + reorder_now only)
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }  from '@tanstack/react-query'
import { fmtTRY, fmtPct } from '@/lib/format'
import type {
  classifyTurnoverHealth,
  classifyShrinkageLevel,
  computeReorderAlert,
  computeDeadStockValue,
} from '@/lib/services/inventory/inventory-turnover.service'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TurnoverReport {
  turnover: {
    ratio: number | null
    dio_days: number | null
    health: ReturnType<typeof classifyTurnoverHealth>
    cogs_ytd: number
    avg_inventory_value: number
  }
  shrinkage: {
    rate_pct: number | null
    level: ReturnType<typeof classifyShrinkageLevel>
    shrinkage_units: number
    shrinkage_value: number
  }
  dead_stock: ReturnType<typeof computeDeadStockValue>
  reorder_alerts: Array<{
    product_id: string
    product_name: string
    current_qty: number
    reorder_point: number
    safety_stock: number
    alert: ReturnType<typeof computeReorderAlert>
  }>
  summary: {
    total_sku_count: number
    total_inventory_value: number
    dead_stock_value: number
    reorder_now_count: number
    critical_count: number
  }
}

interface ApiResponse {
  report: TurnoverReport
}

interface Props {
  companyId: string
}

// ── Badge helpers ─────────────────────────────────────────────────────────────

function TurnoverHealthBadge({ health }: { health: ReturnType<typeof classifyTurnoverHealth> }) {
  const config: Record<ReturnType<typeof classifyTurnoverHealth>, { label: string; cls: string }> = {
    excellent:        { label: 'Mükemmel',    cls: 'bg-pos-light text-pos-text' },
    good:             { label: 'İyi',         cls: 'bg-pos-light text-pos-text' },
    adequate:         { label: 'Yeterli',     cls: 'bg-warn-light text-warn-text' },
    slow:             { label: 'Yavaş',       cls: 'bg-orange-50 text-orange-700' },
    stagnant:         { label: 'Durgun',      cls: 'bg-neg-light text-neg-text' },
    insufficient_data:{ label: 'Veri Yok',   cls: 'bg-[#f1f5f9] text-[#64748b]' },
  }
  const { label, cls } = config[health]
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${cls}`}>
      {label}
    </span>
  )
}

function ShrinkageBadge({ level }: { level: ReturnType<typeof classifyShrinkageLevel> }) {
  const config: Record<ReturnType<typeof classifyShrinkageLevel>, { label: string; cls: string }> = {
    none:             { label: 'Fire Yok',    cls: 'bg-pos-light text-pos-text' },
    acceptable:       { label: 'Kabul Edilebilir', cls: 'bg-warn-light text-warn-text' },
    elevated:         { label: 'Yüksek',     cls: 'bg-orange-50 text-orange-700' },
    critical:         { label: 'Kritik',     cls: 'bg-neg-light text-neg-text' },
    insufficient_data:{ label: 'Veri Yok',  cls: 'bg-[#f1f5f9] text-[#64748b]' },
  }
  const { label, cls } = config[level]
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${cls}`}>
      {label}
    </span>
  )
}

function ReorderAlertBadge({ alert }: { alert: ReturnType<typeof computeReorderAlert> }) {
  const config: Record<ReturnType<typeof computeReorderAlert>, { label: string; cls: string }> = {
    critical:    { label: 'Kritik',         cls: 'bg-neg-light text-neg-text' },
    reorder_now: { label: 'Sipariş Ver',    cls: 'bg-orange-50 text-orange-700' },
    watch:       { label: 'İzle',           cls: 'bg-warn-light text-warn-text' },
    healthy:     { label: 'Sağlıklı',       cls: 'bg-pos-light text-pos-text' },
  }
  const { label, cls } = config[alert]
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${cls}`}>
      {label}
    </span>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-10 bg-[#f1f5f9] rounded" />
      <div className="h-24 bg-[#f1f5f9] rounded" />
      <div className="h-32 bg-[#f1f5f9] rounded" />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function InventoryTurnoverClient({ companyId }: Props) {
  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['inventory-turnover', companyId],
    queryFn:  async () => {
      const res = await fetch('/api/inventory/inventory-turnover')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    staleTime: 60 * 60 * 1000,  // 1 hr
  })

  if (isLoading) return <Skeleton />
  if (error || !data?.report) {
    return (
      <div className="bg-neg-light border border-neg-light rounded px-4 py-3 text-xs text-neg-text font-semibold">
        Stok devir analizi yüklenemedi.
      </div>
    )
  }

  const { turnover, shrinkage, dead_stock, reorder_alerts, summary } = data.report

  // Urgent reorder alerts only
  const urgentAlerts = reorder_alerts.filter(a => a.alert === 'critical' || a.alert === 'reorder_now')

  // Top 5 dead stock items by value
  const topDeadItems = dead_stock.items
    .filter(i => i.is_dead)
    .sort((a, b) => b.stock_value - a.stock_value)
    .slice(0, 5)

  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#e8eaef] flex items-center justify-between">
        <div>
          <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Stok Devir Analizi
          </span>
          <span className="ml-2 text-[10px] text-[#94a3b8]">
            — devir hızı · ölü stok · fire · sipariş uyarıları
          </span>
        </div>
        <TurnoverHealthBadge health={turnover.health} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-[#e8eaef] border-b border-[#e8eaef]">
        {/* Stok Devir Hızı */}
        <div className="px-4 py-3">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            Stok Devir Hızı
          </div>
          <div className="text-xl font-black tabular-nums text-[#0f172a] leading-none">
            {turnover.ratio !== null ? turnover.ratio.toFixed(1) + '×' : '—'}
          </div>
          <div className="text-[10px] text-[#94a3b8] mt-1">
            Benchmark: 6.0× (SME)
          </div>
        </div>

        {/* DIO */}
        <div className="px-4 py-3">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            DIO (Gün)
          </div>
          <div className={`text-xl font-black tabular-nums leading-none ${
            turnover.dio_days !== null && turnover.dio_days > 120 ? 'text-neg'
            : turnover.dio_days !== null && turnover.dio_days > 60 ? 'text-warn-text'
            : 'text-[#0f172a]'
          }`}>
            {turnover.dio_days !== null ? Math.round(turnover.dio_days) + ' gün' : '—'}
          </div>
          <div className="text-[10px] text-[#94a3b8] mt-1">Ortalama stokta kalma</div>
        </div>

        {/* Ölü Stok Değeri */}
        <div className="px-4 py-3">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            Ölü Stok Değeri
          </div>
          <div className={`text-xl font-black tabular-nums leading-none ${
            dead_stock.dead_stock_value > 0 ? 'text-neg' : 'text-[#94a3b8]'
          }`}>
            {fmtTRY(dead_stock.dead_stock_value)}
          </div>
          <div className="text-[10px] text-[#94a3b8] mt-1">
            {dead_stock.dead_stock_count} ürün · {fmtPct(dead_stock.dead_stock_pct_of_total)} stok
          </div>
        </div>

        {/* Kritik Stok */}
        <div className="px-4 py-3">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            Kritik Stok Sayısı
          </div>
          <div className={`text-xl font-black tabular-nums leading-none ${
            summary.critical_count > 0 ? 'text-neg' : 'text-[#94a3b8]'
          }`}>
            {summary.critical_count}
          </div>
          <div className="text-[10px] text-[#94a3b8] mt-1">
            {summary.reorder_now_count} sipariş gerekli
          </div>
        </div>
      </div>

      {/* Shrinkage Section */}
      <div className="px-5 py-4 border-b border-[#e8eaef]">
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Fire / Kayıp Analizi
            </span>
          </div>
          <ShrinkageBadge level={shrinkage.level} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-[10px] text-[#94a3b8] mb-0.5">Fire Oranı</div>
            <div className={`text-sm font-black tabular-nums ${
              shrinkage.rate_pct !== null && shrinkage.rate_pct > 3 ? 'text-neg'
              : shrinkage.rate_pct !== null && shrinkage.rate_pct > 1 ? 'text-warn-text'
              : 'text-[#334155]'
            }`}>
              {shrinkage.rate_pct !== null ? fmtPct(shrinkage.rate_pct) : '—'}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#94a3b8] mb-0.5">Fire Adedi</div>
            <div className="text-sm font-black tabular-nums text-[#334155]">
              {shrinkage.shrinkage_units.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#94a3b8] mb-0.5">Fire Değeri</div>
            <div className={`text-sm font-black tabular-nums ${
              shrinkage.shrinkage_value > 0 ? 'text-neg' : 'text-[#94a3b8]'
            }`}>
              {fmtTRY(shrinkage.shrinkage_value)}
            </div>
          </div>
        </div>
      </div>

      {/* Dead Stock Top 5 */}
      {topDeadItems.length > 0 && (
        <div className="border-b border-[#e8eaef]">
          <div className="px-5 py-3 border-b border-[#e8eaef]">
            <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Ölü Stok — İlk 5 Ürün
            </span>
            <span className="ml-2 text-[10px] text-[#94a3b8]">90+ gün hareketsiz</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] bg-[#f8fafc] border-b border-[#e8eaef]">
                  <th className="text-left px-5 py-2.5">Ürün ID</th>
                  <th className="text-right px-4 py-2.5">Stok Değeri</th>
                  <th className="text-right px-5 py-2.5">Son Satış</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {topDeadItems.map(item => (
                  <tr key={item.product_id} className="hover:bg-[#f8fafc]/60">
                    <td className="px-5 py-3 font-mono text-[10px] text-[#64748b]">
                      {item.product_id.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-neg">
                      {fmtTRY(item.stock_value)}
                    </td>
                    <td className="px-5 py-3 text-right text-[#64748b]">
                      {item.days_since_sale !== null
                        ? `${item.days_since_sale} gün önce`
                        : 'Hiç satılmadı'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reorder Alerts — critical + reorder_now only */}
      {urgentAlerts.length > 0 && (
        <div>
          <div className="px-5 py-3 border-b border-[#e8eaef] flex items-center justify-between">
            <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Acil Sipariş Uyarıları
            </span>
            <span className="text-[10px] text-[#94a3b8]">
              {urgentAlerts.length} ürün
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] bg-[#f8fafc] border-b border-[#e8eaef]">
                  <th className="text-left px-5 py-2.5">Ürün</th>
                  <th className="text-right px-4 py-2.5">Mevcut</th>
                  <th className="text-right px-4 py-2.5">Yeniden Sipariş Noktası</th>
                  <th className="text-right px-4 py-2.5">Güvenlik Stoğu</th>
                  <th className="text-right px-5 py-2.5">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {urgentAlerts.map(alert => (
                  <tr key={alert.product_id} className="hover:bg-[#f8fafc]/60">
                    <td className="px-5 py-3 font-semibold text-[#0f172a]">
                      {alert.product_name}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums font-bold ${
                      alert.alert === 'critical' ? 'text-neg' : 'text-orange-700'
                    }`}>
                      {alert.current_qty.toLocaleString('tr-TR', { maximumFractionDigits: 3 })}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[#64748b]">
                      {alert.reorder_point.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[#64748b]">
                      {alert.safety_stock.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <ReorderAlertBadge alert={alert.alert} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state when all healthy */}
      {urgentAlerts.length === 0 && topDeadItems.length === 0 && (
        <div className="px-5 py-6 text-center">
          <div className="text-xs font-semibold text-pos-text mb-1">Stok sağlıklı</div>
          <div className="text-[10px] text-[#94a3b8]">
            Acil sipariş veya ölü stok uyarısı bulunmuyor.
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

// ── PurchaseAnalyticsClient — Purchase Order Analytics panel ──────────────────
// Client component — fetches /api/inventory/purchase-analytics via TanStack
// Query. Renders KPI strip, monthly spend bar chart, cost variance alerts,
// top suppliers table, and product cost trend list.

import { useQuery } from '@tanstack/react-query'
import type {
  PurchaseAnalyticsSummary,
  SupplierAnalytics,
  ProductPurchaseAnalytics,
  CostTrend,
  LeadTimeClass,
} from '@/lib/services/inventory/purchase-analytics.service'
import { fmtTRY, fmtMonthShort } from '@/lib/format'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function fmtLeadTime(days: number | null): string {
  if (days === null) return '—'
  return `${days} gün`
}

function fmtFreq(freq: number): string {
  return `${freq.toFixed(1)}/ay`
}

const LEAD_CLASS_BADGE: Record<LeadTimeClass, string> = {
  fast:      'bg-[#dcfce7] text-[#15803d]',
  normal:    'bg-[#dbeafe] text-[#1d4ed8]',
  slow:      'bg-[#fef9c3] text-[#854d0e]',
  very_slow: 'bg-[#fee2e2] text-[#991b1b]',
  pending:   'bg-[#f1f5f9] text-[#64748b]',
}

const LEAD_CLASS_LABEL: Record<LeadTimeClass, string> = {
  fast:      'Hızlı',
  normal:    'Normal',
  slow:      'Yavaş',
  very_slow: 'Çok Yavaş',
  pending:   'Bekliyor',
}

const TREND_ICON: Record<CostTrend, string> = {
  increasing:       '↑',
  decreasing:       '↓',
  stable:           '→',
  insufficient_data: '—',
}

const TREND_COLOR: Record<CostTrend, string> = {
  increasing:       'text-[#ef4444]',
  decreasing:       'text-[#22c55e]',
  stable:           'text-[#64748b]',
  insufficient_data: 'text-[#94a3b8]',
}

function varColor(pct: number | null): string {
  if (pct === null) return 'text-[#94a3b8]'
  if (pct > 15)     return 'text-[#ef4444] font-bold'
  if (pct < -15)    return 'text-[#22c55e] font-bold'
  if (pct > 5)      return 'text-[#f97316]'
  if (pct < -5)     return 'text-[#16a34a]'
  return 'text-[#64748b]'
}

function fmtVarPct(pct: number | null): string {
  if (pct === null) return '—'
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="grid grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-16 bg-[#f1f5f9] rounded" />
        ))}
      </div>
      <div className="h-32 bg-[#f1f5f9] rounded" />
      <div className="h-48 bg-[#f1f5f9] rounded" />
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm">
      <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{label}</div>
      <div className="text-xl font-black tabular-nums text-[#1e293b]">{value}</div>
      {sub && <div className="text-[0.65rem] text-[#94a3b8] mt-0.5">{sub}</div>}
    </div>
  )
}

function MonthlySpendChart({ data }: { data: PurchaseAnalyticsSummary['monthly_spend'] }) {
  const maxAmt = Math.max(...data.map(d => d.amount_try), 1)
  return (
    <div className="bg-white border border-[#e2e8f0] rounded shadow-sm">
      <div className="px-4 py-3 border-b border-[#f1f5f9]">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Aylık Harcama (Son 6 Ay)</div>
      </div>
      <div className="px-4 py-4">
        <div className="flex items-end gap-2 h-28">
          {data.map(d => {
            const heightPct = maxAmt > 0 ? Math.round((d.amount_try / maxAmt) * 100) : 0
            return (
              <div key={d.month} className="flex flex-col items-center flex-1 gap-1">
                <div className="text-[0.6rem] tabular-nums text-[#64748b] font-semibold">
                  {d.amount_try > 0 ? fmtTRY(d.amount_try, 0) : '—'}
                </div>
                <div className="w-full flex flex-col justify-end" style={{ height: '60px' }}>
                  <div
                    className="w-full rounded-t bg-[#3b82f6] transition-all"
                    style={{ height: `${Math.max(heightPct, d.amount_try > 0 ? 4 : 0)}%` }}
                  />
                </div>
                <div className="text-[0.6rem] text-[#94a3b8]">{fmtMonthShort(d.month)}</div>
                {d.orders_count > 0 && (
                  <div className="text-[0.55rem] text-[#94a3b8]">{d.orders_count} sipariş</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function CostVarianceAlerts({ alerts }: { alerts: ProductPurchaseAnalytics[] }) {
  if (alerts.length === 0) return null
  return (
    <div className="space-y-2">
      {/* Warning banner */}
      <div className="bg-[#fff7ed] border border-[#fed7aa] rounded px-4 py-3 flex items-start gap-3">
        <span className="text-base mt-0.5">⚠</span>
        <div className="flex-1">
          <div className="text-[11px] font-black uppercase tracking-wide text-[#9a3412]">
            {alerts.length} Üründe Fiyat Dalgalanması
          </div>
          <div className="text-xs text-[#9a3412] mt-0.5">
            Son alım ile önceki alım arasında %15'ten fazla fiyat değişimi tespit edildi.
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#e2e8f0] rounded shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-[#f1f5f9]">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Fiyat Değişim Uyarıları</div>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] border-b border-[#f1f5f9] bg-[#f8fafc]">
              <th className="text-left px-4 py-2">Ürün</th>
              <th className="text-right px-4 py-2">Önceki Maliyet</th>
              <th className="text-right px-4 py-2">Son Maliyet</th>
              <th className="text-right px-4 py-2">Değişim</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f5f9]">
            {alerts.map(p => (
              <tr key={p.product_id} className="hover:bg-[#f8fafc]/50">
                <td className="px-4 py-2.5 text-[#334155] font-medium">
                  {p.product_name}
                  {p.sku && <span className="ml-1 text-[#94a3b8] font-normal">({p.sku})</span>}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-[#64748b]">
                  {p.prior_unit_cost_try !== null ? fmtTRY(p.prior_unit_cost_try) : '—'}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-[#334155] font-semibold">
                  {p.latest_unit_cost_try !== null ? fmtTRY(p.latest_unit_cost_try) : '—'}
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${varColor(p.cost_variance_pct)}`}>
                  {fmtVarPct(p.cost_variance_pct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TopSuppliersTable({ suppliers }: { suppliers: SupplierAnalytics[] }) {
  if (suppliers.length === 0) return null
  return (
    <div className="bg-white border border-[#e2e8f0] rounded shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-[#f1f5f9]">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">En Büyük Tedarikçiler</div>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] border-b border-[#f1f5f9] bg-[#f8fafc]">
            <th className="text-left px-4 py-2">Tedarikçi</th>
            <th className="text-right px-4 py-2">Sipariş</th>
            <th className="text-right px-4 py-2">Toplam Harcama</th>
            <th className="text-right px-4 py-2">Ort. Temin Süresi</th>
            <th className="text-right px-4 py-2">Frekans</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f1f5f9]">
          {suppliers.map(s => (
            <tr key={s.supplier_name} className="hover:bg-[#f8fafc]/50">
              <td className="px-4 py-2.5 text-[#334155] font-medium">
                <div>{s.supplier_name}</div>
                <div className="mt-0.5">
                  <span className={`text-[0.6rem] font-bold px-1.5 py-0.5 rounded ${LEAD_CLASS_BADGE[s.lead_time_class]}`}>
                    {LEAD_CLASS_LABEL[s.lead_time_class]}
                  </span>
                </div>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-[#64748b]">{s.total_orders}</td>
              <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-[#334155]">
                {fmtTRY(s.total_amount_try)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-[#64748b]">
                {fmtLeadTime(s.avg_lead_time_days)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-[#64748b]">
                {fmtFreq(s.purchase_frequency_per_month)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ProductCostTrendList({ products }: { products: ProductPurchaseAnalytics[] }) {
  if (products.length === 0) return null
  // Show top 15 by total_spent
  const top = products.slice(0, 15)
  return (
    <div className="bg-white border border-[#e2e8f0] rounded shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-[#f1f5f9]">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Ürün Maliyet Trendi</div>
      </div>
      <div className="divide-y divide-[#f1f5f9]">
        {top.map(p => (
          <div key={p.product_id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-[#f8fafc]/50">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-[#334155] font-medium truncate">{p.product_name}</div>
              {p.sku && <div className="text-[0.65rem] text-[#94a3b8]">{p.sku}</div>}
            </div>
            <div className="text-xs tabular-nums text-[#64748b] text-right w-24">
              {p.avg_unit_cost_try > 0 ? fmtTRY(p.avg_unit_cost_try) : '—'}
            </div>
            <div className={`text-sm font-black w-6 text-center ${TREND_COLOR[p.cost_trend]}`}>
              {TREND_ICON[p.cost_trend]}
            </div>
            {p.cost_variance_pct !== null && (
              <div className={`text-xs tabular-nums w-14 text-right ${varColor(p.cost_variance_pct)}`}>
                {fmtVarPct(p.cost_variance_pct)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── API response type ─────────────────────────────────────────────────────────

interface ApiResponse {
  summary: PurchaseAnalyticsSummary
}

// ── Main component ────────────────────────────────────────────────────────────

export function PurchaseAnalyticsClient({ companyId }: Props) {
  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['purchase-analytics', companyId],
    queryFn:  () => fetch('/api/inventory/purchase-analytics').then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    }),
    staleTime: 5 * 60 * 1_000,
  })

  if (isLoading) return <Skeleton />
  if (error || !data?.summary) return null

  const s = data.summary

  if (s.total_purchases === 0) {
    return (
      <div className="text-center py-12 text-[#94a3b8] text-sm">
        Satın alma verisi bulunamadı
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* ── KPI strip ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        <KpiCard
          label="Toplam Sipariş"
          value={String(s.total_purchases)}
        />
        <KpiCard
          label="Toplam Harcama"
          value={fmtTRY(s.total_spent_try)}
        />
        <KpiCard
          label="Ort. Temin Süresi"
          value={s.avg_lead_time_days !== null ? `${s.avg_lead_time_days} gün` : '—'}
        />
        <KpiCard
          label="Bekleyen Teslimat"
          value={String(s.pending_receipts)}
          sub="teslim alınmayı bekliyor"
        />
      </div>

      {/* ── Monthly spend chart ───────────────────────────────────────────── */}
      <MonthlySpendChart data={s.monthly_spend} />

      {/* ── Cost variance alerts ──────────────────────────────────────────── */}
      <CostVarianceAlerts alerts={s.cost_variance_alerts} />

      {/* ── Top suppliers ─────────────────────────────────────────────────── */}
      <TopSuppliersTable suppliers={s.top_suppliers} />

      {/* ── Product cost trends ───────────────────────────────────────────── */}
      <ProductCostTrendList products={s.product_analytics} />

    </div>
  )
}

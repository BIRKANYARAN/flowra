'use client'
// ── ProductMarginSensitivityClient — Product Margin Sensitivity Analysis ──────
// Fetches /api/commercial/product-margin-sensitivity via TanStack Query.
// Features:
//   • KPI summary cards: total products, high-risk count, portfolio impact, narrative
//   • Risk ranking table (color-coded by risk level)
//   • Standard scenarios table for top product
//   • Portfolio sensitivity summary (10% and 20% cost increase)
//   • Breakeven calculations panel

import { useQuery } from '@tanstack/react-query'
import type {
  ProductBaseMetrics,
  SensitivityResult,
  ProductMarginSensitivityReport,
} from '@/lib/services/commercial/product-margin-sensitivity.service'
import {
  computeBreakevenPrice,
  computeBreakevenCost,
  computeMarginSafetyBuffer,
} from '@/lib/services/commercial/product-margin-sensitivity.service'

// ── Formatters ────────────────────────────────────────────────────────────────

const TRY_FMT = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  maximumFractionDigits: 0,
})

const PCT_FMT = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const NUM_FMT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 })

function fmtTry(n: number): string {
  return TRY_FMT.format(n)
}

function fmtPct(n: number | null): string {
  if (n === null) return '—'
  return `%${PCT_FMT.format(n)}`
}

function fmtNum(n: number): string {
  return NUM_FMT.format(n)
}

function fmtPp(n: number | null): string {
  if (n === null) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${PCT_FMT.format(n)} pp`
}

// ── Risk level badge ──────────────────────────────────────────────────────────

const RISK_CFG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  low:      { label: 'Düşük',    bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-500' },
  medium:   { label: 'Orta',     bg: 'bg-amber-50',    text: 'text-amber-700',   dot: 'bg-amber-500'   },
  high:     { label: 'Yüksek',   bg: 'bg-orange-50',   text: 'text-orange-700',  dot: 'bg-orange-500'  },
  critical: { label: 'Kritik',   bg: 'bg-red-50',      text: 'text-red-700',     dot: 'bg-red-500'     },
}

function RiskBadge({ level }: { level: string }) {
  const cfg = RISK_CFG[level] ?? RISK_CFG.low
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

// ── Scenario impact badge ─────────────────────────────────────────────────────

function ImpactBadge({ value }: { value: number }) {
  const isPos = value > 0
  const isZero = value === 0
  const colorCls = isZero
    ? 'text-slate-500'
    : isPos
    ? 'text-emerald-600'
    : 'text-red-600'
  const sign = value > 0 ? '+' : ''
  return (
    <span className={`font-semibold tabular-nums ${colorCls}`}>
      {sign}{fmtTry(value)}
    </span>
  )
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: 'default' | 'warning' | 'danger' | 'success'
}) {
  const accentCls =
    accent === 'danger'
      ? 'border-red-300 bg-red-50'
      : accent === 'warning'
      ? 'border-amber-300 bg-amber-50'
      : accent === 'success'
      ? 'border-emerald-300 bg-emerald-50'
      : 'border-slate-200 bg-white'

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-1 ${accentCls}`}>
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className="text-2xl font-bold text-slate-800 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Risk ranking table ────────────────────────────────────────────────────────

function RiskRankingTable({
  rows,
}: {
  rows: Array<
    ProductBaseMetrics & {
      margin_at_inflation: number | null
      margin_drop_pp: number | null
      risk_level: string
    }
  >
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-slate-400 py-4 text-center">Ürün verisi bulunamadı.</p>
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Ürün</th>
            <th className="px-3 py-2.5 text-right font-semibold text-slate-600">Ort. Fiyat</th>
            <th className="px-3 py-2.5 text-right font-semibold text-slate-600">Ort. Maliyet</th>
            <th className="px-3 py-2.5 text-right font-semibold text-slate-600">Cari Marj</th>
            <th className="px-3 py-2.5 text-right font-semibold text-slate-600">+10% Maliyetle</th>
            <th className="px-3 py-2.5 text-right font-semibold text-slate-600">Düşüş</th>
            <th className="px-3 py-2.5 text-right font-semibold text-slate-600">Aylık Marj</th>
            <th className="px-3 py-2.5 text-center font-semibold text-slate-600">Risk</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(p => {
            const rowBg =
              p.risk_level === 'critical'
                ? 'bg-red-50/50'
                : p.risk_level === 'high'
                ? 'bg-orange-50/30'
                : ''
            return (
              <tr key={p.product_id} className={`hover:bg-slate-50 transition-colors ${rowBg}`}>
                <td className="px-3 py-2 font-medium text-slate-800 max-w-[200px] truncate">
                  {p.product_name}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                  {fmtTry(p.avg_selling_price)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                  {fmtTry(p.avg_unit_cost)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-700">
                  {fmtPct(p.gross_margin_pct)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <span
                    className={
                      (p.margin_at_inflation ?? 0) < 0
                        ? 'text-red-600 font-semibold'
                        : 'text-slate-600'
                    }
                  >
                    {fmtPct(p.margin_at_inflation)}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <span
                    className={
                      (p.margin_drop_pp ?? 0) > 10
                        ? 'text-red-600 font-semibold'
                        : (p.margin_drop_pp ?? 0) > 5
                        ? 'text-amber-600'
                        : 'text-slate-500'
                    }
                  >
                    {p.margin_drop_pp !== null
                      ? `-${PCT_FMT.format(p.margin_drop_pp)} pp`
                      : '—'}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                  {fmtTry(p.gross_margin_try_monthly)}
                </td>
                <td className="px-3 py-2 text-center">
                  <RiskBadge level={p.risk_level} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Scenarios table ───────────────────────────────────────────────────────────

function ScenariosTable({ scenarios }: { scenarios: SensitivityResult[] }) {
  if (scenarios.length === 0) {
    return <p className="text-xs text-slate-400 py-4 text-center">Senaryo verisi bulunamadı.</p>
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Senaryo</th>
            <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Değişim</th>
            <th className="px-3 py-2.5 text-right font-semibold text-slate-600">Yeni Fiyat</th>
            <th className="px-3 py-2.5 text-right font-semibold text-slate-600">Yeni Maliyet</th>
            <th className="px-3 py-2.5 text-right font-semibold text-slate-600">Yeni Marj</th>
            <th className="px-3 py-2.5 text-right font-semibold text-slate-600">Marj Değ.</th>
            <th className="px-3 py-2.5 text-right font-semibold text-slate-600">Aylık Etki</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {scenarios.map((s, i) => (
            <tr key={i} className="hover:bg-slate-50 transition-colors">
              <td className="px-3 py-2 text-slate-600">{s.scenario_name}</td>
              <td className="px-3 py-2 font-medium text-slate-800">{s.delta_label}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                {fmtTry(s.new_selling_price)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                {fmtTry(s.new_unit_cost)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold">
                <span
                  className={
                    (s.new_gross_margin_pct ?? 0) < 0
                      ? 'text-red-600'
                      : (s.new_gross_margin_pct ?? 0) < 10
                      ? 'text-amber-600'
                      : 'text-slate-700'
                  }
                >
                  {fmtPct(s.new_gross_margin_pct)}
                </span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                <span
                  className={
                    (s.margin_change_pp ?? 0) > 0
                      ? 'text-emerald-600 font-semibold'
                      : (s.margin_change_pp ?? 0) < 0
                      ? 'text-red-600 font-semibold'
                      : 'text-slate-500'
                  }
                >
                  {fmtPp(s.margin_change_pp)}
                </span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                <ImpactBadge value={s.monthly_impact_try} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Portfolio impact summary ───────────────────────────────────────────────────

function PortfolioImpactCard({
  label,
  data,
}: {
  label: string
  data: {
    baseline_monthly_margin: number
    new_monthly_margin: number
    total_impact_try: number
    impact_pct: number | null
  }
}) {
  const isNeg = data.total_impact_try < 0

  return (
    <div className={`rounded-xl border p-4 ${isNeg ? 'border-red-200 bg-red-50/40' : 'border-slate-200 bg-white'}`}>
      <p className="text-xs font-semibold text-slate-600 mb-3">{label}</p>
      <div className="grid grid-cols-2 gap-y-2 text-xs">
        <span className="text-slate-500">Mevcut Aylık Marj</span>
        <span className="text-right font-semibold tabular-nums text-slate-700">
          {fmtTry(data.baseline_monthly_margin)}
        </span>
        <span className="text-slate-500">Yeni Aylık Marj</span>
        <span className="text-right font-semibold tabular-nums text-slate-700">
          {fmtTry(data.new_monthly_margin)}
        </span>
        <span className="text-slate-500">Toplam Etki</span>
        <span className="text-right">
          <ImpactBadge value={data.total_impact_try} />
        </span>
        <span className="text-slate-500">Etki %</span>
        <span
          className={`text-right font-semibold tabular-nums ${
            isNeg ? 'text-red-600' : 'text-emerald-600'
          }`}
        >
          {data.impact_pct !== null
            ? `${data.impact_pct > 0 ? '+' : ''}${PCT_FMT.format(data.impact_pct)}%`
            : '—'}
        </span>
      </div>
    </div>
  )
}

// ── Breakeven panel ───────────────────────────────────────────────────────────

function BreakevenPanel({ product }: { product: ProductBaseMetrics }) {
  const TARGET_MARGIN = 20 // 20% target

  const bepPrice = computeBreakevenPrice(product.avg_unit_cost, TARGET_MARGIN)
  const bepCost  = computeBreakevenCost(product.avg_selling_price, TARGET_MARGIN)
  const buffer   = computeMarginSafetyBuffer(product.gross_margin_pct, TARGET_MARGIN)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold text-slate-600 mb-3">
        Başabaş Analizi — {product.product_name}
        <span className="text-slate-400 font-normal ml-1">(Hedef: %{TARGET_MARGIN} marj)</span>
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-slate-400 mb-1">Başabaş Fiyatı</p>
          <p className="font-bold text-slate-800 text-base tabular-nums">
            {bepPrice !== null ? fmtTry(bepPrice) : '—'}
          </p>
          <p className="text-slate-400 mt-1">%{TARGET_MARGIN} marj için min. fiyat</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-slate-400 mb-1">Maks. Müsaade Maliyet</p>
          <p className="font-bold text-slate-800 text-base tabular-nums">
            {fmtTry(bepCost)}
          </p>
          <p className="text-slate-400 mt-1">%{TARGET_MARGIN} marj için maks. maliyet</p>
        </div>
        <div className={`rounded-lg p-3 ${(buffer ?? 0) >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
          <p className="text-slate-400 mb-1">Güvenlik Tamponu</p>
          <p
            className={`font-bold text-base tabular-nums ${
              (buffer ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-600'
            }`}
          >
            {buffer !== null
              ? `${buffer >= 0 ? '+' : ''}${PCT_FMT.format(buffer)} pp`
              : '—'}
          </p>
          <p className="text-slate-400 mt-1">Cari marj − hedef marj</p>
        </div>
      </div>
    </div>
  )
}

// ── Main client ───────────────────────────────────────────────────────────────

export default function ProductMarginSensitivityClient() {
  const { data, isLoading, isError } = useQuery<{ report: ProductMarginSensitivityReport }>({
    queryKey: ['product-margin-sensitivity'],
    queryFn:  () => fetch('/api/commercial/product-margin-sensitivity').then(r => r.json()),
    staleTime: 60 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-slate-400">
        Marj analizi yükleniyor…
      </div>
    )
  }

  if (isError || !data?.report) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-red-400">
        Veri yüklenirken hata oluştu. Lütfen sayfayı yenileyin.
      </div>
    )
  }

  const report = data.report
  const topProduct = report.products[0] ?? null
  const highRiskCount = report.high_risk_product_count
  const totalProducts = report.products.length

  return (
    <div className="space-y-6">
      {/* Narrative banner */}
      <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${
        highRiskCount > 0
          ? 'bg-amber-50 border-amber-200 text-amber-800'
          : 'bg-emerald-50 border-emerald-200 text-emerald-800'
      }`}>
        {report.narrative}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard
          label="Toplam Ürün"
          value={String(totalProducts)}
          sub="Analiz edilen ürün sayısı"
        />
        <KpiCard
          label="Yüksek Risk Ürün"
          value={String(highRiskCount)}
          sub="+10% maliyet artışında"
          accent={highRiskCount > 0 ? 'danger' : 'success'}
        />
        <KpiCard
          label="Portföy Etkisi (+10%)"
          value={fmtTry(report.portfolio_sensitivity_10pct_cost.total_impact_try)}
          sub="Aylık marj değişimi"
          accent={
            report.portfolio_sensitivity_10pct_cost.total_impact_try < 0 ? 'warning' : 'default'
          }
        />
        <KpiCard
          label="Portföy Etkisi (+20%)"
          value={fmtTry(report.portfolio_sensitivity_20pct_cost.total_impact_try)}
          sub="Aylık marj değişimi"
          accent={
            report.portfolio_sensitivity_20pct_cost.total_impact_try < 0 ? 'danger' : 'default'
          }
        />
      </div>

      {/* Risk ranking */}
      <section>
        <SectionHeader
          title="Ürün Risk Sıralaması"
          sub="+10% maliyet artışına göre ürünler sıralandı"
        />
        <RiskRankingTable rows={report.risk_ranking} />
      </section>

      {/* Standard scenarios for top product */}
      {topProduct && (
        <section>
          <SectionHeader
            title={`Duyarlılık Senaryoları — ${topProduct.product_name}`}
            sub="8 standart senaryo: fiyat, maliyet ve kombine değişimler"
          />
          <ScenariosTable scenarios={report.standard_scenarios} />
        </section>
      )}

      {/* Portfolio sensitivity */}
      <section>
        <SectionHeader
          title="Portföy Duyarlılığı"
          sub="Tüm ürünlere aynı maliyet artışı uygulandığında toplam etki"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <PortfolioImpactCard
            label="+10% Maliyet Artışı"
            data={report.portfolio_sensitivity_10pct_cost}
          />
          <PortfolioImpactCard
            label="+20% Maliyet Artışı"
            data={report.portfolio_sensitivity_20pct_cost}
          />
        </div>
      </section>

      {/* Breakeven for top product */}
      {topProduct && (
        <section>
          <SectionHeader
            title="Başabaş Analizi"
            sub="En yüksek marjlı ürün için fiyat ve maliyet limitleri"
          />
          <BreakevenPanel product={topProduct} />
        </section>
      )}
    </div>
  )
}

'use client'

// ─────────────────────────────────────────────────────────────────────────────
// GrossMarginBridgeClient
//
// Gross Margin Bridge Decomposition visualization.
//
// Features:
//   - 4 KPI cells: current GP, prior GP, margin %, margin improvement pp
//   - Bridge waterfall visualization (horizontal bars)
//     Start: prior GP → volume → price → cost → mix → current GP
//   - Dominant driver badge + margin dynamics classification
//   - Product contributions table (top 5 by absolute contribution)
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }       from '@tanstack/react-query'
import { fmtTRY }         from '@/lib/format'
import type {
  GrossMarginBridgeReport,
  GrossMarginBridgeComponent,
} from '@/lib/services/finance/gross-margin-bridge.service'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function barColor(isFavorable: boolean): string {
  return isFavorable ? 'bg-[#16a34a]' : 'bg-[#dc2626]'
}

function amtColor(amount: number): string {
  if (amount > 0) return 'text-[#16a34a]'
  if (amount < 0) return 'text-[#dc2626]'
  return 'text-[#64748b]'
}

function fmtPp(pp: number): string {
  const sign = pp >= 0 ? '+' : ''
  return `${sign}${pp.toFixed(1)} pp`
}

const MARGIN_DYNAMICS_LABELS: Record<string, string> = {
  margin_expansion: 'Marj Genişlemesi',
  volume_driven:    'Hacim Odaklı',
  cost_compression: 'Maliyet Baskısı',
  price_pressure:   'Fiyat Baskısı',
  mixed:            'Karışık Sinyal',
  neutral:          'Nötr',
}

const MARGIN_HEALTH_LABELS: Record<string, string> = {
  premium:  'Prim Marj',
  strong:   'Güçlü Marj',
  adequate: 'Yeterli Marj',
  thin:     'Zayıf Marj',
  critical: 'Kritik Marj',
}

const MARGIN_HEALTH_COLORS: Record<string, string> = {
  premium:  'bg-[#dcfce7] text-[#16a34a] border-[#86efac]',
  strong:   'bg-[#dbeafe] text-[#2563eb] border-[#93c5fd]',
  adequate: 'bg-[#fefce8] text-[#ca8a04] border-[#fde68a]',
  thin:     'bg-[#fff7ed] text-[#ea580c] border-[#fed7aa]',
  critical: 'bg-[#fef2f2] text-[#dc2626] border-[#fca5a5]',
}

const DYNAMICS_COLORS: Record<string, string> = {
  margin_expansion: 'bg-[#dcfce7] text-[#16a34a] border-[#86efac]',
  volume_driven:    'bg-[#dbeafe] text-[#2563eb] border-[#93c5fd]',
  cost_compression: 'bg-[#fff7ed] text-[#ea580c] border-[#fed7aa]',
  price_pressure:   'bg-[#fef2f2] text-[#dc2626] border-[#fca5a5]',
  mixed:            'bg-[#f1f5f9] text-[#64748b] border-[#e2e8f0]',
  neutral:          'bg-[#f1f5f9] text-[#64748b] border-[#e2e8f0]',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCell({
  label,
  value,
  sub,
  highlight,
}: {
  label: string
  value: string
  sub?: string
  highlight?: 'positive' | 'negative' | 'neutral'
}) {
  const valueColor =
    highlight === 'positive' ? 'text-[#16a34a]' :
    highlight === 'negative' ? 'text-[#dc2626]' :
    'text-[#0f172a]'

  return (
    <div className="bg-white border border-[#e2e8f0] rounded p-3 flex flex-col gap-0.5 min-w-0">
      <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] truncate">
        {label}
      </div>
      <div className={`text-base font-black tabular-nums leading-tight ${valueColor}`}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-[#94a3b8]">{sub}</div>
      )}
    </div>
  )
}

function WaterfallBar({
  component,
  maxAbsEffect,
}: {
  component: GrossMarginBridgeComponent
  maxAbsEffect: number
}) {
  if (component.component_key === 'total') return null

  const barPct = maxAbsEffect > 0
    ? Math.max(3, Math.round((Math.abs(component.amount_try) / maxAbsEffect) * 80))
    : 3

  return (
    <div className="flex items-center gap-3">
      <div className="w-28 text-[11px] font-semibold text-[#334155] shrink-0 text-right">
        {component.name}
      </div>
      <div className="flex-1 flex items-center gap-2">
        <div className="flex-1 h-6 bg-[#f1f5f9] rounded overflow-hidden relative">
          {/* Center divider */}
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#cbd5e1]" />
          {/* Effect bar */}
          <div
            className={`absolute top-1 bottom-1 rounded-sm transition-all ${barColor(component.is_favorable)}`}
            style={
              !component.is_favorable
                ? { right: '50%', width: `${barPct / 2}%` }
                : { left: '50%', width: `${barPct / 2}%` }
            }
          />
        </div>
        <div className={`text-[11px] font-black tabular-nums w-28 text-right ${amtColor(component.amount_try)}`}>
          {component.amount_try >= 0 ? '+' : '−'}{fmtTRY(Math.abs(component.amount_try))}
        </div>
        <div className={`text-[10px] font-semibold w-20 text-right tabular-nums ${amtColor(component.amount_try)}`}>
          {component.pct_of_prior_gp >= 0 ? '+' : ''}{component.pct_of_prior_gp.toFixed(1)}% GP
        </div>
      </div>
    </div>
  )
}

function Badge({ label, colorClass }: { label: string; colorClass: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wide ${colorClass}`}>
      {label}
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GrossMarginBridgeClient({ companyId }: Props) {
  const { data, isLoading, isError } = useQuery<{ report: GrossMarginBridgeReport }>({
    queryKey: ['gross-margin-bridge', companyId],
    queryFn: async () => {
      const res = await fetch('/api/finance/gross-margin-bridge')
      if (!res.ok) throw new Error('Brüt marj köprüsü verileri yüklenemedi')
      return res.json()
    },
    staleTime: 3_600_000,
  })

  const report = data?.report

  // Waterfall scale
  const drivers = report?.bridge_components.filter(c => c.component_key !== 'total') ?? []
  const maxAbsEffect = drivers.length > 0
    ? Math.max(...drivers.map(c => Math.abs(c.amount_try)), 1)
    : 1

  const totalChange = report
    ? report.current_gross_profit_try - report.prior_gross_profit_try
    : 0

  const marginImpPp = report?.margin_improvement_pp ?? 0

  return (
    <div>
      <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">
        Brüt Kâr Köprüsü — Hacim / Fiyat / Maliyet / Karışım
      </div>

      <div className="bg-white border border-[#e2e8f0] rounded shadow-sm overflow-hidden">

        {/* ── Loading ──────────────────────────────────────────────────────────── */}
        {isLoading && (
          <div className="px-4 py-8 text-center text-xs text-[#94a3b8]">
            Köprü analizi hesaplanıyor…
          </div>
        )}

        {/* ── Error ────────────────────────────────────────────────────────────── */}
        {isError && (
          <div className="px-4 py-6 text-center text-xs text-[#dc2626]">
            Veriler yüklenemedi — lütfen sayfayı yenileyin.
          </div>
        )}

        {report && !isLoading && (
          <>
            {/* ── KPI strip ────────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 border-b border-[#f1f5f9]">
              <KpiCell
                label="Cari Brüt Kâr"
                value={fmtTRY(report.current_gross_profit_try)}
                sub={`${report.period_current}`}
                highlight={report.current_gross_profit_try >= report.prior_gross_profit_try ? 'positive' : 'negative'}
              />
              <KpiCell
                label="Önceki Brüt Kâr"
                value={fmtTRY(report.prior_gross_profit_try)}
                sub={`${report.period_prior}`}
              />
              <KpiCell
                label="Cari Brüt Marj"
                value={`%${report.current_gross_margin_pct.toFixed(1)}`}
                sub={MARGIN_HEALTH_LABELS[report.margin_health]}
                highlight={report.current_gross_margin_pct >= report.prior_gross_margin_pct ? 'positive' : 'negative'}
              />
              <KpiCell
                label="Marj Değişimi"
                value={fmtPp(marginImpPp)}
                sub={`Önceki: %${report.prior_gross_margin_pct.toFixed(1)}`}
                highlight={marginImpPp > 0 ? 'positive' : marginImpPp < 0 ? 'negative' : 'neutral'}
              />
            </div>

            {/* ── Badges row ───────────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-[#f1f5f9] bg-[#f8fafc]">
              <Badge
                label={MARGIN_HEALTH_LABELS[report.margin_health]}
                colorClass={MARGIN_HEALTH_COLORS[report.margin_health]}
              />
              <Badge
                label={MARGIN_DYNAMICS_LABELS[report.margin_dynamics]}
                colorClass={DYNAMICS_COLORS[report.margin_dynamics]}
              />
              {report.dominant_driver && (
                <span className="text-[10px] text-[#64748b] font-semibold">
                  Ana etken: <span className="font-black text-[#0f172a]">{report.dominant_driver.name}</span>
                </span>
              )}
            </div>

            {/* ── Total change summary ─────────────────────────────────────────── */}
            <div className={`px-4 py-2 border-b border-[#f1f5f9] flex items-center gap-3 ${
              totalChange >= 0 ? 'bg-[#f0fdf4]' : 'bg-[#fef2f2]'
            }`}>
              <span className="text-[11px] font-semibold text-[#64748b] shrink-0">
                Brüt Kâr Değişimi ({report.period_prior} → {report.period_current})
              </span>
              <span className={`text-sm font-black tabular-nums ${totalChange >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                {totalChange >= 0 ? '+' : '−'}{fmtTRY(Math.abs(totalChange))}
              </span>
            </div>

            {/* ── Waterfall bridge ─────────────────────────────────────────────── */}
            <div className="px-4 py-4 space-y-3">
              {/* Anchor row: Prior GP */}
              <div className="flex items-center gap-3">
                <div className="w-28 text-[11px] font-black text-[#334155] shrink-0 text-right">
                  Önceki GP
                </div>
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1" />
                  <div className="text-[11px] font-black tabular-nums text-[#334155] w-28 text-right">
                    {fmtTRY(report.prior_gross_profit_try)}
                  </div>
                  <div className="w-20" />
                </div>
              </div>

              {/* Bridge bars */}
              {report.bridge_components.map(component => (
                <WaterfallBar
                  key={component.component_key}
                  component={component}
                  maxAbsEffect={maxAbsEffect}
                />
              ))}

              {/* Anchor row: Current GP */}
              <div className="flex items-center gap-3 border-t border-[#e2e8f0] pt-2 mt-1">
                <div className="w-28 text-[11px] font-black text-[#0f172a] shrink-0 text-right">
                  Cari GP
                </div>
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1" />
                  <div className={`text-[11px] font-black tabular-nums w-28 text-right ${
                    report.current_gross_profit_try >= report.prior_gross_profit_try
                      ? 'text-[#16a34a]'
                      : 'text-[#dc2626]'
                  }`}>
                    {fmtTRY(report.current_gross_profit_try)}
                  </div>
                  <div className="w-20" />
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center justify-center gap-4 text-[9px] text-[#94a3b8] pt-1">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-[#dc2626] inline-block" />
                  Olumsuz etki
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-[#16a34a] inline-block" />
                  Olumlu etki
                </span>
              </div>
            </div>

            {/* ── Product contributions table ───────────────────────────────────── */}
            {report.product_contributions.length > 0 && (
              <div className="border-t border-[#f1f5f9]">
                <div className="px-4 py-2 bg-[#f8fafc]">
                  <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">
                    Ürün Katkı Analizi (İlk 5)
                  </div>
                </div>
                <div className="divide-y divide-[#f1f5f9]">
                  {report.product_contributions
                    .sort((a, b) => Math.abs(b.gp_change_try) - Math.abs(a.gp_change_try))
                    .slice(0, 5)
                    .map(p => (
                      <div
                        key={p.product_id}
                        className="px-4 py-2 flex items-center gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-semibold text-[#334155] truncate flex items-center gap-1.5">
                            {p.product_name}
                            {p.is_top_contributor && (
                              <span className="text-[9px] font-black uppercase tracking-wide bg-[#dbeafe] text-[#2563eb] border border-[#93c5fd] px-1.5 py-0.5 rounded-full">
                                Ana Katkı
                              </span>
                            )}
                          </div>
                        </div>
                        <div className={`text-[11px] font-black tabular-nums w-28 text-right shrink-0 ${amtColor(p.gp_change_try)}`}>
                          {p.gp_change_try >= 0 ? '+' : '−'}{fmtTRY(Math.abs(p.gp_change_try))}
                        </div>
                        <div className={`text-[10px] font-semibold w-16 text-right shrink-0 tabular-nums ${amtColor(p.gp_change_try)}`}>
                          {p.gp_change_pct_of_total >= 0 ? '+' : ''}{p.gp_change_pct_of_total.toFixed(1)}%
                        </div>
                        <div className={`text-[10px] w-16 text-right shrink-0 tabular-nums font-semibold ${amtColor(p.margin_pct_change_pp)}`}>
                          {fmtPp(p.margin_pct_change_pp)}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* ── Dominant driver callout ──────────────────────────────────────── */}
            {report.dominant_driver && (
              <div className="px-4 py-3 border-t border-[#f1f5f9] bg-blue-50/30 flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0 mt-1" />
                <p className="text-[11px] text-[#334155] leading-snug">
                  <span className="font-black">{report.dominant_driver.name}</span>{' '}
                  bu dönemde brüt kâr değişiminin en belirleyici faktörüydü.{' '}
                  {report.dominant_driver.description}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

'use client'

// ─────────────────────────────────────────────────────────────────────────────
// MarginBridgeClient
//
// Gross Margin Bridge (Price / Volume / Mix) visualization.
//
// Features:
//   - Period pair selector: current + prior month dropdowns (last 6 months)
//   - Bridge waterfall visualization (pure CSS, no chart libraries)
//   - Summary row: Prior GP → [±price] → [±volume] → [±mix] → Current GP
//   - Dominant driver callout
//   - Narrative sentence
//   - Margin comparison: prior % vs current %
// ─────────────────────────────────────────────────────────────────────────────

import { useState }       from 'react'
import { useQuery }       from '@tanstack/react-query'
import { fmtTRY, fmtPct } from '@/lib/format'
import type {
  MarginBridgeReport,
  BridgeComponent,
}                         from '@/lib/services/finance/margin-bridge.service'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES: Record<string, string> = {
  '01': 'Ocak',    '02': 'Şubat',   '03': 'Mart',
  '04': 'Nisan',   '05': 'Mayıs',   '06': 'Haziran',
  '07': 'Temmuz',  '08': 'Ağustos', '09': 'Eylül',
  '10': 'Ekim',    '11': 'Kasım',   '12': 'Aralık',
}

function periodLabel(key: string): string {
  const [year, month] = key.split('-')
  return `${MONTH_NAMES[month] ?? month} ${year}`
}

function getLastNMonths(n: number): string[] {
  const result: string[] = []
  const now = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return result
}

function priorOfKey(key: string): string {
  const [y, m] = key.split('-').map(Number)
  if (m === 1) return `${y - 1}-12`
  return `${y}-${String(m - 1).padStart(2, '0')}`
}

function directionArrow(direction: BridgeComponent['direction']): string {
  if (direction === 'favorable')   return '▲'
  if (direction === 'unfavorable') return '▼'
  return '—'
}

function directionColor(direction: BridgeComponent['direction']): string {
  if (direction === 'favorable')   return 'text-[#16a34a]'
  if (direction === 'unfavorable') return 'text-[#dc2626]'
  return 'text-[#64748b]'
}

function barBg(direction: BridgeComponent['direction']): string {
  if (direction === 'favorable')   return 'bg-[#16a34a]'
  if (direction === 'unfavorable') return 'bg-[#dc2626]'
  return 'bg-[#94a3b8]'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function WaterfallBar({
  component,
  maxAbsEffect,
}: {
  component: BridgeComponent
  maxAbsEffect: number
}) {
  const barPct = maxAbsEffect > 0
    ? Math.max(4, Math.round((Math.abs(component.amount_try) / maxAbsEffect) * 100))
    : 4

  return (
    <div className="flex items-center gap-3">
      <div className="w-28 text-[11px] font-semibold text-[#334155] shrink-0 text-right">
        {component.label}
      </div>
      <div className="flex-1 flex items-center gap-2">
        <div className="flex-1 h-6 bg-[#f1f5f9] rounded overflow-hidden relative">
          {/* Center line */}
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#e2e8f0]" />
          {/* Effect bar — right of center if favorable, left if unfavorable */}
          <div
            className={`absolute top-1 bottom-1 rounded-sm transition-all ${barBg(component.direction)}`}
            style={
              component.direction === 'unfavorable'
                ? { right: '50%', width: `${barPct / 2}%` }
                : component.direction === 'favorable'
                ? { left: '50%', width: `${barPct / 2}%` }
                : { left: '50%', width: '1%' }
            }
          />
        </div>
        <div className={`text-[11px] font-black tabular-nums w-24 text-right ${directionColor(component.direction)}`}>
          {component.amount_try >= 0 ? '+' : '−'}{fmtTRY(Math.abs(component.amount_try))}
        </div>
        <div className={`text-[10px] font-bold w-6 text-center ${directionColor(component.direction)}`}>
          {directionArrow(component.direction)}
        </div>
        <div className="text-[10px] text-[#94a3b8] w-16 text-right tabular-nums">
          {Math.abs(component.pct_of_revenue).toFixed(1)}% ciro
        </div>
      </div>
    </div>
  )
}

function DominantDriverBadge({ driver }: { driver: MarginBridgeReport['dominant_driver'] }) {
  const cfg: Record<MarginBridgeReport['dominant_driver'], { label: string; color: string }> = {
    price:    { label: 'Fiyat Odaklı',   color: 'bg-blue-50 border-blue-200 text-blue-700' },
    volume:   { label: 'Hacim Odaklı',   color: 'bg-[#fefce8] border-yellow-200 text-yellow-700' },
    mix:      { label: 'Karışım Odaklı', color: 'bg-purple-50 border-purple-200 text-purple-700' },
    balanced: { label: 'Dengeli Etki',   color: 'bg-[#f1f5f9] border-[#e8eaef] text-[#64748b]' },
  }
  const { label, color } = cfg[driver]
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wide ${color}`}>
      {label}
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MarginBridgeClient({ companyId }: Props) {
  const months = getLastNMonths(7)  // 7 so we can always show a valid prior for the oldest current
  const currentOptions = months.slice(0, 6)  // last 6 months selectable as "current"

  const [currentPeriod, setCurrentPeriod] = useState<string>(currentOptions[0])
  const [priorPeriod,   setPriorPeriod]   = useState<string>(priorOfKey(currentOptions[0]))

  const { data, isLoading, isError } = useQuery<{ report: MarginBridgeReport }>({
    queryKey: ['margin-bridge', companyId, currentPeriod, priorPeriod],
    queryFn: async () => {
      const params = new URLSearchParams({ current: currentPeriod, prior: priorPeriod })
      const res    = await fetch(`/api/finance/margin-bridge?${params}`)
      if (!res.ok) throw new Error('Bridge verileri yüklenemedi')
      return res.json()
    },
    staleTime: 3_600_000,
  })

  const report = data?.report

  // Waterfall scale: max absolute effect across all three
  const maxAbsEffect = report
    ? Math.max(
        Math.abs(report.bridge.price_effect.amount_try),
        Math.abs(report.bridge.volume_effect.amount_try),
        Math.abs(report.bridge.mix_effect.amount_try),
        1,
      )
    : 1

  const gpChange    = report?.gross_profit_change_try ?? 0
  const gpChangePct = report?.gross_profit_change_pct ?? null

  return (
    <div>
      <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">
        Brüt Kâr Köprüsü — Fiyat / Hacim / Karışım
      </div>

      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft shadow-sm overflow-hidden">

        {/* ── Header: period selectors ─────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[#f1f5f9] bg-[#f8fafc]">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-semibold text-[#64748b] shrink-0">Cari Dönem</label>
              <select
                value={currentPeriod}
                onChange={e => {
                  const next = e.target.value
                  setCurrentPeriod(next)
                  setPriorPeriod(priorOfKey(next))
                }}
                className="text-xs font-semibold text-[#0f172a] border border-[#e8eaef] rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-brand-light"
              >
                {currentOptions.map(k => (
                  <option key={k} value={k}>{periodLabel(k)}</option>
                ))}
              </select>
            </div>
            <span className="text-[10px] text-[#94a3b8]">vs</span>
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-semibold text-[#64748b] shrink-0">Kıyas Dönemi</label>
              <select
                value={priorPeriod}
                onChange={e => setPriorPeriod(e.target.value)}
                className="text-xs font-semibold text-[#0f172a] border border-[#e8eaef] rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-brand-light"
              >
                {months.slice(1).map(k => (
                  <option key={k} value={k}>{periodLabel(k)}</option>
                ))}
              </select>
            </div>
          </div>

          {report && (
            <DominantDriverBadge driver={report.dominant_driver} />
          )}
        </div>

        {/* ── Loading / Error states ───────────────────────────────────────── */}
        {isLoading && (
          <div className="px-4 py-8 text-center text-xs text-[#94a3b8]">
            Köprü hesaplanıyor…
          </div>
        )}

        {isError && (
          <div className="px-4 py-6 text-center text-xs text-[#dc2626]">
            Veriler yüklenemedi — lütfen tekrar deneyin.
          </div>
        )}

        {report && !isLoading && (
          <>
            {/* ── GP Change summary bar ────────────────────────────────────── */}
            <div className={`px-4 py-2.5 border-b border-[#f1f5f9] flex items-center gap-3 ${
              gpChange >= 0 ? 'bg-[#f0fdf4]' : 'bg-[#fef2f2]'
            }`}>
              <span className="text-[11px] font-semibold text-[#64748b] shrink-0">Toplam GP Değişimi</span>
              <span className={`text-sm font-black tabular-nums ${gpChange >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                {gpChange >= 0 ? '+' : '−'}{fmtTRY(Math.abs(gpChange))}
              </span>
              {gpChangePct !== null && (
                <span className={`text-[11px] font-semibold tabular-nums ${gpChange >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                  ({gpChangePct >= 0 ? '+' : ''}{gpChangePct.toFixed(1)}%)
                </span>
              )}
            </div>

            {/* ── Waterfall bridge ─────────────────────────────────────────── */}
            <div className="px-4 py-4 space-y-3">

              {/* Summary: Prior GP → effects → Current GP */}
              <div className="flex items-center gap-2 text-[10px] font-black flex-wrap">
                <span className="bg-[#f1f5f9] px-2 py-1 rounded text-[#334155]">
                  {report.prior_period_label} GP: {fmtTRY(report.prior_gross_profit_try)}
                </span>
                {[
                  { label: 'Fiyat', amount: report.bridge.price_effect.amount_try },
                  { label: 'Hacim', amount: report.bridge.volume_effect.amount_try },
                  { label: 'Karışım', amount: report.bridge.mix_effect.amount_try },
                ].map(({ label, amount }) => (
                  <span
                    key={label}
                    className={`px-2 py-1 rounded font-black tabular-nums ${
                      amount >= 0
                        ? 'bg-[#dcfce7] text-[#16a34a]'
                        : 'bg-[#fee2e2] text-[#dc2626]'
                    }`}
                  >
                    {amount >= 0 ? '+' : '−'}{fmtTRY(Math.abs(amount))} ({label})
                  </span>
                ))}
                <span className="text-[#94a3b8]">→</span>
                <span className={`px-2 py-1 rounded font-black tabular-nums ${
                  report.current_gross_profit_try >= report.prior_gross_profit_try
                    ? 'bg-[#dcfce7] text-[#16a34a]'
                    : 'bg-[#fee2e2] text-[#dc2626]'
                }`}>
                  {report.current_period_label} GP: {fmtTRY(report.current_gross_profit_try)}
                </span>
              </div>

              {/* Visual waterfall bars */}
              <div className="space-y-2.5 pt-1">
                <WaterfallBar
                  component={report.bridge.price_effect}
                  maxAbsEffect={maxAbsEffect}
                />
                <WaterfallBar
                  component={report.bridge.volume_effect}
                  maxAbsEffect={maxAbsEffect}
                />
                <WaterfallBar
                  component={report.bridge.mix_effect}
                  maxAbsEffect={maxAbsEffect}
                />
              </div>

              {/* Axis legend */}
              <div className="flex items-center justify-center gap-4 text-[9px] text-[#94a3b8] pt-1">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-[#dc2626] inline-block" />
                  Olumsuz etki
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-[#16a34a] inline-block" />
                  Olumlu etki
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-[#94a3b8] inline-block" />
                  Nötr (&lt;1% ciro)
                </span>
              </div>
            </div>

            {/* ── Margin comparison ────────────────────────────────────────── */}
            <div className="px-4 py-3 border-t border-[#f1f5f9] bg-[#f8fafc] grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">
                  {report.prior_period_label} Brüt Marj
                </div>
                <div className="text-lg font-black tabular-nums text-[#334155]">
                  {fmtPct(report.prior_gross_margin_pct)}
                </div>
                <div className="text-[10px] text-[#94a3b8]">
                  Ciro: {fmtTRY(report.prior_revenue_try)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">
                  {report.current_period_label} Brüt Marj
                </div>
                <div className={`text-lg font-black tabular-nums ${
                  report.current_gross_margin_pct >= report.prior_gross_margin_pct
                    ? 'text-[#16a34a]'
                    : 'text-[#dc2626]'
                }`}>
                  {fmtPct(report.current_gross_margin_pct)}
                  <span className="text-sm ml-1">
                    {report.current_gross_margin_pct >= report.prior_gross_margin_pct ? '▲' : '▼'}
                  </span>
                </div>
                <div className="text-[10px] text-[#94a3b8]">
                  Ciro: {fmtTRY(report.current_revenue_try)}
                </div>
              </div>
            </div>

            {/* ── Dominant driver callout ──────────────────────────────────── */}
            <div className="px-4 py-3 border-t border-[#f1f5f9] flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-light shrink-0 mt-1" />
              <div>
                <span className="text-[10px] font-black text-[#334155] mr-1.5">
                  Dönemsel fark ağırlıklı olarak{' '}
                  {{
                    price:    'fiyat',
                    volume:   'hacim',
                    mix:      'karışım',
                    balanced: 'dengeli',
                  }[report.dominant_driver]}{' '}
                  kaynaklı.
                </span>
              </div>
            </div>

            {/* ── Narrative ────────────────────────────────────────────────── */}
            <div className="px-4 py-3 border-t border-[#f1f5f9] bg-blue-50/30">
              <p className="text-[11px] text-[#334155] leading-snug">
                <span className="text-[#94a3b8] mr-1.5">—</span>
                {report.narrative}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

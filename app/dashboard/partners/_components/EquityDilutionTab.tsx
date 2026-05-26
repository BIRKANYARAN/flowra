'use client'

// ── EquityDilutionTab — Sermaye Seyreltme simülasyon sekmesi ──────────────────
//
// Displays:
//   • Current partner equity table (partner, share%, paid capital, gap)
//   • Total equity + gap summary
//   • 3 scenario cards side by side (gap_filled, small_raise, large_raise)
//   • Partner buyout scenario as a separate section
//   • "Bu simülasyon bilgi amaçlıdır" disclaimer

import { useState, useEffect } from 'react'
import {
  Panel, PanelHeader, KpiStrip, KpiCell, EmptySlate, Skeleton,
  DataTable, DataTh, DataTd, NarrativeFooter,
} from '@/components/ds'
import { fmtTRY } from '@/lib/format'
import type { EquityDilutionReport, DilutionScenario } from '@/lib/services/pcle/equity-dilution.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

function pctFmt(r: number) {
  return `%${(r * 100).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`
}

function signedPctFmt(v: number) {
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ScenarioCard({ scenario }: { scenario: DilutionScenario }) {
  const hasNewPartner = !!scenario.new_partner_name

  return (
    <div className="border border-[#e2e8f0] rounded-lg p-4 flex flex-col gap-3 bg-[#f8fafc]">
      <div>
        <div className="text-xs font-bold text-[#0f172a] leading-tight">{scenario.scenario_name}</div>
        {scenario.new_capital_try > 0 && (
          <div className="text-xs text-[#64748b] mt-0.5">
            {hasNewPartner
              ? `Yeni ortak: ${scenario.new_partner_name} (%${((scenario.new_partner_share_ratio ?? 0) * 100).toFixed(0)})`
              : `Sermaye artışı: ${fmtTRY(scenario.new_capital_try)}`}
          </div>
        )}
      </div>

      {/* Partner rows */}
      <div className="flex flex-col gap-1">
        {scenario.partners_after.map((p) => (
          <div key={p.partner_name} className="flex items-center justify-between text-xs gap-2">
            <span className="text-[#334155] font-medium truncate max-w-[100px]" title={p.partner_name}>
              {p.partner_name}
            </span>
            <span className="text-[#94a3b8]">{pctFmt(p.share_ratio_before)}</span>
            <span className="text-[#64748b]">→</span>
            <span className={p.share_ratio_after < p.share_ratio_before ? 'text-neg-text font-semibold' : 'text-pos-text font-semibold'}>
              {pctFmt(p.share_ratio_after)}
            </span>
            <span className={`text-[0.65rem] ${p.dilution_pct < 0 ? 'text-neg-text' : p.dilution_pct > 0 ? 'text-pos-text' : 'text-[#94a3b8]'}`}>
              ({signedPctFmt(p.dilution_pct)})
            </span>
          </div>
        ))}
        {hasNewPartner && scenario.new_partner_name && (
          <div className="flex items-center justify-between text-xs gap-2 border-t border-[#e2e8f0] pt-1 mt-1">
            <span className="text-[#334155] font-medium truncate max-w-[100px]">{scenario.new_partner_name}</span>
            <span className="text-[#94a3b8]">%0,0</span>
            <span className="text-[#64748b]">→</span>
            <span className="text-pos-text font-semibold">{pctFmt(scenario.new_partner_share_ratio ?? 0)}</span>
            <span className="text-[0.65rem] text-pos-text">(+yeni)</span>
          </div>
        )}
      </div>

      {/* Equity totals */}
      <div className="text-[0.65rem] text-[#64748b] border-t border-[#e2e8f0] pt-2">
        <div className="flex justify-between">
          <span>Önceki özkaynak</span>
          <span className="font-medium text-[#334155]">{fmtTRY(scenario.total_equity_before)}</span>
        </div>
        <div className="flex justify-between">
          <span>Sonraki özkaynak</span>
          <span className="font-medium text-[#334155]">{fmtTRY(scenario.total_equity_after)}</span>
        </div>
      </div>

      {/* Description */}
      <div className="text-[0.65rem] text-[#64748b] italic leading-relaxed">
        {scenario.dilution_description}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function EquityDilutionTab() {
  const [report,  setReport]  = useState<EquityDilutionReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/partners/equity-dilution')
        if (!res.ok) {
          const j = await res.json().catch(() => ({})) as { error?: string }
          throw new Error(j.error ?? `HTTP ${res.status}`)
        }
        const json = await res.json() as { report: EquityDilutionReport }
        if (!cancelled) setReport(json.report)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Veri yüklenemedi')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-neg-light border border-neg-light rounded px-4 py-3 text-xs text-neg-text font-medium">
        {error}
      </div>
    )
  }

  if (!report) return null

  const { current_partners, current_total_equity_try, equity_gap_total_try, scenarios } = report

  return (
    <div className="flex flex-col gap-6">

      {/* ── Disclaimer ─────────────────────────────────────────────────────── */}
      <div className="bg-[#fffbeb] border border-[#fde68a] rounded px-4 py-2 text-xs text-[#92400e] flex items-start gap-2">
        <span className="font-bold mt-0.5 flex-shrink-0">!</span>
        <span>
          <strong>Bu simülasyon bilgi amaçlıdır.</strong>{' '}
          Gösterilen değerler varsayımsal senaryo analizleri olup gerçek hukuki veya finansal tavsiye niteliği taşımaz.
          Kesin kararlar için lisanslı bir finansal danışmana başvurunuz.
        </span>
      </div>

      {/* ── KPI strip ──────────────────────────────────────────────────────── */}
      <KpiStrip>
        <KpiCell
          label="Güncel Özkaynak"
          value={fmtTRY(current_total_equity_try)}
          sub="Balance Sheet'ten"
        />
        <KpiCell
          label="Toplam Taahhüt Açığı"
          value={fmtTRY(equity_gap_total_try)}
          sub={equity_gap_total_try > 0 ? 'Ödenmemiş taahhütler' : 'Açık yok'}
          tone={equity_gap_total_try > 0 ? 'warn' : 'neutral'}
        />
        <KpiCell
          label="Ortak Sayısı"
          value={String(current_partners.length)}
          sub="Aktif ortaklar"
        />
      </KpiStrip>

      {/* ── Current partner equity table ───────────────────────────────────── */}
      <Panel>
        <PanelHeader label="Güncel Ortak Özkaynak Durumu" />
        {current_partners.length === 0 ? (
          <EmptySlate title="Aktif ortak bulunamadı." />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <DataTh>Ortak</DataTh>
                <DataTh align="right">Pay Oranı</DataTh>
                <DataTh align="right">Ödenen Sermaye</DataTh>
                <DataTh align="right">Taahhüt Edilen</DataTh>
                <DataTh align="right">Açık</DataTh>
              </tr>
            </thead>
            <tbody>
              {current_partners.map(p => (
                <tr key={p.partner_id} className="hover:bg-[#f8fafc]">
                  <DataTd className="font-medium">{p.partner_name}</DataTd>
                  <DataTd align="right">{pctFmt(p.share_ratio)}</DataTd>
                  <DataTd align="right">{fmtTRY(p.paid_capital_try)}</DataTd>
                  <DataTd align="right">{fmtTRY(p.committed_capital_try)}</DataTd>
                  <DataTd align="right">
                    <span className={p.equity_gap_try > 0 ? 'text-neg-text font-semibold' : 'text-[#94a3b8]'}>
                      {p.equity_gap_try > 0 ? fmtTRY(p.equity_gap_try) : '—'}
                    </span>
                  </DataTd>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Panel>

      {/* ── Scenario cards ─────────────────────────────────────────────────── */}
      <Panel>
        <PanelHeader
          label="Seyreltme Senaryoları"
          sub="Varsayımsal sermaye artışı durumlarında ortak pay oranlarının değişimi"
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
          <ScenarioCard scenario={scenarios.gap_filled} />
          <ScenarioCard scenario={scenarios.small_raise} />
          <ScenarioCard scenario={scenarios.large_raise} />
        </div>
      </Panel>

      {/* ── Buyout scenario ────────────────────────────────────────────────── */}
      <Panel>
        <PanelHeader
          label="Ortak Hisse Alım Senaryosu"
          sub="En küçük paylı ortağın payının diğer ortaklarca devralınması durumu"
        />
        <div className="p-4 max-w-sm">
          <ScenarioCard scenario={scenarios.partner_buyout} />
        </div>
        {current_partners.length <= 1 && (
          <p className="px-4 pb-4 text-xs text-[#94a3b8]">Hisse alım senaryosu için en az 2 ortak gereklidir.</p>
        )}
      </Panel>

      <NarrativeFooter
        narrative="Pay oranları ve özkaynak değerleri anlık balance sheet hesaplamasına dayanır. Seyreltme oranları, yeni ortağın belirlenen pay yüzdesi aldığı ve mevcut ortakların orantılı olarak seyreltildiği varsayımına göre hesaplanmıştır."
        links={[]}
      />
    </div>
  )
}

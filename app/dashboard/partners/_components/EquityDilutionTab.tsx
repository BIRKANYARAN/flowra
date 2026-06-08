'use client'

// ─────────────────────────────────────────────────────────────────────────────
// EquityDilutionTab — Partner Equity Dilution & Capital Structure Tracker
//
// Displays:
//   • Capital structure overview: Total Committed / Total Paid / Gap / Funding %
//   • Progress bar: paid as % of committed (green ≥80%, yellow 50-79%, red <50%)
//   • Partner equity table with Effective%, FD%, Contractual%, Drift
//   • Ownership drift warning when |drift| > 2%
//   • Capital call simulator — 3 scenario cards (25% / 50% / 100%)
//   • Per-partner before/after table per scenario
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import {
  Panel, PanelHeader, KpiStrip, KpiCell, EmptySlate, Skeleton,
  DataTable, DataTh, DataTd, NarrativeFooter,
} from '@/components/ds'
import { fmtTRY, fmtPct } from '@/lib/format'
import type { CapitalStructureReport, CapitalCallScenario, PartnerEquityPosition } from '@/lib/services/pcle/equity-dilution.service'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApiResponse {
  report: CapitalStructureReport
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchReport(): Promise<CapitalStructureReport> {
  const res  = await fetch('/api/partners/equity-dilution')
  const data = await res.json()
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  return (data as ApiResponse).report
}

function pctFmt(v: number) {
  return fmtPct(v, 1)
}

function driftColor(drift: number): string {
  if (Math.abs(drift) > 2) return 'text-neg-text font-semibold'
  if (Math.abs(drift) > 0.5) return 'text-[#d97706]'
  return 'text-[#64748b]'
}

function fundingBarColor(pct: number): string {
  if (pct >= 80) return 'bg-pos-text'
  if (pct >= 50) return 'bg-[#d97706]'
  return 'bg-neg-text'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FundingProgressBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct))
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full bg-[#e2e8f0] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${fundingBarColor(clamped)}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className={`text-xs font-bold min-w-[42px] text-right ${
        clamped >= 80 ? 'text-pos-text' : clamped >= 50 ? 'text-[#d97706]' : 'text-neg-text'
      }`}>
        {pctFmt(clamped)}
      </span>
    </div>
  )
}

function DriftBadge({ drift }: { drift: number }) {
  const sign = drift >= 0 ? '+' : ''
  const abs  = Math.abs(drift)
  const isWarn = abs > 2
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
      isWarn ? 'text-neg-text' : drift > 0 ? 'text-pos-text' : 'text-[#64748b]'
    }`}>
      {sign}{pctFmt(drift)}
      {isWarn && (
        <span className="ml-1 text-[0.6rem] px-1 py-0.5 rounded bg-neg-light text-neg-text font-bold uppercase tracking-wide">
          sapma
        </span>
      )}
    </span>
  )
}

function CapitalCallCard({
  scenario,
  partners,
}: {
  scenario: CapitalCallScenario
  partners: PartnerEquityPosition[]
}) {
  const labelMap = { 25: 'Kısmi Çağrı', 50: 'Yarı Çağrı', 100: 'Tam Çağrı' } as Record<number, string>
  const label    = labelMap[scenario.call_pct] ?? `%${scenario.call_pct} Çağrısı`

  return (
    <div className="border border-[#e8eaef] rounded-lg p-4 flex flex-col gap-3 bg-[#f8fafc]">
      {/* Header */}
      <div>
        <div className="text-xs font-black text-[#0f172a]">
          %{scenario.call_pct} Sermaye Çağrısı
        </div>
        <div className="text-[0.65rem] text-[#64748b] mt-0.5">{label}</div>
      </div>

      {/* Total additional capital */}
      <div className="rounded bg-white border border-[#e8eaef] px-3 py-2 text-center">
        <div className="text-[0.65rem] text-[#94a3b8] uppercase tracking-wide font-semibold">
          Toplam Ek Sermaye
        </div>
        <div className="text-sm font-black text-[#0f172a]">
          {fmtTRY(scenario.total_additional_capital_try)}
        </div>
      </div>

      {/* Per-partner breakdown */}
      <div className="flex flex-col gap-1.5">
        {scenario.partner_impacts.map(impact => {
          const partnerPos = partners.find(p => p.partner_id === impact.partner_id)
          return (
            <div key={impact.partner_id} className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="text-[#334155] font-medium truncate max-w-[110px]" title={impact.partner_name}>
                  {impact.partner_name}
                </span>
                <span className="text-[#94a3b8] text-[0.65rem] whitespace-nowrap">
                  {fmtTRY(impact.additional_payment_try)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[0.65rem] text-[#64748b] gap-2 pl-0">
                <span className="text-[#94a3b8]">{pctFmt(impact.current_ownership_pct)}</span>
                <span className="text-[#64748b]">→</span>
                <span className={impact.dilution_impact_pct > 0 ? 'text-pos-text font-semibold' : impact.dilution_impact_pct < 0 ? 'text-neg-text font-semibold' : 'text-[#94a3b8]'}>
                  {pctFmt(impact.projected_ownership_pct)}
                </span>
                <span className={`text-[0.6rem] ${impact.dilution_impact_pct > 0 ? 'text-pos-text' : impact.dilution_impact_pct < 0 ? 'text-neg-text' : 'text-[#94a3b8]'}`}>
                  ({impact.dilution_impact_pct >= 0 ? '+' : ''}{pctFmt(impact.dilution_impact_pct)})
                </span>
              </div>
              {partnerPos && partnerPos.capital_gap_try === 0 && (
                <div className="text-[0.6rem] text-[#94a3b8] italic">Taahhüt karşılandı</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  companyId?: string
}

export function EquityDilutionTab({ companyId }: Props) {
  const { data: report, isLoading, isError, error } = useQuery<CapitalStructureReport>({
    queryKey: ['equity-dilution', companyId ?? 'default'],
    queryFn:  fetchReport,
    staleTime: 5 * 60_000,
  })

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-8 w-full rounded" />
        <Skeleton className="h-56 w-full rounded-lg" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="bg-neg-light border border-neg-light rounded px-4 py-3 text-xs text-neg-text font-medium">
        {error instanceof Error ? error.message : 'Veri yüklenemedi'}
      </div>
    )
  }

  if (!report) return null

  const {
    total_committed_capital_try,
    total_paid_capital_try,
    total_capital_gap_try,
    overall_funding_pct,
    partners,
    capital_call_scenarios,
    has_ownership_drift,
  } = report

  return (
    <div className="flex flex-col gap-6">

      {/* ── Ownership drift warning ─────────────────────────────────────────── */}
      {has_ownership_drift && (
        <div className="bg-[#fef9c3] border border-[#fde047] rounded px-4 py-2.5 text-xs text-[#713f12] flex items-start gap-2">
          <span className="font-black mt-0.5 flex-shrink-0 text-[#d97706]">!</span>
          <span>
            <strong>Sahiplik sapması tespit edildi.</strong>{' '}
            Bir veya daha fazla ortağın fiili özkaynak yüzdesi sözleşmesel pay oranından
            &gt;%2 farklı. Sermaye taahhütlerini gözden geçirin.
          </span>
        </div>
      )}

      {/* ── KPI strip ──────────────────────────────────────────────────────── */}
      <KpiStrip>
        <KpiCell
          label="Toplam Taahhüt"
          value={fmtTRY(total_committed_capital_try)}
          sub="Tüm ortak taahhütleri"
        />
        <KpiCell
          label="Ödenen Sermaye"
          value={fmtTRY(total_paid_capital_try)}
          sub="Fiili nakit girişi"
          tone={total_paid_capital_try > 0 ? 'ok' : 'neutral'}
        />
        <KpiCell
          label="Sermaye Açığı"
          value={fmtTRY(total_capital_gap_try)}
          sub={total_capital_gap_try > 0 ? 'Ödenmemiş taahhüt' : 'Açık yok'}
          tone={total_capital_gap_try > 0 ? 'critical' : 'neutral'}
        />
        <KpiCell
          label="Fonlama Oranı"
          value={pctFmt(overall_funding_pct)}
          sub="Ödenen / Taahhüt edilen"
          tone={overall_funding_pct >= 80 ? 'ok' : overall_funding_pct >= 50 ? 'warn' : 'critical'}
        />
      </KpiStrip>

      {/* ── Funding progress bar ────────────────────────────────────────────── */}
      <Panel>
        <PanelHeader label="Sermaye Fonlama Durumu" sub="Ödenen sermayenin taahhüt edilen sermayeye oranı" />
        <div className="px-4 pb-4">
          <FundingProgressBar pct={overall_funding_pct} />
          <div className="flex justify-between text-[0.65rem] text-[#94a3b8] mt-1.5">
            <span>₺0</span>
            <span>Ödenen: {fmtTRY(total_paid_capital_try)}</span>
            <span>Hedef: {fmtTRY(total_committed_capital_try)}</span>
          </div>
        </div>
      </Panel>

      {/* ── Partner equity table ────────────────────────────────────────────── */}
      <Panel>
        <PanelHeader
          label="Ortak Sermaye Pozisyonları"
          sub="Taahhüt · Ödeme · Açık · Sözleşmesel vs Fiili sahiplik"
        />
        {partners.length === 0 ? (
          <EmptySlate title="Aktif ortak bulunamadı." />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <DataTh>Ortak</DataTh>
                <DataTh align="right">Taahhüt</DataTh>
                <DataTh align="right">Ödenen</DataTh>
                <DataTh align="right">Açık</DataTh>
                <DataTh align="right">Sözleşmesel %</DataTh>
                <DataTh align="right">Fiili %</DataTh>
                <DataTh align="right">FD %</DataTh>
                <DataTh align="right">Sapma</DataTh>
              </tr>
            </thead>
            <tbody>
              {partners.map(p => (
                <tr key={p.partner_id} className="hover:bg-[#f8fafc]">
                  <DataTd className="font-medium">
                    <div className="flex items-center gap-1.5">
                      {p.partner_name}
                      {p.is_underpaid && (
                        <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-[#fef2f2] text-neg-text font-bold uppercase tracking-wide border border-[#fecaca]">
                          Yetersiz ödeme
                        </span>
                      )}
                    </div>
                  </DataTd>
                  <DataTd align="right">{fmtTRY(p.committed_capital_try)}</DataTd>
                  <DataTd align="right">{fmtTRY(p.paid_capital_try)}</DataTd>
                  <DataTd align="right">
                    <span className={p.capital_gap_try > 0 ? 'text-neg-text font-semibold' : 'text-[#94a3b8]'}>
                      {p.capital_gap_try > 0 ? fmtTRY(p.capital_gap_try) : '—'}
                    </span>
                  </DataTd>
                  <DataTd align="right">{pctFmt(p.contractual_share_pct)}</DataTd>
                  <DataTd align="right" className="font-semibold">{pctFmt(p.effective_ownership_pct)}</DataTd>
                  <DataTd align="right" className="text-[#64748b]">{pctFmt(p.fully_diluted_pct)}</DataTd>
                  <DataTd align="right">
                    <DriftBadge drift={p.ownership_vs_contractual} />
                  </DataTd>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}

        {/* Column legend */}
        <div className="px-4 pb-3 pt-1 flex flex-wrap gap-x-4 gap-y-1 text-[0.65rem] text-[#94a3b8]">
          <span><strong>Fiili %</strong> = Ödenen / Toplam ödenen</span>
          <span><strong>FD %</strong> = Tam seyreltilmiş (ödenen + kalan taahhüt)</span>
          <span><strong>Sapma</strong> = Fiili – Sözleşmesel (negatif = seyreltilmiş)</span>
        </div>
      </Panel>

      {/* ── Capital call simulator ──────────────────────────────────────────── */}
      <Panel>
        <PanelHeader
          label="Sermaye Çağrısı Simülasyonu"
          sub="Kalan taahhüdün belirli bir yüzdesi ödenseydi sahiplik nasıl değişirdi?"
        />
        {total_capital_gap_try === 0 ? (
          <div className="px-4 pb-4 text-xs text-[#64748b]">
            Tüm ortaklar taahhütlerini tamamen ödemiş — sermaye çağrısı simülasyonu uygulanamaz.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
            {capital_call_scenarios.map(scenario => (
              <CapitalCallCard
                key={scenario.call_pct}
                scenario={scenario}
                partners={partners}
              />
            ))}
          </div>
        )}

        {/* Scenario comparison table */}
        {total_capital_gap_try > 0 && partners.length > 0 && (
          <div className="px-4 pb-4">
            <div className="text-xs font-semibold text-[#334155] mb-2">
              Senaryo Karşılaştırması — Ortak Sahiplik Değişimi
            </div>
            <DataTable>
              <thead>
                <tr>
                  <DataTh>Ortak</DataTh>
                  <DataTh align="right">Güncel %</DataTh>
                  {capital_call_scenarios.map(s => (
                    <DataTh key={s.call_pct} align="right">%{s.call_pct} Çağrısı</DataTh>
                  ))}
                </tr>
              </thead>
              <tbody>
                {partners.map(p => (
                  <tr key={p.partner_id} className="hover:bg-[#f8fafc]">
                    <DataTd className="font-medium">{p.partner_name}</DataTd>
                    <DataTd align="right">{pctFmt(p.effective_ownership_pct)}</DataTd>
                    {capital_call_scenarios.map(s => {
                      const impact = s.partner_impacts.find(i => i.partner_id === p.partner_id)
                      if (!impact) return <DataTd key={s.call_pct} align="right">—</DataTd>
                      return (
                        <DataTd key={s.call_pct} align="right">
                          <span className={impact.dilution_impact_pct > 0 ? 'text-pos-text font-semibold' : impact.dilution_impact_pct < 0 ? 'text-neg-text' : 'text-[#64748b]'}>
                            {pctFmt(impact.projected_ownership_pct)}
                          </span>
                        </DataTd>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        )}
      </Panel>

      {/* ── Disclaimer ─────────────────────────────────────────────────────── */}
      <div className="bg-[#fffbeb] border border-[#fde68a] rounded px-4 py-2 text-xs text-[#92400e] flex items-start gap-2">
        <span className="font-bold mt-0.5 flex-shrink-0">!</span>
        <span>
          <strong>Bu simülasyon bilgi amaçlıdır.</strong>{' '}
          Gösterilen sahiplik yüzdeleri fiili ödenen sermayeye dayanır.
          Hukuki ortaklık oranları için şirket ana sözleşmesi esas alınır.
          Kesin kararlar için lisanslı bir finansal danışmana başvurunuz.
        </span>
      </div>

      <NarrativeFooter
        narrative="Fiili sahiplik yüzdesi, her ortağın ödediği sermayenin toplam ödenen sermayeye oranı olarak hesaplanır. Tam seyreltilmiş yüzde (FD%), kalan taahhütlerin de ödendiği varsayımıyla hesaplanan sahiplik oranını gösterir. Sermaye çağrısı simülasyonları, kalan taahhüdün belirli bir yüzdesinin ödenmesi durumundaki sahiplik değişimlerini modeller."
        links={[]}
      />
    </div>
  )
}

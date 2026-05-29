'use client'

// ─────────────────────────────────────────────────────────────────────────────
// EquityWaterfallDistributionTab — Kâr Dağıtım Waterfall
//
// Multi-tier waterfall distribution view:
//   • Summary KPI strip: Dağıtılabilir Kâr / Yasal Yedek / Stopaj / Net Dağıtım
//   • Tier-by-tier flow: each tier shows amount in/out and per-partner distributions
//   • Partner net distribution table: gross / stopaj / net / effective yield
//   • Distribution equity badge
//   • Narrative footer
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import {
  Panel, PanelHeader, KpiStrip, KpiCell, EmptySlate, Skeleton,
  NarrativeFooter, DataTable, DataTh, DataTd,
} from '@/components/ds'
import { fmtTRY, fmtPct } from '@/lib/format'
import type {
  EquityWaterfallDistributionReport,
  WaterfallResult,
  WaterfallTier,
  classifyDistributionEquity,
} from '@/lib/services/pcle/equity-waterfall-distribution.service'

// ── Types ─────────────────────────────────────────────────────────────────────

type EquityLabel = ReturnType<typeof classifyDistributionEquity>

interface ApiResponse {
  report: EquityWaterfallDistributionReport
}

interface Props {
  companyId?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchReport(): Promise<EquityWaterfallDistributionReport> {
  const res  = await fetch('/api/partners/equity-waterfall-distribution')
  const data = await res.json() as ApiResponse | { error?: string }
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  return (data as ApiResponse).report
}

const EQUITY_LABELS: Record<EquityLabel, string> = {
  equitable:            'Dengeli',
  slight_imbalance:     'Hafif Dengesizlik',
  moderate_imbalance:   'Orta Dengesizlik',
  significant_imbalance: 'Ciddi Dengesizlik',
}

const EQUITY_COLORS: Record<EquityLabel, string> = {
  equitable:            'bg-pos-light text-pos-text border-pos-text/20',
  slight_imbalance:     'bg-[#fffbeb] text-[#92400e] border-[#fde68a]/30',
  moderate_imbalance:   'bg-[#fff7ed] text-[#c2410c] border-[#fed7aa]/30',
  significant_imbalance: 'bg-neg-light text-neg-text border-neg-text/20',
}

function fmtPctVal(v: number | null): string {
  if (v === null) return '—'
  return fmtPct(v)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EquityBadge({ equity }: { equity: EquityLabel }) {
  return (
    <span className={[
      'inline-flex items-center px-2.5 py-1 rounded text-[0.7rem] font-semibold border',
      EQUITY_COLORS[equity],
    ].join(' ')}>
      {EQUITY_LABELS[equity]}
    </span>
  )
}

function TierConnector({ amount }: { amount: number }) {
  return (
    <div className="flex items-center justify-center py-1">
      <div className="flex flex-col items-center">
        <div className="w-px h-4 bg-[#cbd5e1]" />
        <span className="text-[0.6rem] font-mono text-[#94a3b8] px-1.5 py-0.5 bg-[#f1f5f9] rounded border border-[#e2e8f0]">
          {fmtTRY(amount)} devredildi
        </span>
        <div className="w-px h-4 bg-[#cbd5e1]" />
      </div>
    </div>
  )
}

function TierCard({ tier }: { tier: WaterfallTier }) {
  const tierColors: Record<string, string> = {
    'Borç Servisi':     'border-l-[#f59e0b] bg-[#fffbeb]',
    'Tercihli Getiri':  'border-l-[#6366f1] bg-[#f5f3ff]',
    'Pro-Rata Dağıtım': 'border-l-[#10b981] bg-[#ecfdf5]',
  }
  const color = tierColors[tier.tier_name] ?? 'border-l-[#cbd5e1] bg-[#f8fafc]'

  return (
    <div className={`border border-[#e2e8f0] border-l-4 rounded-lg p-4 space-y-3 ${color}`}>
      {/* Tier header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8]">
              Kademe {tier.tier_number}
            </span>
          </div>
          <p className="text-sm font-semibold text-[#0f172a] mt-0.5">{tier.tier_name}</p>
          <p className="text-xs text-[#64748b] mt-0.5">{tier.description}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8]">Dağıtılan</p>
          <p className="text-sm font-bold text-[#0f172a]">{fmtTRY(tier.amount_distributed)}</p>
        </div>
      </div>

      {/* Flow indicator */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8]">Giren</p>
          <p className="text-xs font-semibold text-[#334155]">{fmtTRY(tier.amount_available)}</p>
        </div>
        <div>
          <p className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8]">Kullanılan</p>
          <p className="text-xs font-semibold text-[#0f172a]">{fmtTRY(tier.amount_distributed)}</p>
        </div>
        <div>
          <p className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8]">Kalan</p>
          <p className="text-xs font-semibold text-[#334155]">{fmtTRY(tier.amount_remaining)}</p>
        </div>
      </div>

      {/* Per-partner distributions */}
      {tier.distributions.length > 0 && (
        <div className="border-t border-[#e2e8f0] pt-2">
          <p className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-2">
            Ortak Dağılımı
          </p>
          <div className="space-y-1">
            {tier.distributions.map(d => (
              <div key={d.partner_id} className="flex items-center justify-between">
                <span className="text-xs text-[#334155] truncate max-w-[60%]">{d.partner_name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[0.65rem] text-[#94a3b8]">%{d.share_pct.toFixed(1)}</span>
                  <span className="text-xs font-semibold text-[#0f172a]">{fmtTRY(d.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function EquityWaterfallDistributionTab({ companyId: _companyId = '' }: Props) {
  const { data: report, isLoading, error } = useQuery<EquityWaterfallDistributionReport>({
    queryKey:  ['equity-waterfall-distribution', _companyId],
    queryFn:   () => fetchReport(),
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (error || !report) {
    return (
      <EmptySlate
        title="Veri yüklenemedi"
        sub={error instanceof Error ? error.message : 'Kâr dağıtım waterfall verisi alınamadı.'}
      />
    )
  }

  const { waterfall_result, partner_net_distributions, distribution_equity, narrative } = report
  const tiers = waterfall_result.tiers

  return (
    <div className="space-y-5">

      {/* Summary KPI strip */}
      <Panel>
        <PanelHeader label="Kâr Dağıtım Özeti" />
        <KpiStrip>
          <KpiCell
            label="Dağıtılabilir Kâr"
            value={fmtTRY(report.distributable_profit_try)}
          />
          <KpiCell
            label="Yasal Yedek"
            value={fmtTRY(report.legal_reserve_deduction_try)}
          />
          <KpiCell
            label="Yönetim Kararı Yedek"
            value={fmtTRY(report.board_retained_try)}
          />
          <KpiCell
            label="Toplam Stopaj"
            value={fmtTRY(report.withholding_tax_try)}
          />
          <KpiCell
            label="Toplam Dağıtım"
            value={fmtTRY(waterfall_result.total_distributed)}
          />
        </KpiStrip>
      </Panel>

      {/* Waterfall tier flow */}
      {tiers.length === 0 ? (
        <EmptySlate
          title="Dağıtım kademesi bulunamadı"
          sub="Ortaklara ait veri kaydı yok veya dağıtılabilir kâr sıfır."
        />
      ) : (
        <Panel>
          <div className="flex items-center justify-between mb-4">
            <PanelHeader label="Waterfall Kademe Akışı" />
            <EquityBadge equity={distribution_equity} />
          </div>

          <div className="space-y-1">
            {tiers.map((tier, idx) => (
              <div key={tier.tier_number}>
                <TierCard tier={tier} />
                {idx < tiers.length - 1 && (
                  <TierConnector amount={tier.amount_remaining} />
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Per-partner net distribution table */}
      {partner_net_distributions.length > 0 && (
        <Panel>
          <PanelHeader label="Ortak Bazlı Net Dağıtım" />
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#e2e8f0]">
                  <DataTh align="left">Ortak</DataTh>
                  <DataTh align="right">Brüt Alınan</DataTh>
                  <DataTh align="right">Stopaj (%10)</DataTh>
                  <DataTh align="right">Net Alınan</DataTh>
                  <DataTh align="right">Efektif Getiri</DataTh>
                </tr>
              </thead>
              <tbody>
                {partner_net_distributions.map(p => (
                  <tr key={p.partner_id} className="border-b border-[#f1f5f9] hover:bg-[#f8fafc]">
                    <DataTd align="left">
                      <span className="font-medium text-[#334155]">{p.partner_name}</span>
                    </DataTd>
                    <DataTd align="right">{fmtTRY(p.gross_received)}</DataTd>
                    <DataTd align="right">
                      <span className="text-neg-text">{fmtTRY(p.withholding_tax)}</span>
                    </DataTd>
                    <DataTd align="right">
                      <span className="font-semibold text-[#0f172a]">{fmtTRY(p.net_received)}</span>
                    </DataTd>
                    <DataTd align="right">
                      <span className={p.effective_yield_pct !== null && p.effective_yield_pct > 0
                        ? 'text-pos-text font-semibold'
                        : 'text-[#94a3b8]'}>
                        {fmtPctVal(p.effective_yield_pct)}
                      </span>
                    </DataTd>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <NarrativeFooter
        narrative={narrative}
        links={[]}
      />

    </div>
  )
}

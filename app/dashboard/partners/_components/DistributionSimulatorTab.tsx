'use client'

// ─────────────────────────────────────────────────────────────────────────────
// DistributionSimulatorTab — Kâr Dağıtımı Simülatörü
//
// Shows the 4-layer profit distribution waterfall with Turkish legal compliance:
//   Gross Net Income → − Legal Reserve (TTK 519) → − Board Retained
//   → − Unpaid Compensation → = Distributable Gross
//   → − Withholding Tax 10% (GVK 94) → = Net Distributable
//
// Features:
//   - Current scenario waterfall visualization
//   - TTK 509 / legal reserve compliance banners
//   - Scenario comparison: Conservative / Balanced / Maximum
//   - Per-partner allocation table
//
// Data: GET /api/partners/distribution-simulator
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import { fmtTRY } from '@/lib/format'
import type {
  DistributionSimulatorReport,
  DistributionScenario,
  PartnerAllocation,
} from '@/lib/services/pcle/profit-distribution.service'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApiResponse {
  report: DistributionSimulatorReport
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchReport(): Promise<DistributionSimulatorReport> {
  const res = await fetch('/api/partners/distribution-simulator')
  const data = await res.json()
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  return (data as ApiResponse).report
}

// ── Sub-components ────────────────────────────────────────────────────────────

function WaterfallRow({
  label,
  amount,
  base,
  color,
  isResult,
  sign,
}: {
  label: string
  amount: number
  base: number
  color: string
  isResult?: boolean
  sign?: '+' | '-' | '='
}) {
  const pct = base > 0 ? Math.abs(amount / base) * 100 : 0
  return (
    <div
      className={[
        'flex items-center gap-3 py-2.5 px-3 rounded',
        isResult ? 'bg-[#f0fdf4] border border-[#bbf7d0]' : 'bg-[#f8fafc]',
      ].join(' ')}
    >
      <div className="w-5 text-center text-xs font-black text-[#94a3b8] flex-shrink-0">
        {sign ?? ''}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-[#334155] truncate">{label}</div>
        {base > 0 && (
          <div className="mt-1 h-1.5 rounded-full bg-[#e2e8f0] overflow-hidden">
            <div
              className={`h-full rounded-full ${color}`}
              style={{ width: `${Math.min(pct, 100).toFixed(1)}%` }}
            />
          </div>
        )}
      </div>
      <div className="text-right flex-shrink-0">
        <div
          className={[
            'text-sm font-black tabular-nums',
            isResult ? 'text-[#16a34a]' : amount < 0 ? 'text-[#dc2626]' : 'text-[#0f172a]',
          ].join(' ')}
        >
          {fmtTRY(Math.abs(amount))}
        </div>
        {base > 0 && (
          <div className="text-[0.6rem] text-[#94a3b8] tabular-nums">
            %{pct.toFixed(1)}
          </div>
        )}
      </div>
    </div>
  )
}

function WaterfallCard({ scenario }: { scenario: DistributionScenario }) {
  const base = scenario.gross_net_income

  return (
    <div className="flex flex-col gap-1.5">
      <WaterfallRow
        label="Vergi Sonrası Net Gelir"
        amount={scenario.gross_net_income}
        base={base}
        color="bg-[#3b82f6]"
        sign="+"
      />
      <WaterfallRow
        label="Yasal Yedek Ayrımı (TTK 519)"
        amount={-scenario.legal_reserve_allocation}
        base={base}
        color="bg-[#f59e0b]"
        sign="-"
      />
      <WaterfallRow
        label="Yönetim Kurulu Kararı (Tutulan)"
        amount={-scenario.board_retained_amount}
        base={base}
        color="bg-[#8b5cf6]"
        sign="-"
      />
      <WaterfallRow
        label="Ödenmemiş Huzur Hakkı"
        amount={-scenario.unpaid_compensation}
        base={base}
        color="bg-[#f97316]"
        sign="-"
      />
      <div className="border-t border-dashed border-[#e2e8f0] my-1" />
      <WaterfallRow
        label="Brüt Dağıtılabilir Kâr"
        amount={scenario.distributable_gross}
        base={base}
        color="bg-[#06b6d4]"
        sign="="
      />
      <WaterfallRow
        label="Stopaj Vergisi (%10 GVK 94)"
        amount={-scenario.withholding_tax}
        base={base}
        color="bg-[#ef4444]"
        sign="-"
      />
      <div className="border-t border-dashed border-[#e2e8f0] my-1" />
      <WaterfallRow
        label="Net Dağıtılabilir Kâr"
        amount={scenario.distributable_net}
        base={base}
        color="bg-[#22c55e]"
        isResult
        sign="="
      />
    </div>
  )
}

function PartnerTable({ allocations }: { allocations: PartnerAllocation[] }) {
  if (allocations.length === 0) {
    return (
      <p className="text-xs text-[#94a3b8] py-4 text-center">
        Ortak bulunamadı.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#e2e8f0]">
            <th className="text-left pb-2 text-[#64748b] font-semibold">Ortak</th>
            <th className="text-right pb-2 text-[#64748b] font-semibold">Pay %</th>
            <th className="text-right pb-2 text-[#64748b] font-semibold">Brüt Hak</th>
            <th className="text-right pb-2 text-[#64748b] font-semibold">Stopaj</th>
            <th className="text-right pb-2 text-[#64748b] font-semibold">Net Hak</th>
          </tr>
        </thead>
        <tbody>
          {allocations.map(a => (
            <tr key={a.partner_id} className="border-b border-[#f1f5f9] hover:bg-[#f8fafc]">
              <td className="py-2 font-medium text-[#0f172a]">{a.partner_name}</td>
              <td className="py-2 text-right text-[#64748b] tabular-nums">
                %{a.share_pct.toFixed(1)}
              </td>
              <td className="py-2 text-right tabular-nums text-[#0f172a]">
                {fmtTRY(a.gross_allocation)}
              </td>
              <td className="py-2 text-right tabular-nums text-[#dc2626]">
                {fmtTRY(a.withholding_tax)}
              </td>
              <td className="py-2 text-right tabular-nums font-bold text-[#16a34a]">
                {fmtTRY(a.net_allocation)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ScenarioComparisonTable({
  scenarios,
}: {
  scenarios: DistributionSimulatorReport['scenarios']
}) {
  const rows: { key: keyof typeof scenarios; label: string; pct: string }[] = [
    { key: 'conservative', label: 'Muhafazakar', pct: '%20 tutulan' },
    { key: 'balanced',     label: 'Dengeli',     pct: '%10 tutulan' },
    { key: 'maximum',      label: 'Maksimum',    pct: '%0 tutulan'  },
  ]

  const allPartnerIds = scenarios.maximum.partner_allocations.map(p => p.partner_id)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#e2e8f0]">
            <th className="text-left pb-2 text-[#64748b] font-semibold">Senaryo</th>
            <th className="text-right pb-2 text-[#64748b] font-semibold">Brüt Dağıtılabilir</th>
            <th className="text-right pb-2 text-[#64748b] font-semibold">Net Dağıtılabilir</th>
            {scenarios.maximum.partner_allocations.map(p => (
              <th key={p.partner_id} className="text-right pb-2 text-[#64748b] font-semibold">
                {p.partner_name} (Net)
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, label, pct }) => {
            const s = scenarios[key]
            return (
              <tr key={key} className="border-b border-[#f1f5f9] hover:bg-[#f8fafc]">
                <td className="py-2 font-medium text-[#0f172a]">
                  {label}
                  <span className="ml-1 text-[#94a3b8] font-normal">({pct})</span>
                </td>
                <td className="py-2 text-right tabular-nums text-[#0f172a]">
                  {fmtTRY(s.distributable_gross)}
                </td>
                <td
                  className={[
                    'py-2 text-right tabular-nums font-bold',
                    s.can_distribute ? 'text-[#16a34a]' : 'text-[#dc2626]',
                  ].join(' ')}
                >
                  {fmtTRY(s.distributable_net)}
                </td>
                {allPartnerIds.map(pid => {
                  const alloc = s.partner_allocations.find(a => a.partner_id === pid)
                  return (
                    <td key={pid} className="py-2 text-right tabular-nums text-[#334155]">
                      {alloc ? fmtTRY(alloc.net_allocation) : '—'}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function DistributionSimulatorTab() {
  const { data, isLoading, error } = useQuery<DistributionSimulatorReport, Error>({
    queryKey: ['distribution-simulator'],
    queryFn: fetchReport,
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-xs text-[#94a3b8]">
        Simülasyon hesaplanıyor...
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-[#fef2f2] border border-[#fecaca] rounded px-4 py-3 text-xs text-[#dc2626] font-medium">
        {error.message}
      </div>
    )
  }

  if (!data) return null

  const { current_scenario: s, scenarios } = data

  return (
    <div className="flex flex-col gap-6">

      {/* ── Compliance banners ──────────────────────────────────────────────── */}

      {!s.can_distribute && (
        <div className="flex items-center gap-3 bg-[#fef2f2] border border-[#fecaca] rounded-lg px-4 py-3">
          <span className="text-base">⛔</span>
          <div>
            <p className="text-xs font-bold text-[#dc2626]">
              Dağıtılabilir kâr yok — TTK 509 uyarısı
            </p>
            <p className="text-[0.65rem] text-[#ef4444] mt-0.5">
              Net dağıtılabilir tutar sıfır veya negatif. Temettü dağıtımı yasal olarak mümkün değil.
            </p>
          </div>
        </div>
      )}

      {s.ttk_509_violated && (
        <div className="flex items-center gap-3 bg-[#fff7ed] border border-[#fed7aa] rounded-lg px-4 py-3">
          <span className="text-base">⚠</span>
          <div>
            <p className="text-xs font-bold text-[#c2410c]">
              TTK 509 İhlali — Brüt Dağıtılabilir Negatif
            </p>
            <p className="text-[0.65rem] text-[#ea580c] mt-0.5">
              Kesintiler net geliri aşıyor. Dağıtım gerçekleştirilemez.
            </p>
          </div>
        </div>
      )}

      {s.legal_reserve_satisfied && (
        <div className="inline-flex items-center gap-1.5 self-start bg-[#f0fdf4] border border-[#bbf7d0] rounded-full px-3 py-1">
          <span className="text-[0.65rem]">✓</span>
          <span className="text-[0.65rem] font-bold text-[#16a34a]">Yasal Yedek Tamamlandı</span>
        </div>
      )}

      {/* ── Waterfall ──────────────────────────────────────────────────────── */}

      <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
        <div className="mb-4">
          <h2 className="text-sm font-black text-[#0f172a]">Kâr Dağıtım Kademesi</h2>
          <p className="text-[0.65rem] text-[#94a3b8] mt-0.5">
            TTK 519 yasal yedek · YK kararı · GVK 94 stopaj
          </p>
        </div>
        <WaterfallCard scenario={s} />

        {/* Legal reserve detail */}
        <div className="mt-4 p-3 bg-[#fffbeb] rounded-lg border border-[#fef3c7]">
          <p className="text-[0.65rem] font-semibold text-[#92400e]">TTK 519 Yasal Yedek</p>
          <div className="mt-1 grid grid-cols-2 gap-2 text-[0.65rem] text-[#78350f]">
            <span>Mevcut yedek:</span>
            <span className="text-right font-semibold tabular-nums">
              {fmtTRY(s.existing_legal_reserve)}
            </span>
            <span>Ödenmiş sermaye:</span>
            <span className="text-right font-semibold tabular-nums">
              {fmtTRY(s.paid_in_capital)}
            </span>
            <span>Hedef (%20):</span>
            <span className="text-right font-semibold tabular-nums">
              {fmtTRY(s.paid_in_capital * 0.20)}
            </span>
            <span>Bu dönem ayrım:</span>
            <span className="text-right font-semibold tabular-nums text-[#d97706]">
              {fmtTRY(s.legal_reserve_allocation)}
            </span>
          </div>
        </div>
      </div>

      {/* ── Scenario comparison ─────────────────────────────────────────────── */}

      <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
        <div className="mb-4">
          <h2 className="text-sm font-black text-[#0f172a]">Senaryo Karşılaştırması</h2>
          <p className="text-[0.65rem] text-[#94a3b8] mt-0.5">
            YK kararı (tutulan pay) değişimine göre net dağıtılabilir tutar
          </p>
        </div>
        <ScenarioComparisonTable scenarios={scenarios} />
      </div>

      {/* ── Per-partner allocation ──────────────────────────────────────────── */}

      <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
        <div className="mb-4">
          <h2 className="text-sm font-black text-[#0f172a]">Ortak Bazlı Dağıtım</h2>
          <p className="text-[0.65rem] text-[#94a3b8] mt-0.5">
            Mevcut senaryoda her ortağın brüt ve net hakkı
          </p>
        </div>
        <PartnerTable allocations={s.partner_allocations} />
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}

      <p className="text-[0.6rem] text-[#94a3b8] text-right">
        Hesaplanma: {new Date(data.computed_at).toLocaleString('tr-TR')}
      </p>

    </div>
  )
}

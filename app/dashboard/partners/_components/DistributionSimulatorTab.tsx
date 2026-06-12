'use client'

// ─────────────────────────────────────────────────────────────────────────────
// DistributionSimulatorTab — Ortak Dağıtım Simülatörü
//
// Simulates different dividend/distribution scenarios for partners under
// various financial constraints (TTK compliance, tax withholding, legal reserves).
//
// Features:
//   - Distributable profit summary + legal reserve required
//   - 4 scenario cards (Full, Conservative 50%, Requested, Debt-First)
//   - Per-partner breakdown per scenario (compact table)
//   - Compliance/blocking reason badges
//   - Optimal scenario highlighted (green border)
//   - Custom amount input + "Simulate" button (POST /api/partners/distribution-simulator)
//
// Data:
//   GET  /api/partners/distribution-simulator — standard scenarios
//   POST /api/partners/distribution-simulator — custom simulation
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { fmtTRY } from '@/lib/format'
import type {
  DistributionSimulationResult,
  DistributionScenario,
} from '@/lib/services/pcle/distribution-simulator.service'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApiResponse {
  result: DistributionSimulationResult
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchScenarios(): Promise<DistributionSimulationResult> {
  const res = await fetch('/api/partners/distribution-simulator')
  const data = await res.json()
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  return (data as ApiResponse).result
}

async function postSimulation(requestedDistribution: number): Promise<DistributionSimulationResult> {
  const res = await fetch('/api/partners/distribution-simulator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requested_distribution: requestedDistribution }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  return (data as ApiResponse).result
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ComplianceBadge({ compliant }: { compliant: boolean }) {
  if (compliant) {
    return (
      <span className="inline-flex items-center gap-1 text-[0.6rem] font-bold px-2 py-0.5 rounded-full bg-[#f0fdf4] border border-[#bbf7d0] text-[#16a34a]">
        Uyumlu
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[0.6rem] font-bold px-2 py-0.5 rounded-full bg-[#fef2f2] border border-[#fecaca] text-[#dc2626]">
      Uyumsuz
    </span>
  )
}

function BlockingReasonBox({ reason }: { reason: string }) {
  return (
    <div className="mt-2 flex items-start gap-2 bg-[#fef2f2] border border-[#fecaca] rounded-lg px-3 py-2">
      <span className="text-[#dc2626] text-xs mt-0.5 flex-shrink-0">!</span>
      <p className="text-[0.65rem] text-[#dc2626] font-medium leading-relaxed">{reason}</p>
    </div>
  )
}

function PartnerBreakdownTable({
  distributions,
}: {
  distributions: DistributionScenario['per_partner_distributions']
}) {
  if (distributions.length === 0) {
    return <p className="text-[0.65rem] text-[#94a3b8] py-2">Ortak bulunamadı.</p>
  }
  return (
    <div className="overflow-x-auto mt-2">
      <table className="w-full text-[0.65rem]">
        <thead>
          <tr className="border-b border-[#e8eaef]">
            <th className="text-left pb-1 text-[#64748b] font-semibold">Ortak ID</th>
            <th className="text-right pb-1 text-[#64748b] font-semibold">Pay %</th>
            <th className="text-right pb-1 text-[#64748b] font-semibold">Brüt</th>
            <th className="text-right pb-1 text-[#64748b] font-semibold">Stopaj</th>
            <th className="text-right pb-1 text-[#64748b] font-semibold">Net</th>
          </tr>
        </thead>
        <tbody>
          {distributions.map(d => (
            <tr key={d.partner_id} className="border-b border-[#f1f5f9] hover:bg-[#f8fafc]">
              <td className="py-1 font-mono text-[#334155] truncate max-w-[80px]">
                {d.partner_id.slice(0, 8)}…
              </td>
              <td className="py-1 text-right tabular-nums text-[#64748b]">
                %{d.share_pct.toFixed(1)}
              </td>
              <td className="py-1 text-right tabular-nums text-[#0f172a]">
                {fmtTRY(d.gross_try)}
              </td>
              <td className="py-1 text-right tabular-nums text-[#dc2626]">
                {fmtTRY(d.withholding_try)}
              </td>
              <td className="py-1 text-right tabular-nums font-bold text-[#16a34a]">
                {fmtTRY(d.net_try)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ScenarioCard({
  scenario,
  isOptimal,
}: {
  scenario: DistributionScenario
  isOptimal: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={[
        'rounded-xl border p-4 flex flex-col gap-2 transition-shadow',
        isOptimal
          ? 'border-[#86efac] ring-1 ring-[#86efac] bg-[#f0fdf4]'
          : 'border-[#e8eaef] bg-white',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-black text-[#0f172a]">{scenario.name}</h3>
            {isOptimal && (
              <span className="text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full bg-[#bbf7d0] text-[#15803d]">
                Optimal
              </span>
            )}
          </div>
          <p className="text-[0.65rem] text-[#94a3b8] mt-0.5 line-clamp-2">{scenario.description}</p>
        </div>
        <ComplianceBadge compliant={scenario.is_legally_compliant} />
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-[#f8fafc] rounded-lg p-2">
          <p className="text-[0.6rem] text-[#64748b] font-semibold">Brüt Dağıtım</p>
          <p className="text-xs font-black text-[#0f172a] tabular-nums mt-0.5">
            {fmtTRY(scenario.gross_distribution_try)}
          </p>
        </div>
        <div className="bg-[#f8fafc] rounded-lg p-2">
          <p className="text-[0.6rem] text-[#64748b] font-semibold">Stopaj (%10)</p>
          <p className="text-xs font-black text-[#dc2626] tabular-nums mt-0.5">
            -{fmtTRY(scenario.withholding_tax_try)}
          </p>
        </div>
        <div className="bg-[#f0fdf4] rounded-lg p-2">
          <p className="text-[0.6rem] text-[#64748b] font-semibold">Net Dağıtım</p>
          <p className="text-xs font-black text-[#16a34a] tabular-nums mt-0.5">
            {fmtTRY(scenario.net_distribution_try)}
          </p>
        </div>
      </div>

      {/* Legal reserve row */}
      <div className="flex items-center justify-between text-[0.65rem]">
        <span className="text-[#64748b]">Yasal Yedek (TTK 519):</span>
        <span className="font-semibold text-[#78350f] tabular-nums">
          {fmtTRY(scenario.legal_reserve_required_try)}
        </span>
      </div>

      {/* Blocking reason */}
      {scenario.blocking_reason && (
        <BlockingReasonBox reason={scenario.blocking_reason} />
      )}

      {/* Partner breakdown toggle */}
      {scenario.per_partner_distributions.length > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="text-left text-[0.65rem] text-[#3b82f6] font-semibold hover:underline mt-1"
        >
          {expanded ? 'Ortakları Gizle' : `Ortak Dağılımı (${scenario.per_partner_distributions.length} ortak)`}
        </button>
      )}

      {expanded && (
        <PartnerBreakdownTable distributions={scenario.per_partner_distributions} />
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function DistributionSimulatorTab() {
  const [customAmount, setCustomAmount] = useState('')
  const [customResult, setCustomResult] = useState<DistributionSimulationResult | null>(null)

  const {
    data,
    isLoading,
    error,
  } = useQuery<DistributionSimulationResult, Error>({
    queryKey: ['distribution-simulator-v2'],
    queryFn: fetchScenarios,
    staleTime: 0,
  })

  const mutation = useMutation<DistributionSimulationResult, Error, number>({
    mutationFn: postSimulation,
    onSuccess: result => {
      setCustomResult(result)
    },
  })

  const handleSimulate = () => {
    const amount = parseFloat(customAmount.replace(/[^0-9.,]/g, '').replace(',', '.'))
    if (!isNaN(amount) && amount >= 0) {
      mutation.mutate(amount)
    }
  }

  const activeData = customResult ?? data

  // ── Loading ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 animate-pulse">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-32 rounded-xl bg-[#f1f5f9]" />
        ))}
      </div>
    )
  }

  // ── Error ──────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="bg-[#fef2f2] border border-[#fecaca] rounded-lg px-4 py-3 text-xs text-[#dc2626] font-medium">
        {error.message}
      </div>
    )
  }

  if (!activeData) return null

  const { input_summary, scenarios, optimal_scenario, compliance_warnings } = activeData

  return (
    <div className="flex flex-col gap-6">

      {/* ── Summary KPI strip ──────────────────────────────────────────────── */}

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4">
          <p className="text-[0.65rem] text-[#64748b] font-semibold">Net Kâr</p>
          <p className="text-base font-bold text-[#0f172a] tabular-nums mt-1">
            {fmtTRY(input_summary.net_profit_try)}
          </p>
        </div>
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4">
          <p className="text-[0.65rem] text-[#64748b] font-semibold">Azami Dağıtılabilir</p>
          <p className="text-base font-bold text-[#0f172a] tabular-nums mt-1">
            {fmtTRY(input_summary.max_distributable_try)}
          </p>
        </div>
        <div className="bg-[#fffbeb] border border-[#fef3c7] rounded-xl p-4">
          <p className="text-[0.65rem] text-[#92400e] font-semibold">Yasal Yedek Gerekli</p>
          <p className="text-base font-black text-[#92400e] tabular-nums mt-1">
            {fmtTRY(input_summary.legal_reserve_required_try)}
          </p>
        </div>
      </div>

      {/* ── Compliance warnings ────────────────────────────────────────────── */}

      {compliance_warnings.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {compliance_warnings.map((w, i) => (
            <div
              key={i}
              className="flex items-start gap-2 bg-[#fff7ed] border border-[#fed7aa] rounded-lg px-3 py-2"
            >
              <span className="text-[#c2410c] text-xs mt-0.5 flex-shrink-0">!</span>
              <p className="text-[0.65rem] text-[#c2410c] font-medium">{w}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Scenario cards ─────────────────────────────────────────────────── */}

      <div>
        <h2 className="text-sm font-black text-[#0f172a] mb-3">Dağıtım Senaryoları</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {scenarios.map(scenario => (
            <ScenarioCard
              key={scenario.name}
              scenario={scenario}
              isOptimal={
                optimal_scenario !== null &&
                optimal_scenario.name === scenario.name
              }
            />
          ))}
        </div>
      </div>

      {/* ── Custom simulation ───────────────────────────────────────────────── */}

      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-5">
        <h2 className="text-sm font-black text-[#0f172a] mb-1">Özel Tutar Simülasyonu</h2>
        <p className="text-[0.65rem] text-[#94a3b8] mb-3">
          Dağıtmak istediğiniz tutarı girin — TTK 509/519 ve GVK 94 uyumluluğu anında hesaplanır
        </p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={customAmount}
            onChange={e => setCustomAmount(e.target.value)}
            placeholder="Örn: 500.000"
            className="flex-1 border border-[#e8eaef] rounded-lg px-3 py-2 text-sm text-[#0f172a] placeholder-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:border-transparent"
          />
          <button
            type="button"
            onClick={handleSimulate}
            disabled={mutation.isPending}
            className="px-4 py-2 bg-[#0f172a] text-white text-xs font-bold rounded-lg hover:bg-[#1e293b] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {mutation.isPending ? 'Hesaplanıyor…' : 'Simüle Et'}
          </button>
        </div>

        {mutation.isError && (
          <p className="mt-2 text-[0.65rem] text-[#dc2626] font-medium">
            {mutation.error.message}
          </p>
        )}

        {customResult && (
          <p className="mt-2 text-[0.65rem] text-[#16a34a] font-medium">
            Simülasyon tamamlandı — {customResult.scenarios.length} senaryo hesaplandı
          </p>
        )}
      </div>

    </div>
  )
}

'use client'

// ── CashflowPrediction — 30/60/90-day prediction UI section ─────────────────
// Client component: fetches prediction data and renders scenarios + tables.

import { useEffect, useState } from 'react'
import { cn } from '@/components/ui'
import { fmtTRY, fmtDate } from '@/lib/format'
import type { CashFlowPrediction } from '@/lib/services/cashflow/cashflow-prediction.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

function CashValue({ value }: { value: number }) {
  const tone = value > 0 ? 'text-pos-text' : value < 0 ? 'text-neg' : 'text-[#94a3b8]'
  return <span className={cn('font-black tabular-nums', tone)}>{fmtTRY(value)}</span>
}

function RunwayBadge({ months }: { months: number | null }) {
  if (months === null) return <span className="text-[#94a3b8] text-xs">∞</span>
  if (months === 0)    return <span className="text-neg text-xs font-bold">0 ay</span>
  const tone = months <= 2 ? 'text-neg' : months <= 6 ? 'text-warn-text' : 'text-pos-text'
  return <span className={cn('text-xs font-bold', tone)}>{months.toFixed(1)} ay</span>
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const styles: Record<string, string> = {
    high:     'bg-pos-light text-pos-text',
    medium:   'bg-warn-light text-warn-text',
    low:      'bg-[#fef3c7] text-[#b45309]',
    at_risk:  'bg-neg-light text-neg-text',
  }
  const labels: Record<string, string> = {
    high:    'Yüksek',
    medium:  'Orta',
    low:     'Düşük',
    at_risk: 'Riskli',
  }
  return (
    <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', styles[confidence] ?? 'bg-[#f1f5f9] text-[#64748b]')}>
      {labels[confidence] ?? confidence}
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  companyId?: string  // not needed — server-side auth handles it
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function CashflowPrediction(_props: Props) {
  const [prediction, setPrediction] = useState<CashFlowPrediction | null>(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/cashflow/prediction')
      .then(r => r.json())
      .then((data: CashFlowPrediction) => {
        setPrediction(data)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Tahmin yüklenemedi.')
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded px-4 py-6 text-center text-xs text-[#94a3b8] shadow-sm">
        Tahmin hesaplanıyor…
      </div>
    )
  }

  if (error || !prediction) {
    return (
      <div className="bg-neg-light border border-neg-light rounded px-4 py-3 text-xs text-neg-text font-semibold">
        Tahmin yüklenemedi: {error ?? 'Bilinmeyen hata'}
      </div>
    )
  }

  const { starting_cash_try, periods, scenarios, receivables_expected, commitments_expected, flags } = prediction

  // ── Critical flags at top ──────────────────────────────────────────────────
  const criticalFlags = flags.filter(f => f.severity === 'critical')
  const warningFlags  = flags.filter(f => f.severity === 'warning')

  return (
    <div className="space-y-4">

      {/* Section header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Nakit Akışı Tahmini (30/60/90 Gün)</div>
          <p className="text-[10px] text-[#94a3b8] mt-0.5">
            Başlangıç nakiti: <span className="font-bold text-[#334155]">{fmtTRY(starting_cash_try)}</span>
            {' · '}{new Date(prediction.computed_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>

      {/* Flags */}
      {criticalFlags.map((f, i) => (
        <div key={i} className="bg-neg-light border border-neg-light rounded px-4 py-2.5 text-xs text-neg-text font-semibold">
          🔴 {f.message}
        </div>
      ))}
      {warningFlags.map((f, i) => (
        <div key={i} className="bg-warn-light border border-warn-light rounded px-4 py-2.5 text-xs text-warn-text font-semibold">
          ⚠️ {f.message}
        </div>
      ))}

      {/* Scenario cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {([
          { key: 'optimistic', label: 'İyimser', bg: 'bg-pos-light', border: 'border-pos', titleColor: 'text-pos-text' },
          { key: 'base',       label: 'Baz',     bg: 'bg-white',     border: 'border-[#e2e8f0]', titleColor: 'text-[#0f172a]' },
          { key: 'pessimistic',label: 'Kötümser',bg: 'bg-warn-light',border: 'border-warn-light', titleColor: 'text-warn-text' },
        ] as const).map(({ key, label, bg, border, titleColor }) => {
          const scenario = scenarios[key]
          return (
            <div key={key} className={cn('rounded border px-4 py-3 shadow-sm', bg, border)}>
              <div className={cn('text-xs font-black uppercase tracking-widest mb-2', titleColor)}>{label}</div>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[#64748b]">30 gün</span>
                  <CashValue value={scenario.ending_cash_30_try} />
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[#64748b]">60 gün</span>
                  <CashValue value={scenario.ending_cash_60_try} />
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[#64748b]">90 gün</span>
                  <CashValue value={scenario.ending_cash_90_try} />
                </div>
                <div className="flex justify-between items-center text-xs pt-1 border-t border-[#e2e8f0]">
                  <span className="text-[#64748b]">Runway</span>
                  <RunwayBadge months={scenario.runway_months} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Period breakdown (base) */}
      <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-[#e2e8f0]">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Dönem Bazında Nakit Akışı (Baz Senaryo)</div>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#f8fafc] border-b border-[#e2e8f0]">
              <th className="text-left px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Dönem</th>
              <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-pos">Gelecek Gelir</th>
              <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-neg">Çıkış</th>
              <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Net</th>
              <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-brand-light">Nakit Sonu</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f5f9]">
            {([
              { label: '30 Gün', period: periods.days_30 },
              { label: '60 Gün (kümülatif)', period: periods.days_60 },
              { label: '90 Gün (kümülatif)', period: periods.days_90 },
            ]).map(({ label, period }) => (
              <tr key={label} className={cn('hover:bg-[#f8fafc]/60', period.ending_cash_base_try < 0 ? 'bg-neg-light/30' : '')}>
                <td className="px-4 py-2.5 font-semibold text-[#334155]">{label}</td>
                <td className="px-4 py-2.5 text-right font-mono text-pos-text tabular-nums">{fmtTRY(period.inflows_base_try)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-neg tabular-nums">{fmtTRY(period.outflows_base_try)}</td>
                <td className={cn('px-4 py-2.5 text-right font-mono font-bold tabular-nums', period.net_try >= 0 ? 'text-[#334155]' : 'text-neg')}>
                  {fmtTRY(period.net_try)}
                </td>
                <td className={cn('px-4 py-2.5 text-right font-black tabular-nums', period.ending_cash_base_try < 0 ? 'text-neg-text' : 'text-[#0f172a]')}>
                  {fmtTRY(period.ending_cash_base_try)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Expected receivables */}
      {receivables_expected.length > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-[#e2e8f0] flex items-center justify-between">
            <div>
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Beklenen Tahsilatlar</div>
              <p className="text-[10px] text-[#94a3b8] mt-0.5">Müşteri davranışına göre tahmin edilen ödeme tarihleri</p>
            </div>
            <span className="text-xs font-bold px-2 py-1 rounded bg-[#f1f5f9] text-[#64748b]">
              {receivables_expected.length} alacak
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[520px]">
              <thead>
                <tr className="bg-[#f8fafc] border-b border-[#e2e8f0]">
                  <th className="text-left px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Müşteri</th>
                  <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Tutar</th>
                  <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Tahmini Ödeme</th>
                  <th className="text-center px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Güven</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {receivables_expected.map((r, i) => (
                  <tr key={i} className={cn('hover:bg-[#f8fafc]/60', r.confidence === 'at_risk' ? 'bg-neg-light/20' : '')}>
                    <td className="px-4 py-2.5 font-medium text-[#334155] max-w-[160px] truncate">{r.customer_name}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold tabular-nums text-[#0f172a]">
                      {fmtTRY(r.outstanding_try)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[#64748b]">
                      {fmtDate(r.predicted_payment_date)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <ConfidenceBadge confidence={r.confidence} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Expected outflows */}
      {commitments_expected.length > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-[#e2e8f0] flex items-center justify-between">
            <div>
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Beklenen Çıkışlar (90 Gün)</div>
              <p className="text-[10px] text-[#94a3b8] mt-0.5">Taahhütler ve bilinen yükümlülükler</p>
            </div>
            <span className="text-xs font-bold px-2 py-1 rounded bg-[#f1f5f9] text-[#64748b]">
              {commitments_expected.length} yükümlülük
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[480px]">
              <thead>
                <tr className="bg-[#f8fafc] border-b border-[#e2e8f0]">
                  <th className="text-left px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Başlık</th>
                  <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Tutar</th>
                  <th className="text-right px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Vade</th>
                  <th className="text-left px-4 py-2.5 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Kaynak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {commitments_expected.map((c, i) => (
                  <tr key={i} className="hover:bg-[#f8fafc]/60">
                    <td className="px-4 py-2.5 font-medium text-[#334155] max-w-[180px] truncate">{c.title}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-neg">
                      {c.amount_try !== null ? fmtTRY(c.amount_try) : <span className="text-[#cbd5e1]">Belirsiz</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[#64748b]">{fmtDate(c.due_date)}</td>
                    <td className="px-4 py-2.5 text-[#94a3b8] text-[10px]">{c.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {receivables_expected.length === 0 && commitments_expected.length === 0 && (
        <div className="bg-pos-light border border-pos-light rounded px-4 py-3 text-xs text-pos-text font-semibold">
          90 gün içinde bekleyen alacak veya taahhüt bulunmuyor.
        </div>
      )}
    </div>
  )
}

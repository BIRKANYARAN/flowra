'use client'

import { useState } from 'react'
import Link from 'next/link'
import { NarrativeFooter } from '@/components/ds'
import {
  DistribState,
  pct, fmt,
} from '@/app/dashboard/partners/_components/types'

// ── Compliance gate types ──────────────────────────────────────────────────────

interface ComplianceViolation {
  rule:     string
  message:  string
  blocking: boolean
}

interface CompliancePreCheck {
  violations: ComplianceViolation[]
  blocked:    boolean
}

export interface DistributionTabProps {
  distrib: DistribState | null
  distribLoading: boolean
  netIncomeInput: string
  boardRetainedInput: string
  dividendConfirm: boolean
  dividendLoading: boolean
  dividendError: string | null
  dividendSuccess: boolean
  onNetIncomeChange: (v: string) => void
  onBoardRetainedChange: (v: string) => void
  onLoadDistribution: (netIncome: number, boardRetained: number) => void
  onSetDividendConfirm: (v: boolean) => void
  onDeclareDividend: () => void
}

export function DistributionTab({
  distrib,
  distribLoading,
  netIncomeInput,
  boardRetainedInput,
  dividendConfirm,
  dividendLoading,
  dividendError,
  dividendSuccess,
  onNetIncomeChange,
  onBoardRetainedChange,
  onLoadDistribution,
  onSetDividendConfirm,
  onDeclareDividend,
}: DistributionTabProps) {
  const [preCheck,       setPreCheck]       = useState<CompliancePreCheck | null>(null)
  const [preCheckLoading, setPreCheckLoading] = useState(false)

  // Run compliance pre-check before full distribution compute
  async function handleCalculate() {
    const netIncome    = parseFloat(netIncomeInput)    || 0
    const boardRetained = parseFloat(boardRetainedInput) || 0

    setPreCheckLoading(true)
    setPreCheck(null)
    try {
      const params = new URLSearchParams({
        net_income:      String(netIncome),
        board_retained:  String(boardRetained),
        // dividend_requested = 0 for pre-check (we just want to see the rules)
        dividend_requested: '0',
        legal_reserves_done: 'false',
      })
      const res = await fetch(`/api/partners/pcle/distribute?${params}`)
      if (res.status === 422) {
        const json = await res.json().catch(() => ({ violations: [], blocked: true }))
        setPreCheck({ violations: json.violations ?? [], blocked: true })
      } else if (res.ok) {
        const json = await res.json().catch(() => ({}))
        setPreCheck({ violations: json.violations ?? [], blocked: false })
        // Only call full distribution if no blocking violation
        onLoadDistribution(netIncome, boardRetained)
      } else {
        // On unexpected error, still allow distribution to run
        onLoadDistribution(netIncome, boardRetained)
      }
    } catch {
      onLoadDistribution(netIncome, boardRetained)
    }
    setPreCheckLoading(false)
  }

  const hasBlockingViolation = preCheck?.blocked === true

  // Rule display order with Turkish labels
  const RULE_LABELS: Record<string, string> = {
    TTK_509_NO_PROFIT:    'TTK 509 — Kâr yokken dağıtım yasaktır',
    TTK_509_EXCESS:       'TTK 509 — Dağıtılabilir kâr sınırı',
    TTK_519_RESERVE:      'TTK 519 — Yasal yedek zorunluluğu',
    NEG_DISTRIBUTABLE:    'Negatif dağıtılabilir tutar',
  }

  function ruleLabel(rule: string): string {
    return RULE_LABELS[rule] ?? rule.replace(/_/g, ' ')
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3">
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-3">Dağıtım Parametreleri</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
              Dönem Net Gelir (TL)
            </label>
            <input
              type="number"
              min="0"
              placeholder="örn. 500000"
              className="w-full border border-[#e8eaef] rounded px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand/30"
              value={netIncomeInput}
              onChange={e => { onNetIncomeChange(e.target.value); setPreCheck(null) }}
            />
          </div>
          <div>
            <label className="block text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
              Yönetim Kurulu Alıkoyması (TL)
            </label>
            <input
              type="number"
              min="0"
              placeholder="örn. 0"
              className="w-full border border-[#e8eaef] rounded px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand/30"
              value={boardRetainedInput}
              onChange={e => { onBoardRetainedChange(e.target.value); setPreCheck(null) }}
            />
          </div>
        </div>
        <button
          onClick={handleCalculate}
          disabled={distribLoading || preCheckLoading}
          className="mt-3 text-xs font-bold px-4 py-2 rounded bg-brand-light text-white hover:bg-brand disabled:opacity-50 transition-colors"
        >
          {distribLoading || preCheckLoading ? 'Hesaplanıyor...' : 'Dağıtım Hesapla'}
        </button>
      </div>

      {/* ── Compliance Pre-Check Panel ──────────────────────────────────────── */}
      {preCheck && (
        <div className={`border rounded overflow-hidden ${hasBlockingViolation ? 'border-neg-light bg-neg-light' : 'border-pos-light bg-pos-light'}`}>
          <div className={`px-4 py-2 border-b ${hasBlockingViolation ? 'border-neg-light' : 'border-pos-light'}`}>
            <div className={`text-[0.65rem] font-bold uppercase tracking-wider ${hasBlockingViolation ? 'text-neg-text' : 'text-pos-text'}`}>
              Yasal Uyum Ön Kontrolü
            </div>
          </div>
          <div className="divide-y divide-[#f1f5f9]">
            {/* Show core TTK rules explicitly */}
            {[
              {
                key:      'ttk509',
                label:    'TTK 509 — Dağıtılabilir kâr',
                passing:  !preCheck.violations.some(v => v.rule.includes('509') && v.blocking),
                blocking: preCheck.violations.some(v => v.rule.includes('509') && v.blocking),
                msg:      preCheck.violations.find(v => v.rule.includes('509'))?.message,
              },
              {
                key:      'ttk519',
                label:    'TTK 519 — Yasal yedek ayrımı',
                passing:  !preCheck.violations.some(v => v.rule.includes('519') && v.blocking),
                blocking: preCheck.violations.some(v => v.rule.includes('519') && v.blocking),
                msg:      preCheck.violations.find(v => v.rule.includes('519'))?.message,
              },
              {
                key:      'neg',
                label:    'Negatif dağıtım kontrolü',
                passing:  !preCheck.violations.some(v => v.rule.includes('NEG') && v.blocking),
                blocking: preCheck.violations.some(v => v.rule.includes('NEG') && v.blocking),
                msg:      preCheck.violations.find(v => v.rule.includes('NEG'))?.message,
              },
            ].map(rule => (
              <div key={rule.key} className={`flex items-start gap-3 px-4 py-2.5 bg-white`}>
                <span className={`text-base shrink-0 mt-0.5 ${rule.blocking ? 'text-neg' : 'text-pos-text'}`}>
                  {rule.blocking ? '✗' : '✓'}
                </span>
                <div>
                  <div className={`text-[11px] font-bold ${rule.blocking ? 'text-neg-text' : 'text-pos-text'}`}>
                    {rule.label}
                  </div>
                  {rule.msg && (
                    <div className={`text-[10px] mt-0.5 ${rule.blocking ? 'text-neg' : 'text-[#64748b]'}`}>
                      {rule.msg}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {/* Any additional non-blocking warnings from the API */}
            {preCheck.violations.filter(v => !v.blocking && !['509','519','NEG'].some(k => v.rule.includes(k))).map((v, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-2.5 bg-white">
                <span className="text-warn text-base shrink-0 mt-0.5">⚠</span>
                <div>
                  <div className="text-[11px] font-bold text-warn-text">{ruleLabel(v.rule)}</div>
                  <div className="text-[10px] text-warn-text mt-0.5">{v.message}</div>
                </div>
              </div>
            ))}
          </div>
          {hasBlockingViolation && (
            <div className="px-4 py-3 bg-neg-light border-t border-neg-light">
              <div className="text-xs text-neg-text font-bold">
                Engelleme ihlali mevcut — Dağıtım başlatılamaz.
              </div>
            </div>
          )}
        </div>
      )}

      {distrib && (
        <>
          {/* 4-Layer Distribution Breakdown */}
          <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[#e8eaef] bg-[#f8fafc]">
              <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">4 Katmanlı Dağıtım Güvenlik Hesabı</div>
            </div>
            <div className="divide-y divide-[#f1f5f9]">
              {[
                { label: 'Brüt Net Gelir',        value: distrib.distribution_layers.gross_net_income_try,    color: 'text-[#0f172a]',    sign: '' },
                { label: '(−) Yasal Yedek (TTK 519 %5)', value: distrib.distribution_layers.legal_reserve_try, color: 'text-warn-text', sign: '−' },
                { label: '(−) YK Alıkoyması',      value: distrib.distribution_layers.board_retained_try,     color: 'text-warn-text',   sign: '−' },
                { label: '(−) Ödenmemiş Huzur H.', value: distrib.distribution_layers.unpaid_compensation_try,color: 'text-warn-text',   sign: '−' },
                { label: 'Brüt Dağıtılabilir',     value: distrib.distribution_layers.distributable_gross_try,color: 'text-brand', sign: '=' },
                { label: '(−) Stopaj (%10 GVK 94)',value: distrib.distribution_layers.withholding_tax_try,    color: 'text-neg',     sign: '−' },
                { label: 'Net Dağıtılabilir',       value: distrib.distribution_layers.distributable_net_try,  color: distrib.distribution_layers.is_distributable ? 'text-pos-text' : 'text-neg-text', sign: '=' },
              ].map(row => (
                <div key={row.label} className={`flex items-center justify-between px-4 py-3 ${row.sign === '=' ? 'bg-[#f8fafc]' : ''}`}>
                  <div className="text-xs text-[#64748b]">{row.label}</div>
                  <div className={`text-xs font-bold tabular-nums font-mono ${row.color}`}>
                    {row.sign && row.sign !== '=' ? row.sign + ' ' : ''}{fmt(row.value)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Block reason / distribute status */}
          {distrib.distribution_layers.is_distributable ? (
            <div className="bg-pos-light border border-pos-light rounded px-4 py-3 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-bold text-pos-text">Dağıtım yapılabilir</div>
                  <div className="text-xs text-pos-text mt-0.5">
                    Net dağıtılabilir: <span className="font-bold">{fmt(distrib.distribution_layers.distributable_net_try)}</span>
                  </div>
                </div>
                {dividendSuccess ? (
                  <span className="text-xs font-bold text-pos-text px-3 py-2">✓ Temettü kaydedildi</span>
                ) : dividendConfirm ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={onDeclareDividend}
                      disabled={dividendLoading}
                      className="text-xs font-bold px-3 py-2 rounded bg-pos text-white hover:bg-pos disabled:opacity-50 transition-colors"
                    >
                      {dividendLoading ? 'Kaydediliyor…' : 'Onayla'}
                    </button>
                    <button
                      onClick={() => { onSetDividendConfirm(false) }}
                      disabled={dividendLoading}
                      className="text-xs font-bold px-3 py-2 rounded border border-pos text-pos-text hover:bg-pos-light disabled:opacity-50 transition-colors"
                    >
                      İptal
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { onSetDividendConfirm(true) }}
                    disabled={hasBlockingViolation}
                    className="text-xs font-bold px-4 py-2 rounded bg-pos text-white hover:bg-pos transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                    title={hasBlockingViolation ? 'Yasal uyum ihlali nedeniyle dağıtım engellenmiştir' : undefined}
                  >
                    Dağıtım Başlat
                  </button>
                )}
              </div>
              {dividendConfirm && !dividendLoading && (
                <div className="text-xs text-pos-text border-t border-pos-light pt-2">
                  {distrib.per_partner_distribution.length} ortak için net temettü kaydedilecek. Bu işlem geri alınamaz.
                </div>
              )}
              {dividendError && (
                <div className="text-xs text-neg border-t border-pos-light pt-2">{dividendError}</div>
              )}
            </div>
          ) : (
            <div className="bg-neg-light border border-neg-light rounded px-4 py-3">
              <div className="text-xs font-bold text-neg-text">Dağıtım engellenmiştir</div>
              <div className="text-xs text-neg mt-0.5">{distrib.distribution_layers.block_reason ?? 'Dağıtılabilir net gelir yetersiz (TTK 509).'}</div>
            </div>
          )}

          {/* Per-partner entitlements */}
          {distrib.per_partner_distribution.length > 0 && (
            <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#e8eaef] bg-[#f8fafc]">
                <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Ortak Bazında Hak Edilenler</div>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#e8eaef]">
                    {['Ortak', 'Pay', 'Brüt Hak', 'Stopaj', 'Net Hak'].map(h => (
                      <th key={h} className={`px-4 py-2 text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] ${h === 'Ortak' ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {distrib.per_partner_distribution.map(p => (
                    <tr key={p.partner_id} className="hover:bg-[#f8fafc]/60">
                      <td className="px-4 py-3 font-semibold text-[#0f172a]">{p.partner_name}</td>
                      <td className="px-4 py-3 text-right text-[#64748b]">{pct(p.share_ratio)}</td>
                      <td className="px-4 py-3 text-right font-mono text-[#334155]">{fmt(p.gross_entitlement_try)}</td>
                      <td className="px-4 py-3 text-right font-mono text-neg">{fmt(p.withholding_try)}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-pos-text">{fmt(p.net_entitlement_try)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Compliance warnings */}
          {distrib.compliance_warnings.length > 0 && (
            <div className="flex flex-col gap-2">
              {distrib.compliance_warnings.map((w, i) => {
                const cls = w.severity === 'error'
                  ? 'bg-neg-light border-neg-light text-neg-text'
                  : w.severity === 'warning'
                  ? 'bg-warn-light border-warn-light text-warn-text'
                  : 'bg-info-light border-info-light text-info-text'
                return (
                  <div key={i} className={`border rounded px-4 py-3 text-xs ${cls}`}>
                    <span className="font-bold uppercase tracking-wide">[{w.type}]</span>{' '}{w.message}
                    {w.amount != null && <span className="font-bold ml-1">{fmt(w.amount)}</span>}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {!distrib && !distribLoading && (
        <div className="bg-[#f8fafc] border border-[#e8eaef] rounded px-4 py-8 text-center text-xs text-[#94a3b8]">
          Dönem net gelirini girin ve hesapla butonuna basın.
        </div>
      )}

      {/* Cross-navigation */}
      <NarrativeFooter
        className="pt-2"
        narrative="Kâr dağıtımı P&L ve geçici vergi ile uyumlu olmalı."
        links={[
          { label: 'P&L Analizi',  href: '/dashboard/finance?tab=pnl' },
          { label: 'Geçici Vergi', href: '/dashboard/finance?tab=quarterly' },
          { label: 'Bilanço',      href: '/dashboard/finance?tab=balance' },
        ]}
      />
    </div>
  )
}

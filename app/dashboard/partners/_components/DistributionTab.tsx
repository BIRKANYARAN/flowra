'use client'

import Link from 'next/link'
import {
  DistribState,
  pct, fmt,
} from '@/app/dashboard/partners/_components/types'

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
  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white border border-[#e2e8f0] rounded px-5 py-4">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">Dağıtım Parametreleri</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
              Dönem Net Gelir (TL)
            </label>
            <input
              type="number"
              min="0"
              placeholder="örn. 500000"
              className="w-full border border-[#e2e8f0] rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              value={netIncomeInput}
              onChange={e => onNetIncomeChange(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
              Yönetim Kurulu Alıkoyması (TL)
            </label>
            <input
              type="number"
              min="0"
              placeholder="örn. 0"
              className="w-full border border-[#e2e8f0] rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
              value={boardRetainedInput}
              onChange={e => onBoardRetainedChange(e.target.value)}
            />
          </div>
        </div>
        <button
          onClick={() => onLoadDistribution(
            parseFloat(netIncomeInput) || 0,
            parseFloat(boardRetainedInput) || 0,
          )}
          disabled={distribLoading}
          className="mt-3 text-xs font-bold px-4 py-2 rounded bg-brand-light text-white hover:bg-brand disabled:opacity-50 transition-colors"
        >
          {distribLoading ? 'Hesaplanıyor...' : 'Dağıtım Hesapla'}
        </button>
      </div>

      {distrib && (
        <>
          {/* 4-Layer Distribution Breakdown */}
          <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[#e2e8f0] bg-[#f8fafc]">
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">4 Katmanlı Dağıtım Güvenlik Hesabı</div>
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
                  <div className={`text-sm font-black tabular-nums font-mono ${row.color}`}>
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
                  <div className="text-sm font-bold text-pos-text">Dağıtım yapılabilir</div>
                  <div className="text-xs text-pos-text mt-0.5">
                    Net dağıtılabilir: <span className="font-black">{fmt(distrib.distribution_layers.distributable_net_try)}</span>
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
                    className="text-xs font-bold px-4 py-2 rounded bg-pos text-white hover:bg-pos transition-colors shrink-0"
                  >
                    Temettü Beyan Et
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
              <div className="text-sm font-bold text-neg-text">Dağıtım engellenmiştir</div>
              <div className="text-xs text-neg mt-0.5">{distrib.distribution_layers.block_reason ?? 'Dağıtılabilir net gelir yetersiz (TTK 509).'}</div>
            </div>
          )}

          {/* Per-partner entitlements */}
          {distrib.per_partner_distribution.length > 0 && (
            <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#e2e8f0] bg-[#f8fafc]">
                <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Ortak Bazında Hak Edilenler</div>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#e2e8f0]">
                    {['Ortak', 'Pay', 'Brüt Hak', 'Stopaj', 'Net Hak'].map(h => (
                      <th key={h} className={`px-4 py-2 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] ${h === 'Ortak' ? 'text-left' : 'text-right'}`}>{h}</th>
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
                    {w.amount != null && <span className="font-black ml-1">{fmt(w.amount)}</span>}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {!distrib && !distribLoading && (
        <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-4 py-8 text-center text-sm text-[#94a3b8]">
          Dönem net gelirini girin ve hesapla butonuna basın.
        </div>
      )}

      {/* Cross-navigation */}
      <div className="flex items-center justify-between px-1 pt-2">
        <p className="text-[10px] text-[#94a3b8] leading-relaxed">
          Kâr dağıtımı P&amp;L ve geçici vergi ile uyumlu olmalı.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link href="/dashboard/finance?tab=pnl" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            P&amp;L Analizi →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/finance?tab=quarterly" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Geçici Vergi →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/finance?tab=balance" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Bilanço →
          </Link>
        </div>
      </div>
    </div>
  )
}

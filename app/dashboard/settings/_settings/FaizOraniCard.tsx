// Faiz Oranı (policy interest-rate) card — extracted verbatim from settings/page.tsx.
// Presentational: per-currency rate entry + history list, driven entirely by props
// (state + save handler stay in the page, which owns the policy_rates load/save).
'use client'

import { FlowraCard }   from '@/components/ui-kit/FlowraCard'
import { FlowraButton } from '@/components/ui-kit/FlowraButton'
import { FlowraInput }  from '@/components/ui-kit/FlowraInput'

export interface RateHistoryRow { rate_date: string; annual_rate: number; source?: string }

interface Props {
  currency:     'TRY' | 'USD' | 'EUR'
  setCurrency:  (c: 'TRY' | 'USD' | 'EUR') => void
  rate:         string
  setRate:      (v: string) => void
  saving:       boolean
  onSave:       () => void
  history:      RateHistoryRow[]
}

export function FaizOraniCard({ currency, setCurrency, rate, setRate, saving, onSave, history }: Props) {
  return (
    <FlowraCard>
      <p className="font-bold text-sm border-b border-[#e2e8f0] pb-2 mb-3">Faiz Oranı</p>
      <p className="text-[10px] text-[#94a3b8] mb-3">
        Simülasyon ve reel kâr hesabı için para birimi bazında yıllık oran
      </p>

      {/* Currency selector */}
      <div className="flex gap-1 mb-3">
        {(['TRY', 'USD', 'EUR'] as const).map(c => (
          <button
            key={c}
            type="button"
            onClick={() => { setCurrency(c); setRate('') }}
            className={`text-xs border rounded-md px-2.5 py-1 font-semibold transition-colors select-none ${
              currency === c
                ? 'border-brand-light bg-brand-light text-white'
                : 'border-[#e2e8f0] text-[#64748b] hover:bg-[#f8fafc] hover:text-[#1e293b]'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <FlowraInput
            label={`Yıllık Faiz (%) — ${currency}`}
            type="number"
            min="0"
            max="1000"
            step="0.01"
            placeholder="45.50"
            value={rate}
            onChange={e => setRate(e.target.value)}
          />
        </div>
        <FlowraButton
          variant="primary"
          onClick={onSave}
          loading={saving}
          disabled={saving || !rate}
        >
          {saving ? '...' : 'Kaydet'}
        </FlowraButton>
      </div>

      {history.length > 0 && (
        <div className="mt-3 border-t border-[#e2e8f0] pt-3 space-y-1">
          <p className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">
            Geçmiş — {currency}
          </p>
          {history.map(r => (
            <div key={r.rate_date} className="flex justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-[#64748b]">{r.rate_date}</span>
                {r.source && r.source !== 'manual' && (
                  <span className="text-[9px] bg-[#f1f5f9] text-[#94a3b8] px-1 rounded uppercase">
                    {r.source}
                  </span>
                )}
              </div>
              <span className="font-semibold tabular-nums">%{(Number(r.annual_rate) || 0).toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </FlowraCard>
  )
}

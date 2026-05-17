'use client'

import {
  WaterfallData,
  fmt,
} from '@/app/dashboard/partners/_components/types'
import { Skeleton, StatusPill } from '@/app/dashboard/partners/_components/ui'

export interface WaterfallTabProps {
  loading: boolean
  waterfall: WaterfallData | null
  totalDebt: number
  availCash: number
  onCashChange: (v: number) => void
  onLoadWaterfall: (cash: number) => void
}

export function WaterfallTab({
  loading,
  waterfall,
  totalDebt,
}: WaterfallTabProps) {
  return (
    <div className="flex flex-col gap-4">
      {loading ? <Skeleton h="h-32" /> : !waterfall ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-6 text-center text-sm text-gray-400">Waterfall verisi yüklenemedi.</div>
      ) : (
        <>
          {/* Summary row */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Mevcut Nakit</div>
              <div className="text-2xl font-black tabular-nums text-gray-900">{fmt(waterfall.available_cash_try)}</div>
            </div>
            <div className="bg-white border border-amber-200 rounded-xl px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-1">Toplam Borç</div>
              <div className={`text-2xl font-black tabular-nums ${totalDebt > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{fmt(totalDebt)}</div>
            </div>
            <div className="bg-white border border-emerald-200 rounded-xl px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-1">Borç Sonrası</div>
              <div className={`text-2xl font-black tabular-nums ${waterfall.remaining_after_debt >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmt(waterfall.remaining_after_debt)}</div>
            </div>
          </div>

          {/* Clearance projection */}
          {waterfall.debt_clearance_months != null && totalDebt > 0 && (
            <div className={`rounded-xl px-4 py-3 text-sm ${
              waterfall.debt_clearance_months <= 3  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' :
              waterfall.debt_clearance_months <= 12 ? 'bg-amber-50 border border-amber-200 text-amber-800' :
              'bg-red-50 border border-red-200 text-red-800'
            }`}>
              <span className="font-bold">Borç kapanma tahmini:</span>{' '}
              Mevcut nakit oranında yaklaşık{' '}
              <span className="font-black">{waterfall.debt_clearance_months} ay</span>
              {waterfall.debt_clearance_months > 12 && ' — borç yükü kritik seviyede.'}
            </div>
          )}

          {totalDebt === 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-4 text-sm text-emerald-800 font-semibold text-center">
              Tüm ortak borçları kapatılmış. Nakit dağıtıma hazır.
            </div>
          )}

          {/* Debt tranches table */}
          {waterfall.tranches.filter(t => t.principal_try > 0).length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Ortak Borç Pozisyonları</div>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Ortak','Toplam Borç','Ödenen','Kalan','Gün','Durum'].map(h => (
                      <th key={h} className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400 ${h === 'Ortak' ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {waterfall.tranches.filter(t => t.principal_try > 0).map(t => (
                    <tr key={t.id} className="hover:bg-gray-50/60">
                      <td className="px-4 py-3 font-semibold text-gray-900">{t.partner_name}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700">{fmt(t.principal_try)}</td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-600">{fmt(t.actual_repaid_try)}</td>
                      <td className={`px-4 py-3 text-right font-mono font-bold ${t.remaining_principal_try > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{fmt(t.remaining_principal_try)}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{t.days_outstanding}g</td>
                      <td className="px-4 py-3 text-right"><StatusPill status={t.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Allocation steps */}
          {waterfall.steps.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Dağıtım Adımları (Öncelik Sırası)</div>
              </div>
              <div className="divide-y divide-gray-50">
                {waterfall.steps.map((step, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-primary-50 text-primary-700 text-[10px] font-black flex items-center justify-center shrink-0">
                        {i + 1}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-gray-800">{step.description}</div>
                      </div>
                    </div>
                    <div className="text-sm font-black tabular-nums text-primary-700">{fmt(step.allocated_try)}</div>
                  </div>
                ))}
                {waterfall.remaining_after_debt > 0 && (
                  <div className="flex items-center justify-between px-4 py-3 bg-emerald-50">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black flex items-center justify-center shrink-0">
                        {waterfall.steps.length + 1}
                      </div>
                      <div className="text-xs font-semibold text-emerald-800">Dağıtılabilir nakit (temettü)</div>
                    </div>
                    <div className="text-sm font-black tabular-nums text-emerald-700">{fmt(waterfall.remaining_after_debt)}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {waterfall.steps.length === 0 && totalDebt === 0 && (
            <p className="text-xs text-center text-gray-400">Geri ödeme adımı yok — borç mevcut değil.</p>
          )}
        </>
      )}
    </div>
  )
}

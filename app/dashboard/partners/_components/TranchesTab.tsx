'use client'

import {
  WaterfallData,
  fmt, fmtPct,
} from '@/app/dashboard/partners/_components/types'
import { Skeleton, StatusPill } from '@/app/dashboard/partners/_components/ui'

export interface TranchesTabProps {
  loading: boolean
  waterfall: WaterfallData | null
}

export function TranchesTab({ loading, waterfall }: TranchesTabProps) {
  return (
    <div className="flex flex-col gap-4">
      {loading ? <Skeleton h="h-32" /> : !waterfall ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-6 text-center text-sm text-gray-400">
          Tranche verisi yüklenemedi.
        </div>
      ) : waterfall.tranches.filter(t => t.principal_try > 0).length === 0 ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-6 text-center text-sm text-emerald-700 font-semibold">
          Aktif ortak borç tranche&apos;ı yok.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white border border-amber-200 rounded-xl px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-1">Toplam Açık Borç</div>
              <div className="text-2xl font-black tabular-nums text-amber-700">{fmt(waterfall.total_debt_try)}</div>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Aktif Tranche Sayısı</div>
              <div className="text-2xl font-black tabular-nums text-gray-900">
                {waterfall.tranches.filter(t => t.status !== 'repaid').length}
              </div>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Kapanma Tahmini</div>
              <div className={`text-2xl font-black tabular-nums ${
                (waterfall.debt_clearance_months ?? 0) > 0
                  ? waterfall.debt_clearance_months! <= 3 ? 'text-emerald-700' : waterfall.debt_clearance_months! <= 12 ? 'text-amber-700' : 'text-red-700'
                  : 'text-gray-400'
              }`}>
                {waterfall.debt_clearance_months != null && waterfall.total_debt_try > 0
                  ? `${waterfall.debt_clearance_months} ay`
                  : '—'}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {waterfall.tranches.filter(t => t.principal_try > 0).map(t => {
              const repaidPct = t.principal_try > 0 ? (t.actual_repaid_try / t.principal_try) * 100 : 0
              const progressColor = t.status === 'repaid' ? 'bg-emerald-500' : t.status === 'overdue' ? 'bg-red-500' : 'bg-primary-500'
              return (
                <div key={t.id} className="bg-white border border-gray-100 rounded-xl px-5 py-4 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-900">{t.partner_name}</span>
                        <StatusPill status={t.status} />
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{t.days_outstanding} gündür açık</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-black tabular-nums text-amber-700">{fmt(t.remaining_principal_try)}</div>
                      <div className="text-[10px] text-gray-400">kalan</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-3 text-xs">
                    <div>
                      <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Toplam Borç</div>
                      <div className="font-mono font-bold text-gray-700">{fmt(t.principal_try)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Ödenen</div>
                      <div className="font-mono font-bold text-emerald-600">{fmt(t.actual_repaid_try)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Geri Ödeme</div>
                      <div className="font-mono font-bold text-gray-700">{fmtPct(repaidPct)}</div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                      <span>Geri ödeme ilerleme</span>
                      <span>{fmtPct(repaidPct)}</span>
                    </div>
                    <div className="bg-gray-100 rounded-full h-2">
                      <div
                        className={`${progressColor} h-2 rounded-full transition-all`}
                        style={{ width: `${Math.min(100, repaidPct)}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

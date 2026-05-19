'use client'

import Link from 'next/link'
import { NarrativeFooter } from '@/components/ds'
import {
  CapitalReturn,
  fmt, fmtPct,
} from '@/app/dashboard/partners/_components/types'
import { Skeleton, RoiBar } from '@/app/dashboard/partners/_components/ui'

export interface ReturnsTabProps {
  loading: boolean
  returns: CapitalReturn[]
}

export function ReturnsTab({ loading, returns }: ReturnsTabProps) {
  return (
    <div className="flex flex-col gap-4">
      {loading ? <Skeleton h="h-32" /> : returns.length === 0 ? (
        <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-4 py-6 text-center text-sm text-[#94a3b8]">
          Getiri verisi hesaplanamadı.
        </div>
      ) : (
        <>
          <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 border-b border-[#e2e8f0] bg-[#f8fafc]">
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Ortak Bazında Sermaye Getirisi</div>
            </div>
            <div className="divide-y divide-[#f1f5f9]">
              {returns.map(r => (
                <div key={r.partner_id} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div>
                      <div className="text-sm font-bold text-[#0f172a]">{r.partner_name}</div>
                      <div className="text-[10px] text-[#94a3b8] mt-0.5">
                        Yatırılan: <span className="font-semibold text-[#64748b]">{fmt(r.total_invested_try)}</span>
                        {' '}· Geri alınan: <span className="font-semibold text-pos-text">{fmt(r.total_returned_try)}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-lg font-black tabular-nums ${r.roi_to_date_pct >= 100 ? 'text-pos-text' : r.roi_to_date_pct >= 50 ? 'text-warn-text' : 'text-neg'}`}>
                        {fmtPct(r.roi_to_date_pct)}
                      </div>
                      <div className="text-[10px] text-[#94a3b8]">ROI</div>
                    </div>
                  </div>
                  <RoiBar pct={r.roi_to_date_pct} />
                </div>
              ))}
            </div>
          </div>

          <div className="bg-info-light border border-info-light rounded px-4 py-3 text-xs text-info-text leading-relaxed">
            <span className="font-bold">Not:</span> ROI = (Geri Alınan / Yatırılan) × 100.
            Geri alınan = geri ödemeler + temettü + maaş/huzur. %100 üzeri tam geri dönüş anlamına gelir.
            Faiz izleme ve IRR hesaplaması için gelişmiş borç takibi gereklidir.
          </div>

          {/* Cross-navigation */}
          <NarrativeFooter
            narrative="Sermaye getirisi kâr dağıtımı ve borç trancheleriyle bütünleşik izlenebilir."
            links={[
              { label: 'Kâr Dağıtımı',  href: '/dashboard/partners?tab=distribution' },
              { label: 'Borç Dilimleri', href: '/dashboard/partners?tab=tranches' },
            ]}
          />
        </>
      )}
    </div>
  )
}

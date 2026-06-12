'use client'

// ── GecikmeHesaplayiciClient — Gecikme Faizi Hesaplayıcı ──────────────────────
//
// Computes late interest on overdue Turkish tax payments.
// Rate: 2.5% per month (30-day basis) — informational only.
// Formula: borç × (gecikme_günü / 30) × 0.025

import { useState, useMemo } from 'react'

const MONTHLY_RATE = 0.025 // 2.5% per month

function formatTRY(val: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style:    'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val)
}

function parseDate(s: string): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(s + 'T00:00:00')
  return isNaN(d.getTime()) ? null : d
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86400000))
}

export function GecikmeHesaplayiciClient() {
  const today = new Date().toISOString().slice(0, 10)

  const [borcStr,    setBorcStr]    = useState('')
  const [vadeStr,    setVadeStr]    = useState('')
  const [odemeStr,   setOdemeStr]   = useState(today)

  const result = useMemo(() => {
    const borc   = parseFloat(borcStr.replace(/[^\d.]/g, ''))
    const vade   = parseDate(vadeStr)
    const odeme  = parseDate(odemeStr)
    if (!borc || borc <= 0 || !vade || !odeme) return null
    if (odeme <= vade) return { days: 0, faiz: 0, toplam: borc }
    const days  = daysBetween(vade, odeme)
    const faiz  = borc * (days / 30) * MONTHLY_RATE
    return { days, faiz: Math.round(faiz * 100) / 100, toplam: borc + faiz }
  }, [borcStr, vadeStr, odemeStr])

  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-[#e8eaef] flex items-center justify-between">
        <div>
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Gecikme Faizi Hesaplayıcı</div>
          <p className="text-[10px] text-[#94a3b8] mt-0.5">Vadesi geçen vergi borçları için gecikme faizi hesaplama aracı</p>
        </div>
        <span className="text-[9px] font-bold px-2 py-0.5 rounded border bg-[#f1f5f9] text-[#64748b] border-[#e8eaef]">
          Bilgi amaçlı
        </span>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Input row */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
              Borç Tutarı (₺)
            </label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={borcStr}
              onChange={e => setBorcStr(e.target.value)}
              className="w-full text-xs border border-[#e8eaef] rounded px-2.5 py-2 font-mono text-[#0f172a] placeholder:text-[#cbd5e1] focus:outline-none focus:border-warn/40 focus:ring-1 focus:ring-warn/20 transition-colors"
            />
          </div>
          <div>
            <label className="block text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
              Vade Tarihi
            </label>
            <input
              type="date"
              value={vadeStr}
              onChange={e => setVadeStr(e.target.value)}
              className="w-full text-xs border border-[#e8eaef] rounded px-2.5 py-2 text-[#0f172a] focus:outline-none focus:border-warn/40 focus:ring-1 focus:ring-warn/20 transition-colors"
            />
          </div>
          <div>
            <label className="block text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
              Ödeme Tarihi
            </label>
            <input
              type="date"
              value={odemeStr}
              onChange={e => setOdemeStr(e.target.value)}
              className="w-full text-xs border border-[#e8eaef] rounded px-2.5 py-2 text-[#0f172a] focus:outline-none focus:border-warn/40 focus:ring-1 focus:ring-warn/20 transition-colors"
            />
          </div>
        </div>

        {/* Result strip */}
        {result && (
          <div className={`rounded border px-4 py-3 grid grid-cols-3 gap-4 ${
            result.days > 0
              ? 'bg-neg-light/30 border-neg/20'
              : 'bg-pos-light border-pos-light'
          }`}>
            <div className="text-center">
              <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">Gecikme Süresi</div>
              <div className={`text-xl font-black tabular-nums ${result.days > 0 ? 'text-neg' : 'text-pos-text'}`}>
                {result.days} gün
              </div>
            </div>
            <div className="text-center border-x border-[#e8eaef]">
              <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">Gecikme Faizi</div>
              <div className={`text-xl font-black tabular-nums ${result.faiz > 0 ? 'text-neg' : 'text-pos-text'}`}>
                {formatTRY(result.faiz)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">Toplam Ödeme</div>
              <div className="text-xl font-black tabular-nums text-warn-text">
                {formatTRY(result.toplam)}
              </div>
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <p className="text-[9px] text-[#94a3b8] border-t border-[#f1f5f9] pt-2">
          %2.5 aylık gecikme faizi oranı kullanılmaktadır (30 günlük ay esası). Bu araç bilgi amaçlıdır;
          resmi vergi hesaplamaları için Mali Müşavirinize veya GİB sistemine başvurunuz.
        </p>
      </div>
    </div>
  )
}

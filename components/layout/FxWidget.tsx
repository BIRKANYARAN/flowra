'use client'
// FxWidget — full behavior preserved; styling updated to design-system tokens.

import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'

interface FxData {
  USD:        number
  EUR:        number
  source:     string
  rate_date:  string | null
  fetched_at: string | null
}

function fxSourceLabel(s: string): string {
  if (s === 'tcmb_today')             return 'TCMB'
  if (s === 'tcmb_last_business_day') return 'TCMB (Son İş Günü)'
  if (s === 'db')                     return 'TCMB (Kayıtlı)'
  return 'Veri yok'
}

function fmtRateDate(iso: string | null): string {
  if (!iso) return ''
  try {
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch { return iso }
}

function fmtTimestamp(iso: string | null): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

interface Props {
  initialFx: FxData
}

export function FxWidget({ initialFx }: Props) {
  const [fx, setFx]               = useState<FxData>(initialFx)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshErr, setRefreshErr] = useState('')

  const fxOk       = Number(fx.USD) > 0 && Number(fx.EUR) > 0
  const fxIsOld    = fx.source === 'tcmb_last_business_day'
  const fxFallback = fx.source === 'fallback'

  async function refresh() {
    setRefreshing(true)
    setRefreshErr('')
    try {
      const res  = await fetch('/api/fx', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) {
        setRefreshErr(data.error || 'Kur alınamadı')
      } else {
        setFx({
          USD:        Number(data.USD || 0),
          EUR:        Number(data.EUR || 0),
          source:     data.source || 'fallback',
          rate_date:  data.rate_date || null,
          fetched_at: new Date().toISOString(),
        })
      }
    } catch {
      setRefreshErr('Ağ hatası — kur güncellenemedi')
    }
    setRefreshing(false)
  }

  return (
    <div className={`rounded-2xl px-4 py-3 border flex items-center justify-between gap-6 flex-wrap ${
      fxFallback ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'
    }`}>
      {/* Left — label + badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Güncel Kur</span>
        {fxIsOld    && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">Son iş günü</span>}
        {fxFallback && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">Veri alınamadı</span>}
        {refreshErr && <span className="text-xs text-red-600">{refreshErr}</span>}
      </div>

      {/* Right — rates + meta + refresh */}
      <div className="flex items-center gap-6 flex-wrap">
        {fxOk ? (
          <>
            <RatePair label="USD / TRY" value={fx.USD} />
            <div className="w-px h-8 bg-gray-100 hidden sm:block" />
            <RatePair label="EUR / TRY" value={fx.EUR} />
            <div className="text-[10px] text-gray-400 text-right space-y-0.5">
              <div>Kaynak: {fxSourceLabel(fx.source)}</div>
              {fx.rate_date  && <div className="tabular-nums">Kur: {fmtRateDate(fx.rate_date)}</div>}
              {fx.fetched_at && <div className="tabular-nums">Güncellendi: {fmtTimestamp(fx.fetched_at)}</div>}
            </div>
          </>
        ) : (
          <span className="text-xs text-amber-700">Kur bilgisi şu an mevcut değil.</span>
        )}

        <button
          onClick={refresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border bg-white border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          aria-label="Kurları güncelle"
        >
          <Icon name="refresh" size={12} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Güncelleniyor…' : 'Yenile'}
        </button>
      </div>
    </div>
  )
}

function RatePair({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">{label}</div>
      <div className="text-lg font-black tabular-nums text-gray-900">₺{Number(value).toFixed(4)}</div>
    </div>
  )
}

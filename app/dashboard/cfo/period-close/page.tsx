'use client'

// /dashboard/cfo/period-close — Dönem Kapanış Workflow
// Lists accounting periods and allows close + lock transitions.

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Period {
  id:           string
  period_start: string
  period_end:   string
  status:       'open' | 'pre_close' | 'closed' | 'locked'
  closed_at?:   string | null
  locked_at?:   string | null
}

const STATUS_LABEL: Record<Period['status'], string> = {
  open:      'Açık',
  pre_close: 'Kapanış Hazırlığı',
  closed:    'Kapalı',
  locked:    'Kilitli',
}

const STATUS_COLOR: Record<Period['status'], string> = {
  open:      'bg-blue-50 text-blue-700',
  pre_close: 'bg-amber-50 text-amber-700',
  closed:    'bg-emerald-50 text-emerald-700',
  locked:    'bg-gray-100 text-gray-500',
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' })
}

function Skeleton() { return <div className="bg-gray-100 rounded-xl h-16 animate-pulse" /> }

export default function PeriodClosePage() {
  const [periods,  setPeriods]  = useState<Period[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [working,  setWorking]  = useState<string | null>(null)  // period id being acted on
  const [feedback, setFeedback] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch('/api/periods')
      .then(r => r.json())
      .then(d => setPeriods(Array.isArray(d) ? d : d.periods ?? []))
      .catch(() => setError('Dönemler yüklenemedi'))
      .finally(() => setLoading(false))
  }, [])

  async function closePeriod(periodId: string) {
    setWorking(periodId)
    setFeedback(f => ({ ...f, [periodId]: '' }))
    try {
      const res  = await fetch(`/api/periods/${periodId}/close`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setFeedback(f => ({ ...f, [periodId]: data.error ?? 'Dönem kapatılamadı' }))
      } else {
        setPeriods(prev => prev.map(p => p.id === periodId ? { ...p, status: 'closed', closed_at: new Date().toISOString() } : p))
        setFeedback(f => ({ ...f, [periodId]: 'Dönem kapatıldı.' }))
      }
    } catch {
      setFeedback(f => ({ ...f, [periodId]: 'Ağ hatası.' }))
    }
    setWorking(null)
  }

  async function lockPeriod(periodId: string) {
    if (!confirm('Bu dönem kilitlenecek. Bu işlem geri alınamaz. Emin misiniz?')) return
    setWorking(periodId)
    setFeedback(f => ({ ...f, [periodId]: '' }))
    try {
      const res  = await fetch(`/api/periods/${periodId}/lock`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ confirm: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFeedback(f => ({ ...f, [periodId]: data.error ?? 'Dönem kilitlenemedi' }))
      } else {
        setPeriods(prev => prev.map(p => p.id === periodId ? { ...p, status: 'locked', locked_at: new Date().toISOString() } : p))
        setFeedback(f => ({ ...f, [periodId]: 'Dönem kilitlendi.' }))
      }
    } catch {
      setFeedback(f => ({ ...f, [periodId]: 'Ağ hatası.' }))
    }
    setWorking(null)
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight">Dönem Kapanış Yönetimi</h1>
          <p className="text-xs text-gray-400 mt-0.5">Muhasebe dönemlerini kapat ve kilitle</p>
        </div>
        <Link href="/dashboard/cfo" className="text-xs text-gray-400 hover:text-primary-600 font-semibold">
          ← CFO Cockpit
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading && (
        <div className="flex flex-col gap-2">{[1,2,3].map(i => <Skeleton key={i} />)}</div>
      )}

      {!loading && periods.length === 0 && !error && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-10 text-center">
          <div className="text-2xl mb-2">📅</div>
          <div className="text-sm font-semibold text-gray-500">Muhasebe dönemi bulunamadı</div>
          <div className="text-xs text-gray-400 mt-1">Dönem oluşturmak için Ayarlar → Dönem Yönetimi kullanın.</div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {periods.map(p => {
          const isWorking = working === p.id
          const msg = feedback[p.id]

          return (
            <div key={p.id} className="bg-white border border-gray-200 rounded-xl px-5 py-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-gray-900">
                      {fmt(p.period_start)} — {fmt(p.period_end)}
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_COLOR[p.status]}`}>
                      {STATUS_LABEL[p.status]}
                    </span>
                  </div>
                  {p.closed_at && (
                    <div className="text-[10px] text-gray-400">
                      Kapatıldı: {fmt(p.closed_at)}
                      {p.locked_at && ` · Kilitlendi: ${fmt(p.locked_at)}`}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {p.status === 'open' || p.status === 'pre_close' ? (
                    <button
                      onClick={() => closePeriod(p.id)}
                      disabled={isWorking}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
                    >
                      {isWorking ? 'İşleniyor...' : 'Dönemi Kapat'}
                    </button>
                  ) : p.status === 'closed' ? (
                    <button
                      onClick={() => lockPeriod(p.id)}
                      disabled={isWorking}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-800 text-white hover:bg-gray-900 disabled:opacity-50 transition-colors"
                    >
                      {isWorking ? 'Kilitleniyor...' : 'Kilitle'}
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400 font-semibold">Kilitli — salt okunur</span>
                  )}

                  <Link
                    href={`/dashboard/cfo/trial-balance?period_id=${p.id}`}
                    className="text-xs text-primary-600 hover:text-primary-700 font-semibold px-2 py-1.5 rounded-lg hover:bg-primary-50 transition-colors"
                  >
                    Mizan →
                  </Link>
                </div>
              </div>

              {msg && (
                <div className={`mt-2 text-xs px-3 py-2 rounded-lg ${msg.includes('Dönem kapatıldı') || msg.includes('kilitlendi') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                  {msg}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700 leading-relaxed">
        <span className="font-bold">Not:</span> Dönem kapatma için mizan dengeli ve mutabakat kritik uyuşmazlık içermemelidir.
        Kilit işlemi geri alınamaz — tüm finansal yazma işlemleri bu dönem için engellenir.
      </div>
    </div>
  )
}

'use client'

// /dashboard/cfo/period-close — Dönem Kapanış Workflow
// Lists accounting periods, shows pre-close checklist, allows close + lock transitions.

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { fmtDate as fmt } from '@/lib/format'

interface Period {
  id:           string
  period_start: string
  period_end:   string
  status:       'open' | 'pre_close' | 'closed' | 'locked'
  closed_at?:   string | null
  locked_at?:   string | null
}

// ── Pre-close checklist definition ───────────────────────────────────────────
// required = true → must be checked before Close button activates
const CHECKLIST = [
  { key: 'trial_balance',       label: 'Mizan dengesi kontrol edildi',  required: true,  hint: 'Mizan görünümünden tüm hesapların dengeli olduğunu doğrulayın.' },
  { key: 'bank_reconciliation', label: 'Banka mutabakatı tamamlandı',   required: true,  hint: 'Bankadaki bakiye ile sistemdeki 102 hesap bakiyesi eşleşiyor.' },
  { key: 'all_sales_entered',   label: 'Tüm satış faturaları girildi',  required: true,  hint: 'Dönem içindeki tüm satış faturaları sisteme yüklendi.' },
  { key: 'all_expenses_entered',label: 'Tüm masraflar girildi',         required: true,  hint: 'Dönem içindeki tüm masraflar (faturalar dahil) kayıt altına alındı.' },
  { key: 'kdv_calculated',      label: 'KDV beyanı hesaplandı',         required: true,  hint: 'Hesaplanan KDV - İndirilecek KDV = Beyanname tutarı doğrulandı.' },
  { key: 'stock_counted',       label: 'Stok sayımı yapıldı',           required: false, hint: 'Fiziksel stok, sistemdeki stok ile karşılaştırıldı.' },
  { key: 'compensation_paid',   label: 'Ortak huzur hakkı işlendi',     required: false, hint: 'Dönem huzur hakları masraf olarak girildi (TTK 394).' },
  { key: 'interest_accrued',    label: 'Faiz tahakkukları hesaplandı',  required: false, hint: 'Ortak borçlarına ait faiz tahakkukları işlendi.' },
] as const

type ChecklistKey = typeof CHECKLIST[number]['key']

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<Period['status'], string> = {
  open:      'Açık',
  pre_close: 'Kapanış Hazırlığı',
  closed:    'Kapalı',
  locked:    'Kilitli',
}

const STATUS_COLOR: Record<Period['status'], string> = {
  open:      'bg-info-light text-info-text',
  pre_close: 'bg-warn-light text-warn-text',
  closed:    'bg-pos-light text-pos-text',
  locked:    'bg-[#f1f5f9] text-[#64748b]',
}

function Skeleton() { return <div className="bg-[#f1f5f9] rounded h-16 animate-pulse" /> }

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PeriodClosePage() {
  const [periods,   setPeriods]   = useState<Period[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [working,   setWorking]   = useState<string | null>(null)
  const [feedback,  setFeedback]  = useState<Record<string, string>>({})
  const [expanded,  setExpanded]  = useState<string | null>(null)
  const [checklist, setChecklist] = useState<Record<string, Set<ChecklistKey>>>({})

  useEffect(() => {
    const ctrl = new AbortController()
    fetch('/api/periods', { signal: ctrl.signal })
      .then(r => r.json())
      .then(d => {
        const list: Period[] = Array.isArray(d) ? d : d.periods ?? []
        setPeriods(list)
        // Auto-expand the first open/pre_close period
        const first = list.find(p => p.status === 'open' || p.status === 'pre_close')
        if (first) setExpanded(first.id)
      })
      .catch(err => { if (err.name !== 'AbortError') setError('Dönemler yüklenemedi') })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [])

  function toggleChecklistItem(periodId: string, key: ChecklistKey) {
    setChecklist(prev => {
      const current = new Set(prev[periodId] ?? [])
      if (current.has(key)) current.delete(key); else current.add(key)
      return { ...prev, [periodId]: current }
    })
  }

  function isCloseEnabled(periodId: string): boolean {
    const checked = checklist[periodId] ?? new Set()
    return CHECKLIST.filter(i => i.required).every(i => checked.has(i.key))
  }

  async function closePeriod(periodId: string) {
    if (!isCloseEnabled(periodId)) return
    setWorking(periodId)
    setFeedback(f => ({ ...f, [periodId]: '' }))
    try {
      const res  = await fetch(`/api/periods/${periodId}/close`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setFeedback(f => ({ ...f, [periodId]: data.error ?? 'Dönem kapatılamadı' }))
      } else {
        setPeriods(prev => prev.map(p => p.id === periodId ? { ...p, status: 'closed', closed_at: new Date().toISOString() } : p))
        setFeedback(f => ({ ...f, [periodId]: '✓ Dönem kapatıldı.' }))
        setExpanded(null)
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
        setFeedback(f => ({ ...f, [periodId]: '✓ Dönem kilitlendi.' }))
      }
    } catch {
      setFeedback(f => ({ ...f, [periodId]: 'Ağ hatası.' }))
    }
    setWorking(null)
  }

  const requiredCount = CHECKLIST.filter(i => i.required).length

  return (
    <div className="flex flex-col gap-4 max-w-3xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-[#0f172a] tracking-tight">Dönem Kapanış Yönetimi</h1>
          <p className="text-xs text-[#94a3b8] mt-0.5">
            Muhasebe dönemlerini kapat ve kilitle — kapanış için {requiredCount} zorunlu kontrol
          </p>
        </div>
        <Link href="/dashboard/cfo" className="text-xs text-[#94a3b8] hover:text-brand-light font-semibold">
          ← CFO Cockpit
        </Link>
      </div>

      {error && (
        <div className="bg-neg-light border border-neg-light rounded px-4 py-3 text-sm text-neg-text">{error}</div>
      )}

      {loading && (
        <div className="flex flex-col gap-2">{[1,2,3].map(i => <Skeleton key={i} />)}</div>
      )}

      {!loading && periods.length === 0 && !error && (
        <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-4 py-10 text-center">
          <div className="text-xs font-medium text-[#334155] mb-1">Muhasebe dönemi bulunamadı</div>
          <div className="text-xs text-[#94a3b8] mt-1">Dönem oluşturmak için Ayarlar → Dönem Yönetimi kullanın.</div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {periods.map(p => {
          const isWorking  = working === p.id
          const msg        = feedback[p.id]
          const isOpen     = p.status === 'open' || p.status === 'pre_close'
          const isExpanded = expanded === p.id && isOpen
          const checked    = checklist[p.id] ?? new Set<ChecklistKey>()
          const reqChecked = CHECKLIST.filter(i => i.required && checked.has(i.key)).length
          const canClose   = isCloseEnabled(p.id)

          return (
            <div key={p.id} className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">

              {/* Period header row */}
              <div className="px-5 py-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-bold text-[#0f172a]">
                        {fmt(p.period_start)} — {fmt(p.period_end)}
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STATUS_COLOR[p.status]}`}>
                        {STATUS_LABEL[p.status]}
                      </span>
                      {isOpen && (
                        <span className="text-[10px] text-[#94a3b8]">
                          {reqChecked}/{requiredCount} zorunlu kontrol
                        </span>
                      )}
                    </div>
                    {p.closed_at && (
                      <div className="text-[10px] text-[#94a3b8]">
                        Kapatıldı: {fmt(p.closed_at)}
                        {p.locked_at && ` · Kilitlendi: ${fmt(p.locked_at)}`}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {isOpen && (
                      <button
                        onClick={() => setExpanded(isExpanded ? null : p.id)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded transition-colors ${
                          isExpanded
                            ? 'bg-[#f1f5f9] text-[#64748b] hover:bg-[#e2e8f0]'
                            : 'bg-info-light text-info-text hover:bg-info-light'
                        }`}
                      >
                        {isExpanded ? 'Kapat ▲' : 'Kontrol Listesi ▼'}
                      </button>
                    )}

                    {isOpen ? (
                      <button
                        onClick={() => closePeriod(p.id)}
                        disabled={isWorking || !canClose}
                        title={canClose ? 'Dönemi kapat' : `Kapamak için ${requiredCount} zorunlu kontrolü tamamlayın`}
                        className="text-xs font-bold px-3 py-1.5 rounded bg-warn text-white hover:bg-warn disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {isWorking ? 'İşleniyor...' : 'Dönemi Kapat'}
                      </button>
                    ) : p.status === 'closed' ? (
                      <button
                        onClick={() => lockPeriod(p.id)}
                        disabled={isWorking}
                        className="text-xs font-bold px-3 py-1.5 rounded bg-[#1e293b] text-white hover:bg-[#0f172a] disabled:opacity-50 transition-colors"
                      >
                        {isWorking ? 'Kilitleniyor...' : 'Kilitle'}
                      </button>
                    ) : (
                      <span className="text-xs text-[#94a3b8] font-semibold">Kilitli — salt okunur</span>
                    )}

                    <Link
                      href={`/dashboard/cfo/trial-balance?period_id=${p.id}`}
                      className="text-xs text-brand-light hover:text-brand font-semibold px-2 py-1.5 rounded hover:bg-brand-subtle transition-colors"
                    >
                      Mizan →
                    </Link>
                  </div>
                </div>

                {msg && (
                  <div className={`mt-2 text-xs px-3 py-2 rounded ${
                    msg.startsWith('✓') ? 'bg-pos-light text-pos-text' : 'bg-neg-light text-neg'
                  }`}>
                    {msg}
                  </div>
                )}
              </div>

              {/* Checklist panel */}
              {isExpanded && (
                <div className="border-t border-[#e2e8f0] px-5 py-4 bg-[#f8fafc]/60">
                  <p className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
                    Kapanış Kontrol Listesi — {reqChecked}/{requiredCount} zorunlu tamamlandı
                  </p>

                  <div className="space-y-2">
                    {CHECKLIST.map(item => {
                      const isDone = checked.has(item.key)
                      return (
                        <label
                          key={item.key}
                          className={`flex items-start gap-3 p-2.5 rounded cursor-pointer transition-colors group ${
                            isDone ? 'bg-pos-light' : 'bg-white hover:bg-[#f8fafc]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isDone}
                            onChange={() => toggleChecklistItem(p.id, item.key)}
                            className="mt-0.5 w-4 h-4 rounded text-pos border-[#e2e8f0] cursor-pointer"
                          />
                          <div className="flex-1 min-w-0">
                            <div className={`text-xs font-semibold ${isDone ? 'text-pos-text line-through' : 'text-[#1e293b]'}`}>
                              {item.label}
                              {item.required
                                ? <span className="ml-1.5 text-[9px] font-bold text-neg uppercase tracking-widest">Zorunlu</span>
                                : <span className="ml-1.5 text-[9px] font-bold text-[#94a3b8] uppercase tracking-widest">İsteğe Bağlı</span>
                              }
                            </div>
                            <div className="text-[10px] text-[#94a3b8] mt-0.5">{item.hint}</div>
                          </div>
                          {item.key === 'trial_balance' && (
                            <Link
                              href={`/dashboard/cfo/trial-balance?period_id=${p.id}`}
                              onClick={e => e.stopPropagation()}
                              className="text-[10px] text-brand-light font-semibold hover:underline shrink-0"
                            >
                              Mizan →
                            </Link>
                          )}
                        </label>
                      )
                    })}
                  </div>

                  {!canClose && reqChecked < requiredCount && (
                    <div className="mt-3 px-3 py-2 bg-warn-light border border-warn-light rounded text-xs text-warn-text">
                      ⚠️ Dönemi kapatmak için {requiredCount - reqChecked} zorunlu kontrol daha tamamlanmalı.
                    </div>
                  )}
                  {canClose && (
                    <div className="mt-3 px-3 py-2 bg-pos-light border border-pos-light rounded text-xs text-pos-text font-semibold">
                      ✓ Tüm zorunlu kontroller tamamlandı — dönem kapatılabilir.
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="bg-info-light border border-info-light rounded px-4 py-3 text-xs text-info-text leading-relaxed">
        <span className="font-bold">Not:</span> API ayrıca mizan dengesi ve mutabakat uyuşmazlıklarını otomatik denetler.
        Kilit işlemi geri alınamaz — tüm finansal yazma işlemleri bu dönem için engellenir.
      </div>

      {/* Cross-navigation */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] text-[#94a3b8] leading-relaxed">
          Dönem kapanışı mizan ve mutabakat kontrolü tamamlandıktan sonra yapılmalı.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link href="/dashboard/cfo/trial-balance" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Mizan →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/cfo/reconciliation" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Mutabakat →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/cfo/journal-entries" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Journal Kayıtları →
          </Link>
        </div>
      </div>
    </div>
  )
}

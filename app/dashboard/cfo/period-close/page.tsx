'use client'

// /dashboard/cfo/period-close — Dönem Kapanış Workflow
// Enhanced with 16-point auto+manual readiness checks from PeriodCloseEnhancedService.

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { Skeleton } from '@/components/ds'
import { fmtDate as fmt } from '@/lib/format'
import type { PeriodCloseReadiness, PeriodCloseCheck } from '@/lib/services/ledger/period-close-enhanced.service'
import { PeriodCloseTab } from '@/app/dashboard/cfo/_tabs/PeriodCloseTab'

interface Period {
  id:           string
  period_start: string
  period_end:   string
  status:       'open' | 'pre_close' | 'closed' | 'locked'
  closed_at?:   string | null
  locked_at?:   string | null
}

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

// ── Check status helpers ──────────────────────────────────────────────────────

function CheckStatusBadge({ check }: { check: PeriodCloseCheck }) {
  const cls = check.status === 'pass'    ? 'bg-pos-light text-pos-text' :
              check.status === 'fail'    ? 'bg-neg-light text-neg' :
              check.status === 'warn'    ? 'bg-warn-light text-warn-text' :
              check.status === 'pending' ? 'bg-[#f1f5f9] text-[#64748b]' :
              'bg-[#f8fafc] text-[#94a3b8]'
  const label = check.status === 'pass'    ? '✓ Geçti' :
                check.status === 'fail'    ? '✗ Başarısız' :
                check.status === 'warn'    ? '⚠ Uyarı' :
                check.status === 'pending' ? '○ Bekleniyor' :
                '– Atlandı'
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cls}`}>{label}</span>
}

// ── Category icons ────────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<PeriodCloseCheck['category'], string> = {
  accounting:  'Muhasebe',
  compliance:  'Uyum',
  partner:     'Ortak',
  documents:   'Belgeler',
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PeriodClosePage() {
  const [periods,       setPeriods]       = useState<Period[]>([])
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState<string | null>(null)
  const [working,       setWorking]       = useState<string | null>(null)
  const [feedback,      setFeedback]      = useState<Record<string, string>>({})
  const [expanded,      setExpanded]      = useState<string | null>(null)

  // Enhanced readiness state (keyed by period id)
  const [readiness,       setReadiness]       = useState<Record<string, PeriodCloseReadiness>>({})
  const [readinessLoading, setReadinessLoading] = useState<Record<string, boolean>>({})

  // Manual check overrides (keyed by `${periodId}:${key}`)
  const [manualChecks, setManualChecks] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const ctrl = new AbortController()
    fetch('/api/periods', { signal: ctrl.signal })
      .then(r => r.json())
      .then(d => {
        const list: Period[] = Array.isArray(d) ? d : d.periods ?? []
        setPeriods(list)
        const first = list.find(p => p.status === 'open' || p.status === 'pre_close')
        if (first) setExpanded(first.id)
      })
      .catch(err => { if (err.name !== 'AbortError') setError('Dönemler yüklenemedi') })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [])

  // Load readiness when a period is expanded
  useEffect(() => {
    if (!expanded) return
    if (readiness[expanded]) return  // already loaded
    setReadinessLoading(prev => ({ ...prev, [expanded]: true }))
    fetch(`/api/periods/close-readiness?period_id=${expanded}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setReadiness(prev => ({ ...prev, [expanded]: data as PeriodCloseReadiness }))
      })
      .catch(() => {/* non-fatal */})
      .finally(() => setReadinessLoading(prev => ({ ...prev, [expanded]: false })))
  }, [expanded, readiness])

  function toggleManual(periodId: string, key: string) {
    const mk = `${periodId}:${key}`
    setManualChecks(prev => ({ ...prev, [mk]: !prev[mk] }))
  }

  function isManualDone(periodId: string, key: string): boolean {
    return manualChecks[`${periodId}:${key}`] === true
  }

  function isCloseEnabled(periodId: string): boolean {
    const r = readiness[periodId]
    if (!r) return false
    return r.can_close
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
    } finally {
      setWorking(null)
    }
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
    } finally {
      setWorking(null)
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-[#0f172a] tracking-tight">Dönem Kapanış Yönetimi</h1>
          <p className="text-xs text-[#94a3b8] mt-0.5">
            16-nokta otomatik + manuel kontrol listesi — tüm bloke kontroller geçmeli
          </p>
        </div>
        <Link href="/dashboard/finance?tab=cfo" className="text-xs text-[#94a3b8] hover:text-brand-light font-semibold">
          ← CFO Cockpit
        </Link>
      </div>

      {/* Period Close Wizard Tab */}
      <section>
        <h2 className="text-base font-bold text-[#0f172a] mb-3">Dönem Kapanış Wizard</h2>
        <PeriodCloseTab />
      </section>

      {error && (
        <div className="bg-neg-light border border-neg-light rounded px-4 py-3 text-xs text-neg-text">{error}</div>
      )}

      {loading && (
        <div className="flex flex-col gap-2">{[1,2,3].map(i => <Skeleton key={i} height="h-16" />)}</div>
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
          const r          = readiness[p.id]
          const rLoading   = readinessLoading[p.id] ?? false
          const canClose   = isCloseEnabled(p.id)

          return (
            <div key={p.id} className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden shadow-sm">

              {/* Period header row */}
              <div className="px-4 py-3">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-bold text-[#0f172a]">
                        {fmt(p.period_start)} — {fmt(p.period_end)}
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STATUS_COLOR[p.status]}`}>
                        {STATUS_LABEL[p.status]}
                      </span>
                      {isOpen && r && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${r.can_close ? 'bg-pos-light text-pos-text' : 'bg-neg-light text-neg'}`}>
                          {r.can_close ? '✓ Kapatılabilir' : `${r.blocking_count} bloke kontrol`}
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
                        title={canClose ? 'Dönemi kapat' : 'Tüm bloke kontroller geçmeli'}
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

              {/* Enhanced Readiness Panel */}
              {isExpanded && (
                <div className="border-t border-[#e2e8f0] px-4 py-3 bg-[#f8fafc]/60">

                  {/* Readiness summary header */}
                  {r && (
                    <div className={`mb-3 px-3 py-2 rounded border flex items-center gap-3 flex-wrap ${
                      r.can_close
                        ? 'bg-pos-light border-pos-light'
                        : 'bg-warn-light border-warn-light'
                    }`}>
                      <div className={`text-xs font-bold ${r.can_close ? 'text-pos-text' : 'text-warn-text'}`}>
                        {r.can_close ? '✓ Dönem kapatılabilir' : `${r.blocking_count} bloke kontrol başarısız`}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-[#64748b] ml-auto flex-wrap">
                        <span>{r.auto_passed_count} otomatik geçti</span>
                        {r.warning_count > 0 && <span className="text-warn-text">{r.warning_count} uyarı</span>}
                        <span>{r.manual_pending_count} manuel bekliyor</span>
                      </div>
                    </div>
                  )}

                  {rLoading && !r && (
                    <div className="flex flex-col gap-1.5 mb-3">
                      {[1,2,3,4].map(i => <Skeleton key={i} height="h-10" />)}
                    </div>
                  )}

                  {r && (
                    <>
                      <p className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
                        Kapanış Kontrol Listesi — {r.checks.length} kontrol
                      </p>

                      {/* Group checks by category */}
                      {(['accounting', 'compliance', 'partner', 'documents'] as Array<PeriodCloseCheck['category']>).map(cat => {
                        const catChecks = r.checks.filter(c => c.category === cat)
                        if (catChecks.length === 0) return null
                        return (
                          <div key={cat} className="mb-3">
                            <p className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">
                              {CATEGORY_LABEL[cat]}
                            </p>
                            <div className="space-y-1.5">
                              {catChecks.map(check => {
                                const isManual  = !check.is_auto
                                const manualOn  = isManual && isManualDone(p.id, check.key)
                                const isDone    = check.status === 'pass' || manualOn
                                const isSkipped = check.status === 'skip'

                                return (
                                  <div
                                    key={check.key}
                                    className={`flex items-start gap-3 p-2.5 rounded ${
                                      isSkipped   ? 'bg-[#f8fafc] opacity-60' :
                                      isDone      ? 'bg-pos-light' :
                                      check.status === 'fail' ? 'bg-neg-light border border-neg-light' :
                                      check.status === 'warn' ? 'bg-warn-light' :
                                      'bg-white hover:bg-[#f8fafc]'
                                    } ${isManual ? 'cursor-pointer' : ''}`}
                                    onClick={() => isManual ? toggleManual(p.id, check.key) : undefined}
                                  >
                                    {/* Checkbox or auto icon */}
                                    {isManual ? (
                                      <input
                                        type="checkbox"
                                        checked={manualOn}
                                        onChange={() => toggleManual(p.id, check.key)}
                                        className="mt-0.5 w-4 h-4 rounded text-pos border-[#e2e8f0] cursor-pointer"
                                        onClick={e => e.stopPropagation()}
                                      />
                                    ) : (
                                      <span className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                                        check.status === 'pass' ? 'bg-pos text-white' :
                                        check.status === 'fail' ? 'bg-neg text-white' :
                                        check.status === 'warn' ? 'bg-warn text-white' :
                                        'bg-[#e2e8f0] text-[#94a3b8]'
                                      }`}>
                                        {check.status === 'pass' ? '✓' : check.status === 'fail' ? '✗' : check.status === 'warn' ? '!' : '–'}
                                      </span>
                                    )}

                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className={`text-xs font-semibold ${isDone ? 'text-pos-text line-through' : isSkipped ? 'text-[#94a3b8] line-through' : check.status === 'fail' ? 'text-neg' : 'text-[#1e293b]'}`}>
                                          {check.label}
                                        </span>
                                        {check.blocking && !isSkipped && (
                                          <span className="text-[9px] font-bold text-neg uppercase tracking-widest">Bloke</span>
                                        )}
                                        {!check.is_auto && (
                                          <span className="text-[9px] font-bold text-[#94a3b8] uppercase tracking-widest">Manuel</span>
                                        )}
                                        {check.is_auto && !isSkipped && (
                                          <span className="text-[9px] font-bold text-info-text uppercase tracking-widest">Otomatik</span>
                                        )}
                                        {!isSkipped && <CheckStatusBadge check={check} />}
                                      </div>
                                      <div className="text-[10px] text-[#94a3b8] mt-0.5">{check.detail}</div>
                                    </div>

                                    {check.action_url && (check.status === 'fail' || check.status === 'warn') && (
                                      <Link
                                        href={check.action_url}
                                        onClick={e => e.stopPropagation()}
                                        className="text-[10px] text-brand-light font-semibold hover:underline shrink-0"
                                      >
                                        Düzelt →
                                      </Link>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}

                      {/* Summary footer */}
                      {r.can_close ? (
                        <div className="mt-3 px-3 py-2 bg-pos-light border border-pos-light rounded text-xs text-pos-text font-semibold">
                          ✓ Tüm bloke kontroller geçti — dönem kapatılabilir.
                        </div>
                      ) : (
                        <div className="mt-3 px-3 py-2 bg-warn-light border border-warn-light rounded text-xs text-warn-text">
                          {r.blocking_count} bloke kontrol başarısız — dönemi kapatmak için bunları düzeltin.
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="bg-info-light border border-info-light rounded px-4 py-3 text-xs text-info-text leading-relaxed">
        <span className="font-bold">Not:</span> Otomatik kontroller canlı verilerden hesaplanır.
        Bloke kontrollerin tamamı geçmeden dönem kapatılamaz. Uyarılar kapatmayı engellemez.
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
          <Link href="/dashboard/cfo/bank-reconciliation" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Banka Mutabakatı →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/cfo/journal-entries" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Journal →
          </Link>
        </div>
      </div>
    </div>
  )
}

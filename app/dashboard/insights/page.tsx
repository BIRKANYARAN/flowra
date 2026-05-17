'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { AnomalyResult, CustomerRisk } from '@/lib/engines/anomaly.engine'
import type { DuplicateGroup }              from '@/lib/engines/duplicate-detector'
import type { AISummaryResult }             from '@/lib/services/ai-summary.service'
import type { SituationResult }             from '@/lib/engines/situation.engine'
import type { DecisionAlert }               from '@/lib/engines/alert.engine'
import { fmtCompact as fmtTRY }             from '@/lib/format'

// ── Types for API responses ────────────────────────────────────────────────

interface AnomalyData {
  revenue_anomalies: AnomalyResult[]
  expense_anomalies: AnomalyResult[]
  customer_risks:    CustomerRisk[]
}

interface DuplicateData {
  duplicates:       DuplicateGroup[]
  count:            number
  high_confidence:  number
}

interface SummaryData {
  situation: SituationResult
  alerts:    DecisionAlert[]
  summary:   AISummaryResult
}

// ── Severity colours ───────────────────────────────────────────────────────

const SEV: Record<string, string> = {
  high:   'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low:    'bg-blue-100 text-blue-700 border-blue-200',
}

const STATUS_THEME: Record<string, { band: string; badge: string; text: string }> = {
  healthy:  { band: 'bg-emerald-50 border-emerald-200', badge: 'bg-emerald-600', text: 'text-emerald-700' },
  caution:  { band: 'bg-amber-50 border-amber-200',    badge: 'bg-amber-500',   text: 'text-amber-700'   },
  'at-risk':{ band: 'bg-orange-50 border-orange-200',  badge: 'bg-orange-500',  text: 'text-orange-700'  },
  critical: { band: 'bg-red-50 border-red-200',        badge: 'bg-red-600',     text: 'text-red-700'     },
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const [anomalies, setAnomalies] = useState<AnomalyData | null>(null)
  const [duplicates,setDuplicates]= useState<DuplicateData | null>(null)
  const [summary,   setSummary]   = useState<SummaryData | null>(null)

  const [loadingA, setLoadingA] = useState(true)
  const [loadingD, setLoadingD] = useState(true)
  const [loadingS, setLoadingS] = useState(true)

  const [errorA, setErrorA] = useState<string | null>(null)
  const [errorD, setErrorD] = useState<string | null>(null)
  const [errorS, setErrorS] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    fetch('/api/insights/anomalies', { signal })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((d: AnomalyData) => setAnomalies(d))
      .catch(e => { if (e.name !== 'AbortError') setErrorA(e.message ?? 'Yüklenemedi') })
      .finally(() => setLoadingA(false))

    fetch('/api/insights/duplicates', { signal })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((d: DuplicateData) => setDuplicates(d))
      .catch(e => { if (e.name !== 'AbortError') setErrorD(e.message ?? 'Yüklenemedi') })
      .finally(() => setLoadingD(false))

    fetch('/api/insights/situation-summary', { signal })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((d: SummaryData) => setSummary(d))
      .catch(e => { if (e.name !== 'AbortError') setErrorS(e.message ?? 'Yüklenemedi') })
      .finally(() => setLoadingS(false))

    return () => controller.abort()
  }, [])

  const theme = STATUS_THEME[summary?.situation?.status ?? 'caution']

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight">AI İçgörüler</h1>
          <p className="text-xs text-gray-400 mt-0.5">Anomali tespiti · Kopya masraf · Durum özeti</p>
        </div>
        <Link href="/dashboard" className="text-xs text-gray-400 hover:text-primary-600 font-semibold">← Dashboard</Link>
      </div>

      {/* ── AI Situation Summary ─────────────────────────────────────────── */}
      <div>
        <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">AI Durum Özeti</div>
        {loadingS && <div className="bg-gray-100 rounded-xl h-32 animate-pulse" />}
        {!loadingS && errorS && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">Durum özeti yüklenemedi: {errorS}</div>
        )}
        {!loadingS && !errorS && summary && (
          <div className={`rounded-xl border p-4 ${theme.band}`}>
            <div className="flex items-start gap-3">
              <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${theme.badge}`} />
              <div className="flex-1">
                <p className={`text-sm font-semibold leading-relaxed ${theme.text}`}>
                  {summary.summary.summary_tr}
                </p>
                <ul className="mt-2 space-y-1">
                  {summary.summary.key_factors.map((f, i) => (
                    <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                      <span className="text-gray-400 mt-0.5">•</span>{f}
                    </li>
                  ))}
                </ul>
                <div className="mt-2 text-xs font-semibold text-gray-700 bg-white/60 rounded-lg px-3 py-1.5 inline-block">
                  Öneri: {summary.summary.recommendation}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-2xl font-black tabular-nums text-gray-900">
                  {summary.situation.composite}
                </div>
                <div className="text-[10px] text-gray-400">/ 100</div>
                <div className={`text-[10px] font-bold mt-0.5 ${theme.text}`}>
                  {summary.summary.generated_by === 'ai' ? '✦ AI' : '⚙ Kural'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Revenue + Expense Anomalies ──────────────────────────────────── */}
      <div>
        <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Gelir & Gider Anomalileri</div>
        {loadingA && <div className="bg-gray-100 rounded-xl h-24 animate-pulse" />}
        {!loadingA && anomalies && (
          <>
            {(anomalies.revenue_anomalies.length + anomalies.expense_anomalies.length) === 0 ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700 font-semibold">
                Anlamlı gelir veya gider anomalisi tespit edilmedi
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-50">
                {[...anomalies.revenue_anomalies, ...anomalies.expense_anomalies].map((a, i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${SEV[a.severity]}`}>
                      {a.severity === 'high' ? 'YÜK' : a.severity === 'medium' ? 'ORT' : 'DÜŞ'}
                    </span>
                    <div className="flex-1">
                      <p className="text-xs text-gray-700">{a.message}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {a.month} · Gerçek: {fmtTRY(a.actual)} · Ortalama: {fmtTRY(a.mean)}
                        {' '}· {a.direction === 'spike' ? '▲' : '▼'} %{Math.abs(a.deviation_pct)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Customer Risk ────────────────────────────────────────────────── */}
      {!loadingA && anomalies && anomalies.customer_risks.filter(r => r.risk_level !== 'low').length > 0 && (
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Müşteri Risk Skoru</div>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-50">
            {anomalies.customer_risks
              .filter(r => r.risk_level !== 'low')
              .slice(0, 6)
              .map((r, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-gray-900">{r.customer_name}</div>
                    <div className="text-[10px] text-gray-400">
                      Ort. {r.avg_days_late} gün gecikme · {r.overdue_count} gecikmiş işlem · {fmtTRY(r.total_overdue)} açık
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${r.risk_level === 'high' ? 'bg-red-500' : 'bg-amber-400'}`}
                        style={{ width: `${r.risk_score}%` }}
                      />
                    </div>
                    <span className={`text-xs font-black tabular-nums ${r.risk_level === 'high' ? 'text-red-600' : 'text-amber-600'}`}>
                      {r.risk_score}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── Duplicate Expenses ───────────────────────────────────────────── */}
      <div>
        <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
          CFO: Olası Kopya Masraflar
          {duplicates && duplicates.high_confidence > 0 && (
            <span className="ml-2 bg-red-100 text-red-700 text-[10px] px-1.5 py-0.5 rounded-full font-black">
              {duplicates.high_confidence} yüksek güven
            </span>
          )}
        </div>
        {loadingD && <div className="bg-gray-100 rounded-xl h-24 animate-pulse" />}
        {!loadingD && duplicates && (
          <>
            {duplicates.count === 0 ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700 font-semibold">
                Son 90 günde kopya masraf tespit edilmedi
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-50">
                {duplicates.duplicates.slice(0, 8).map((d, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-start gap-3">
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${
                      d.confidence === 'high'
                        ? 'bg-red-100 text-red-700 border-red-200'
                        : 'bg-amber-100 text-amber-700 border-amber-200'
                    }`}>
                      {d.confidence === 'high' ? 'YÜK' : 'ORT'}
                    </span>
                    <div className="flex-1">
                      <p className="text-xs text-gray-700">{d.message}</p>
                      <div className="flex gap-3 mt-0.5">
                        {d.rows.map((r, j) => (
                          <span key={j} className="text-[10px] text-gray-400">
                            {r.expense_date}{r.vendor_name ? ` · ${r.vendor_name}` : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="text-sm font-black text-gray-900 tabular-nums shrink-0">
                      {fmtTRY(d.amount_try)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-gray-400 mt-1.5 px-1">
              Bu öneriler için otomatik işlem yapılmaz. CFO incelemesi ve manuel karar gerektirir.
            </p>
          </>
        )}
      </div>

      {/* Active Alerts strip */}
      {!loadingS && summary?.alerts && summary.alerts.length > 0 && (
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Aktif Uyarılar</div>
          <div className="flex flex-col gap-1.5">
            {summary.alerts.map(a => (
              <Link key={a.id} href={a.actionHref}
                className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 transition-colors hover:opacity-80 ${
                  a.severity === 'critical' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
                }`}>
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                  a.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {a.severity === 'critical' ? 'KRİTİK' : 'UYARI'}
                </span>
                <span className="text-xs font-semibold text-gray-900 flex-1">{a.title}</span>
                <span className="text-[10px] text-gray-400">{a.actionLabel} →</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

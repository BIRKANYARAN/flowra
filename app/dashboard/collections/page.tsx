'use client'

import { useEffect, useState, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface CollectionRow {
  id: string
  customer_name: string
  currency: string
  total: number
  total_try: number
  nominal_profit: number
  created_at: string
  proforma_id: string | null
  payment_status: 'unpaid' | 'paid' | 'partial' | 'overdue'
  paid_at: string | null
  proformas: { proforma_no: string } | null
}

type TabKey = 'unpaid' | 'paid' | 'all'

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtCurrency(n: number, currency = 'TRY') {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(n)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const STATUS_META: Record<string, { label: string; bg: string; text: string; border: string }> = {
  unpaid:  { label: 'Bekliyor',   bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-100' },
  paid:    { label: 'Ödendi',     bg: 'bg-green-50',  text: 'text-green-600',  border: 'border-green-100'  },
  partial: { label: 'Kısmi',      bg: 'bg-yellow-50', text: 'text-yellow-600', border: 'border-yellow-100' },
  overdue: { label: 'Gecikmiş',   bg: 'bg-red-50',    text: 'text-red-600',    border: 'border-red-100'    },
}

// ── StatusBadge ───────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.unpaid
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium border ${m.bg} ${m.text} ${m.border}`}>
      {m.label}
    </span>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CollectionsPage() {
  const [rows,     setRows]     = useState<CollectionRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState<TabKey>('unpaid')
  const [patching, setPatching] = useState<string | null>(null)
  const [error,    setError]    = useState<string | null>(null)

  // ── Data load ───────────────────────────────────────────────────────────────
  const load = useCallback(async (status: TabKey) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/collections?status=${status}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json()
      setRows(Array.isArray(data) ? data : [])
    } catch {
      setError('Tahsilat verileri yüklenemedi. Lütfen sayfayı yenileyin.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(tab) }, [tab, load])

  // ── Status toggle ────────────────────────────────────────────────────────────
  async function markStatus(id: string, next: 'paid' | 'unpaid' | 'partial' | 'overdue') {
    setPatching(id)
    try {
      const res = await fetch('/api/collections', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id, payment_status: next }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Güncelleme başarısız')
      }
      // Optimistic update — remove from current tab if it no longer belongs
      if (tab !== 'all') {
        setRows(prev => prev.filter(r => r.id !== id))
      } else {
        setRows(prev => prev.map(r => r.id === id ? { ...r, payment_status: next, paid_at: next === 'paid' ? new Date().toISOString() : null } : r))
      }
    } catch {
      setError('Ödeme durumu güncellenemedi. Lütfen tekrar deneyin.')
    } finally {
      setPatching(null)
    }
  }

  // ── Summary numbers (computed over visible rows, or "all" from fresh fetch) ──
  const totalVisible    = rows.reduce((s, r) => s + (r.total_try ?? 0), 0)
  const paidVisible     = rows.filter(r => r.payment_status === 'paid').reduce((s, r) => s + (r.total_try ?? 0), 0)
  const unpaidVisible   = rows.filter(r => r.payment_status !== 'paid').reduce((s, r) => s + (r.total_try ?? 0), 0)

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'unpaid', label: 'Bekleyenler' },
    { key: 'paid',   label: 'Ödenenler'   },
    { key: 'all',    label: 'Tümü'        },
  ]

  return (
    <div className="max-w-5xl space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Tahsilat</h1>
          <p className="text-sm text-gray-400 mt-0.5">Satış ödemelerini takip edin</p>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4 shadow-sm">
          <div className="text-xs text-gray-400 font-medium mb-1">Toplam (görünür)</div>
          <div className="text-xl font-black text-gray-900">{loading ? '—' : fmtCurrency(totalVisible)}</div>
          <div className="text-xs text-gray-400 mt-0.5">{rows.length} kayıt</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4 shadow-sm">
          <div className="text-xs text-gray-400 font-medium mb-1">Beklenen tahsilat</div>
          <div className="text-xl font-black text-orange-500">{loading ? '—' : fmtCurrency(unpaidVisible)}</div>
          <div className="text-xs text-gray-400 mt-0.5">{rows.filter(r => r.payment_status !== 'paid').length} satış</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4 shadow-sm">
          <div className="text-xs text-gray-400 font-medium mb-1">Tahsil edildi</div>
          <div className="text-xl font-black text-green-500">{loading ? '—' : fmtCurrency(paidVisible)}</div>
          <div className="text-xs text-gray-400 mt-0.5">{rows.filter(r => r.payment_status === 'paid').length} satış</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              tab === t.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            {tab === 'unpaid' ? 'Bekleyen tahsilat yok 🎉' : 'Kayıt yok'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Müşteri</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Tutar</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">TL Karşılığı</th>
                <th className="text-center px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Durum</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Tarih</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Proforma</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(row => {
                const isPending = patching === row.id
                return (
                  <tr key={row.id} className="hover:bg-gray-50/60 transition-colors">
                    {/* Customer */}
                    <td className="px-5 py-3.5 font-medium text-gray-900">
                      {row.customer_name || '—'}
                    </td>

                    {/* Amount in original currency */}
                    <td className="px-4 py-3.5 text-right font-mono text-gray-700">
                      {fmtCurrency(row.total, row.currency)}
                    </td>

                    {/* Amount in TRY */}
                    <td className="px-4 py-3.5 text-right font-mono text-gray-500 text-xs">
                      {row.currency !== 'TRY' ? fmtCurrency(row.total_try) : '—'}
                    </td>

                    {/* Status badge */}
                    <td className="px-4 py-3.5 text-center">
                      <StatusBadge status={row.payment_status} />
                    </td>

                    {/* Sale date */}
                    <td className="px-4 py-3.5 text-gray-500 text-xs whitespace-nowrap">
                      {fmtDate(row.created_at)}
                    </td>

                    {/* Proforma link */}
                    <td className="px-4 py-3.5 text-xs">
                      {row.proformas?.proforma_no ? (
                        <a
                          href={`/dashboard/proformas?id=${row.proforma_id}`}
                          className="text-primary-500 hover:underline font-mono"
                        >
                          {row.proformas.proforma_no}
                        </a>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>

                    {/* Action button */}
                    <td className="px-4 py-3.5 text-right">
                      {row.payment_status !== 'paid' ? (
                        <button
                          disabled={isPending}
                          onClick={() => markStatus(row.id, 'paid')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-50 text-green-700 hover:bg-green-100 border border-green-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isPending ? (
                            <span className="animate-spin">⟳</span>
                          ) : (
                            <span>✓</span>
                          )}
                          Tahsil Et
                        </button>
                      ) : (
                        <button
                          disabled={isPending}
                          onClick={() => markStatus(row.id, 'unpaid')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-50 text-gray-500 hover:bg-gray-100 border border-gray-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isPending ? (
                            <span className="animate-spin">⟳</span>
                          ) : (
                            <span>↩</span>
                          )}
                          Geri Al
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer note */}
      {!loading && rows.length > 0 && (
        <p className="text-xs text-gray-400 text-center">
          Son 200 kayıt gösteriliyor. Daha eski verilere Analitik sayfasından ulaşabilirsiniz.
        </p>
      )}
    </div>
  )
}

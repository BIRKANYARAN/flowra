'use client'

// ─────────────────────────────────────────────────────────────────────────────
// /dashboard/admin/audit — Company-wide audit log (admin only)
//
// Shows all audit_logs rows for the company with filters:
//   • action (create / update / delete)
//   • entity_type
//   • user_id (which team member performed the action)
// Paginates 50 rows at a time.
// ─────────────────────────────────────────────────────────────────────────────

import { Fragment, useState, useEffect, useCallback, type ChangeEvent } from 'react'
import type { AuditLog } from '@/types'

// ── Style tokens ──────────────────────────────────────────────────────────────
const SEL = 'border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white transition-colors cursor-pointer'

// ── Entity type labels ────────────────────────────────────────────────────────
const ENTITY_LABELS: Record<string, string> = {
  stock_movement:     'Stok Hareketi',
  purchase:           'Satın Alma',
  sale:               'Satış',
  expense:            'Gider',
  recurring_expense:  'Tekrarlayan Gider',
  partner_transaction:'Ortak İşlemi',
  partner:            'Ortak',
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  create: { label: 'Oluşturuldu', color: 'bg-green-100 text-green-700' },
  update: { label: 'Güncellendi', color: 'bg-blue-100  text-blue-700'  },
  delete: { label: 'Silindi',     color: 'bg-red-100   text-red-700'   },
}

const PAGE_SIZE = 50

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminAuditPage() {
  const [logs,      setLogs]      = useState<AuditLog[]>([])
  const [total,     setTotal]     = useState(0)
  const [offset,    setOffset]    = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [error,     setError]     = useState('')

  // Expanded row for old_data / new_data JSON diff
  const [expanded, setExpanded] = useState<string | null>(null)

  // Filters
  const [filterAction,     setFilterAction]     = useState('')
  const [filterEntityType, setFilterEntityType] = useState('')
  const [filterSince,      setFilterSince]      = useState('')

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const load = useCallback(async (off = 0, signal?: AbortSignal) => {
    setLoading(true)
    setError('')

    const params = new URLSearchParams()
    params.set('limit',  String(PAGE_SIZE))
    params.set('offset', String(off))
    if (filterAction)     params.set('action',      filterAction)
    if (filterEntityType) params.set('entity_type', filterEntityType)
    if (filterSince)      params.set('since',        filterSince)

    const res = await fetch(`/api/admin/audit?${params.toString()}`, { signal })
    if (res.status === 403) { setForbidden(true); setLoading(false); return }
    if (!res.ok) { setError('Audit logları yüklenemedi.'); setLoading(false); return }

    const json = await res.json()
    setLogs(json.logs ?? [])
    setTotal(json.total ?? 0)
    setOffset(off)
    setLoading(false)
  }, [filterAction, filterEntityType, filterSince])

  useEffect(() => {
    const ctrl = new AbortController()
    load(0, ctrl.signal).catch(err => { if (err.name !== 'AbortError') setError('Audit logları yüklenemedi.') })
    return () => ctrl.abort()
  }, [load])

  // ── Render ─────────────────────────────────────────────────────────────────

  if (forbidden) {
    return (
      <div className="max-w-lg">
        <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center">
          <div className="text-3xl mb-3">🔒</div>
          <h2 className="font-bold text-red-700 mb-1">Yetkisiz Erişim</h2>
          <p className="text-sm text-red-600">Bu sayfaya yalnızca yöneticiler erişebilir.</p>
        </div>
      </div>
    )
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  return (
    <div className="max-w-5xl">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-black">Denetim Kaydı</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Şirketteki tüm işlem geçmişi · {total.toLocaleString('tr-TR')} kayıt
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-[0_1px_2px_rgba(17,24,39,0.04)] mb-5 flex flex-wrap gap-3 items-end">
        <div>
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">İşlem</div>
          <select
            className={SEL}
            value={filterAction}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setFilterAction(e.target.value)}
          >
            <option value="">Tümü</option>
            <option value="create">Oluşturuldu</option>
            <option value="update">Güncellendi</option>
            <option value="delete">Silindi</option>
          </select>
        </div>
        <div>
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Kayıt Türü</div>
          <select
            className={SEL}
            value={filterEntityType}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setFilterEntityType(e.target.value)}
          >
            <option value="">Tümü</option>
            {Object.entries(ENTITY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Başlangıç Tarihi</div>
          <input
            type="date"
            className={SEL}
            value={filterSince}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setFilterSince(e.target.value ? e.target.value + 'T00:00:00Z' : '')}
          />
        </div>
        <button
          onClick={() => { setFilterAction(''); setFilterEntityType(''); setFilterSince('') }}
          className="text-sm text-gray-400 hover:text-gray-700 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors"
        >
          Sıfırla
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600 mb-5">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Table */}
      {!loading && (
        <>
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
            {logs.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <div className="text-4xl mb-2">📋</div>
                <p className="text-sm">Kayıt bulunamadı.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400">Tarih</th>
                    <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400">Kullanıcı</th>
                    <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400">İşlem</th>
                    <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400">Kayıt Türü</th>
                    <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400">Kayıt ID</th>
                    <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400">Detay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {logs.map(log => {
                    const actionMeta = ACTION_LABELS[log.action] ?? { label: log.action, color: 'bg-gray-100 text-gray-600' }
                    const entityLabel = ENTITY_LABELS[log.entity_type] ?? log.entity_type
                    const isExpanded = expanded === log.id

                    return (
                      <Fragment key={log.id}>
                        <tr
                          className="hover:bg-gray-50/60 transition-colors cursor-pointer"
                          onClick={() => setExpanded(isExpanded ? null : log.id)}
                        >
                          <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap">
                            {new Date(log.created_at).toLocaleString('tr-TR', {
                              day: '2-digit', month: '2-digit', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })}
                          </td>
                          <td className="px-5 py-3">
                            <code className="text-[10px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
                              {log.user_id.slice(0, 8)}…
                            </code>
                          </td>
                          <td className="px-5 py-3">
                            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${actionMeta.color}`}>
                              {actionMeta.label}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-xs text-gray-700">{entityLabel}</td>
                          <td className="px-5 py-3">
                            <code className="text-[10px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
                              {log.entity_id.slice(0, 8)}…
                            </code>
                          </td>
                          <td className="px-5 py-3">
                            <button className="text-xs text-primary-600 hover:text-primary-800 font-medium">
                              {isExpanded ? '▲ Gizle' : '▼ Görüntüle'}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${log.id}-detail`} className="bg-gray-50">
                            <td colSpan={6} className="px-5 py-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                                    Önceki Değer
                                  </div>
                                  <pre className="text-[10px] bg-white border border-gray-100 rounded-xl p-3 overflow-auto max-h-48 text-gray-700">
                                    {log.old_data ? JSON.stringify(log.old_data, null, 2) : '—'}
                                  </pre>
                                </div>
                                <div>
                                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                                    Yeni Değer
                                  </div>
                                  <pre className="text-[10px] bg-white border border-gray-100 rounded-xl p-3 overflow-auto max-h-48 text-gray-700">
                                    {log.new_data ? JSON.stringify(log.new_data, null, 2) : '—'}
                                  </pre>
                                </div>
                              </div>
                              {log.ip_address && (
                                <div className="mt-2 text-[10px] text-gray-400">
                                  IP: {log.ip_address}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between mt-4 px-1">
              <span className="text-xs text-gray-400">
                Sayfa {currentPage} / {totalPages} · {total.toLocaleString('tr-TR')} kayıt
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => load(offset - PAGE_SIZE)}
                  disabled={offset === 0}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
                >
                  ← Önceki
                </button>
                <button
                  onClick={() => load(offset + PAGE_SIZE)}
                  disabled={offset + PAGE_SIZE >= total}
                  className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
                >
                  Sonraki →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

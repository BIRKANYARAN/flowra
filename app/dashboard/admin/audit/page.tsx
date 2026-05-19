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
import Link from 'next/link'
import type { AuditLog } from '@/types'

// ── Style tokens ──────────────────────────────────────────────────────────────
const SEL = 'border border-[#e2e8f0] rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white transition-colors cursor-pointer'

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
  create: { label: 'Oluşturuldu', color: 'bg-pos-light text-pos-text' },
  update: { label: 'Güncellendi', color: 'bg-info-light  text-info-text'  },
  delete: { label: 'Silindi',     color: 'bg-neg-light   text-neg-text'   },
}

const PAGE_SIZE = 50

// ── Chain verify result type (mirrors ChainVerifyResult from audit-chain.service) ────
interface ChainResult {
  is_supported:  boolean
  total_checked: number
  broken_links:  number
  first_broken?: { id: string; created_at: string; expected_hash: string; actual_hash: string }
  ok:            boolean
  from:          string
  to:            string
}

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

  // ── Audit chain integrity ──────────────────────────────────────────────────
  const [chainResult,  setChainResult]  = useState<ChainResult | null>(null)
  const [chainLoading, setChainLoading] = useState(false)
  const [chainError,   setChainError]   = useState('')

  const verifyChain = useCallback(async () => {
    setChainLoading(true)
    setChainError('')
    setChainResult(null)
    try {
      const today  = new Date().toISOString().slice(0, 10)
      const dfl30  = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
      const res    = await fetch(`/api/admin/audit/chain?from=${dfl30}&to=${today}`)
      if (!res.ok) { setChainError('Zincir doğrulama başarısız.'); return }
      setChainResult(await res.json())
    } catch {
      setChainError('Bağlantı hatası.')
    } finally {
      setChainLoading(false)
    }
  }, [])

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
        <div className="bg-neg-light border border-neg-light rounded p-6 text-center">
          <div className="text-3xl mb-3">🔒</div>
          <h2 className="font-bold text-neg-text mb-1">Yetkisiz Erişim</h2>
          <p className="text-sm text-neg">Bu sayfaya yalnızca yöneticiler erişebilir.</p>
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

      {/* ── Audit Chain Integrity ─────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm mb-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-[#94a3b8]">Denetim Zinciri Bütünlüğü</div>
            <div className="text-[10px] text-gray-400 mt-0.5">SHA-256 hash zinciri — son 30 gün</div>
          </div>
          <button
            onClick={verifyChain}
            disabled={chainLoading}
            className="text-xs font-semibold px-3 py-1.5 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {chainLoading ? 'Doğrulanıyor…' : 'Zinciri Doğrula'}
          </button>
        </div>

        {chainError && (
          <div className="text-xs text-neg bg-neg-light border border-neg-light rounded px-3 py-2">
            {chainError}
          </div>
        )}

        {chainResult && !chainError && (
          <div className="mt-2">
            {!chainResult.is_supported ? (
              <div className="flex items-center gap-2 text-xs text-warn-text bg-warn-light border border-warn-light rounded px-3 py-2">
                <span className="text-sm">⚠</span>
                <span>Hash kolonları bu veritabanında henüz aktif değil (migrasyon bekleniyor).</span>
              </div>
            ) : chainResult.total_checked === 0 ? (
              <div className="flex items-center gap-2 text-xs text-gray-500 bg-[#f8fafc] border border-[#e2e8f0] rounded px-3 py-2">
                <span>Seçili aralıkta denetim kaydı bulunamadı.</span>
              </div>
            ) : chainResult.ok ? (
              <div className="flex items-center gap-3 bg-pos-light border border-pos-light rounded px-4 py-3">
                <span className="text-lg">✓</span>
                <div>
                  <div className="text-xs font-bold text-pos-text">Zincir bütün — müdahale tespit edilmedi</div>
                  <div className="text-[10px] text-pos-text mt-0.5">
                    {chainResult.total_checked.toLocaleString('tr-TR')} kayıt doğrulandı · {chainResult.from} – {chainResult.to}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-neg-light border border-neg-light rounded px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm">⛔</span>
                  <div className="text-xs font-bold text-neg-text">
                    Zincir kırık — {chainResult.broken_links} bozuk bağlantı tespit edildi
                  </div>
                </div>
                <div className="text-[10px] text-neg mb-2">
                  {chainResult.total_checked} kayıttan {chainResult.broken_links} tanesi doğrulanamadı. Kayıtlar değiştirilmiş olabilir.
                </div>
                {chainResult.first_broken && (
                  <div className="bg-white border border-neg-light rounded p-3 space-y-1">
                    <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">İlk Bozuk Kayıt</div>
                    <div className="text-[10px] text-gray-700">
                      <span className="text-gray-400">ID:</span>{' '}
                      <code className="bg-neg-light px-1 rounded">{chainResult.first_broken.id}</code>
                    </div>
                    <div className="text-[10px] text-gray-700">
                      <span className="text-gray-400">Tarih:</span>{' '}
                      {new Date(chainResult.first_broken.created_at).toLocaleString('tr-TR')}
                    </div>
                    <div className="text-[10px] text-gray-700 truncate">
                      <span className="text-gray-400">Beklenen:</span>{' '}
                      <code className="text-pos-text">{chainResult.first_broken.expected_hash.slice(0, 24)}…</code>
                    </div>
                    <div className="text-[10px] text-gray-700 truncate">
                      <span className="text-gray-400">Gerçek:</span>{' '}
                      <code className="text-neg">{chainResult.first_broken.actual_hash.slice(0, 24)}…</code>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm mb-5 flex flex-wrap gap-3 items-end">
        <div>
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">İşlem</div>
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
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">Kayıt Türü</div>
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
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">Başlangıç Tarihi</div>
          <input
            type="date"
            className={SEL}
            value={filterSince}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setFilterSince(e.target.value ? e.target.value + 'T00:00:00Z' : '')}
          />
        </div>
        <button
          onClick={() => { setFilterAction(''); setFilterEntityType(''); setFilterSince('') }}
          className="text-sm text-gray-400 hover:text-gray-700 px-3 py-2 rounded hover:bg-[#f8fafc] transition-colors"
        >
          Sıfırla
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-neg-light border border-neg-light rounded px-4 py-3 text-sm text-neg mb-5">
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
          <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
            {logs.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <div className="text-4xl mb-2">📋</div>
                <p className="text-sm">Kayıt bulunamadı.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e2e8f0]">
                    <th className="px-4 py-2 text-left text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Tarih</th>
                    <th className="px-4 py-2 text-left text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Kullanıcı</th>
                    <th className="px-4 py-2 text-left text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">İşlem</th>
                    <th className="px-4 py-2 text-left text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Kayıt Türü</th>
                    <th className="px-4 py-2 text-left text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Kayıt ID</th>
                    <th className="px-4 py-2 text-left text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Detay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {logs.map(log => {
                    const actionMeta = ACTION_LABELS[log.action] ?? { label: log.action, color: 'bg-gray-100 text-gray-600' }
                    const entityLabel = ENTITY_LABELS[log.entity_type] ?? log.entity_type
                    const isExpanded = expanded === log.id

                    return (
                      <Fragment key={log.id}>
                        <tr
                          className="hover:bg-[#f8fafc]/60 transition-colors cursor-pointer"
                          onClick={() => setExpanded(isExpanded ? null : log.id)}
                        >
                          <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">
                            {new Date(log.created_at).toLocaleString('tr-TR', {
                              day: '2-digit', month: '2-digit', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })}
                          </td>
                          <td className="px-4 py-2">
                            <code className="text-[10px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
                              {log.user_id.slice(0, 8)}…
                            </code>
                          </td>
                          <td className="px-4 py-2">
                            <span className={`text-xs font-semibold px-2 py-1 rounded ${actionMeta.color}`}>
                              {actionMeta.label}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-700">{entityLabel}</td>
                          <td className="px-4 py-2">
                            <code className="text-[10px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
                              {log.entity_id.slice(0, 8)}…
                            </code>
                          </td>
                          <td className="px-4 py-2">
                            <button className="text-xs text-primary-600 hover:text-primary-800 font-medium">
                              {isExpanded ? '▲ Gizle' : '▼ Görüntüle'}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${log.id}-detail`} className="bg-[#f8fafc]">
                            <td colSpan={6} className="px-5 py-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
                                    Önceki Değer
                                  </div>
                                  <pre className="text-[10px] bg-white border border-[#e2e8f0] rounded p-3 overflow-auto max-h-48 text-gray-700">
                                    {log.old_data ? JSON.stringify(log.old_data, null, 2) : '—'}
                                  </pre>
                                </div>
                                <div>
                                  <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
                                    Yeni Değer
                                  </div>
                                  <pre className="text-[10px] bg-white border border-[#e2e8f0] rounded p-3 overflow-auto max-h-48 text-gray-700">
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
                  className="px-3 py-1.5 text-xs border border-[#e2e8f0] rounded hover:bg-[#f8fafc] disabled:opacity-40 transition-colors"
                >
                  ← Önceki
                </button>
                <button
                  onClick={() => load(offset + PAGE_SIZE)}
                  disabled={offset + PAGE_SIZE >= total}
                  className="px-3 py-1.5 text-xs border border-[#e2e8f0] rounded hover:bg-[#f8fafc] disabled:opacity-40 transition-colors"
                >
                  Sonraki →
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Cross-navigation */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] text-gray-400 leading-relaxed">
          Denetim izi tüm değişikliklerin yasal kaydıdır — silinmez.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link href="/dashboard/admin/governance" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Yönetişim →
          </Link>
          <span className="text-gray-200">|</span>
          <Link href="/dashboard/admin/users" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Kullanıcılar →
          </Link>
          <span className="text-gray-200">|</span>
          <Link href="/dashboard/cfo/journal-entries" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Journal Kayıtları →
          </Link>
        </div>
      </div>
    </div>
  )
}

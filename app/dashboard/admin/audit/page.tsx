'use client'

// ─────────────────────────────────────────────────────────────────────────────
// /dashboard/admin/audit — Company-wide audit log (admin only)
//
// Shows all audit_logs rows for the company with filters:
//   • action (create / update / delete)
//   • entity_type
//   • user_id (which team member performed the action)
// Paginates 50 rows at a time.
// Chain Integrity Panel at the top with date range picker.
// ─────────────────────────────────────────────────────────────────────────────

import { Fragment, useState, useEffect, useCallback, type ChangeEvent } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { AuditLog } from '@/types'

// ── Style tokens ──────────────────────────────────────────────────────────────
const SEL = 'border border-[#e2e8f0] rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white transition-colors cursor-pointer'

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

// ── Chain verify result type (shape returned by /api/admin/audit/chain, which
//    aggregates the in-DB verify_audit_chain RPC) ──────────────────────────────
interface ChainResult {
  is_supported:  boolean
  total_checked: number
  broken_links:  number
  first_broken?: { id: string; created_at: string; expected_hash: string; actual_hash: string }
  ok:            boolean
  from:          string
  to:            string
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function dfl30Str(): string {
  return new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminAuditPage() {
  const searchParams = useSearchParams()
  const router       = useRouter()

  // ── Date range (from search params, defaulting to last 30 days) ───────────
  const [chainFrom, setChainFrom] = useState<string>(() => searchParams.get('from') ?? dfl30Str())
  const [chainTo,   setChainTo]   = useState<string>(() => searchParams.get('to')   ?? todayStr())

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

  const verifyChain = useCallback(async (from: string, to: string) => {
    setChainLoading(true)
    setChainError('')
    setChainResult(null)

    // Sync search params
    const params = new URLSearchParams()
    params.set('from', from)
    params.set('to',   to)
    router.replace(`?${params.toString()}`, { scroll: false })

    try {
      const res = await fetch(`/api/admin/audit/chain?from=${from}&to=${to}`)
      if (!res.ok) { setChainError('Zincir doğrulama başarısız.'); return }
      setChainResult(await res.json())
    } catch {
      setChainError('Bağlantı hatası.')
    } finally {
      setChainLoading(false)
    }
  }, [router])

  // Run chain verify on mount with default / URL-provided dates
  useEffect(() => {
    verifyChain(chainFrom, chainTo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Fetch audit logs ───────────────────────────────────────────────────────

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

  const totalPages  = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  return (
    <div className="max-w-5xl">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-black">Denetim Kaydı</h1>
        <p className="text-sm text-[#64748b] mt-0.5">
          Şirketteki tüm işlem geçmişi · {total.toLocaleString('tr-TR')} kayıt
        </p>
      </div>

      {/* ── Chain Integrity Panel ──────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded p-4 shadow-sm mb-5">
        <div className="flex items-start justify-between mb-3 gap-4 flex-wrap">
          <div>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Denetim Zinciri Bütünlüğü</div>
            <div className="text-[10px] text-[#94a3b8] mt-0.5">SHA-256 hash zinciri · tarih aralığı seçin</div>
          </div>

          {/* Date range picker + verify button */}
          <div className="flex items-end gap-2 flex-wrap">
            <div>
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Başlangıç</div>
              <input
                type="date"
                className={SEL + ' text-xs'}
                value={chainFrom}
                max={chainTo}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setChainFrom(e.target.value)}
              />
            </div>
            <div>
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Bitiş</div>
              <input
                type="date"
                className={SEL + ' text-xs'}
                value={chainTo}
                min={chainFrom}
                max={todayStr()}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setChainTo(e.target.value)}
              />
            </div>
            <button
              onClick={() => { setChainFrom(dfl30Str()); setChainTo(todayStr()) }}
              className="text-xs text-[#94a3b8] hover:text-[#334155] px-2 py-2 rounded hover:bg-[#f8fafc] transition-colors whitespace-nowrap"
              title="Son 30 güne sıfırla"
            >
              Son 30 Gün
            </button>
            <button
              onClick={() => verifyChain(chainFrom, chainTo)}
              disabled={chainLoading || !chainFrom || !chainTo}
              className="text-xs font-semibold px-3 py-2 bg-brand-light text-white rounded hover:bg-brand disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {chainLoading ? 'Doğrulanıyor…' : 'Zinciri Doğrula'}
            </button>
          </div>
        </div>

        {/* Status badge */}
        {!chainLoading && chainResult && !chainError && chainResult.is_supported && chainResult.total_checked > 0 && (
          <div className="mb-3">
            {chainResult.ok ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-pos-light text-pos-text border border-pos-light">
                ✅ Zincir Bütünlüklü
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-neg-light text-neg-text border border-neg-light">
                ❌ Zincir İhlali Tespit Edildi!
              </span>
            )}
          </div>
        )}

        {chainError && (
          <div className="text-xs text-neg bg-neg-light border border-neg-light rounded px-3 py-2">
            {chainError}
          </div>
        )}

        {chainLoading && (
          <div className="flex items-center gap-2 text-xs text-[#94a3b8] py-2">
            <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            Doğrulanıyor…
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
              <div className="flex items-center gap-2 text-xs text-[#64748b] bg-[#f8fafc] border border-[#e2e8f0] rounded px-3 py-2">
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
                    <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">İlk İhlal</div>
                    <div className="text-[10px] text-[#334155]">
                      <span className="text-[#94a3b8]">ID:</span>{' '}
                      <code className="bg-neg-light px-1 rounded">{chainResult.first_broken.id}</code>
                    </div>
                    <div className="text-[10px] text-[#334155]">
                      <span className="text-[#94a3b8]">Tarih:</span>{' '}
                      {new Date(chainResult.first_broken.created_at).toLocaleString('tr-TR')}
                    </div>
                    <div className="text-[10px] text-[#334155] truncate">
                      <span className="text-[#94a3b8]">Beklenen:</span>{' '}
                      <code className="text-pos-text">{chainResult.first_broken.expected_hash.slice(0, 24)}…</code>
                    </div>
                    <div className="text-[10px] text-[#334155] truncate">
                      <span className="text-[#94a3b8]">Gerçek:</span>{' '}
                      <code className="text-neg">{chainResult.first_broken.actual_hash.slice(0, 24)}…</code>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Audit Log Table + Filters ──────────────────────────────────────── */}

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
          className="text-sm text-[#94a3b8] hover:text-[#334155] px-3 py-2 rounded hover:bg-[#f8fafc] transition-colors"
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
          <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Table */}
      {!loading && (
        <>
          <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
            {logs.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-xs font-medium text-[#334155] mb-1">Kayıt bulunamadı</div>
                <div className="text-[0.65rem] text-[#94a3b8]">Seçili aralıkta denetim faaliyeti yok</div>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e2e8f0]">
                    <th className="px-4 py-2 text-left text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Tarih</th>
                    <th className="px-4 py-2 text-left text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Kullanıcı</th>
                    <th className="px-4 py-2 text-left text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">İşlem</th>
                    <th className="px-4 py-2 text-left text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Kaynak</th>
                    <th className="px-4 py-2 text-left text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Hash</th>
                    <th className="px-4 py-2 text-left text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Detay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {logs.map(log => {
                    const actionMeta  = ACTION_LABELS[log.action] ?? { label: log.action, color: 'bg-[#f1f5f9] text-[#64748b]' }
                    const entityLabel = ENTITY_LABELS[log.entity_type] ?? log.entity_type
                    const isExpanded  = expanded === log.id
                    // content_hash may not exist on the AuditLog type yet (pre-migration)
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const contentHash = (log as any).content_hash as string | null | undefined

                    return (
                      <Fragment key={log.id}>
                        <tr
                          className="hover:bg-[#f8fafc]/60 transition-colors cursor-pointer"
                          onClick={() => setExpanded(isExpanded ? null : log.id)}
                        >
                          <td className="px-4 py-2 text-xs text-[#64748b] whitespace-nowrap">
                            {new Date(log.created_at).toLocaleString('tr-TR', {
                              day: '2-digit', month: '2-digit', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })}
                          </td>
                          <td className="px-4 py-2">
                            <code className="text-[10px] bg-[#f1f5f9] text-[#64748b] rounded px-1.5 py-0.5">
                              {log.user_id.slice(0, 8)}…
                            </code>
                          </td>
                          <td className="px-4 py-2">
                            <span className={`text-xs font-semibold px-2 py-1 rounded ${actionMeta.color}`}>
                              {actionMeta.label}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-xs text-[#334155]">
                            <span className="text-[#64748b]">{entityLabel}</span>
                            <span className="mx-1 text-[#cbd5e1]">·</span>
                            <code className="text-[10px] bg-[#f1f5f9] text-[#64748b] rounded px-1.5 py-0.5">
                              {log.entity_id.slice(0, 8)}…
                            </code>
                          </td>
                          <td className="px-4 py-2">
                            {contentHash ? (
                              <code className="text-[10px] font-mono bg-[#f8fafc] text-[#64748b] border border-[#e2e8f0] rounded px-1.5 py-0.5" title={contentHash}>
                                {contentHash.slice(0, 8)}
                              </code>
                            ) : (
                              <span className="text-[10px] text-[#cbd5e1]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            <button className="text-xs text-brand-light hover:text-brand font-medium">
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
                                  <pre className="text-[10px] bg-white border border-[#e2e8f0] rounded p-3 overflow-auto max-h-48 text-[#334155]">
                                    {log.old_data ? JSON.stringify(log.old_data, null, 2) : '—'}
                                  </pre>
                                </div>
                                <div>
                                  <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
                                    Yeni Değer
                                  </div>
                                  <pre className="text-[10px] bg-white border border-[#e2e8f0] rounded p-3 overflow-auto max-h-48 text-[#334155]">
                                    {log.new_data ? JSON.stringify(log.new_data, null, 2) : '—'}
                                  </pre>
                                </div>
                              </div>
                              {log.ip_address && (
                                <div className="mt-2 text-[10px] text-[#94a3b8]">
                                  IP: {log.ip_address}
                                </div>
                              )}
                              {contentHash && (
                                <div className="mt-1 text-[10px] text-[#94a3b8]">
                                  SHA-256: <code className="font-mono">{contentHash}</code>
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
              <span className="text-xs text-[#94a3b8]">
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
      <div className="flex items-center justify-between px-1 mt-4">
        <p className="text-[10px] text-[#94a3b8] leading-relaxed">
          Denetim izi tüm değişikliklerin yasal kaydıdır — silinmez.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link href="/dashboard/admin/governance" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Yönetişim →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/admin/users" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Kullanıcılar →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/cfo/journal-entries" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap">
            Journal Kayıtları →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link
            href={`/api/admin/audit/export?from=${chainFrom}&to=${chainTo}`}
            target="_blank"
            className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap"
          >
            CSV İndir →
          </Link>
        </div>
      </div>
    </div>
  )
}

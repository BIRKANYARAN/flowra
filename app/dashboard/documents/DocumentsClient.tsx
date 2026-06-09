'use client'

// ─────────────────────────────────────────────────────────────────────────────
// DocumentsClient — Document library for financial documents (TTK 10-year retention)
//
// Three sections:
//   1. Summary bar — total docs, audit readiness %, count by type
//   2. Filter toolbar — type, period, audit required toggle
//   3. Document grid — cards with file info, verification status, actions
//
// Upload form: accepts a URL + metadata (Supabase Storage URL or external link).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams, useRouter }       from 'next/navigation'
import { cn }                               from '@/components/ds'
import { fmtDate }                          from '@/lib/format'
import {
  DOCUMENT_TYPE_LABELS,
  AUDIT_REQUIRED_TYPES,
  ALL_DOCUMENT_TYPES,
} from '@/lib/services/documents/document.service'
import type {
  CompanyDocument,
  DocumentSummary,
  DocumentType,
} from '@/lib/services/documents/document.service'

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function typeColor(t: DocumentType): string {
  const colors: Record<DocumentType, string> = {
    invoice:          'bg-info-light text-info-text border-info-light',
    contract:         'bg-brand-subtle text-brand border-brand-subtle',
    bank_statement:   'bg-green-50 text-green-700 border-green-200',
    board_resolution: 'bg-amber-50 text-amber-700 border-amber-200',
    tax_declaration:  'bg-red-50 text-red-700 border-red-200',
    proof_of_payment: 'bg-teal-50 text-teal-700 border-teal-200',
    audit_report:     'bg-indigo-50 text-indigo-700 border-indigo-200',
    other:            'bg-[#f8fafc] text-[#475569] border-[#e8eaef]',
  }
  return colors[t] ?? 'bg-[#f8fafc] text-[#475569] border-[#e8eaef]'
}

const today = new Date().toISOString().slice(0, 10)

// ── Summary bar ────────────────────────────────────────────────────────────────
function SummaryBar({ summary }: { summary: DocumentSummary }) {
  const readinessPct = summary.audit_readiness_pct
  const readinessColor =
    readinessPct >= 80 ? 'text-green-700' :
    readinessPct >= 50 ? 'text-amber-600' :
    'text-red-600'

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="border border-[#e8eaef] rounded-xl p-3 bg-white">
        <p className="text-xs font-medium text-[#64748b]">Toplam Belge</p>
        <p className="text-2xl font-bold text-[#0f172a] mt-1">{summary.total_documents}</p>
      </div>
      <div className="border border-[#e8eaef] rounded-xl p-3 bg-white">
        <p className="text-xs font-medium text-[#64748b]">Denetim Hazırlığı</p>
        <p className={cn('text-2xl font-bold mt-1', readinessColor)}>
          %{readinessPct}
        </p>
        <p className="text-xs text-[#94a3b8] mt-0.5">
          {summary.audit_required_verified}/{summary.audit_required_total} doğrulandı
        </p>
      </div>
      <div className="border border-[#e8eaef] rounded-xl p-3 bg-white col-span-2">
        <p className="text-xs font-medium text-[#64748b] mb-2">Tür Dağılımı</p>
        <div className="flex flex-wrap gap-1.5">
          {ALL_DOCUMENT_TYPES.filter(t => (summary.by_type[t] ?? 0) > 0).map(t => (
            <span
              key={t}
              className={cn('text-[11px] px-2 py-0.5 rounded border font-medium', typeColor(t))}
            >
              {DOCUMENT_TYPE_LABELS[t]}: {summary.by_type[t]}
            </span>
          ))}
          {ALL_DOCUMENT_TYPES.every(t => !summary.by_type[t]) && (
            <span className="text-xs text-[#94a3b8]">Henüz belge yok</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Upload form ────────────────────────────────────────────────────────────────
interface UploadFormProps {
  onClose:   () => void
  onSuccess: () => void
}

function UploadForm({ onClose, onSuccess }: UploadFormProps) {
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')
  const [form, setForm] = useState({
    document_type:        'invoice' as DocumentType,
    title:                '',
    description:          '',
    file_url:             '',
    file_name:            '',
    document_date:        today,
    linked_resource_type: '',
    is_audit_required:    false,
  })

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(p => ({ ...p, [k]: v }))
  }

  async function handleSave() {
    if (!form.title.trim())     { setErr('Başlık zorunludur'); return }
    if (!form.file_url.trim())  { setErr('Dosya URL zorunludur'); return }
    if (!form.file_name.trim()) { setErr('Dosya adı zorunludur'); return }

    setSaving(true)
    setErr('')
    try {
      const r = await fetch('/api/documents', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          document_type:        form.document_type,
          title:                form.title.trim(),
          description:          form.description.trim() || undefined,
          file_url:             form.file_url.trim(),
          file_name:            form.file_name.trim(),
          document_date:        form.document_date,
          linked_resource_type: form.linked_resource_type || undefined,
          is_audit_required:    form.is_audit_required,
        }),
      })
      if (!r.ok) {
        const d = await r.json() as { error?: string }
        setErr(d.error ?? 'Kayıt hatası')
        return
      }
      onSuccess()
    } catch {
      setErr('Sunucu bağlantı hatası')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border border-brand-subtle rounded-xl p-4 bg-brand-subtle space-y-3">
      <h3 className="text-sm font-semibold text-brand">Yeni Belge Yükle</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-[#475569] mb-1 block">Belge Türü *</label>
          <select
            className="w-full border rounded-lg px-3 py-1.5 text-sm bg-white"
            value={form.document_type}
            onChange={e => set('document_type', e.target.value as DocumentType)}
          >
            {ALL_DOCUMENT_TYPES.map(t => (
              <option key={t} value={t}>{DOCUMENT_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-[#475569] mb-1 block">Belge Tarihi *</label>
          <input
            type="date"
            className="w-full border rounded-lg px-3 py-1.5 text-sm bg-white"
            value={form.document_date}
            onChange={e => set('document_date', e.target.value)}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs text-[#475569] mb-1 block">Başlık *</label>
          <input
            className="w-full border rounded-lg px-3 py-1.5 text-sm bg-white"
            placeholder="Ör: Ocak 2025 Banka Ekstresi"
            value={form.title}
            onChange={e => set('title', e.target.value)}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs text-[#475569] mb-1 block">
            Dosya URL (Supabase Storage veya harici bağlantı) *
          </label>
          <input
            className="w-full border rounded-lg px-3 py-1.5 text-sm bg-white font-mono text-xs"
            placeholder="https://..."
            value={form.file_url}
            onChange={e => set('file_url', e.target.value)}
          />
        </div>

        <div>
          <label className="text-xs text-[#475569] mb-1 block">Dosya Adı *</label>
          <input
            className="w-full border rounded-lg px-3 py-1.5 text-sm bg-white"
            placeholder="ocak-2025-ekstre.pdf"
            value={form.file_name}
            onChange={e => set('file_name', e.target.value)}
          />
        </div>

        <div>
          <label className="text-xs text-[#475569] mb-1 block">İlgili Kayıt Türü (opsiyonel)</label>
          <select
            className="w-full border rounded-lg px-3 py-1.5 text-sm bg-white"
            value={form.linked_resource_type}
            onChange={e => set('linked_resource_type', e.target.value)}
          >
            <option value="">— Bağlantısız —</option>
            <option value="sale">Satış</option>
            <option value="expense">Gider</option>
            <option value="purchase">Satın Alma</option>
            <option value="partner_loan">Ortak Kredisi</option>
            <option value="resolution">Yönetim Kararı</option>
            <option value="period">Dönem</option>
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="text-xs text-[#475569] mb-1 block">Açıklama (opsiyonel)</label>
          <textarea
            rows={2}
            className="w-full border rounded-lg px-3 py-1.5 text-sm bg-white"
            placeholder="Belge hakkında kısa açıklama…"
            value={form.description}
            onChange={e => set('description', e.target.value)}
          />
        </div>

        <div className="sm:col-span-2 flex items-center gap-2">
          <input
            id="audit-req-check"
            type="checkbox"
            className="w-4 h-4 accent-violet-600"
            checked={form.is_audit_required || AUDIT_REQUIRED_TYPES.includes(form.document_type)}
            onChange={e => set('is_audit_required', e.target.checked)}
          />
          <label htmlFor="audit-req-check" className="text-xs text-[#475569]">
            Denetim için zorunlu belge
          </label>
        </div>
      </div>

      {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-xs bg-brand-light text-white px-4 py-1.5 rounded-lg hover:bg-brand disabled:opacity-50 transition-colors"
        >
          {saving ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
        <button
          onClick={onClose}
          className="text-xs text-[#475569] px-3 py-1.5 rounded-lg hover:bg-[#f1f5f9] transition-colors"
        >
          İptal
        </button>
      </div>
    </div>
  )
}

// ── Document card ─────────────────────────────────────────────────────────────
interface DocCardProps {
  doc:         CompanyDocument
  isAdmin:     boolean
  onVerify:    (id: string) => void
  onDelete:    (id: string) => void
  verifying:   string | null
  deleting:    string | null
}

function DocCard({ doc, isAdmin, onVerify, onDelete, verifying, deleting }: DocCardProps) {
  return (
    <div className="border border-[#e8eaef] rounded-xl p-4 bg-white hover:border-[#e8eaef] transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Type + audit badge */}
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className={cn('text-[11px] px-2 py-0.5 rounded border font-medium', typeColor(doc.document_type))}>
              {DOCUMENT_TYPE_LABELS[doc.document_type]}
            </span>
            {doc.is_audit_required && (
              <span className="text-[11px] px-2 py-0.5 rounded border font-medium bg-indigo-50 text-indigo-700 border-indigo-200">
                Denetim
              </span>
            )}
          </div>

          {/* Title */}
          <p className="text-sm font-semibold text-[#0f172a] truncate">{doc.title}</p>

          {/* File info */}
          <p className="text-xs text-[#64748b] mt-0.5 truncate">
            {doc.file_name}
            {doc.file_size_bytes ? <span className="ml-2 text-[#94a3b8]">{fmtBytes(doc.file_size_bytes)}</span> : null}
          </p>

          {/* Date + linked resource */}
          <div className="flex items-center gap-3 mt-1">
            <p className="text-xs text-[#94a3b8]">{fmtDate(doc.document_date)}</p>
            {doc.linked_resource_type && (
              <span className="text-[11px] text-[#94a3b8] bg-[#f1f5f9] px-1.5 py-0.5 rounded capitalize">
                {doc.linked_resource_type.replace('_', ' ')}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          {/* Verification status */}
          {doc.is_verified ? (
            <span className="text-[11px] px-2 py-0.5 rounded border font-medium bg-green-50 text-green-700 border-green-200">
              ✓ Doğrulandı
            </span>
          ) : (
            <span className="text-[11px] px-2 py-0.5 rounded border font-medium bg-amber-50 text-amber-700 border-amber-200">
              ⚠ Doğrulanmadı
            </span>
          )}

          {/* Open link */}
          <a
            href={doc.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-brand-light hover:text-brand hover:underline"
          >
            Aç →
          </a>

          {/* Admin actions */}
          {isAdmin && !doc.is_verified && (
            <button
              onClick={() => onVerify(doc.id)}
              disabled={verifying === doc.id}
              className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-lg hover:bg-green-100 disabled:opacity-50 transition-colors"
            >
              {verifying === doc.id ? '…' : 'Doğrula'}
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => onDelete(doc.id)}
              disabled={deleting === doc.id}
              className="text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
            >
              {deleting === doc.id ? '…' : 'Sil'}
            </button>
          )}
        </div>
      </div>

      {doc.description && (
        <p className="text-xs text-[#64748b] mt-2 border-t border-[#f1f5f9] pt-2">{doc.description}</p>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function DocumentsClient() {
  const searchParams = useSearchParams()
  const router       = useRouter()

  const [docs,      setDocs]      = useState<CompanyDocument[]>([])
  const [summary,   setSummary]   = useState<DocumentSummary | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const [verifying, setVerifying] = useState<string | null>(null)
  const [deleting,  setDeleting]  = useState<string | null>(null)

  // Assume admin for demo; in prod, derive from /api/settings or auth context
  const isAdmin = true

  // Filters from query params
  const filterType        = (searchParams.get('type')          ?? '') as DocumentType | ''
  const filterYear        = searchParams.get('period_year')    ?? ''
  const filterMonth       = searchParams.get('period_month')   ?? ''
  const filterAuditReq    = searchParams.get('audit_required') ?? ''

  const setParam = useCallback((key: string, value: string) => {
    const sp = new URLSearchParams(searchParams.toString())
    if (value) sp.set(key, value)
    else        sp.delete(key)
    router.replace(`/dashboard/documents?${sp.toString()}`, { scroll: false })
  }, [searchParams, router])

  const loadDocs = useCallback(async () => {
    setLoading(true)
    try {
      const sp = new URLSearchParams()
      if (filterType)      sp.set('type', filterType)
      if (filterYear)      sp.set('period_year', filterYear)
      if (filterMonth)     sp.set('period_month', filterMonth)
      if (filterAuditReq)  sp.set('audit_required', filterAuditReq)
      sp.set('limit', '50')

      const [docsRes, sumRes] = await Promise.all([
        fetch(`/api/documents?${sp.toString()}`),
        fetch('/api/documents/summary'),
      ])

      if (docsRes.ok) {
        const d = await docsRes.json() as { documents: CompanyDocument[] }
        setDocs(d.documents ?? [])
      }
      if (sumRes.ok) {
        const d = await sumRes.json() as { summary: DocumentSummary }
        setSummary(d.summary ?? null)
      }
    } finally {
      setLoading(false)
    }
  }, [filterType, filterYear, filterMonth, filterAuditReq])

  useEffect(() => { void loadDocs() }, [loadDocs])

  async function handleVerify(id: string) {
    setVerifying(id)
    try {
      const r = await fetch(`/api/documents/${id}/verify`, { method: 'POST' })
      if (r.ok) await loadDocs()
    } finally { setVerifying(null) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Bu belgeyi silmek istediğinizden emin misiniz?')) return
    setDeleting(id)
    try {
      const r = await fetch(`/api/documents/${id}`, { method: 'DELETE' })
      if (r.ok) await loadDocs()
    } finally { setDeleting(null) }
  }

  const currentYear  = new Date().getFullYear()
  const years        = Array.from({ length: 11 }, (_, i) => currentYear - i)

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#0f172a]">Belge Kütüphanesi</h1>
          <p className="text-sm text-[#64748b] mt-1">
            Finansal belgeler — TTK kapsamında 10 yıl saklama zorunluluğu
          </p>
        </div>
        <button
          onClick={() => setShowForm(s => !s)}
          className="text-sm bg-brand-light text-white px-4 py-2 rounded-lg hover:bg-brand transition-colors shrink-0"
        >
          + Belge Yükle
        </button>
      </div>

      {/* Upload form */}
      {showForm && (
        <UploadForm
          onClose={() => setShowForm(false)}
          onSuccess={() => { setShowForm(false); void loadDocs() }}
        />
      )}

      {/* Summary bar */}
      {summary && <SummaryBar summary={summary} />}

      {/* Filter toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          className="border border-[#e8eaef] rounded-lg px-3 py-1.5 text-sm bg-white"
          value={filterType}
          onChange={e => setParam('type', e.target.value)}
        >
          <option value="">Tüm türler</option>
          {ALL_DOCUMENT_TYPES.map(t => (
            <option key={t} value={t}>{DOCUMENT_TYPE_LABELS[t]}</option>
          ))}
        </select>

        <select
          className="border border-[#e8eaef] rounded-lg px-3 py-1.5 text-sm bg-white"
          value={filterYear}
          onChange={e => setParam('period_year', e.target.value)}
        >
          <option value="">Tüm yıllar</option>
          {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
        </select>

        {filterYear && (
          <select
            className="border border-[#e8eaef] rounded-lg px-3 py-1.5 text-sm bg-white"
            value={filterMonth}
            onChange={e => setParam('period_month', e.target.value)}
          >
            <option value="">Tüm aylar</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={String(m)}>
                {new Date(2024, m - 1, 1).toLocaleDateString('tr-TR', { month: 'long' })}
              </option>
            ))}
          </select>
        )}

        <label className="flex items-center gap-2 text-sm text-[#475569] cursor-pointer select-none">
          <input
            type="checkbox"
            className="w-4 h-4 accent-violet-600"
            checked={filterAuditReq === 'true'}
            onChange={e => setParam('audit_required', e.target.checked ? 'true' : '')}
          />
          Denetim için zorunlu
        </label>

        {(filterType || filterYear || filterAuditReq) && (
          <button
            onClick={() => {
              router.replace('/dashboard/documents', { scroll: false })
            }}
            className="text-xs text-[#64748b] hover:text-[#334155] underline"
          >
            Filtreleri temizle
          </button>
        )}
      </div>

      {/* Document list */}
      {loading ? (
        <div className="py-16 text-center text-sm text-[#94a3b8]">Belgeler yükleniyor…</div>
      ) : docs.length === 0 ? (
        <div className="py-16 flex flex-col items-center justify-center gap-3 text-center border border-dashed border-[#e8eaef] rounded-xl">
          <div className="text-3xl opacity-50">📄</div>
          <p className="text-sm text-[#64748b]">Henüz belge yok.</p>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand text-white text-xs font-semibold hover:bg-brand-light transition-colors">
              + İlk belgeni yükle
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map(doc => (
            <DocCard
              key={doc.id}
              doc={doc}
              isAdmin={isAdmin}
              onVerify={handleVerify}
              onDelete={handleDelete}
              verifying={verifying}
              deleting={deleting}
            />
          ))}
        </div>
      )}

      {/* Footer note */}
      <p className="text-xs text-[#94a3b8] bg-[#f8fafc] rounded-lg px-3 py-2">
        Türk Ticaret Kanunu (TTK) Madde 82 kapsamında finansal belgeler 10 yıl süresince saklanmalıdır.
        Saklama süresi belge tarihinden itibaren hesaplanmaktadır.
      </p>
    </div>
  )
}

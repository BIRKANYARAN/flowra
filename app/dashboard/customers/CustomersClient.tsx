'use client'

// ── CustomersClient — client island for customer list + CRUD ─────────────────
// Receives initialCustomers from the server component.
// Mutations go through /api/customers.
// After add/edit: router.refresh() re-runs the server component with fresh data.

import { useState, useEffect, type ChangeEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Customer } from '@/types'

export type { Customer }

const IL  = 'w-full border border-[#e8eaef] rounded px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand bg-white transition-colors'
const LAB = 'block text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5'

const EMPTY = {
  name: '', address: '', tax_number: '', tax_office: '',
  email: '', phone: '', website: '', notes: '',
}

interface Props {
  initialCustomers: Customer[]
}

export default function CustomersClient({ initialCustomers }: Props) {
  const router = useRouter()

  const [list,      setList]      = useState<Customer[]>(initialCustomers)
  const [showForm,  setShowForm]  = useState(false)
  const [editId,    setEditId]    = useState<string | null>(null)
  const [form,      setForm]      = useState({ ...EMPTY })
  const [saving,    setSaving]    = useState(false)
  const [err,       setErr]       = useState('')
  const [search,    setSearch]    = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)

  function openNew() {
    setForm({ ...EMPTY }); setEditId(null); setErr(''); setShowForm(true)
  }

  // Task-first: open the new-customer form immediately when reached via "+ Yeni" (?new=1)
  const searchParams = useSearchParams()
  useEffect(() => { if (searchParams.get('new') === '1') openNew() }, [searchParams])
  function openEdit(c: Customer) {
    setForm({
      name: c.name, address: c.address ?? '', tax_number: c.tax_number ?? '',
      tax_office: c.tax_office ?? '', email: c.email ?? '', phone: c.phone ?? '',
      website: c.website ?? '', notes: c.notes ?? '',
    })
    setEditId(c.id); setErr(''); setShowForm(true)
  }
  function closeForm() {
    setShowForm(false); setEditId(null); setForm({ ...EMPTY }); setErr('')
  }

  async function save() {
    if (!form.name.trim()) { setErr('Müşteri adı zorunludur'); return }
    setSaving(true); setErr('')
    const method = editId ? 'PATCH' : 'POST'
    const body   = editId ? { id: editId, ...form } : form
    const res    = await fetch('/api/customers', {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const json   = await res.json() as Record<string, unknown>
    if (!res.ok) { setErr((json.error as string | undefined) ?? 'Hata'); setSaving(false); return }
    closeForm(); setSaving(false)
    router.refresh()
  }

  async function del(id: string) {
    await fetch(`/api/customers?id=${id}`, { method: 'DELETE' })
    setList(prev => prev.filter(c => c.id !== id))
    setConfirmId(null)
  }

  const f = (k: keyof typeof EMPTY) => ({
    value: form[k],
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value })),
  })

  const filtered = list.filter(c =>
    !search.trim() ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (c.tax_number ?? '').includes(search)
  )

  return (
    <div className="space-y-4">
      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          {list.length} Müşteri
        </h2>
        {!showForm && (
          <button
            onClick={openNew}
            className="bg-brand-light text-white px-4 py-2 rounded text-sm font-semibold hover:bg-brand transition-colors"
          >
            + Yeni Müşteri
          </button>
        )}
      </div>

      {/* ── Add/Edit Form ─────────────────────────────────────────────────── */}
      {showForm && (
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-6 space-y-4">
          <h3 className="font-bold text-sm border-b border-[#e8eaef] pb-3">
            {editId ? 'Müşteriyi Düzenle' : 'Yeni Müşteri'}
          </h3>
          <div>
            <label className={LAB}>Ad *</label>
            <input className={IL} {...f('name')} autoFocus />
          </div>
          <div>
            <label className={LAB}>Adres</label>
            <textarea className={`${IL} resize-none`} rows={2} {...f('address')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={LAB}>Vergi No</label><input className={IL} {...f('tax_number')} /></div>
            <div><label className={LAB}>Vergi Dairesi</label><input className={IL} {...f('tax_office')} /></div>
            <div><label className={LAB}>E-posta</label><input type="email" className={IL} {...f('email')} /></div>
            <div><label className={LAB}>Telefon</label><input className={IL} {...f('phone')} /></div>
          </div>
          <div>
            <label className={LAB}>Notlar</label>
            <textarea className={`${IL} resize-none`} rows={2} {...f('notes')} />
          </div>
          {err && (
            <div className="text-sm text-neg bg-neg-light border border-neg-light rounded px-3 py-2">
              {err}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving || !form.name.trim()}
              className="bg-brand-light text-white px-5 py-2.5 rounded text-sm font-semibold hover:bg-brand disabled:opacity-40 transition-colors"
            >
              {saving ? 'Kaydediliyor...' : editId ? 'Güncelle' : 'Kaydet'}
            </button>
            <button
              onClick={closeForm}
              className="border border-[#e8eaef] px-5 py-2.5 rounded text-sm font-medium hover:bg-[#f8fafc]/60 transition-colors"
            >
              İptal
            </button>
          </div>
        </div>
      )}

      {/* ── Search ────────────────────────────────────────────────────────── */}
      {!showForm && list.length > 4 && (
        <input
          className={IL}
          placeholder="Ad, e-posta veya vergi numarası ile ara..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      )}

      {/* ── Customer List ─────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
            <div className="text-3xl opacity-50">👤</div>
            <div className="text-sm text-[#64748b]">
              {search ? 'Eşleşen müşteri bulunamadı' : 'Henüz müşteri eklenmedi'}
            </div>
            {!search && (
              <button
                onClick={openNew}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand text-white text-xs font-semibold hover:bg-brand-light transition-colors">
                + İlk müşterini ekle
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-[#e8eaef]">
            {filtered.map(c => (
              <div key={c.id} className="flex items-center justify-between px-5 py-4 hover:bg-[#f8fafc]/60 transition-colors">
                <button
                  onClick={() => router.push(`/dashboard/customers/${c.id}`)}
                  className="min-w-0 text-left flex-1 mr-3"
                >
                  <div className="text-sm font-semibold truncate hover:text-brand-light transition-colors">
                    {c.name}
                  </div>
                  {c.tax_number && (
                    <div className="text-xs text-[#94a3b8]">
                      Vergi No: {c.tax_number}{c.tax_office ? ' · ' + c.tax_office : ''}
                    </div>
                  )}
                  {c.email && <div className="text-xs text-[#94a3b8]">{c.email}</div>}
                </button>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => openEdit(c)}
                    className="text-xs text-[#94a3b8] hover:text-[#0f172a] px-2 py-1 rounded hover:bg-[#f1f5f9] transition-colors"
                  >
                    Düzenle
                  </button>
                  {confirmId === c.id ? (
                    <span className="flex items-center gap-1">
                      <button
                        onClick={() => del(c.id)}
                        className="text-xs text-white bg-neg-light hover:bg-neg px-2 py-1 rounded transition-colors font-semibold"
                      >
                        Evet, sil
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        className="text-xs text-[#94a3b8] px-2 py-1 rounded hover:bg-[#f1f5f9] transition-colors"
                      >
                        İptal
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmId(c.id)}
                      className="text-xs text-[#94a3b8] hover:text-neg px-2 py-1 rounded hover:bg-neg-light transition-colors"
                    >
                      Sil
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState, useCallback, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useSupabase } from '@/lib/hooks/useSupabase'
import type { Customer } from '@/types'
import { resolveCompanyId } from '@/lib/resolve-company'

const IL  = 'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 bg-white transition-colors'
const LAB = 'block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5'

const EMPTY = { name:'', address:'', tax_number:'', tax_office:'', email:'', phone:'', website:'', notes:'' }

export default function CustomersPage() {
  const supabase = useSupabase()
  const router   = useRouter()
  const [list,      setList]      = useState<Customer[]>([])
  const [loading,   setLoading]   = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const [editId,    setEditId]    = useState<string|null>(null)
  const [form,      setForm]      = useState({ ...EMPTY })
  const [saving,    setSaving]    = useState(false)
  const [err,       setErr]       = useState('')
  const [search,    setSearch]    = useState('')

  const load = useCallback(async () => {
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) return null
    const user = authData.user
    const companyId = await resolveCompanyId(user.id, supabase)
    const { data } = await supabase.from('customers').select('*')
      .eq('company_id', companyId).is('deleted_at', null).order('name')
    setList((data ?? []) as Customer[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  function openNew() { setForm({ ...EMPTY }); setEditId(null); setErr(''); setShowForm(true) }
  function openEdit(c: Customer) {
    setForm({ name: c.name, address: c.address||'', tax_number: c.tax_number||'',
      tax_office: c.tax_office||'', email: c.email||'', phone: c.phone||'',
      website: c.website||'', notes: c.notes||'' })
    setEditId(c.id); setErr(''); setShowForm(true)
  }
  function closeForm() { setShowForm(false); setEditId(null); setForm({ ...EMPTY }); setErr('') }

  async function save() {
    if (!form.name.trim()) { setErr('Müşteri adı zorunludur'); return }
    setSaving(true); setErr('')
    const method = editId ? 'PATCH' : 'POST'
    const body   = editId ? { id: editId, ...form } : form
    const res = await fetch('/api/customers', {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok) { setErr(json.error ?? 'Hata'); setSaving(false); return }
    closeForm(); setSaving(false); load()
  }

  async function del(id: string) {
    if (!confirm('Silmek istediğinizden emin misiniz?')) return
    await fetch(`/api/customers?id=${id}`, { method: 'DELETE' })
    load()
  }

  const f = (k: keyof typeof EMPTY) => ({
    value: form[k],
    onChange: (e: ChangeEvent<HTMLInputElement|HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value })),
  })

  const filtered = list.filter(c =>
    !search.trim() ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email ?? '').toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div className="flex items-center justify-center h-40"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black">Müşteriler</h1>
          <p className="text-sm text-gray-500 mt-0.5">{list.length} kayıt</p>
        </div>
        {!showForm && (
          <button onClick={openNew} className="bg-primary-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-700 transition-colors">
            + Yeni Müşteri
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5 space-y-4">
          <h3 className="font-bold text-sm border-b border-gray-100 pb-3">{editId ? 'Düzenle' : 'Yeni Müşteri'}</h3>
          <div><label className={LAB}>Ad *</label><input className={IL} {...f('name')} autoFocus /></div>
          <div><label className={LAB}>Adres</label><textarea className={`${IL} resize-none`} rows={2} {...f('address')} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={LAB}>Vergi No</label><input className={IL} {...f('tax_number')} /></div>
            <div><label className={LAB}>Vergi Dairesi</label><input className={IL} {...f('tax_office')} /></div>
            <div><label className={LAB}>E-posta</label><input type="email" className={IL} {...f('email')} /></div>
            <div><label className={LAB}>Telefon</label><input className={IL} {...f('phone')} /></div>
          </div>
          <div><label className={LAB}>Notlar</label><textarea className={`${IL} resize-none`} rows={2} {...f('notes')} /></div>
          {err && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{err}</div>}
          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !form.name.trim()}
              className="bg-primary-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-700 disabled:opacity-40 transition-colors">
              {saving ? 'Kaydediliyor...' : editId ? 'Güncelle' : 'Kaydet'}
            </button>
            <button onClick={closeForm} className="border border-gray-200 px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50/60 transition-colors">İptal</button>
          </div>
        </div>
      )}

      {!showForm && list.length > 4 && (
        <div className="mb-4">
          <input className={IL} placeholder="Ara..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-2">👥</div>
            <p className="text-sm">{search ? 'Sonuç bulunamadı.' : 'Henüz müşteri eklenmedi.'}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map(c => (
              <div key={c.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50/60 transition-colors">
                <button
                  onClick={() => router.push(`/dashboard/customers/${c.id}`)}
                  className="min-w-0 text-left flex-1 mr-3"
                >
                  <div className="text-sm font-semibold truncate hover:text-primary-600 transition-colors">{c.name}</div>
                  {c.tax_number && <div className="text-xs text-gray-400">Vergi No: {c.tax_number}{c.tax_office ? ' · ' + c.tax_office : ''}</div>}
                  {c.email && <div className="text-xs text-gray-400">{c.email}</div>}
                </button>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(c)} className="text-xs text-gray-400 hover:text-gray-900 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors">Düzenle</button>
                  <button onClick={() => del(c.id)} className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">Sil</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

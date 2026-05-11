'use client'

// ─────────────────────────────────────────────────────────────────────────────
// /dashboard/tasks — Light CRM task management
//
// Features:
//   • List open / done / cancelled tasks for the company
//   • Create new task (title, due_date, related customer, notes)
//   • Mark task as done / cancelled inline
//   • Delete task (soft-delete)
//   • Filter by status tab
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, type ChangeEvent } from 'react'
import type { Task, TaskStatus, Customer, Sale } from '@/types'

// ── Style tokens ──────────────────────────────────────────────────────────────
const IL  = 'w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400 bg-white transition-colors'
const LAB = 'block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5'
const SEL = `${IL} cursor-pointer`
const BTN = 'px-4 py-2 rounded-xl text-sm font-semibold transition-colors'

const STATUS_LABELS: Record<TaskStatus, string> = {
  open:      'Açık',
  done:      'Tamamlandı',
  cancelled: 'İptal',
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  open:      'bg-blue-100 text-blue-700',
  done:      'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-gray-100 text-gray-500',
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00Z')
  return dt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function isOverdue(due: string | null, status: TaskStatus): boolean {
  if (!due || status !== 'open') return false
  return new Date(due + 'T00:00:00Z') < new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z')
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const [tasks,      setTasks]      = useState<Task[]>([])
  const [customers,  setCustomers]  = useState<Customer[]>([])
  const [sales,      setSales]      = useState<Pick<Sale, 'id' | 'customer_name' | 'total_try' | 'created_at'>[]>([])
  const [tab,        setTab]        = useState<TaskStatus | 'all'>('open')
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')

  // Create form
  const [showForm,   setShowForm]   = useState(false)
  const [title,      setTitle]      = useState('')
  const [dueDate,    setDueDate]    = useState('')
  const [custId,     setCustId]     = useState('')
  const [saleId,     setSaleId]     = useState('')
  const [notes,      setNotes]      = useState('')
  const [saving,     setSaving]     = useState(false)
  const [formError,  setFormError]  = useState('')

  // ── Fetch tasks ─────────────────────────────────────────────────────────────

  const loadTasks = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res  = await fetch(`/api/tasks?status=${tab}&limit=100`)
      const data = await res.json()
      if (!res.ok) { setError(data?.error ?? 'Yükleme hatası'); setTasks([]) }
      else setTasks(Array.isArray(data) ? data : [])
    } catch { setError('Sunucu hatası') }
    finally  { setLoading(false) }
  }, [tab])

  useEffect(() => { loadTasks() }, [loadTasks])

  useEffect(() => {
    fetch('/api/customers?limit=200')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setCustomers(d) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/sales?limit=100')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setSales(d) })
      .catch(() => {})
  }, [])

  // ── Create task ─────────────────────────────────────────────────────────────

  async function handleCreate() {
    if (!title.trim()) { setFormError('Başlık zorunludur.'); return }
    setSaving(true); setFormError('')
    try {
      const res  = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          due_date:            dueDate || null,
          related_customer_id: custId  || null,
          related_sale_id:     saleId  || null,
          notes:               notes.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setFormError(data.error ?? 'Hata'); return }
      setTitle(''); setDueDate(''); setCustId(''); setSaleId(''); setNotes('')
      setShowForm(false)
      if (tab === 'open' || tab === 'all') loadTasks()
    } catch { setFormError('Sunucu hatası') }
    finally  { setSaving(false) }
  }

  // ── Update task status ──────────────────────────────────────────────────────

  async function updateStatus(id: string, status: TaskStatus) {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      loadTasks()
    } else {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Görev güncellenemedi')
    }
  }

  // ── Delete task ─────────────────────────────────────────────────────────────

  async function deleteTask(id: string) {
    if (!confirm('Bu görevi silmek istiyor musunuz?')) return
    const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    if (res.ok) {
      loadTasks()
    } else {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Görev silinemedi')
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const tabs: Array<TaskStatus | 'all'> = ['open', 'done', 'cancelled', 'all']

  return (
    <div className="max-w-3xl space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-gray-900">Görevler</h1>
          <p className="text-xs text-gray-400 mt-0.5">Hafif CRM — takip ve hatırlatma</p>
        </div>
        <button
          onClick={() => { setShowForm(s => !s); setFormError('') }}
          className={`${BTN} bg-primary-600 text-white hover:bg-primary-700`}
        >
          {showForm ? 'İptal' : '+ Yeni Görev'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-bold text-gray-700">Yeni Görev</h2>
          {formError && <p className="text-xs text-red-600">{formError}</p>}

          <div>
            <label className={LAB}>Başlık *</label>
            <input
              className={IL}
              placeholder="Görevi açıklayın…"
              value={title}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LAB}>Son Tarih</label>
              <input
                type="date"
                className={IL}
                value={dueDate}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setDueDate(e.target.value)}
              />
            </div>
            <div>
              <label className={LAB}>İlgili Müşteri</label>
              <select
                className={SEL}
                value={custId}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setCustId(e.target.value)}
              >
                <option value="">— Seçiniz —</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={LAB}>İlgili Satış</label>
            <select
              className={SEL}
              value={saleId}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setSaleId(e.target.value)}
            >
              <option value="">— Seçiniz —</option>
              {sales.map(s => (
                <option key={s.id} value={s.id}>
                  {s.customer_name} — ₺{Number(s.total_try).toLocaleString('tr-TR', { minimumFractionDigits: 0 })}
                  {' '}({new Date(s.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={LAB}>Notlar</label>
            <textarea
              className={`${IL} resize-none`}
              rows={2}
              placeholder="Ek notlar…"
              value={notes}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setShowForm(false); setFormError('') }}
              className={`${BTN} bg-gray-100 text-gray-600 hover:bg-gray-200`}
            >
              İptal
            </button>
            <button
              onClick={handleCreate}
              disabled={saving}
              className={`${BTN} bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50`}
            >
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </div>
      )}

      {/* Status tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {t === 'all' ? 'Tümü' : STATUS_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Task list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
              <div className="h-3.5 bg-gray-100 rounded w-2/3 mb-2" />
              <div className="h-2.5 bg-gray-50 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-400">
            {tab === 'open' ? 'Açık görev yok.' : 'Bu durumda görev yok.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map(task => {
            const overdue = isOverdue(task.due_date, task.status)
            return (
              <div
                key={task.id}
                className={`bg-white rounded-xl border p-4 flex items-start gap-3 ${
                  overdue ? 'border-red-200 bg-red-50' : 'border-gray-100'
                }`}
              >
                {/* Status toggle checkbox */}
                <button
                  onClick={() => updateStatus(task.id, task.status === 'done' ? 'open' : 'done')}
                  title={task.status === 'done' ? 'Yeniden Aç' : 'Tamamlandı İşaretle'}
                  className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                    task.status === 'done'
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'border-gray-300 hover:border-emerald-400'
                  }`}
                >
                  {task.status === 'done' && (
                    <svg viewBox="0 0 10 8" className="w-3 h-3" fill="none">
                      <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-semibold ${
                      task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'
                    }`}>
                      {task.title}
                    </p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLORS[task.status]}`}>
                      {STATUS_LABELS[task.status]}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {task.due_date && (
                      <span className={`text-xs ${overdue ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                        📅 {formatDate(task.due_date)}{overdue && ' — GEÇMİŞ'}
                      </span>
                    )}
                    {task.customer_name && (
                      <span className="text-xs text-gray-400">
                        🏢 {task.customer_name}
                      </span>
                    )}
                  </div>

                  {task.notes && (
                    <p className="text-xs text-gray-400 mt-1 truncate">{task.notes}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {task.status === 'open' && (
                    <button
                      onClick={() => updateStatus(task.id, 'cancelled')}
                      title="İptal Et"
                      className="text-[10px] text-gray-400 hover:text-orange-600 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors"
                    >
                      İptal
                    </button>
                  )}
                  <button
                    onClick={() => deleteTask(task.id)}
                    title="Sil"
                    className="text-[10px] text-gray-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Sil
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

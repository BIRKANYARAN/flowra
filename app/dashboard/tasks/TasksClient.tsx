'use client'

// ── TasksClient — client island for task CRUD + status tabs ──────────────────
// Receives initialTasks, initialCustomers, initialSales from server component.
// Tab switching filters locally (no API call).
// Mutations go through /api/tasks and /api/tasks/[id].

import { useState, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { Task, TaskStatus, Customer, Sale } from '@/types'
import { fmtTRY } from '@/lib/format'

const IL  = 'w-full border border-[#e8eaef] rounded px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand bg-white transition-colors'
const LAB = 'block text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5'
const SEL = `${IL} cursor-pointer`
const BTN = 'px-4 py-2 rounded text-sm font-semibold transition-colors'

const STATUS_LABELS: Record<TaskStatus, string> = {
  open:      'Açık',
  done:      'Tamamlandı',
  cancelled: 'İptal',
}
const STATUS_COLORS: Record<TaskStatus, string> = {
  open:      'bg-info-light text-info-text',
  done:      'bg-pos-light text-pos-text',
  cancelled: 'bg-[#f1f5f9] text-[#64748b]',
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00Z')
  return dt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function isOverdue(due: string | null, status: TaskStatus): boolean {
  if (!due || status !== 'open') return false
  const today = new Date().toISOString().slice(0, 10)
  return due < today
}

interface Props {
  initialTasks:     Task[]
  initialCustomers: Pick<Customer, 'id' | 'name'>[]
  initialSales:     Pick<Sale, 'id' | 'customer_name' | 'total_try' | 'sale_date' | 'created_at'>[]
}

export default function TasksClient({ initialTasks, initialCustomers, initialSales }: Props) {
  const router = useRouter()

  const [tasks,     setTasks]     = useState<Task[]>(initialTasks)
  const [tab,       setTab]       = useState<TaskStatus | 'all'>('open')
  const [error,     setError]     = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)

  // Create form
  const [showForm,  setShowForm]  = useState(false)
  const [title,     setTitle]     = useState('')
  const [dueDate,   setDueDate]   = useState('')
  const [custId,    setCustId]    = useState('')
  const [saleId,    setSaleId]    = useState('')
  const [notes,     setNotes]     = useState('')
  const [saving,    setSaving]    = useState(false)
  const [formError, setFormError] = useState('')

  // ── Filtered tasks (local — no API call) ────────────────────────────────────
  const filtered = tab === 'all'
    ? tasks
    : tasks.filter(t => t.status === tab)

  // ── Create ──────────────────────────────────────────────────────────────────
  async function handleCreate() {
    if (!title.trim()) { setFormError('Başlık zorunludur.'); return }
    setSaving(true); setFormError('')
    try {
      const res  = await fetch('/api/tasks', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          title:               title.trim(),
          due_date:            dueDate || null,
          related_customer_id: custId  || null,
          related_sale_id:     saleId  || null,
          notes:               notes.trim() || null,
        }),
      })
      const data = await res.json() as Record<string, unknown>
      if (!res.ok) { setFormError((data.error as string | undefined) ?? 'Hata'); return }
      // Prepend new task to local state
      const newTask = data as unknown as Task
      setTasks(prev => [newTask, ...prev])
      setTitle(''); setDueDate(''); setCustId(''); setSaleId(''); setNotes('')
      setShowForm(false)
      setTab('open')
    } catch { setFormError('Sunucu hatası') }
    finally  { setSaving(false) }
  }

  // ── Update status ────────────────────────────────────────────────────────────
  async function updateStatus(id: string, status: TaskStatus) {
    // Capture old status BEFORE the optimistic update — the rollback needs this
    // value, not the post-update value that `t.status` would refer to later.
    const prevStatus = tasks.find(t => t.id === id)?.status
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t))
    setError('')
    const res = await fetch(`/api/tasks/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as Record<string, unknown>
      setError((d.error as string | undefined) ?? 'Güncelleme başarısız')
      // Revert to the pre-optimistic status (prevStatus was captured above)
      if (prevStatus !== undefined) {
        setTasks(prev => prev.map(t => t.id === id ? { ...t, status: prevStatus } : t))
      }
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function deleteTask(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id))
    setConfirmId(null)
    const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as Record<string, unknown>
      setError((d.error as string | undefined) ?? 'Silme başarısız')
      router.refresh()  // refresh to restore server state
    }
  }

  const tabs: Array<TaskStatus | 'all'> = ['open', 'done', 'cancelled', 'all']

  return (
    <div className="space-y-4">

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          {filtered.length} Görev
        </h2>
        <button
          onClick={() => { setShowForm(s => !s); setFormError('') }}
          className={`${BTN} bg-brand-light text-white hover:bg-brand`}
        >
          {showForm ? 'İptal' : '+ Yeni Görev'}
        </button>
      </div>

      {/* ── Create form ───────────────────────────────────────────────────── */}
      {showForm && (
        <div className="bg-white rounded border border-[#e8eaef] p-5 space-y-4">
          <h2 className="text-sm font-bold text-[#334155]">Yeni Görev</h2>
          {formError && <p className="text-xs text-neg">{formError}</p>}
          <div>
            <label className={LAB}>Başlık *</label>
            <input
              className={IL}
              placeholder="Görevi açıklayın…"
              value={title}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
              autoFocus
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
                {initialCustomers.map(c => (
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
              {initialSales.map(s => (
                <option key={s.id} value={s.id}>
                  {s.customer_name} — {fmtTRY(Number(s.total_try), 0)}
                  {' '}({new Date(s.sale_date || s.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })})
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
              className={`${BTN} bg-[#f1f5f9] text-[#64748b] hover:bg-[#e2e8f0]`}
            >
              İptal
            </button>
            <button
              onClick={handleCreate}
              disabled={saving}
              className={`${BTN} bg-brand-light text-white hover:bg-brand disabled:opacity-50`}
            >
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </div>
      )}

      {/* ── Status tabs ───────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-[#f1f5f9] rounded p-1">
        {tabs.map(t => {
          const count = t === 'all'
            ? tasks.length
            : tasks.filter(tk => tk.status === t).length
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-1.5 text-xs font-semibold rounded transition-colors ${
                tab === t ? 'bg-white text-[#0f172a] shadow-sm' : 'text-[#94a3b8] hover:text-[#64748b]'
              }`}
            >
              {t === 'all' ? 'Tümü' : STATUS_LABELS[t]}
              {count > 0 && (
                <span className="ml-1 text-[9px] text-[#94a3b8]">({count})</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="text-sm text-neg bg-neg-light border border-neg-light rounded px-3 py-2 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-3 text-neg font-bold">✕</button>
        </div>
      )}

      {/* ── Task list ─────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded border border-[#e8eaef] p-8 text-center">
          <p className="text-sm text-[#94a3b8]">
            {tab === 'open' ? 'Açık görev yok. ✓' : 'Bu durumda görev yok.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(task => {
            const overdue = isOverdue(task.due_date, task.status)
            return (
              <div
                key={task.id}
                className={`bg-white rounded border p-4 flex items-start gap-3 ${
                  overdue ? 'border-neg-light bg-neg-light/60' : 'border-[#e8eaef]'
                }`}
              >
                {/* Status toggle */}
                <button
                  onClick={() => updateStatus(task.id, task.status === 'done' ? 'open' : 'done')}
                  title={task.status === 'done' ? 'Yeniden Aç' : 'Tamamlandı İşaretle'}
                  className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                    task.status === 'done'
                      ? 'bg-pos-light border-pos text-white'
                      : 'border-[#e8eaef] hover:border-pos'
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
                      task.status === 'done' ? 'line-through text-[#94a3b8]' : 'text-[#1e293b]'
                    }`}>
                      {task.title}
                    </p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex-shrink-0 ${STATUS_COLORS[task.status]}`}>
                      {STATUS_LABELS[task.status]}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {task.due_date && (
                      <span className={`text-xs ${overdue ? 'text-neg font-semibold' : 'text-[#94a3b8]'}`}>
                        📅 {formatDate(task.due_date)}{overdue && ' — GEÇMİŞ'}
                      </span>
                    )}
                    {task.customer_name && (
                      <span className="text-xs text-[#94a3b8]">🏢 {task.customer_name}</span>
                    )}
                  </div>
                  {task.notes && (
                    <p className="text-xs text-[#94a3b8] mt-1 truncate">{task.notes}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {task.status === 'open' && (
                    <button
                      onClick={() => updateStatus(task.id, 'cancelled')}
                      className="text-[10px] text-[#94a3b8] hover:text-warn px-2 py-1 rounded hover:bg-warn-light transition-colors"
                    >
                      İptal
                    </button>
                  )}
                  {confirmId === task.id ? (
                    <span className="flex items-center gap-1">
                      <button onClick={() => deleteTask(task.id)}
                        className="text-[10px] text-white bg-neg-light hover:bg-neg px-2 py-1 rounded transition-colors font-semibold">
                        Evet, sil
                      </button>
                      <button onClick={() => setConfirmId(null)}
                        className="text-[10px] text-[#94a3b8] px-2 py-1 rounded hover:bg-[#f1f5f9] transition-colors">
                        İptal
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmId(task.id)}
                      className="text-[10px] text-[#94a3b8] hover:text-neg px-2 py-1 rounded hover:bg-neg-light transition-colors"
                    >
                      Sil
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

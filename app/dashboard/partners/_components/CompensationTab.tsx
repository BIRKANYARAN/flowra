'use client'

// ─────────────────────────────────────────────────────────────────────────────
// CompensationTab — Huzur Hakkı (TTK 394)
//
// Displays:
//   - KPI strip: total monthly gross, this month total, YTD total
//   - Active schedules table: partner, gross, withholding, net, since, board ref
//   - Due / overdue payments with "Öde" button
//   - "Yeni Takvim" form: partner selector, gross, withholding rate, effective_from, board ref
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Skeleton, cn } from '@/components/ds'
import { fmtTRY, fmtDate } from '@/lib/format'
import type { CompensationSchedule, CompensationPaymentDue } from '@/lib/services/pcle/compensation.service'
import type { PartnerRow } from '@/app/dashboard/partners/_components/types'

// ── API response shape ────────────────────────────────────────────────────────

interface CompensationApiResponse {
  schedules:    CompensationSchedule[]
  due_payments: CompensationPaymentDue[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(rate: number) {
  return `%${(rate * 100).toFixed(0)}`
}

// ── New Schedule Form ─────────────────────────────────────────────────────────

interface NewScheduleFormProps {
  partners:  PartnerRow[]
  onClose:   () => void
  onCreated: () => void
}

function NewScheduleForm({ partners, onClose, onCreated }: NewScheduleFormProps) {
  const [form, setForm] = useState({
    partner_id:         '',
    monthly_gross_try:  '',
    withholding_rate:   '15',
    effective_from:     new Date().toISOString().slice(0, 7) + '-01',
    board_decision_ref: '',
    notes:              '',
  })
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    const gross = parseFloat(form.monthly_gross_try)
    const rate  = parseFloat(form.withholding_rate) / 100
    if (!form.partner_id)           { setErr('Ortak seçilmedi');               return }
    if (!Number.isFinite(gross) || gross <= 0) { setErr('Geçerli bir tutar girin'); return }
    if (!Number.isFinite(rate)  || rate  <  0 || rate > 1) { setErr('Stopaj oranı 0–100 arası olmalı'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/partners/compensation', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          type:               'schedule',
          partner_id:         form.partner_id,
          monthly_gross_try:  gross,
          withholding_rate:   rate,
          effective_from:     form.effective_from,
          board_decision_ref: form.board_decision_ref || null,
          notes:              form.notes || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'Hata' })) as { error?: string }
        throw new Error(d.error ?? `HTTP ${res.status}`)
      }
      onCreated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Kaydedilemedi')
    }
    setSaving(false)
  }

  const inputCls = 'w-full text-xs border border-[#e8eaef] rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#0f172a]'
  const labelCls = 'text-[0.65rem] font-semibold uppercase tracking-wider text-[#94a3b8] mb-1 block'

  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft shadow-sm p-4 mb-4">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-bold text-[#0f172a]">Yeni Huzur Hakkı Takvimi</div>
        <button onClick={onClose} className="text-xs text-[#94a3b8] hover:text-[#0f172a]">İptal</button>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
        {/* Partner */}
        <div className="col-span-2">
          <label className={labelCls}>Ortak</label>
          <select
            value={form.partner_id}
            onChange={e => setForm(f => ({ ...f, partner_id: e.target.value }))}
            className={inputCls}
          >
            <option value="">Ortak seçin…</option>
            {partners.filter(p => p.is_active).map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Monthly gross */}
        <div>
          <label className={labelCls}>Aylık Brüt (₺)</label>
          <input
            type="number" min="0" step="100"
            value={form.monthly_gross_try}
            onChange={e => setForm(f => ({ ...f, monthly_gross_try: e.target.value }))}
            className={inputCls}
            placeholder="10000"
          />
        </div>

        {/* Withholding rate */}
        <div>
          <label className={labelCls}>Stopaj Oranı (%)</label>
          <input
            type="number" min="0" max="100" step="1"
            value={form.withholding_rate}
            onChange={e => setForm(f => ({ ...f, withholding_rate: e.target.value }))}
            className={inputCls}
            placeholder="15"
          />
        </div>

        {/* Effective from */}
        <div>
          <label className={labelCls}>Geçerlilik Başlangıcı</label>
          <input
            type="date"
            value={form.effective_from}
            onChange={e => setForm(f => ({ ...f, effective_from: e.target.value }))}
            className={inputCls}
          />
        </div>

        {/* Board decision ref */}
        <div>
          <label className={labelCls}>Yönetim Kurulu Karar No</label>
          <input
            type="text"
            value={form.board_decision_ref}
            onChange={e => setForm(f => ({ ...f, board_decision_ref: e.target.value }))}
            className={inputCls}
            placeholder="YK/2026-05"
          />
        </div>

        {/* Notes */}
        <div className="col-span-2">
          <label className={labelCls}>Notlar (isteğe bağlı)</label>
          <input
            type="text"
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            className={inputCls}
          />
        </div>

        {err && (
          <div className="col-span-2 text-xs text-[#dc2626] bg-[#fef2f2] border border-[#fecaca] rounded px-3 py-2">
            {err}
          </div>
        )}

        <div className="col-span-2 flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs border border-[#e8eaef] rounded text-[#64748b] hover:bg-[#f8fafc]"
          >
            İptal
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-3.5 py-1.5 text-xs rounded bg-[#0f172a] text-white font-semibold hover:bg-[#1e293b] disabled:opacity-50"
          >
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Main Tab ──────────────────────────────────────────────────────────────────

interface CompensationTabProps {
  partners: PartnerRow[]
}

export function CompensationTab({ partners }: CompensationTabProps) {
  const [showForm, setShowForm] = useState(false)
  const [payingId, setPayingId] = useState<string | null>(null)
  const [payErr,   setPayErr]   = useState<string | null>(null)
  const qc = useQueryClient()

  const { data, isLoading, error } = useQuery<CompensationApiResponse>({
    queryKey: ['partner-compensation'],
    queryFn: async () => {
      const res = await fetch('/api/partners/compensation?months=3')
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'Veri alınamadı' })) as { error?: string }
        throw new Error(d.error ?? `HTTP ${res.status}`)
      }
      return res.json() as Promise<CompensationApiResponse>
    },
    staleTime: 30_000,
  })

  const payMutation = useMutation({
    mutationFn: async ({ schedule_id, payment_period }: { schedule_id: string; payment_period: string }) => {
      const res = await fetch('/api/partners/compensation', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ type: 'payment', schedule_id, payment_period }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'Hata' })) as { error?: string }
        throw new Error(d.error ?? `HTTP ${res.status}`)
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['partner-compensation'] })
    },
  })

  async function handlePay(schedule_id: string, payment_period: string) {
    setPayErr(null)
    setPayingId(`${schedule_id}|${payment_period}`)
    try {
      await payMutation.mutateAsync({ schedule_id, payment_period })
    } catch (e) {
      setPayErr(e instanceof Error ? e.message : 'Ödeme kaydedilemedi')
    }
    setPayingId(null)
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton height="h-8" />
        <Skeleton height="h-40" />
        <Skeleton height="h-48" />
      </div>
    )
  }

  if (error || !data) {
    const msg = error instanceof Error ? error.message : 'Huzur hakkı verileri alınamadı'
    return (
      <div className="bg-[#fef2f2] border border-[#fecaca] rounded px-4 py-3 text-xs text-[#dc2626] font-medium">
        {msg}
      </div>
    )
  }

  const { schedules, due_payments } = data

  // KPI computations
  const activeSchedules   = schedules.filter(s => s.is_active)
  const totalMonthlyGross = activeSchedules.reduce((s, x) => s + x.monthly_gross_try, 0)
  const totalMonthlyNet   = activeSchedules.reduce((s, x) => s + x.net_monthly_try, 0)

  const now       = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const thisMonthPaid   = due_payments.filter(d => d.payment_period === thisMonth && d.existing_payment_status === 'paid').reduce((s, d) => s + d.gross_amount_try, 0)
  const overdueCount    = due_payments.filter(d => d.is_overdue && d.existing_payment_status !== 'paid').length

  return (
    <div className="flex flex-col gap-6">

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-3 py-2.5 shadow-sm">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Aylık Toplam Brüt</div>
          <div className="text-sm font-black text-[#0f172a] tabular-nums mt-1">{fmtTRY(totalMonthlyGross)}</div>
          <div className="text-[0.65rem] text-[#94a3b8]">{activeSchedules.length} aktif takvim</div>
        </div>
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-3 py-2.5 shadow-sm">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Aylık Net Ödeme</div>
          <div className="text-sm font-black text-[#16a34a] tabular-nums mt-1">{fmtTRY(totalMonthlyNet)}</div>
          <div className="text-[0.65rem] text-[#94a3b8]">Stopaj sonrası</div>
        </div>
        <div className={cn(
          'rounded px-3 py-2.5 shadow-sm border',
          overdueCount > 0
            ? 'bg-[#fef2f2] border-[#fecaca]'
            : 'bg-white border-[#e8eaef]',
        )}>
          <div className={cn('text-[0.65rem] font-bold uppercase tracking-wider', overdueCount > 0 ? 'text-[#dc2626]' : 'text-[#94a3b8]')}>
            Bu Ay Ödenen
          </div>
          <div className={cn('text-sm font-extrabold tabular-nums mt-1', overdueCount > 0 ? 'text-[#dc2626]' : 'text-[#0f172a]')}>
            {fmtTRY(thisMonthPaid)}
          </div>
          <div className="text-[0.65rem] text-[#94a3b8]">
            {overdueCount > 0 ? `${overdueCount} vadesi geçmiş` : 'Güncel'}
          </div>
        </div>
      </div>

      {/* New schedule button + form */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
            Aktif Huzur Hakkı Takvimleri
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="px-3 py-1.5 text-xs rounded bg-[#0f172a] text-white font-semibold hover:bg-[#1e293b] transition-colors"
            >
              + Yeni Takvim
            </button>
          )}
        </div>

        {showForm && (
          <NewScheduleForm
            partners={partners}
            onClose={() => setShowForm(false)}
            onCreated={() => {
              setShowForm(false)
              qc.invalidateQueries({ queryKey: ['partner-compensation'] })
            }}
          />
        )}

        {activeSchedules.length === 0 ? (
          <div className="bg-[#f8fafc] border border-[#e8eaef] rounded px-4 py-6 text-center text-xs text-[#94a3b8]">
            Henüz aktif huzur hakkı takvimi bulunmuyor.
          </div>
        ) : (
          <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft shadow-sm overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#f8fafc] border-b border-[#e8eaef]">
                  <th className="px-3 py-2 text-left text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Ortak</th>
                  <th className="px-3 py-2 text-right text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Brüt/Ay</th>
                  <th className="px-3 py-2 text-right text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Stopaj</th>
                  <th className="px-3 py-2 text-right text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Net/Ay</th>
                  <th className="px-3 py-2 text-left text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Başlangıç</th>
                  <th className="px-3 py-2 text-left text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">YK Kararı</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {activeSchedules.map(s => (
                  <tr key={s.id} className="hover:bg-[#f8fafc] transition-colors">
                    <td className="px-3 py-2.5 font-semibold text-[#0f172a]">{s.partner_name}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[#0f172a]">{fmtTRY(s.monthly_gross_try)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[#dc2626]">
                      {pct(s.withholding_rate)}
                      <span className="text-[#94a3b8] ml-1">({fmtTRY(s.monthly_gross_try * s.withholding_rate)})</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[#16a34a]">{fmtTRY(s.net_monthly_try)}</td>
                    <td className="px-3 py-2.5 text-[#475569]">{fmtDate(s.effective_from)}</td>
                    <td className="px-3 py-2.5 text-[#94a3b8]">{s.board_decision_ref ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Due payments */}
      <div>
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-3">
          Dönem Ödemeleri (Son 3 Ay)
        </div>

        {payErr && (
          <div className="mb-3 bg-[#fef2f2] border border-[#fecaca] rounded px-3 py-2 text-xs text-[#dc2626]">
            {payErr}
          </div>
        )}

        {due_payments.length === 0 ? (
          <div className="bg-[#f8fafc] border border-[#e8eaef] rounded px-4 py-6 text-center text-xs text-[#94a3b8]">
            Bekleyen ödeme bulunmuyor.
          </div>
        ) : (
          <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft shadow-sm overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#f8fafc] border-b border-[#e8eaef]">
                  <th className="px-3 py-2 text-left text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Ortak</th>
                  <th className="px-3 py-2 text-left text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Dönem</th>
                  <th className="px-3 py-2 text-right text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Brüt</th>
                  <th className="px-3 py-2 text-right text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Stopaj</th>
                  <th className="px-3 py-2 text-right text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Net</th>
                  <th className="px-3 py-2 text-center text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Durum</th>
                  <th className="px-3 py-2 text-center text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {due_payments.map(d => {
                  const key        = `${d.schedule_id}|${d.payment_period}`
                  const isPaying   = payingId === key
                  const isPaid     = d.existing_payment_status === 'paid'
                  const isCancelled = d.existing_payment_status === 'cancelled'

                  return (
                    <tr key={key} className={cn(
                      'transition-colors',
                      d.is_overdue && !isPaid ? 'bg-[#fff7f7]' : 'hover:bg-[#f8fafc]',
                    )}>
                      <td className="px-3 py-2.5 font-semibold text-[#0f172a]">{d.partner_name}</td>
                      <td className="px-3 py-2.5 text-[#475569]">
                        {d.period_label}
                        {d.is_overdue && !isPaid && (
                          <span className="ml-1.5 text-[0.6rem] font-bold text-[#dc2626] uppercase">vadesi geçmiş</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmtTRY(d.gross_amount_try)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[#dc2626]">−{fmtTRY(d.withholding_try)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[#16a34a]">{fmtTRY(d.net_amount_try)}</td>
                      <td className="px-3 py-2.5 text-center">
                        {isPaid ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[0.6rem] font-bold bg-[#dcfce7] text-[#16a34a]">Ödendi</span>
                        ) : isCancelled ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[0.6rem] font-bold bg-[#f1f5f9] text-[#64748b]">İptal</span>
                        ) : d.is_overdue ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[0.6rem] font-bold bg-[#fee2e2] text-[#dc2626]">Gecikmiş</span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[0.6rem] font-bold bg-[#fef3c7] text-[#d97706]">Bekliyor</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {!isPaid && !isCancelled && (
                          <button
                            onClick={() => handlePay(d.schedule_id, d.payment_period)}
                            disabled={isPaying}
                            className="px-2.5 py-1 text-[0.65rem] font-semibold rounded bg-[#0f172a] text-white hover:bg-[#1e293b] disabled:opacity-50 transition-colors"
                          >
                            {isPaying ? '…' : 'Öde'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Compliance note */}
      <div className="text-[0.65rem] text-[#94a3b8] border-t border-[#f1f5f9] pt-3">
        TTK 394 — Huzur hakkı ödemeleri brüt tutar üzerinden GVK 94/1 uyarınca stopaj kesintisine tabidir.
        Ödeme yapılırken otomatik olarak genel gider (board_fee) kaydı oluşturulur.
      </div>
    </div>
  )
}

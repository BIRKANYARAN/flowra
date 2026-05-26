'use client'

import { useState } from 'react'
import Link from 'next/link'
import { NarrativeFooter, Skeleton } from '@/components/ds'
import {
  WaterfallData, PartnerRow,
  fmt, fmtPct,
} from '@/app/dashboard/partners/_components/types'
import { StatusPill } from '@/app/dashboard/partners/_components/ui'

export interface TranchesTabProps {
  loading:   boolean
  waterfall: WaterfallData | null
  partners:  PartnerRow[]
  onRefresh: () => void
}

interface TrancheForm {
  partner_id:              string
  amount_try:              string
  annual_interest_rate:    string
  disbursement_date:       string
  expected_repayment_date: string
  notes:                   string
}

const EMPTY_FORM: TrancheForm = {
  partner_id:              '',
  amount_try:              '',
  annual_interest_rate:    '',
  disbursement_date:       '',
  expected_repayment_date: '',
  notes:                   '',
}

export function TranchesTab({ loading, waterfall, partners, onRefresh }: TranchesTabProps) {
  const [showForm, setShowForm]   = useState(false)
  const [form,     setForm]       = useState<TrancheForm>(EMPTY_FORM)
  const [saving,   setSaving]     = useState(false)
  const [formErr,  setFormErr]    = useState<string | null>(null)
  const [success,  setSuccess]    = useState(false)

  function field(key: keyof TrancheForm, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
    setFormErr(null)
  }

  function openForm() {
    setForm(EMPTY_FORM)
    setFormErr(null)
    setSuccess(false)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setFormErr(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.partner_id)       { setFormErr('Ortak seçimi zorunludur.');         return }
    const amount = parseFloat(form.amount_try.replace(',', '.'))
    if (!amount || amount <= 0) { setFormErr('Tutar sıfırdan büyük olmalıdır.');  return }
    if (!form.disbursement_date) { setFormErr('Kullandırım tarihi zorunludur.');  return }

    setSaving(true)
    setFormErr(null)
    try {
      const res = await fetch('/api/partners/loan-tranches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partner_id:              form.partner_id,
          amount_try:              amount,
          annual_interest_rate:    form.annual_interest_rate ? parseFloat(form.annual_interest_rate) : 0,
          disbursement_date:       form.disbursement_date,
          expected_repayment_date: form.expected_repayment_date || undefined,
          notes:                   form.notes || undefined,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFormErr((json as { error?: string }).error ?? `Hata (${res.status})`)
        return
      }
      setSuccess(true)
      setShowForm(false)
      onRefresh()
    } catch {
      setFormErr('Ağ hatası. Lütfen tekrar deneyin.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Header row: success toast + CTA */}
      <div className="flex items-center justify-between gap-3 min-h-[32px]">
        {success && (
          <span className="text-xs text-pos-text font-semibold bg-pos-light border border-pos-light rounded px-3 py-1">
            Borç dilimi başarıyla eklendi.
          </span>
        )}
        {!success && <span />}
        <button
          onClick={showForm ? closeForm : openForm}
          disabled={saving}
          className="inline-flex items-center gap-1.5 bg-brand-light text-white px-4 py-2 rounded text-xs font-semibold hover:bg-brand transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {showForm ? '✕ Kapat' : '+ Yeni Borç Dilimi'}
        </button>
      </div>

      {/* Inline new-tranche form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-[#e2e8f0] rounded px-4 py-4 shadow-sm flex flex-col gap-4"
        >
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Yeni Borç Dilimi
          </div>

          {/* Partner select */}
          <div className="flex flex-col gap-1">
            <label className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Ortak <span className="text-neg">*</span>
            </label>
            <select
              value={form.partner_id}
              onChange={e => field('partner_id', e.target.value)}
              className="border border-[#e2e8f0] rounded px-3 py-2 text-xs text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-transparent"
              required
            >
              <option value="">— Ortak seçin —</option>
              {partners.filter(p => p.is_active).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Amount + interest rate */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
                Tutar (₺) <span className="text-neg">*</span>
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount_try}
                onChange={e => field('amount_try', e.target.value)}
                placeholder="0.00"
                className="border border-[#e2e8f0] rounded px-3 py-2 text-xs font-mono text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-transparent"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
                Yıllık Faiz (%)
              </label>
              <input
                type="number"
                min="0"
                max="999"
                step="0.001"
                value={form.annual_interest_rate}
                onChange={e => field('annual_interest_rate', e.target.value)}
                placeholder="0"
                className="border border-[#e2e8f0] rounded px-3 py-2 text-xs font-mono text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-transparent"
              />
            </div>
          </div>

          {/* Disbursement date + expected repayment date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
                Kullandırım Tarihi <span className="text-neg">*</span>
              </label>
              <input
                type="date"
                value={form.disbursement_date}
                onChange={e => field('disbursement_date', e.target.value)}
                className="border border-[#e2e8f0] rounded px-3 py-2 text-xs text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-transparent"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
                Beklenen Geri Ödeme
              </label>
              <input
                type="date"
                value={form.expected_repayment_date}
                onChange={e => field('expected_repayment_date', e.target.value)}
                className="border border-[#e2e8f0] rounded px-3 py-2 text-xs text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-transparent"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1">
            <label className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Notlar
            </label>
            <textarea
              value={form.notes}
              onChange={e => field('notes', e.target.value)}
              rows={2}
              placeholder="İsteğe bağlı açıklama..."
              className="border border-[#e2e8f0] rounded px-3 py-2 text-xs text-[#0f172a] resize-none focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-transparent"
            />
          </div>

          {formErr && (
            <div className="text-xs text-neg font-medium bg-neg-light border border-neg-light rounded px-3 py-2">
              {formErr}
            </div>
          )}

          <div className="flex items-center gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={closeForm}
              disabled={saving}
              className="px-4 py-2 rounded border border-[#e2e8f0] text-xs font-semibold text-[#64748b] hover:bg-[#f8fafc] transition-colors disabled:opacity-50"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded bg-brand-light text-white text-xs font-semibold hover:bg-brand transition-colors disabled:opacity-60"
            >
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </form>
      )}

      {/* Existing tranches display */}
      {loading ? <Skeleton height="h-32" /> : !waterfall ? (
        <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-4 py-6 text-center text-xs text-[#94a3b8]">
          Borç dilimi verisi yüklenemedi.
        </div>
      ) : waterfall.tranches.filter(t => t.principal_try > 0).length === 0 ? (
        <div className="bg-pos-light border border-pos-light rounded px-4 py-6 text-center text-xs text-pos-text font-semibold">
          Aktif ortak borç dilimi yok.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white border border-warn-light rounded px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-warn mb-1">Toplam Açık Borç</div>
              <div className="text-xl font-black tabular-nums text-warn-text">{fmt(waterfall.total_debt_try)}</div>
            </div>
            <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm">
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Aktif Borç Dilimi</div>
              <div className="text-xl font-black tabular-nums text-[#0f172a]">
                {waterfall.tranches.filter(t => t.status !== 'repaid').length}
              </div>
            </div>
            <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm">
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Kapanma Tahmini</div>
              <div className={`text-xl font-black tabular-nums ${
                (waterfall.debt_clearance_months ?? 0) > 0
                  ? waterfall.debt_clearance_months! <= 3 ? 'text-pos-text' : waterfall.debt_clearance_months! <= 12 ? 'text-warn-text' : 'text-neg-text'
                  : 'text-[#94a3b8]'
              }`}>
                {waterfall.debt_clearance_months != null && waterfall.total_debt_try > 0
                  ? `${waterfall.debt_clearance_months} ay`
                  : '—'}
              </div>
            </div>
          </div>

          {/* ── TotalBurden Summary Row ───────────────────────────────────── */}
          {(() => {
            const activeTranches = waterfall.tranches.filter(t => t.principal_try > 0 && t.status !== 'repaid')
            const totalPrincipal = activeTranches.reduce((s, t) => s + t.remaining_principal_try, 0)
            const totalMonthly   = activeTranches.reduce((s, t) => s + (t.remaining_principal_try * (t.interest_rate_annual_pct / 100) / 12), 0)
            const totalAccrued   = activeTranches.reduce((s, t) => s + t.accrued_interest_try, 0)
            return (
              <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
                <div className="px-4 py-2 border-b border-[#f1f5f9] bg-[#f8fafc]/60">
                  <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Toplam Faiz Yükü Özeti</div>
                </div>
                <div className="grid grid-cols-3 divide-x divide-[#f1f5f9]">
                  <div className="px-4 py-3">
                    <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Kalan Ana Para</div>
                    <div className="text-base font-black tabular-nums text-warn-text">{fmt(totalPrincipal)}</div>
                  </div>
                  <div className="px-4 py-3">
                    <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Aylık Faiz Maliyeti</div>
                    <div className="text-base font-black tabular-nums text-neg-text">{fmt(totalMonthly)}</div>
                  </div>
                  <div className="px-4 py-3">
                    <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Toplam Tahakkuk</div>
                    <div className="text-base font-black tabular-nums text-neg-text">{fmt(totalAccrued)}</div>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* ── Tranche Cards (sorted by accrued interest desc) ──────────── */}
          <div className="flex flex-col gap-3">
            {[...waterfall.tranches.filter(t => t.principal_try > 0)]
              .sort((a, b) => b.accrued_interest_try - a.accrued_interest_try)
              .map(t => {
                const repaidPct     = t.principal_try > 0 ? (t.actual_repaid_try / t.principal_try) * 100 : 0
                const progressColor = t.status === 'repaid' ? 'bg-pos-light' : t.status === 'overdue' ? 'bg-neg-light' : 'bg-brand-light'
                // Monthly interest cost
                const monthlyInterest = t.remaining_principal_try * (t.interest_rate_annual_pct / 100) / 12
                // Maturity progress: time elapsed / total duration
                const disbDate    = t.disbursement_date ? new Date(t.disbursement_date).getTime() : null
                const maturityDate = t.expected_repayment_date ? new Date(t.expected_repayment_date).getTime() : null
                const nowMs       = Date.now()
                const maturityPct = (disbDate && maturityDate && maturityDate > disbDate)
                  ? Math.min(100, Math.max(0, ((nowMs - disbDate) / (maturityDate - disbDate)) * 100))
                  : null
                // Next interest date: 1st of next month (approximate)
                const nextInterestDate = (() => {
                  const d = new Date()
                  d.setMonth(d.getMonth() + 1, 1)
                  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
                })()
                return (
                  <div key={t.id} className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#0f172a]">{t.partner_name}</span>
                          <StatusPill status={t.status} />
                        </div>
                        <div className="text-[10px] text-[#94a3b8] mt-0.5">{t.days_outstanding} gündür açık</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-base font-black tabular-nums text-warn-text">{fmt(t.remaining_principal_try)}</div>
                        <div className="text-[10px] text-[#94a3b8]">kalan anapara</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-3 text-xs">
                      <div>
                        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">Ana Para</div>
                        <div className="font-mono font-bold text-[#334155]">{fmt(t.principal_try)}</div>
                      </div>
                      <div>
                        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">Yıllık Faiz</div>
                        <div className="font-mono font-bold text-[#334155]">%{t.interest_rate_annual_pct.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">Aylık Maliyet</div>
                        <div className="font-mono font-bold text-neg-text">{fmt(monthlyInterest)}</div>
                      </div>
                      <div>
                        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">Tahakkuk</div>
                        <div className="font-mono font-bold text-neg-text">{fmt(t.accrued_interest_try)}</div>
                      </div>
                      <div>
                        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">Sonraki Faiz</div>
                        <div className="font-mono text-[#64748b] text-[10px]">{nextInterestDate}</div>
                      </div>
                    </div>

                    {/* Maturity progress bar */}
                    {maturityPct !== null ? (
                      <div className="mb-3">
                        <div className="flex justify-between text-[10px] text-[#94a3b8] mb-1">
                          <span>Vade ilerlemesi ({t.disbursement_date?.slice(0,10)} → {t.expected_repayment_date?.slice(0,10)})</span>
                          <span>{maturityPct.toFixed(0)}%</span>
                        </div>
                        <div className="bg-[#f1f5f9] rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${maturityPct >= 90 ? 'bg-neg-light' : maturityPct >= 70 ? 'bg-warn-light' : 'bg-info'}`}
                            style={{ width: `${maturityPct}%` }}
                          />
                        </div>
                      </div>
                    ) : null}

                    {/* Repayment progress bar */}
                    <div>
                      <div className="flex justify-between text-[10px] text-[#94a3b8] mb-1">
                        <span>Geri ödeme ilerleme</span>
                        <span>{fmtPct(repaidPct)}</span>
                      </div>
                      <div className="bg-[#f1f5f9] rounded-full h-2">
                        <div
                          className={`${progressColor} h-2 rounded-full transition-all`}
                          style={{ width: `${Math.min(100, repaidPct)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        </>
      )}

      {/* Cross-navigation */}
      <NarrativeFooter
        className="pt-2"
        narrative="Borç dilimleri, borç baskısı ve geri ödeme simülasyonuyla birlikte inceleyin."
        links={[
          { label: 'Borç Baskısı', href: '/dashboard/planning?tab=debt-pressure' },
          { label: 'Geri Ödeme',   href: '/dashboard/partners?tab=waterfall' },
          { label: 'Bilanço',      href: '/dashboard/finance?tab=balance' },
        ]}
      />
    </div>
  )
}

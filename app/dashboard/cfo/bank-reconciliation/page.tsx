'use client'

// ═══════════════════════════════════════════════════════════════════════════════
// /dashboard/cfo/bank-reconciliation — Banka Ekstresi Mutabakatı
//
// Lets admins import bank statement lines and match them against
// Flowra sale payments and expense payments to identify discrepancies.
//
// Three sections:
//   1. Period selector — month picker (from/to)
//   2. Reconciliation summary — 4 KPI cards + status badge
//   3. Matching workbench — bank lines (left) vs unmatched Flowra records (right)
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { cn } from '@/components/ds'
import { fmtTRY, fmtDate } from '@/lib/format'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BankLine {
  id: string
  statement_date: string
  description: string
  amount_try: number
  reference: string | null
  counterparty: string | null
  transaction_type: 'credit' | 'debit' | 'unknown'
  match_status: 'unmatched' | 'matched' | 'manual_match' | 'excluded'
  match_confidence: number | null
}

interface FlowraInflow {
  id: string
  date: string
  amount_try: number
  customer_name: string | null
  payment_status: string
}

interface FlowraOutflow {
  id: string
  date: string
  amount_try: number
  expense_type: string
  payment_status: string
}

interface ReconciliationReport {
  period_from: string
  period_to: string
  computed_at: string
  bank_lines_total: number
  bank_lines_matched: number
  bank_lines_unmatched: number
  bank_lines_excluded: number
  flowra_inflows_total: number
  flowra_inflows_matched: number
  flowra_outflows_total: number
  flowra_outflows_matched: number
  bank_credits_try: number
  bank_debits_try: number
  flowra_inflows_try: number
  flowra_outflows_try: number
  unmatched_bank_lines: BankLine[]
  unmatched_flowra_inflows: FlowraInflow[]
  unmatched_flowra_outflows: FlowraOutflow[]
  reconciliation_status: 'reconciled' | 'minor_discrepancies' | 'major_discrepancies' | 'not_started'
  discrepancy_amount_try: number
}

interface ImportLineInput {
  statement_date: string
  value_date: string | null
  description: string
  amount_try: number
  reference: string | null
  counterparty: string | null
  transaction_type: 'credit' | 'debit' | 'unknown'
  period_from: string
  period_to: string
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  not_started:        { label: 'Başlanmadı',           cls: 'bg-[#f1f5f9] text-[#64748b] border-[#e2e8f0]' },
  reconciled:         { label: 'Mutabık',               cls: 'bg-pos-light text-pos-text border-pos-light'   },
  minor_discrepancies:{ label: 'Küçük Farklar',         cls: 'bg-warn-light text-warn-text border-warn-light'},
  major_discrepancies:{ label: 'Büyük Farklar',         cls: 'bg-neg-light text-neg-text border-neg-light'   },
}

const MATCH_STATUS_CONFIG = {
  unmatched:    { label: 'Eşleşmedi',    cls: 'bg-[#f1f5f9] text-[#64748b]'         },
  matched:      { label: 'Otomatik',      cls: 'bg-pos-light text-pos-text'           },
  manual_match: { label: 'Manuel',        cls: 'bg-info-light text-info-text'         },
  excluded:     { label: 'Hariç',         cls: 'bg-[#fef9c3] text-[#854d0e]'         },
}

// ── Helper: current month range ───────────────────────────────────────────────

function currentMonthRange(): { from: string; to: string } {
  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() // 0-indexed
  const from  = new Date(year, month, 1).toISOString().slice(0, 10)
  const to    = new Date(year, month + 1, 0).toISOString().slice(0, 10)
  return { from, to }
}

// ── Import Modal ──────────────────────────────────────────────────────────────

interface ImportModalProps {
  periodFrom: string
  periodTo: string
  onClose: () => void
  onSuccess: () => void
}

function ImportModal({ periodFrom, periodTo, onClose, onSuccess }: ImportModalProps) {
  const [raw,     setRaw]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  // Format: YYYY-MM-DD | description | amount (positive=credit, negative=debit)
  // Optional extra columns: reference | counterparty
  function parseLines(): ImportLineInput[] | null {
    const parsed: ImportLineInput[] = []
    for (const rawLine of raw.split('\n')) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const parts = line.split(/[|\t]/).map(p => p.trim())
      if (parts.length < 3) { setError(`Geçersiz satır: "${line}"`); return null }
      const [dateStr, desc, amtStr, ref, counterparty] = parts
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr ?? '')) {
        setError(`Geçersiz tarih: "${dateStr}". YYYY-MM-DD kullanın.`)
        return null
      }
      const amt = Number(amtStr?.replace(',', '.'))
      if (isNaN(amt)) { setError(`Geçersiz tutar: "${amtStr}"`); return null }
      parsed.push({
        statement_date:   dateStr!,
        value_date:       null,
        description:      desc ?? '',
        amount_try:       amt,
        reference:        ref || null,
        counterparty:     counterparty || null,
        transaction_type: amt > 0 ? 'credit' : amt < 0 ? 'debit' : 'unknown',
        period_from:      periodFrom,
        period_to:        periodTo,
      })
    }
    if (parsed.length === 0) { setError('En az bir satır girilmeli.'); return null }
    return parsed
  }

  async function handleImport() {
    setError(null)
    const lines = parseLines()
    if (!lines) return
    setLoading(true)
    try {
      const res = await fetch('/api/bank-reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines }),
      })
      const data = await res.json() as { imported?: number; auto_matched?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'İçe aktarma başarısız.')
      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hata oluştu')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e2e8f0]">
          <h2 className="text-sm font-black text-[#0f172a]">Banka Ekstresi Satırı Ekle</h2>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-[#475569] text-lg leading-none">×</button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="text-xs text-[#64748b] bg-[#f8fafc] rounded p-3 font-mono leading-relaxed">
            <div className="font-black text-[#334155] mb-1">Format (her satır):</div>
            <div>YYYY-MM-DD | Açıklama | Tutar | [Referans] | [Karşı Taraf]</div>
            <div className="mt-1 text-[#94a3b8]">Pozitif tutar = gelen para (kredi), Negatif = giden (borç)</div>
          </div>
          <textarea
            className="w-full border border-[#e2e8f0] rounded px-3 py-2 text-xs font-mono text-[#1e293b] min-h-[140px] focus:outline-none focus:ring-1 focus:ring-brand-light resize-y"
            placeholder={'2026-01-15 | Müşteri Ödemesi ABC Ltd | 15000.00 | TRF123456\n2026-01-17 | Kira Ödemesi | -8500.00 | EFT789'}
            value={raw}
            onChange={e => setRaw(e.target.value)}
          />
          {error && (
            <div className="text-xs text-neg bg-neg-light rounded px-3 py-2">{error}</div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#e2e8f0]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-[#64748b] border border-[#e2e8f0] rounded hover:bg-[#f8fafc] transition-colors"
          >
            İptal
          </button>
          <button
            onClick={handleImport}
            disabled={loading || !raw.trim()}
            className="px-4 py-2 text-xs font-bold text-white bg-brand-light rounded hover:bg-brand transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'İçe Aktarılıyor…' : 'Satırları İçe Aktar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ReconciliationReport['reconciliation_status'] }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className={cn('inline-flex items-center px-2.5 py-1 rounded text-[11px] font-bold border', cfg.cls)}>
      {cfg.label}
    </span>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, highlight = false }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={cn('rounded border px-4 py-3', highlight ? 'bg-neg-light border-neg-light' : 'bg-white border-[#e2e8f0]')}>
      <div className={cn('text-[0.65rem] font-black uppercase tracking-widest', highlight ? 'text-neg-text' : 'text-[#94a3b8]')}>{label}</div>
      <div className={cn('text-xl font-black tabular-nums mt-1', highlight ? 'text-neg-text' : 'text-[#0f172a]')}>{value}</div>
      {sub && <div className={cn('text-[10px] mt-0.5', highlight ? 'text-neg' : 'text-[#94a3b8]')}>{sub}</div>}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BankReconciliationPage() {
  const defaultRange = currentMonthRange()
  const [periodFrom,    setPeriodFrom]    = useState(defaultRange.from)
  const [periodTo,      setPeriodTo]      = useState(defaultRange.to)
  const [report,        setReport]        = useState<ReconciliationReport | null>(null)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [showImport,    setShowImport]    = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // ── Fetch report ──────────────────────────────────────────────────────────

  const fetchReport = useCallback(async () => {
    if (!periodFrom || !periodTo) return
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`/api/bank-reconciliation?from=${periodFrom}&to=${periodTo}`)
      const data = await res.json() as ReconciliationReport & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Rapor yüklenemedi')
      setReport(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rapor yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [periodFrom, periodTo])

  useEffect(() => { fetchReport() }, [fetchReport])

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleMatch(bankLineId: string, resourceType: string, resourceId: string) {
    setActionLoading(bankLineId)
    try {
      await fetch(`/api/bank-reconciliation/${bankLineId}/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_type: resourceType, resource_id: resourceId }),
      })
      await fetchReport()
    } finally {
      setActionLoading(null)
    }
  }

  async function handleExclude(bankLineId: string) {
    setActionLoading(bankLineId)
    try {
      await fetch(`/api/bank-reconciliation/${bankLineId}/exclude`, { method: 'POST' })
      await fetchReport()
    } finally {
      setActionLoading(null)
    }
  }

  const matchedPct = report && report.bank_lines_total > 0
    ? Math.round((report.bank_lines_matched / report.bank_lines_total) * 100)
    : 0

  return (
    <div className="flex flex-col gap-5 max-w-7xl">
      {showImport && (
        <ImportModal
          periodFrom={periodFrom}
          periodTo={periodTo}
          onClose={() => setShowImport(false)}
          onSuccess={async () => { setShowImport(false); await fetchReport() }}
        />
      )}

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">CFO · Finans</div>
          <h1 className="text-2xl font-black tracking-tight text-[#0f172a] leading-tight">Banka Ekstresi Mutabakatı</h1>
          <p className="text-sm text-[#94a3b8] mt-1">Banka hareketlerini Flowra satış ve gider ödemeleriyle karşılaştır</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-brand-light text-white text-xs font-bold hover:bg-brand transition-colors"
          >
            + Satır Ekle
          </button>
          <Link href="/dashboard/finance?tab=cfo" className="text-xs text-[#94a3b8] hover:text-brand-light font-semibold">
            ← CFO Cockpit
          </Link>
        </div>
      </div>

      {/* ── 1. Period Selector ────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft px-4 py-3">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">Dönem Seçimi</div>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-[#64748b]">Başlangıç</label>
            <input
              type="date"
              value={periodFrom}
              onChange={e => setPeriodFrom(e.target.value)}
              className="border border-[#e2e8f0] rounded px-3 py-1.5 text-xs text-[#1e293b] focus:outline-none focus:ring-1 focus:ring-brand-light"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-[#64748b]">Bitiş</label>
            <input
              type="date"
              value={periodTo}
              onChange={e => setPeriodTo(e.target.value)}
              className="border border-[#e2e8f0] rounded px-3 py-1.5 text-xs text-[#1e293b] focus:outline-none focus:ring-1 focus:ring-brand-light"
            />
          </div>
          <button
            onClick={fetchReport}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded border border-[#e2e8f0] bg-white text-xs font-semibold text-[#64748b] hover:bg-[#f8fafc] transition-colors disabled:opacity-50"
          >
            <svg className={cn('w-3.5 h-3.5', loading && 'animate-spin')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {loading ? 'Yükleniyor…' : 'Raporla'}
          </button>
          {/* Quick month shortcuts */}
          {[-1, 0].map(offset => {
            const d = new Date()
            d.setMonth(d.getMonth() + offset)
            const from = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
            const to   = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
            const label = d.toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' })
            return (
              <button
                key={offset}
                onClick={() => { setPeriodFrom(from); setPeriodTo(to) }}
                className="px-2.5 py-1.5 rounded border border-[#e2e8f0] text-[10px] font-semibold text-[#64748b] hover:bg-[#f8fafc] transition-colors"
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {error && (
        <div className="bg-neg-light border border-neg-light rounded px-4 py-3 text-xs text-neg-text">{error}</div>
      )}

      {/* ── 2. Summary KPI Cards ──────────────────────────────────────────── */}
      {report && (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Dönem Özeti</span>
              <StatusBadge status={report.reconciliation_status} />
            </div>
            <div className="text-[10px] text-[#94a3b8]">
              {fmtDate(report.period_from)} — {fmtDate(report.period_to)}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="Banka Girişi"
              value={fmtTRY(report.bank_credits_try)}
              sub={`${report.bank_lines_total} hareket`}
            />
            <KpiCard
              label="Banka Çıkışı"
              value={fmtTRY(report.bank_debits_try)}
              sub={`${report.bank_lines_total} hareket`}
            />
            <KpiCard
              label="Eşleşme Oranı"
              value={`%${matchedPct}`}
              sub={`${report.bank_lines_matched}/${report.bank_lines_total} satır`}
            />
            <KpiCard
              label="Fark Tutarı"
              value={fmtTRY(report.discrepancy_amount_try)}
              highlight={report.discrepancy_amount_try > 0}
            />
          </div>

          {/* Flowra vs Bank summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft px-4 py-3">
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">Flowra Gelirler (Satışlar)</div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#64748b]">Toplam</span>
                <span className="font-mono font-semibold text-[#334155] tabular-nums">{fmtTRY(report.flowra_inflows_try)}</span>
              </div>
              <div className="flex items-center justify-between text-xs mt-1">
                <span className="text-[#64748b]">Eşleşti</span>
                <span className="font-mono text-pos-text tabular-nums">{report.flowra_inflows_matched}/{report.flowra_inflows_total}</span>
              </div>
            </div>
            <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft px-4 py-3">
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">Flowra Giderler</div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#64748b]">Toplam</span>
                <span className="font-mono font-semibold text-[#334155] tabular-nums">{fmtTRY(report.flowra_outflows_try)}</span>
              </div>
              <div className="flex items-center justify-between text-xs mt-1">
                <span className="text-[#64748b]">Eşleşti</span>
                <span className="font-mono text-pos-text tabular-nums">{report.flowra_outflows_matched}/{report.flowra_outflows_total}</span>
              </div>
            </div>
          </div>

          {/* ── 3. Matching Workbench ────────────────────────────────────────── */}
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Eşleştirme Tezgahı</div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: Bank lines */}
            <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-between">
                <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
                  Banka Satırları
                </span>
                <span className="text-[10px] text-[#94a3b8]">
                  {report.bank_lines_unmatched} eşleşmedi · {report.bank_lines_excluded} hariç
                </span>
              </div>

              {report.unmatched_bank_lines.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-[#94a3b8]">
                  {report.bank_lines_total === 0
                    ? 'Henüz banka satırı yok. Sağ üstten satır ekleyin.'
                    : 'Tüm satırlar eşleşti veya hariç tutuldu.'}
                </div>
              ) : (
                <div className="divide-y divide-[#f1f5f9] max-h-[480px] overflow-y-auto">
                  {report.unmatched_bank_lines.map(line => {
                    const isDebit = Number(line.amount_try) < 0
                    const isLoading = actionLoading === line.id
                    return (
                      <div key={line.id} className="px-4 py-3 hover:bg-[#f8fafc]/60">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-[#1e293b] truncate">{line.description}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-[#94a3b8]">{fmtDate(line.statement_date)}</span>
                              {line.counterparty && (
                                <span className="text-[10px] text-[#94a3b8] truncate max-w-[120px]">{line.counterparty}</span>
                              )}
                              <span className={cn(
                                'text-[10px] px-1.5 py-0.5 rounded font-semibold',
                                MATCH_STATUS_CONFIG[line.match_status].cls,
                              )}>
                                {MATCH_STATUS_CONFIG[line.match_status].label}
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className={cn(
                              'text-sm font-bold tabular-nums font-mono',
                              isDebit ? 'text-neg' : 'text-pos-text',
                            )}>
                              {isDebit ? '-' : '+'}{fmtTRY(Math.abs(Number(line.amount_try)))}
                            </div>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5 mt-2">
                          {/* Quick match against first unmatched Flowra record of correct type */}
                          {isDebit
                            ? report.unmatched_flowra_outflows.length > 0 && (
                              <button
                                disabled={isLoading}
                                onClick={() => handleMatch(line.id, 'expense_payment', report.unmatched_flowra_outflows[0].id)}
                                className="px-2 py-1 text-[10px] font-semibold rounded bg-[#f0fdf4] text-pos-text border border-pos-light hover:bg-pos-light transition-colors disabled:opacity-50"
                              >
                                {isLoading ? '…' : 'Giderle Eşleştir'}
                              </button>
                            )
                            : report.unmatched_flowra_inflows.length > 0 && (
                              <button
                                disabled={isLoading}
                                onClick={() => handleMatch(line.id, 'sale_payment', report.unmatched_flowra_inflows[0].id)}
                                className="px-2 py-1 text-[10px] font-semibold rounded bg-[#f0fdf4] text-pos-text border border-pos-light hover:bg-pos-light transition-colors disabled:opacity-50"
                              >
                                {isLoading ? '…' : 'Satışla Eşleştir'}
                              </button>
                            )
                          }
                          <button
                            disabled={isLoading}
                            onClick={() => handleExclude(line.id)}
                            className="px-2 py-1 text-[10px] font-semibold rounded bg-[#f8fafc] text-[#64748b] border border-[#e2e8f0] hover:bg-[#f1f5f9] transition-colors disabled:opacity-50"
                          >
                            {isLoading ? '…' : 'Hariç Tut'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Right: Unmatched Flowra records */}
            <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-between">
                <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
                  Eşleşmemiş Flowra Kayıtları
                </span>
                <span className="text-[10px] text-[#94a3b8]">
                  {report.unmatched_flowra_inflows.length + report.unmatched_flowra_outflows.length} kayıt
                </span>
              </div>

              {report.unmatched_flowra_inflows.length === 0 && report.unmatched_flowra_outflows.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-[#94a3b8]">
                  Tüm Flowra kayıtları eşleşti.
                </div>
              ) : (
                <div className="divide-y divide-[#f1f5f9] max-h-[480px] overflow-y-auto">
                  {/* Inflows (sales) */}
                  {report.unmatched_flowra_inflows.length > 0 && (
                    <>
                      <div className="px-4 py-2 bg-[#f8fafc]">
                        <span className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">Satış Ödemeleri</span>
                      </div>
                      {report.unmatched_flowra_inflows.map(inflow => (
                        <div key={inflow.id} className="px-4 py-3 hover:bg-[#f8fafc]/60">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-[#1e293b]">
                                {inflow.customer_name ?? `Satış #${inflow.id.slice(0, 8)}`}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-[#94a3b8]">{fmtDate(inflow.date)}</span>
                                <span className="text-[10px] bg-[#f0fdf4] text-pos-text px-1.5 py-0.5 rounded font-semibold">
                                  {inflow.payment_status}
                                </span>
                              </div>
                            </div>
                            <div className="text-sm font-bold tabular-nums font-mono text-pos-text">
                              {fmtTRY(inflow.amount_try)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  {/* Outflows (expenses) */}
                  {report.unmatched_flowra_outflows.length > 0 && (
                    <>
                      <div className="px-4 py-2 bg-[#f8fafc]">
                        <span className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">Gider Ödemeleri</span>
                      </div>
                      {report.unmatched_flowra_outflows.map(outflow => (
                        <div key={outflow.id} className="px-4 py-3 hover:bg-[#f8fafc]/60">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-[#1e293b]">{outflow.expense_type}</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-[#94a3b8]">{fmtDate(outflow.date)}</span>
                                <span className="text-[10px] bg-[#fef9c3] text-[#854d0e] px-1.5 py-0.5 rounded font-semibold">
                                  {outflow.payment_status}
                                </span>
                              </div>
                            </div>
                            <div className="text-sm font-bold tabular-nums font-mono text-neg">
                              -{fmtTRY(outflow.amount_try)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Cross-navigation ─────────────────────────────────────────── */}
          <div className="flex items-center gap-3 pt-1">
            <Link href="/dashboard/cfo/reconciliation" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2">
              GL Mutabakat →
            </Link>
            <span className="text-[#e2e8f0]">|</span>
            <Link href="/dashboard/cfo/trial-balance" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2">
              Mizan →
            </Link>
            <span className="text-[#e2e8f0]">|</span>
            <Link href="/dashboard/cfo/period-close" className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2">
              Dönem Kapat →
            </Link>
          </div>
        </>
      )}

      {/* Loading skeleton */}
      {loading && !report && (
        <div className="space-y-3 animate-pulse">
          <div className="grid grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <div key={i} className="bg-[#f1f5f9] rounded h-16" />)}
          </div>
          <div className="bg-[#f1f5f9] rounded h-64" />
        </div>
      )}
    </div>
  )
}

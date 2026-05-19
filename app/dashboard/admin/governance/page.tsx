'use client'

// ─────────────────────────────────────────────────────────────────────────────
// /dashboard/admin/governance — Ortak Yönetişim Sistemi
//
// Monthly shareholder reconciliation & confirmation system.
// Generates immutable snapshots of the company's financial position
// and collects partner signoffs as formal governance records.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

// Print styles injected via a <style> tag so we don't need a global CSS file.
// This hides the sidebar and UI chrome when the user prints / saves as PDF.
const PRINT_STYLE = `
@media print {
  body { background: white !important; }
  [data-print-hide]  { display: none !important; }
  [data-print-show]  { display: block !important; }
  .print\\:text-black { color: #000 !important; }
}
`

// ── Types ─────────────────────────────────────────────────────────────────────

interface PartnerBalance {
  partner_id:      string
  partner_name:    string
  share_ratio_pct: number
  loan_balance_try: number
}

interface Snapshot {
  period_label:           string
  period_start:           string
  period_end:             string
  generated_at:           string
  revenue_try:            number
  cogs_try:               number
  gross_profit_try:       number
  expenses_try:           number
  net_income_try:         number
  total_assets_try:       number
  total_liabilities_try:  number
  total_equity_try:       number
  cash_try:               number
  inventory_try:          number
  cash_runway_months:     number
  burn_rate_monthly_try:  number
  total_receivables_try:  number
  overdue_receivables_try:number
  unpaid_expenses_try:    number
  total_partner_debt_try: number
  partner_count:          number
  partner_balances:       PartnerBalance[]
  situation_status:       'healthy' | 'caution' | 'at-risk' | 'critical'
  composite_score:        number
}

interface Signoff {
  id:           string
  partner_id:   string
  partner_name: string
  signed_at:    string
  notes:        string | null
}

interface GovernanceReport {
  id:           string
  period_label: string
  period_start: string
  period_end:   string
  is_finalized: boolean
  finalized_at: string | null
  generated_at: string
  notes:        string | null
  snapshot:     Snapshot
  governance_signoffs: Signoff[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TRY_FMT = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
function fmt(n: number | undefined | null): string {
  const v = Number(n ?? 0)
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1).replace('.', ',') + 'M ₺'
  if (Math.abs(v) >= 1_000)    return (v / 1_000).toFixed(0) + 'K ₺'
  return TRY_FMT.format(v) + ' ₺'
}
function fmtFull(n: number | undefined | null): string {
  return TRY_FMT.format(Number(n ?? 0)) + ' ₺'
}
function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return iso }
}
function fmtDateTime(iso: string): string {
  try { return new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }
  catch { return iso }
}

const STATUS_THEME = {
  healthy:  { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', label: 'Sağlıklı' },
  caution:  { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   label: 'Dikkat' },
  'at-risk':{ bg: 'bg-orange-50',  border: 'border-orange-200',  text: 'text-orange-700',  label: 'Risk' },
  critical: { bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-700',     label: 'Kritik' },
} as const

// ── Component: Metric card ────────────────────────────────────────────────────

function MetricCard({ label, value, sub, highlight = false }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded border px-4 py-3 ${highlight ? 'border-primary-200 bg-primary-50/50' : 'border-gray-100 bg-white'}`}>
      <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">{label}</div>
      <div className={`text-xl font-black tabular-nums ${highlight ? 'text-primary-700' : 'text-gray-900'}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}

// ── Component: Report detail ──────────────────────────────────────────────────

function ReportDetail({ report, onSignoff, onFinalize, signing, finalizing }: {
  report: GovernanceReport
  onSignoff: (reportId: string, partnerId: string, partnerName: string, notes: string) => Promise<void>
  onFinalize: (reportId: string) => Promise<void>
  signing: boolean
  finalizing: boolean
}) {
  const snap = report.snapshot
  const theme = STATUS_THEME[snap?.situation_status ?? 'caution']
  const [signNotes, setSignNotes] = useState<Record<string, string>>({})

  if (!snap) return (
    <div className="text-sm text-gray-400 p-4">Snapshot verisi yüklenemedi.</div>
  )

  const allPartnersSigned = snap.partner_balances.length > 0
    && snap.partner_balances.every(pb =>
        report.governance_signoffs.some(s => s.partner_id === pb.partner_id)
      )

  return (
    <div className="flex flex-col gap-6">

      {/* Header strip */}
      <div className={`rounded border px-5 py-4 ${theme.bg} ${theme.border} flex items-start justify-between gap-4`}>
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">{snap.period_label} · Yönetişim Raporu</div>
          <div className={`text-lg font-black mt-0.5 ${theme.text}`}>
            {theme.label} · Skor {Math.round(snap.composite_score ?? 0)}/100
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            Oluşturuldu: {fmtDateTime(report.generated_at)}
            {report.is_finalized && ` · Sonuçlandırıldı: ${fmtDateTime(report.finalized_at!)}`}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => window.print()}
            data-print-hide
            title="Bu raporu PDF olarak kaydet veya yazdır"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-200 bg-white text-xs font-semibold text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-colors shadow-sm"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.75 19.5m10.56-5.671L17.25 19.5M4.5 4.227v.227a49.94 49.94 0 0111 0v-.227c0-.995-.717-1.825-1.703-1.98l-2.088-.337a49.72 49.72 0 00-4.218 0l-2.088.337C5.217 2.402 4.5 3.232 4.5 4.227zm12 4.023H3.5" />
            </svg>
            Yazdır / PDF
          </button>
          <div className={`text-2xl font-black tabular-nums ${theme.text}`}>
            {Math.round(snap.composite_score ?? 0)}<span className="text-sm font-semibold">/100</span>
          </div>
        </div>
      </div>

      {/* P&L snapshot */}
      <section>
        <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Dönem Gelir Tablosu</div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          <MetricCard label="Gelir"      value={fmt(snap.revenue_try)} />
          <MetricCard label="SMMM"       value={fmt(snap.cogs_try)} />
          <MetricCard label="Brüt Kâr"   value={fmt(snap.gross_profit_try)} highlight />
          <MetricCard label="Giderler"   value={fmt(snap.expenses_try)} />
          <MetricCard label="Net Kâr"    value={fmt(snap.net_income_try)} highlight={snap.net_income_try > 0} />
        </div>
      </section>

      {/* Balance sheet */}
      <section>
        <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Bilanço Özeti</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricCard label="Toplam Varlık"  value={fmt(snap.total_assets_try)} />
          <MetricCard label="Toplam Borç"    value={fmt(snap.total_liabilities_try)} />
          <MetricCard label="Özkaynaklar"    value={fmt(snap.total_equity_try)} highlight />
          <MetricCard label="Nakit"          value={fmt(snap.cash_try)} />
        </div>
      </section>

      {/* Operational metrics */}
      <section>
        <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Operasyonel Metrikler</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricCard
            label="Nakit Pisti"
            value={snap.cash_runway_months > 0 ? `${snap.cash_runway_months.toFixed(1)} ay` : '—'}
            sub="mevcut hızda"
          />
          <MetricCard
            label="Açık Alacaklar"
            value={fmt(snap.total_receivables_try)}
            sub={snap.overdue_receivables_try > 0 ? `${fmt(snap.overdue_receivables_try)} vadesi geçmiş` : undefined}
          />
          <MetricCard
            label="Ortak Borçları"
            value={fmt(snap.total_partner_debt_try)}
            sub={`${snap.partner_count} aktif ortak`}
          />
          <MetricCard
            label="Ödenmemiş Giderler"
            value={fmt(snap.unpaid_expenses_try)}
          />
        </div>
      </section>

      {/* Partner positions */}
      {snap.partner_balances.length > 0 && (
        <section>
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Ortak Pozisyonları</div>
          <div className="bg-white border border-gray-100 rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Ortak</th>
                  <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Pay</th>
                  <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Borç Bakiyesi</th>
                  <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">İmza</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {snap.partner_balances.map(pb => {
                  const signed = report.governance_signoffs.find(s => s.partner_id === pb.partner_id)
                  return (
                    <tr key={pb.partner_id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-semibold text-gray-900">{pb.partner_name}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-600">%{pb.share_ratio_pct.toFixed(1)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700">{fmtFull(pb.loan_balance_try)}</td>
                      <td className="px-4 py-3 text-right">
                        {signed ? (
                          <div>
                            <div className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5">
                              ✓ {fmtDate(signed.signed_at)}
                            </div>
                            {signed.notes && <div className="text-[10px] text-gray-400 mt-0.5">{signed.notes}</div>}
                          </div>
                        ) : !report.is_finalized ? (
                          <div className="flex items-center gap-2 justify-end">
                            <input
                              type="text"
                              placeholder="Not (isteğe bağlı)"
                              value={signNotes[pb.partner_id] ?? ''}
                              onChange={e => setSignNotes(prev => ({ ...prev, [pb.partner_id]: e.target.value }))}
                              className="text-xs border border-gray-200 rounded px-2 py-1 w-32 focus:outline-none focus:ring-1 focus:ring-primary-400"
                            />
                            <button
                              onClick={() => onSignoff(report.id, pb.partner_id, pb.partner_name, signNotes[pb.partner_id] ?? '')}
                              disabled={signing}
                              className="text-[10px] font-bold text-white bg-primary-600 hover:bg-primary-700 rounded px-2.5 py-1 transition-colors disabled:opacity-60"
                            >
                              {signing ? '…' : 'Onayla'}
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-gray-400">İmzalanmadı</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Notes */}
      {report.notes && (
        <section>
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Notlar</div>
          <div className="bg-gray-50 border border-gray-100 rounded px-4 py-3 text-sm text-gray-700">{report.notes}</div>
        </section>
      )}

      {/* Finalize action */}
      {!report.is_finalized && (
        <div data-print-hide className={`rounded border px-5 py-4 ${allPartnersSigned ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-100'} flex items-center justify-between gap-4`}>
          <div>
            <div className="text-sm font-bold text-gray-900">Raporu Sonuçlandır</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {allPartnersSigned
                ? 'Tüm ortaklar onayladı. Rapor kalıcı olarak kilitlenebilir.'
                : `${report.governance_signoffs.length}/${snap.partner_balances.length} ortak onayı alındı. Sonuçlandırmak için tüm imzaları beklemek zorunda değilsiniz.`}
            </div>
          </div>
          <button
            onClick={() => onFinalize(report.id)}
            disabled={finalizing}
            className="flex-shrink-0 px-4 py-2 rounded bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors disabled:opacity-60"
          >
            {finalizing ? 'Sonuçlandırılıyor…' : 'Sonuçlandır & Kilitle'}
          </button>
        </div>
      )}

      {report.is_finalized && (
        <div className="rounded border border-gray-100 bg-gray-50 px-5 py-4 flex items-center gap-3">
          <div className="text-lg">🔒</div>
          <div>
            <div className="text-sm font-bold text-gray-700">Sonuçlandırıldı</div>
            <div className="text-xs text-gray-400">{fmtDateTime(report.finalized_at!)} · Bu rapor artık değiştirilemez.</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GovernancePage() {
  const now = new Date()

  const [reports,      setReports]      = useState<GovernanceReport[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [generating,   setGenerating]   = useState(false)
  const [signing,      setSigning]      = useState(false)
  const [finalizing,   setFinalizing]   = useState(false)
  const [selectedId,   setSelectedId]   = useState<string | null>(null)
  const [genYear,      setGenYear]      = useState(now.getFullYear())
  const [genMonth,     setGenMonth]     = useState(now.getMonth() + 1)
  const [genNotes,     setGenNotes]     = useState('')
  const [showGenForm,  setShowGenForm]  = useState(false)

  const selectedReport = reports.find(r => r.id === selectedId)

  // ── Load reports ───────────────────────────────────────────────────────────

  const loadReports = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/governance')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setReports(json.reports ?? [])
      if (json.reports?.length > 0 && !selectedId) {
        setSelectedId(json.reports[0].id)
      }
    } catch (e) {
      setError('Raporlar yüklenemedi. governance.sql migration çalıştırıldı mı?')
    } finally {
      setLoading(false)
    }
  }, [selectedId])

  useEffect(() => { loadReports() }, [])  // eslint-disable-line

  // ── Generate report ────────────────────────────────────────────────────────

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/governance', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ year: genYear, month: genMonth, notes: genNotes || undefined }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Rapor oluşturulamadı'); return }
      setShowGenForm(false)
      setGenNotes('')
      await loadReports()
      if (json.report?.id) setSelectedId(json.report.id)
    } catch { setError('Ağ hatası. Lütfen tekrar deneyin.') }
    finally { setGenerating(false) }
  }

  // ── Signoff ────────────────────────────────────────────────────────────────

  async function handleSignoff(reportId: string, partnerId: string, partnerName: string, notes: string) {
    setSigning(true)
    try {
      const res = await fetch(`/api/governance/${reportId}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ partner_id: partnerId, partner_name: partnerName, notes: notes || undefined }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'İmza kaydedilemedi'); return }
      // Update local state without full reload
      setReports(prev => prev.map(r => r.id !== reportId ? r : {
        ...r,
        governance_signoffs: [
          ...r.governance_signoffs.filter(s => s.partner_id !== partnerId),
          { id: json.signoff.id, partner_id: partnerId, partner_name: partnerName, signed_at: json.signoff.signed_at, notes: notes || null },
        ],
      }))
    } catch { setError('İmza kaydedilemedi.') }
    finally { setSigning(false) }
  }

  // ── Finalize ───────────────────────────────────────────────────────────────

  async function handleFinalize(reportId: string) {
    if (!confirm('Raporu sonuçlandırmak istediğinizden emin misiniz? Bu işlem geri alınamaz.')) return
    setFinalizing(true)
    try {
      const res = await fetch(`/api/governance/${reportId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'finalize' }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Sonuçlandırma başarısız'); return }
      setReports(prev => prev.map(r => r.id !== reportId ? r : { ...r, is_finalized: true, finalized_at: json.report.finalized_at }))
    } catch { setError('Sonuçlandırma hatası.') }
    finally { setFinalizing(false) }
  }

  // ── MONTHS ────────────────────────────────────────────────────────────────

  const MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 max-w-5xl">

      {/* Print styles */}
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLE }} />

      {/* Page header */}
      <div className="flex items-start justify-between gap-4" data-print-hide>
        <div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/admin" className="text-xs text-gray-400 hover:text-gray-600">← Yönetim</Link>
          </div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight mt-1">Ortak Yönetişim Sistemi</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Aylık finansal özet, ortak bakiye doğrulama ve resmi onay kaydı
          </p>
        </div>
        <button
          onClick={() => setShowGenForm(v => !v)}
          className="flex-shrink-0 inline-flex items-center gap-1.5 bg-primary-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-primary-700 transition-colors"
        >
          {showGenForm ? '✕ Kapat' : '+ Yeni Rapor'}
        </button>
      </div>

      {/* Generate form */}
      {showGenForm && (
        <div data-print-hide className="bg-white border border-gray-100 rounded px-5 py-5 shadow-sm">
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">Yeni Yönetişim Raporu Oluştur</div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Yıl</label>
              <select
                value={genYear}
                onChange={e => setGenYear(Number(e.target.value))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              >
                {[now.getFullYear() - 1, now.getFullYear()].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Ay</label>
              <select
                value={genMonth}
                onChange={e => setGenMonth(Number(e.target.value))}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              >
                {MONTHS.map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Not (isteğe bağlı)</label>
              <input
                type="text"
                value={genNotes}
                onChange={e => setGenNotes(e.target.value)}
                placeholder="Yönetim kurulu notu…"
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setShowGenForm(false)} className="px-4 py-2 rounded border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
              Vazgeç
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-4 py-2 rounded bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 disabled:opacity-60"
            >
              {generating ? 'Oluşturuluyor…' : 'Rapor Oluştur'}
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div data-print-hide className="bg-red-50 border border-red-200 rounded px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 font-bold text-base ml-3">✕</button>
        </div>
      )}

      {/* Main layout: list + detail */}
      {loading ? (
        <div className="bg-white border border-gray-100 rounded p-8 text-center">
          <div className="text-sm text-gray-400">Yükleniyor…</div>
        </div>
      ) : reports.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded p-10 text-center">
          <div className="text-3xl mb-3">📋</div>
          <div className="text-sm font-semibold text-gray-700 mb-1">Henüz yönetişim raporu yok</div>
          <div className="text-xs text-gray-400 mb-5">
            İlk aylık raporu oluşturarak ortak onay sürecini başlatın.
            <br />Raporlar şirketin o ayki finansal pozisyonunun kalıcı kaydıdır.
          </div>
          <button
            onClick={() => setShowGenForm(true)}
            className="inline-flex items-center gap-1.5 bg-primary-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-primary-700 transition-colors"
          >
            + İlk Raporu Oluştur
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-[260px_1fr] gap-5 items-start">

          {/* Report list */}
          <div data-print-hide className="flex flex-col gap-2">
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 px-1 mb-1">
              {reports.length} Rapor
            </div>
            {reports.map(r => {
              const snap = r.snapshot as Snapshot | undefined
              const theme = STATUS_THEME[snap?.situation_status ?? 'caution']
              const sigCount = r.governance_signoffs.length
              const partCount = snap?.partner_balances.length ?? 0
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={`w-full text-left rounded border px-4 py-3 transition-all ${
                    selectedId === r.id
                      ? 'border-primary-300 bg-primary-50/50 shadow-sm'
                      : 'border-gray-100 bg-white hover:border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-bold text-gray-900 truncate">{r.period_label}</div>
                    {r.is_finalized
                      ? <span className="text-[9px] font-bold text-gray-500 bg-gray-100 rounded px-1.5 py-0.5 flex-shrink-0">🔒</span>
                      : <span className={`text-[9px] font-bold rounded px-1.5 py-0.5 flex-shrink-0 ${theme.text} ${theme.bg} border ${theme.border}`}>{theme.label}</span>
                    }
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">
                    {sigCount}/{partCount} onay · {fmtDate(r.generated_at)}
                  </div>
                  {sigCount > 0 && sigCount < partCount && (
                    <div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-primary-500 rounded-full" style={{ width: `${(sigCount / partCount) * 100}%` }} />
                    </div>
                  )}
                  {sigCount === partCount && partCount > 0 && (
                    <div className="mt-1.5 h-1 bg-emerald-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full w-full" />
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Report detail */}
          <div className="bg-white border border-[#e2e8f0] rounded p-4">
            {selectedReport ? (
              <ReportDetail
                report={selectedReport}
                onSignoff={handleSignoff}
                onFinalize={handleFinalize}
                signing={signing}
                finalizing={finalizing}
              />
            ) : (
              <div className="text-sm text-gray-400 text-center py-8">Soldan bir rapor seçin</div>
            )}
          </div>
        </div>
      )}

      {/* Info footer */}
      <div data-print-hide className="bg-gray-50 border border-gray-100 rounded px-5 py-4 text-xs text-gray-500 leading-relaxed">
        <span className="font-semibold text-gray-700">Yönetişim Kaydı Hakkında:</span>{' '}
        Her rapor, o ay için şirketin finansal pozisyonunun anlık görüntüsüdür.
        Ortaklar kendi paylarını ve bakiyelerini görür, dijital onay verir.
        Sonuçlandırılan raporlar değiştirilemez — yasal uyumluluk için kalıcı kayıt oluşturulur.
      </div>

      {/* Cross-navigation */}
      <div data-print-hide className="flex items-center justify-between px-1">
        <p className="text-[10px] text-gray-400 leading-relaxed">
          Yönetişim raporları denetim izi ve ortak dağıtım verisiyle birlikte değerlendirilmeli.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link href="/dashboard/admin/audit" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Denetim İzi →
          </Link>
          <span className="text-gray-200">|</span>
          <Link href="/dashboard/partners?tab=distribution" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Kâr Dağıtımı →
          </Link>
          <span className="text-gray-200">|</span>
          <Link href="/dashboard/finance?tab=pnl" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            P&amp;L →
          </Link>
        </div>
      </div>
    </div>
  )
}

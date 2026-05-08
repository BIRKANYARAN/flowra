'use client'

// ─────────────────────────────────────────────────────────────────────────────
// /dashboard/partners  —  Ortaklar
//
// CLIENT component — fetches via /api/partners and /api/partners/equalization.
// No direct service class calls from UI.
//
// Zones:
//   • Summary strip  — total capital / distributed / equalization needed
//   • Partner cards  — per-partner borç / dağıtılan / sermaye, share bar,
//                      amber equalization progress, emerald withdrawable badge
//   • Equalization   — when imbalances exist, shows full summary block
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import Link from 'next/link'

// ── Types ──────────────────────────────────────────────────────────────────────

interface PartnerBalance {
  partner_id:            string
  partner_name:          string
  share_ratio:           number
  is_active:             boolean
  total_loaned_try:      number
  total_repaid_try:      number
  total_distributed_try: number
  total_contributed_try: number
  net_loan_try:          number
  // PART 3: capital_in + loan_to_company − loan_repayment − dividend
  // positive = company owes partner
  partner_balance_try:   number
}

interface PartnerRow {
  id:          string
  name:        string
  share_ratio: number
  is_active:   boolean
  balance:     PartnerBalance | null
}

interface EqEntry {
  partner_id:             string
  partner_name:           string
  share_ratio:            number
  total_distributed_try:  number
  per_unit_contribution:  number
  equalization_amount:    number
  pro_rata_share:         number
  total_payout:           number
}

interface EqResult {
  baseline_per_unit:  number
  total_equalization: number
  distributable:      number
  remaining_after_eq: number
  entries:            EqEntry[]
}

const ZERO_EQ: EqResult = {
  baseline_per_unit: 0, total_equalization: 0, distributable: 0,
  remaining_after_eq: 0, entries: [],
}

// ── Partner Ledger (from /api/partners/ledger) ─────────────────────────────────

interface LedgerEntry {
  partner_id:           string
  partner_name:         string
  share_ratio:          number
  is_active:            boolean
  equity_contributed:   number
  loans_given:          number
  loans_repaid:         number
  net_loan_outstanding: number
  dividends_received:   number
  salary_received:      number   // salary + board_fee + huzur_hakki
  equalization_paid:    number   // intra-partner balancing
  company_total_owed:   number
}

interface LedgerSummary {
  total_equity_pool:      number
  total_debt_to_partners: number
  total_dividends:        number
  total_salary_legacy:    number
  debt_to_equity_ratio:   number | null
  partner_count:          number
  active_partner_count:   number
}

interface LedgerData {
  entries: LedgerEntry[]
  summary: LedgerSummary
}

// ── Debt Burden (from /api/partners/debt-burden) ──────────────────────────────

interface DebtBurdenEntry {
  partner_id:             string
  partner_name:           string
  share_ratio:            number
  equity_contributed:     number
  loans_given:            number
  loans_repaid:           number
  net_loan:               number
  per_unit_loan:          number
  financing_multiple:     number
  overfunding_ratio:      number
  repayment_priority:     number
  equalization_repayment: number
}

interface DebtBurdenSummary {
  total_loans_given:       number
  total_loans_repaid:      number
  total_outstanding:       number
  weighted_avg_per_unit:   number
  is_balanced:             boolean
  equalization_needed:     number
  partner_count:           number
}

interface DebtBurdenData {
  entries: DebtBurdenEntry[]
  summary: DebtBurdenSummary
}

// ── Tx history ─────────────────────────────────────────────────────────────────

interface TxRow {
  id:         string
  tx_type:    string
  amount:     number
  currency:   string
  amount_try: number
  tx_date:    string
  notes:      string | null
}

const TX_TYPE_LABELS: Record<string, string> = {
  // Phase 4 canonical
  capital_in:      'Sermaye Girişi',
  loan_to_company: 'Şirkete Borç',
  loan_repayment:  'Geri Ödeme',
  dividend:        'Temettü',
  // Legacy (backward compat)
  loan_in:         'Sermaye Girişi',
  loan_out:        'Ödeme (Çıkış)',
  salary:          'Maaş',
  board_fee:       'Kurul Ücreti',
  // Phase 7 — executive compensation & equalization
  huzur_hakki:     'Huzur Hakkı',
  equalization:    'Eşitleme',
}

// ── Formatters ─────────────────────────────────────────────────────────────────

const _tryFmt = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Full TRY format: 1234567.89 → "1.234.567,89 TL" */
function fmt(n: number) {
  const raw = Number(n) || 0
  return (raw < 0 ? '−' : '') + _tryFmt.format(Math.abs(raw)) + ' TL'
}

function pct(r: number) {
  return `%${(r * 100).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ShareBar({ ratio }: { ratio: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-[80px]">
        <div className="bg-primary-500 h-1.5 rounded-full" style={{ width: `${Math.min(ratio * 100, 100)}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-8">{pct(ratio)}</span>
    </div>
  )
}

function SummarySkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2 animate-pulse">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-gray-100 rounded-xl h-16" />
      ))}
    </div>
  )
}

function CardSkeleton() {
  return (
    <div className="flex flex-col gap-2 animate-pulse">
      {[1, 2].map(i => (
        <div key={i} className="bg-gray-100 rounded-xl h-20" />
      ))}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

// ── Edit/Delete state ─────────────────────────────────────────────────────────
interface EditForm { name: string; shareRatioPct: string }

type ActiveTab = 'partners' | 'ledger' | 'debt'

export default function PartnersPage() {
  const [partners,     setPartners]     = useState<PartnerRow[]>([])
  const [equalization, setEqualization] = useState<EqResult>(ZERO_EQ)
  const [ledger,       setLedger]       = useState<LedgerData | null>(null)
  const [debtBurden,   setDebtBurden]   = useState<DebtBurdenData | null>(null)
  const [activeTab,    setActiveTab]    = useState<ActiveTab>('partners')
  const [loading,      setLoading]      = useState(true)
  const [fetchError,   setFetchError]   = useState<string | null>(null)

  // Keep backward compat flags
  const ledgerTab = activeTab === 'ledger'

  // Edit state
  const [editId,    setEditId]    = useState<string | null>(null)
  const [editForm,  setEditForm]  = useState<EditForm>({ name: '', shareRatioPct: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [editErr,   setEditErr]   = useState<string | null>(null)

  // Transaction history state (lazy-loaded per partner)
  const [partnerTxs,   setPartnerTxs]   = useState<Record<string, TxRow[]>>({})
  const [loadingTxId,  setLoadingTxId]  = useState<string | null>(null)
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        // Fetch partners + real distributable cash + ledger + debt burden in parallel
        const [pRes, distRes, ledgerRes, debtRes] = await Promise.all([
          fetch('/api/partners'),
          fetch('/api/cash-distributable'),
          fetch('/api/partners/ledger'),
          fetch('/api/partners/debt-burden'),
        ])
        if (!pRes.ok) throw new Error(`Partner verisi alınamadı (${pRes.status})`)

        // Real distributable — fall back to 0 gracefully if endpoint fails
        let cashDistributable = 0
        if (distRes.ok) {
          const distJson = await distRes.json().catch(() => null)
          if (distJson && typeof distJson.cash_distributable === 'number') {
            cashDistributable = distJson.cash_distributable
          }
        }

        // Now fetch equalization with the real distributable value
        const eRes = await fetch(`/api/partners/equalization?distributable=${cashDistributable}`)
        if (!eRes.ok) throw new Error(`Eşitleme verisi alınamadı (${eRes.status})`)

        const [pJson, eJson]: [unknown, unknown] = await Promise.all([
          pRes.json(),
          eRes.json(),
        ])
        if (!Array.isArray(pJson)) throw new Error('Partner verisi beklenmedik formatta')
        if (!eJson || typeof eJson !== 'object') throw new Error('Eşitleme verisi beklenmedik formatta')
        const pData = pJson as PartnerRow[]
        const eData = eJson as EqResult

        let ledgerData: LedgerData | null = null
        if (ledgerRes.ok) {
          const lJson = await ledgerRes.json().catch(() => null)
          if (lJson && typeof lJson === 'object' && Array.isArray(lJson.entries)) {
            ledgerData = lJson as LedgerData
          }
        }

        let debtBurdenData: DebtBurdenData | null = null
        if (debtRes.ok) {
          const dJson = await debtRes.json().catch(() => null)
          if (dJson && typeof dJson === 'object' && Array.isArray(dJson.entries)) {
            debtBurdenData = dJson as DebtBurdenData
          }
        }

        if (!cancelled) {
          setPartners(pData)
          setEqualization(eData)
          setLedger(ledgerData)
          setDebtBurden(debtBurdenData)
        }
      } catch (err) {
        if (!cancelled)
          setFetchError(err instanceof Error ? err.message : 'Veri yüklenemedi')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  // ── Edit / delete handlers ────────────────────────────────────────────────────

  function openEdit(p: PartnerRow) {
    setEditId(p.id)
    setEditErr(null)
    const pct = Math.round(p.share_ratio * 10000) / 100   // 0.5 → 50.00
    setEditForm({ name: p.name, shareRatioPct: String(pct) })
  }

  function cancelEdit() { setEditId(null); setEditErr(null) }

  async function saveEdit(partnerId: string) {
    const trimName = editForm.name.trim()
    const ratePct  = parseFloat(editForm.shareRatioPct)
    if (!trimName) { setEditErr('İsim zorunludur.'); return }
    if (!Number.isFinite(ratePct) || ratePct <= 0 || ratePct > 100) {
      setEditErr('Pay oranı 1–100 arasında olmalı.'); return
    }
    setEditSaving(true); setEditErr(null)
    try {
      const res = await fetch(`/api/partners/${partnerId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: trimName, share_ratio: ratePct / 100 }),
      })
      const data = await res.json()
      if (!res.ok) { setEditErr(data.error ?? 'Güncelleme hatası'); setEditSaving(false); return }
      setEditId(null)
      // Refresh without full skeleton flicker
      const pRes = await fetch('/api/partners')
      if (pRes.ok) setPartners(await pRes.json())
    } catch { setEditErr('Ağ hatası') }
    setEditSaving(false)
  }

  async function deletePartner(partnerId: string, name: string) {
    if (!confirm(`"${name}" ortağını silmek istediğinizden emin misiniz?\nBu işlem geri alınamaz.`)) return
    const res = await fetch(`/api/partners/${partnerId}`, { method: 'DELETE' })
    if (res.ok) {
      setPartners(prev => prev.filter(p => p.id !== partnerId))
    }
  }

  // ── Transaction history (lazy per partner) ───────────────────────────────────
  async function toggleTxHistory(partnerId: string) {
    if (expandedTxId === partnerId) { setExpandedTxId(null); return }
    setExpandedTxId(partnerId)
    if (partnerTxs[partnerId]) return // already loaded
    setLoadingTxId(partnerId)
    try {
      const res = await fetch(`/api/partners/${partnerId}/transactions`)
      if (res.ok) {
        const data: TxRow[] = await res.json()
        setPartnerTxs(prev => ({ ...prev, [partnerId]: data }))
      }
    } finally {
      setLoadingTxId(null)
    }
  }

  // ── Derived totals ────────────────────────────────────────────────────────────

  // PART 3: aggregate using partner_balance_try (capital_in + loan − repayment − dividend)
  const totalPartnerBalance = partners.reduce((s, p) => s + (p.balance?.partner_balance_try ?? 0), 0)
  const totalDistributed    = partners.reduce((s, p) => s + (p.balance?.total_distributed_try ?? 0), 0)
  const hasPartners         = partners.length > 0

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4 max-w-4xl">

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight">Ortaklar</h1>
          <p className="text-xs text-gray-400 mt-0.5">Sermaye, borç ve eşitleme durumu</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle — 3 tabs */}
          <div className="flex bg-gray-100 rounded-xl p-0.5">
            {([
              { key: 'partners', label: 'Ortaklar'      },
              { key: 'ledger',   label: 'Finansal Defter'},
              { key: 'debt',     label: 'Borç Dengesi'  },
            ] as const).map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${activeTab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Link
            href="/dashboard/partners/new"
            className="text-sm font-bold bg-primary-600 text-white px-4 py-2 rounded-xl hover:bg-primary-700 transition-colors"
          >
            + Ortak Ekle
          </Link>
        </div>
      </div>

      {/* ── Finansal Defter (ledger tab) ──────────────────────────────────────── */}
      {ledgerTab && (
        <div className="flex flex-col gap-3">
          {loading ? (
            <div className="bg-gray-100 rounded-xl h-40 animate-pulse" />
          ) : !ledger ? (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
              Finansal defter yüklenemedi.
            </div>
          ) : (
            <>
              {/* Summary strip */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Toplam Özkaynak',   value: fmt(ledger.summary.total_equity_pool),      color: 'text-primary-600' },
                  { label: 'Net Borç',           value: fmt(ledger.summary.total_debt_to_partners), color: ledger.summary.total_debt_to_partners > 0 ? 'text-amber-600' : 'text-gray-400' },
                  { label: 'Toplam Temettü',     value: fmt(ledger.summary.total_dividends),        color: 'text-emerald-600' },
                  { label: 'Borç/Özkaynak',      value: ledger.summary.debt_to_equity_ratio !== null ? ledger.summary.debt_to_equity_ratio.toFixed(2) + '×' : '—', color: 'text-gray-700' },
                ].map(c => (
                  <div key={c.label} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                    <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${c.color}`}>{c.label}</div>
                    <div className="text-lg font-black tabular-nums text-gray-900 leading-none">{c.value}</div>
                  </div>
                ))}
              </div>

              {/* Per-partner ledger table */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Ortak</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-primary-400">Özkaynak</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-amber-400">Verilen Borç</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Geri Ödenen</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-amber-600">Net Borç</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-emerald-500">Temettü</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Maaş/Huzur</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-primary-700">Şirket Borcu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {ledger.entries.map(e => (
                      <tr key={e.partner_id} className={`hover:bg-gray-50/60 ${!e.is_active ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-3 font-semibold text-gray-900">
                          {e.partner_name}
                          {!e.is_active && <span className="ml-1.5 text-[9px] text-gray-400 font-normal">(pasif)</span>}
                          <div className="text-[10px] text-gray-400 font-normal">{pct(e.share_ratio)}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-primary-700 font-bold">{fmt(e.equity_contributed)}</td>
                        <td className="px-4 py-3 text-right font-mono text-amber-600">{fmt(e.loans_given)}</td>
                        <td className="px-4 py-3 text-right font-mono text-gray-500">{fmt(e.loans_repaid)}</td>
                        <td className={`px-4 py-3 text-right font-mono font-bold ${e.net_loan_outstanding > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                          {fmt(e.net_loan_outstanding)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-600">{fmt(e.dividends_received)}</td>
                        <td className="px-4 py-3 text-right font-mono text-gray-500">{fmt(e.salary_received)}</td>
                        <td className="px-4 py-3 text-right font-mono font-black text-primary-800">{fmt(e.company_total_owed)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-gray-400 text-center leading-relaxed">
                Şirket Borcu = Özkaynak + Net Borç. Özkaynak tasfiyede; borç talep üzerine ödenir.
              </p>
            </>
          )}
        </div>
      )}

      {/* ── Borç Dengesi (debt burden tab) ───────────────────────────────────── */}
      {activeTab === 'debt' && (
        <div className="flex flex-col gap-3">
          {loading ? (
            <div className="bg-gray-100 rounded-xl h-40 animate-pulse" />
          ) : !debtBurden ? (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
              Borç dengesi yüklenemedi.
            </div>
          ) : (
            <>
              {/* Summary strip */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Toplam Borç',    value: fmt(debtBurden.summary.total_loans_given),    color: 'text-amber-600' },
                  { label: 'Toplam Ödenen',  value: fmt(debtBurden.summary.total_loans_repaid),   color: 'text-emerald-600' },
                  { label: 'Kalan Borç',     value: fmt(debtBurden.summary.total_outstanding),    color: debtBurden.summary.total_outstanding > 0 ? 'text-red-600' : 'text-gray-400' },
                  {
                    label: 'Denge Durumu',
                    value: debtBurden.summary.is_balanced ? 'Dengeli ✓' : `${fmt(debtBurden.summary.equalization_needed)} eşitleme`,
                    color: debtBurden.summary.is_balanced ? 'text-emerald-600' : 'text-amber-600',
                  },
                ].map(c => (
                  <div key={c.label} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                    <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${c.color}`}>{c.label}</div>
                    <div className="text-base font-black tabular-nums text-gray-900 leading-none">{c.value}</div>
                  </div>
                ))}
              </div>

              {/* Burden info box */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700 leading-relaxed">
                <strong>Nasıl çalışır?</strong> Birim başına borç = Net borç ÷ Pay oranı.
                Ağırlıklı ortalama ({fmt(debtBurden.summary.weighted_avg_per_unit)}/birim) üzerinde olan ortaklar
                <strong> önce</strong> geri ödeme alır. Eşitleme tamamlandıktan sonra kalan ödemeler pay oranına göre paylaşılır.
              </div>

              {/* Per-partner debt burden table */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Ortak</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-amber-500">Net Borç</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Birim Başına</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Fin. Katsayı</th>
                      <th className="text-center px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Yük Oranı</th>
                      <th className="text-center px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-primary-500">Öncelik</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-amber-700">Eşitleme Ödemesi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {debtBurden.entries
                      .slice()
                      .sort((a, b) => a.repayment_priority - b.repayment_priority)
                      .map(e => {
                        const isOver = e.overfunding_ratio > 1.05
                        const isUnder = e.overfunding_ratio < 0.95
                        return (
                          <tr key={e.partner_id} className="hover:bg-gray-50/60">
                            <td className="px-4 py-3 font-semibold text-gray-900">
                              {e.partner_name}
                              <div className="text-[10px] text-gray-400 font-normal">{pct(e.share_ratio)}</div>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-amber-700 font-bold">{fmt(e.net_loan)}</td>
                            <td className="px-4 py-3 text-right font-mono text-gray-600">{fmt(e.per_unit_loan)}</td>
                            <td className="px-4 py-3 text-right font-mono text-gray-500">
                              {e.financing_multiple > 0 ? `${e.financing_multiple.toFixed(2)}×` : '—'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                isOver  ? 'bg-red-100 text-red-700'     :
                                isUnder ? 'bg-blue-100 text-blue-700'   :
                                          'bg-emerald-100 text-emerald-700'
                              }`}>
                                {isOver ? '▲ ' : isUnder ? '▼ ' : '= '}{e.overfunding_ratio.toFixed(2)}×
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                e.repayment_priority === 1 ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-500'
                              }`}>
                                #{e.repayment_priority}
                              </span>
                            </td>
                            <td className={`px-4 py-3 text-right font-mono font-bold ${
                              e.equalization_repayment > 0 ? 'text-amber-700' : 'text-gray-300'
                            }`}>
                              {e.equalization_repayment > 0 ? fmt(e.equalization_repayment) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-gray-400 text-center leading-relaxed">
                Birim Başına = Net Borç ÷ Pay Oranı. Yük Oranı &gt;1 = ortalama üstünde; önce ödenir.
                Eşitleme ödemesi: bu ortağı ağırlıklı ortalamaya getirmeye yetecek ödeme tutarı.
              </p>
            </>
          )}
        </div>
      )}

      {/* ── Partners view (hidden when showing ledger tab) ────────────────────── */}
      {activeTab === 'partners' && fetchError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 font-medium">
          ⚠ {fetchError}
        </div>
      )}

      {/* ── Summary strip ─────────────────────────────────────────────────────── */}
      {activeTab === 'partners' && loading ? <SummarySkeleton /> : activeTab === 'partners' && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Toplam Bakiye',     value: fmt(totalPartnerBalance),              color: 'text-primary-600'  },
            { label: 'Toplam Dağıtılan',  value: fmt(totalDistributed),                 color: 'text-emerald-600' },
            {
              label: 'Eşitleme Gereken',
              value: fmt(equalization.total_equalization),
              color: equalization.total_equalization > 0 ? 'text-amber-600' : 'text-gray-400',
            },
          ].map(c => (
            <div key={c.label} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
              <div className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${c.color}`}>{c.label}</div>
              <div className="text-2xl font-black tabular-nums text-gray-900 leading-none">{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Partner cards / Loading / Empty ───────────────────────────────────── */}
      {activeTab === 'partners' && loading && <CardSkeleton />}

      {activeTab === 'partners' && !loading && !hasPartners && !fetchError && (
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-12 text-center">
          <div className="text-3xl mb-3">🤝</div>
          <div className="text-sm font-semibold text-gray-500">Henüz ortak eklenmemiş</div>
          <div className="text-xs text-gray-400 mt-1">
            Ortakları ekleyerek sermaye ve dağıtım takibi yapabilirsiniz.
          </div>
        </div>
      )}

      {activeTab === 'partners' && !loading && hasPartners && (
        <>
          {/* ── Per-partner cards ─────────────────────────────────────────────── */}
          <div className="flex flex-col gap-2">
            {partners.map((p) => {
              const b           = p.balance
              const contributed = b?.total_contributed_try ?? 0

              // Equalization gap for this partner
              const eqEntry    = equalization.entries.find(e => e.partner_id === p.id)
              const eqTarget   = equalization.baseline_per_unit * p.share_ratio
              const eqNeeded   = equalization.baseline_per_unit > 0 && eqEntry
                ? Math.max(0, eqTarget - contributed)
                : 0
              const isUnderFunded = eqNeeded > 0.01

              // Withdrawable (payout if distributable were available)
              const withdrawable = eqEntry?.total_payout ?? 0

              const isEditing = editId === p.id

              return (
                <div
                  key={p.id}
                  className={`bg-white border rounded-xl px-5 py-4 group ${
                    isUnderFunded ? 'border-amber-200' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">

                    {/* Left — identity + share */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-bold text-gray-900 text-sm">{p.name}</span>

                        {!p.is_active && (
                          <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-lg font-semibold">
                            Pasif
                          </span>
                        )}

                        {isUnderFunded && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">
                            ⚠ Eşitleme gerekli
                          </span>
                        )}

                        {withdrawable > 0.01 && !isUnderFunded && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">
                            ✓ {fmt(withdrawable)} çekilebilir
                          </span>
                        )}
                      </div>
                      <ShareBar ratio={p.share_ratio} />
                    </div>

                    {/* Right — financials */}
                    <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-right shrink-0">
                      <div>
                        <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Bakiye</div>
                        <div className={`text-sm font-black tabular-nums ${(b?.partner_balance_try ?? 0) > 0 ? 'text-primary-700' : 'text-gray-400'}`}>
                          {fmt(b?.partner_balance_try ?? 0)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Dağıtılan</div>
                        <div className="text-sm font-black tabular-nums text-gray-700">
                          {fmt(b?.total_distributed_try ?? 0)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Sermaye</div>
                        <div className="text-sm font-black tabular-nums text-gray-900">
                          {fmt(contributed)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Equalization bar — only when underfunded */}
                  {isUnderFunded && equalization.baseline_per_unit > 0 && (
                    <div className="mt-3 pt-3 border-t border-amber-100">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-amber-700 font-semibold">
                          Eşitleme açığı: {fmt(eqNeeded)}
                        </span>
                        <span className="text-gray-400">
                          Hedef: {fmt(eqTarget)}
                        </span>
                      </div>
                      <div className="mt-1.5 bg-amber-50 rounded-full h-1.5">
                        <div
                          className="bg-amber-400 h-1.5 rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, eqTarget > 0 ? (contributed / eqTarget) * 100 : 0)}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* ── Inline edit form ───────────────────────────────────────── */}
                  {isEditing ? (
                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                            İsim
                          </label>
                          <input
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-40000"
                            value={editForm.name}
                            onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                            autoFocus
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                            Pay Oranı (%)
                          </label>
                          <input
                            type="number" min="0.01" max="100" step="0.01"
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-40000"
                            value={editForm.shareRatioPct}
                            onChange={e => setEditForm(f => ({ ...f, shareRatioPct: e.target.value }))}
                          />
                        </div>
                      </div>
                      {editErr && (
                        <p className="text-xs text-red-600">{editErr}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(p.id)}
                          disabled={editSaving}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
                        >
                          {editSaving ? 'Kaydediliyor...' : 'Kaydet'}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          İptal
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── Action buttons (visible on hover) ──────────────────── */
                    <div className="mt-2 pt-2 border-t border-gray-50 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEdit(p)}
                        className="text-xs text-gray-400 hover:text-primary-600 px-2 py-1 rounded-lg hover:bg-primary-50 transition-colors"
                      >
                        Düzenle
                      </button>
                      <button
                        onClick={() => toggleTxHistory(p.id)}
                        className="text-xs text-gray-400 hover:text-primary-600 px-2 py-1 rounded-lg hover:bg-primary-50 transition-colors"
                      >
                        {expandedTxId === p.id ? 'Geçmişi Gizle ↑' : 'Geçmiş ↓'}
                      </button>
                      <button
                        onClick={() => deletePartner(p.id, p.name)}
                        className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        Sil
                      </button>
                    </div>
                  )}

                  {/* ── Transaction history (lazy-loaded, toggle) ────────────── */}
                  {expandedTxId === p.id && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                        İşlem Geçmişi
                      </div>
                      {loadingTxId === p.id ? (
                        <div className="py-3 text-xs text-gray-400">Yükleniyor...</div>
                      ) : !partnerTxs[p.id] || partnerTxs[p.id].length === 0 ? (
                        <div className="py-3 text-xs text-gray-400">Kayıtlı işlem yok.</div>
                      ) : (
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {partnerTxs[p.id].map(tx => (
                            <div key={tx.id} className="flex items-center justify-between text-xs py-1 border-b border-gray-50 last:border-0">
                              <div className="min-w-0">
                                <span className="font-semibold text-gray-700">
                                  {TX_TYPE_LABELS[tx.tx_type] ?? tx.tx_type}
                                </span>
                                {tx.notes && <span className="text-gray-400 ml-1.5">· {tx.notes}</span>}
                                <div className="text-gray-400">{tx.tx_date?.slice(0, 10)}</div>
                              </div>
                              <span className={`shrink-0 font-black tabular-nums ml-4 ${
                                ['loan_out','salary','board_fee','dividend','huzur_hakki','equalization'].includes(tx.tx_type)
                                  ? 'text-red-600' : 'text-emerald-700'
                              }`}>
                                {fmt(tx.amount_try)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* ── Equalization summary block ─────────────────────────────────────── */}
          {equalization.total_equalization > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-2">
                Eşitleme Özeti
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Toplam eşitleme gereken: </span>
                  <span className="font-bold text-amber-700">{fmt(equalization.total_equalization)}</span>
                </div>
                <div>
                  <span className="text-gray-500">Baz (birim başına): </span>
                  <span className="font-bold text-gray-700">{fmt(equalization.baseline_per_unit)}</span>
                </div>
              </div>
              <p className="text-xs text-amber-600 mt-2 leading-relaxed">
                En yüksek sermaye katkısı birim başına {fmt(equalization.baseline_per_unit)}.
                Altında kalan ortaklar bu tutara ulaşana kadar öncelikli dağıtım alır.
              </p>
            </div>
          )}
        </>
      )}

    </div>
  )
}

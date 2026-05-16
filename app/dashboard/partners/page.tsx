'use client'

// ─────────────────────────────────────────────────────────────────────────────
// /dashboard/partners — Ortak Finans Merkezi
//
// Tabs:
//   1. Ortaklar       — per-partner cards, equalization, share bars
//   2. Finansal Defter — full ledger table (equity, loans, dividends)
//   3. Geri Ödeme     — normalized two-phase waterfall
//   4. Trancheler     — debt tranche detail + repayment progress
//   5. Kâr Dağıtımı  — 4-layer distribution safety + Turkish compliance
//   6. Getiri         — per-partner ROI and capital return metrics
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

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
  partner_id:            string
  partner_name:          string
  share_ratio:           number
  per_unit_contribution: number
  equalization_amount:   number
  pro_rata_share:        number
  total_payout:          number
}

interface EqResult {
  baseline_per_unit:  number
  total_equalization: number
  distributable:      number
  remaining_after_eq: number
  entries:            EqEntry[]
}

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
  salary_received:      number
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

interface WaterfallStep {
  tranche_id:    string
  partner_name:  string
  component:     string
  allocated_try: number
  description:   string
}

interface DebtTranche {
  id:                       string
  partner_id:               string
  partner_name:             string
  principal_try:            number
  remaining_principal_try:  number
  actual_repaid_try:        number
  status:                   'active' | 'partially_repaid' | 'repaid' | 'overdue'
  days_outstanding:         number
}

interface WaterfallData {
  available_cash_try:    number
  tranches:              DebtTranche[]
  steps:                 WaterfallStep[]
  total_debt_try:        number
  remaining_after_debt:  number
  debt_clearance_months?: number
}

interface CapitalReturn {
  partner_id:         string
  partner_name:       string
  total_invested_try: number
  total_returned_try: number
  roi_to_date_pct:    number
}

interface TxRow {
  id:         string
  tx_type:    string
  amount:     number
  currency:   string
  amount_try: number
  tx_date:    string
  notes:      string | null
}

interface DistributionLayers {
  gross_net_income_try:    number
  legal_reserve_try:       number
  board_retained_try:      number
  unpaid_compensation_try: number
  distributable_gross_try: number
  withholding_tax_try:     number
  distributable_net_try:   number
  is_distributable:        boolean
  block_reason?:           string
}

interface PartnerDistribEntry {
  partner_id:            string
  partner_name:          string
  share_ratio:           number
  gross_entitlement_try: number
  withholding_try:       number
  net_entitlement_try:   number
}

interface ComplianceWarning {
  type:     string
  severity: 'info' | 'warning' | 'error'
  message:  string
  amount?:  number
}

interface DistribState {
  distribution_layers:      DistributionLayers
  per_partner_distribution: PartnerDistribEntry[]
  compliance_warnings:      ComplianceWarning[]
}

type TabId = 'partners' | 'ledger' | 'waterfall' | 'tranches' | 'distribution' | 'returns'

const TX_TYPE_LABELS: Record<string, string> = {
  capital_in:      'Sermaye Girişi',
  loan_to_company: 'Şirkete Borç',
  loan_repayment:  'Geri Ödeme',
  dividend:        'Temettü',
  loan_in:         'Sermaye Girişi',
  loan_out:        'Ödeme (Çıkış)',
  salary:          'Maaş',
  board_fee:       'Kurul Ücreti',
}

const STATUS_LABELS: Record<DebtTranche['status'], string> = {
  active:           'Aktif',
  partially_repaid: 'Kısmi Ödendi',
  repaid:           'Ödendi',
  overdue:          'Vadesi Geçmiş',
}

const ZERO_EQ: EqResult = {
  baseline_per_unit: 0, total_equalization: 0, distributable: 0,
  remaining_after_eq: 0, entries: [],
}

// ── Formatters ─────────────────────────────────────────────────────────────────

const _tryFmt = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function fmt(n: number) {
  const raw = Number(n) || 0
  return (raw < 0 ? '−' : '') + _tryFmt.format(Math.abs(raw)) + ' TL'
}

function pct(r: number) {
  return `%${(r * 100).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function fmtPct(v: number) {
  return `%${v.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`
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

function Skeleton({ h = 'h-16' }: { h?: string }) {
  return <div className={`bg-gray-100 rounded-xl ${h} animate-pulse`} />
}

function TabBtn({ id, active, label, onClick }: { id: TabId; active: boolean; label: string; onClick: (id: TabId) => void }) {
  return (
    <button
      onClick={() => onClick(id)}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
        active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {label}
    </button>
  )
}

// ── Status badge for debt tranches ─────────────────────────────────────────────

function StatusPill({ status }: { status: DebtTranche['status'] }) {
  const cls = {
    active:           'bg-blue-50 text-blue-700',
    partially_repaid: 'bg-amber-50 text-amber-700',
    repaid:           'bg-emerald-50 text-emerald-700',
    overdue:          'bg-red-50 text-red-700',
  }[status]
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cls}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

// ── ROI Meter ─────────────────────────────────────────────────────────────────

function RoiBar({ pct: roiPct }: { pct: number }) {
  const capped = Math.min(roiPct, 200)
  const color  = roiPct >= 100 ? 'bg-emerald-500' : roiPct >= 50 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-2 max-w-[120px]">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${Math.max(2, capped / 2)}%` }} />
      </div>
      <span className={`text-xs font-bold tabular-nums ${roiPct >= 100 ? 'text-emerald-600' : roiPct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
        {fmtPct(roiPct)}
      </span>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

interface EditForm { name: string; shareRatioPct: string }

export default function PartnersPage() {
  const [activeTab,    setActiveTab]    = useState<TabId>('partners')
  const [partners,     setPartners]     = useState<PartnerRow[]>([])
  const [equalization, setEqualization] = useState<EqResult>(ZERO_EQ)
  const [ledger,       setLedger]       = useState<LedgerData | null>(null)
  const [waterfall,    setWaterfall]    = useState<WaterfallData | null>(null)
  const [returns,      setReturns]      = useState<CapitalReturn[]>([])
  const [distrib,      setDistrib]      = useState<DistribState | null>(null)
  const [distribLoading, setDistribLoading] = useState(false)
  const [netIncomeInput, setNetIncomeInput] = useState('')
  const [boardRetainedInput, setBoardRetainedInput] = useState('')
  const [loading,      setLoading]      = useState(true)
  const [fetchError,   setFetchError]   = useState<string | null>(null)
  const [availCash,    setAvailCash]    = useState(0)

  // Edit state
  const [editId,     setEditId]     = useState<string | null>(null)
  const [editForm,   setEditForm]   = useState<EditForm>({ name: '', shareRatioPct: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [editErr,    setEditErr]    = useState<string | null>(null)

  // Tx history
  const [partnerTxs,   setPartnerTxs]   = useState<Record<string, TxRow[]>>({})
  const [loadingTxId,  setLoadingTxId]  = useState<string | null>(null)
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null)

  const loadWaterfall = useCallback(async (cash: number) => {
    try {
      const res = await fetch(`/api/partners/waterfall?available_cash=${cash}`)
      if (res.ok) {
        const json = await res.json()
        setWaterfall(json.waterfall ?? null)
        setReturns(json.projections ?? [])
      }
    } catch { /* silent */ }
  }, [])

  const loadDistribution = useCallback(async (netIncome: number, boardRetained: number) => {
    setDistribLoading(true)
    try {
      const params = new URLSearchParams({
        net_income:     String(netIncome),
        board_retained: String(boardRetained),
      })
      const res = await fetch(`/api/partners/pcle/distribute?${params}`)
      if (res.ok) {
        const json = await res.json()
        setDistrib(json as DistribState)
      }
    } catch { /* silent */ }
    setDistribLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [pRes, distRes, ledgerRes] = await Promise.all([
          fetch('/api/partners'),
          fetch('/api/cash-distributable'),
          fetch('/api/partners/ledger'),
        ])
        if (!pRes.ok) throw new Error(`Partner verisi alınamadı (${pRes.status})`)

        let cashDistributable = 0
        if (distRes.ok) {
          const distJson = await distRes.json().catch(() => null)
          if (distJson && typeof distJson.cash_distributable === 'number') {
            cashDistributable = distJson.cash_distributable
          }
        }

        const eRes = await fetch(`/api/partners/equalization?distributable=${cashDistributable}`)
        if (!eRes.ok) throw new Error(`Eşitleme verisi alınamadı (${eRes.status})`)

        const [pJson, eJson]: [unknown, unknown] = await Promise.all([pRes.json(), eRes.json()])
        if (!Array.isArray(pJson)) throw new Error('Partner verisi beklenmedik formatta')

        let ledgerData: LedgerData | null = null
        if (ledgerRes.ok) {
          const lJson = await ledgerRes.json().catch(() => null)
          if (lJson && typeof lJson === 'object' && Array.isArray(lJson.entries)) {
            ledgerData = lJson as LedgerData
          }
        }

        if (!cancelled) {
          setPartners(pJson as PartnerRow[])
          setEqualization(eJson as EqResult)
          setLedger(ledgerData)
          setAvailCash(cashDistributable)
        }

        // Waterfall + returns in parallel
        const wRes = await fetch(`/api/partners/waterfall?available_cash=${cashDistributable}`)
        if (wRes.ok && !cancelled) {
          const wJson = await wRes.json()
          setWaterfall(wJson.waterfall ?? null)
          setReturns(wJson.projections ?? [])
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

  // ── Edit / delete handlers ─────────────────────────────────────────────────────

  function openEdit(p: PartnerRow) {
    setEditId(p.id); setEditErr(null)
    const pctVal = Math.round(p.share_ratio * 10000) / 100
    setEditForm({ name: p.name, shareRatioPct: String(pctVal) })
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
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ name: trimName, share_ratio: ratePct / 100 }),
      })
      const data = await res.json()
      if (!res.ok) { setEditErr(data.error ?? 'Güncelleme hatası'); setEditSaving(false); return }
      setEditId(null)
      const pRes = await fetch('/api/partners')
      if (pRes.ok) setPartners(await pRes.json())
    } catch { setEditErr('Ağ hatası') }
    setEditSaving(false)
  }

  async function deletePartner(partnerId: string, name: string) {
    if (!confirm(`"${name}" ortağını silmek istediğinizden emin misiniz?`)) return
    const res = await fetch(`/api/partners/${partnerId}`, { method: 'DELETE' })
    if (res.ok) setPartners(prev => prev.filter(p => p.id !== partnerId))
  }

  async function toggleTxHistory(partnerId: string) {
    if (expandedTxId === partnerId) { setExpandedTxId(null); return }
    setExpandedTxId(partnerId)
    if (partnerTxs[partnerId]) return
    setLoadingTxId(partnerId)
    try {
      const res = await fetch(`/api/partners/${partnerId}/transactions`)
      if (res.ok) { const data: TxRow[] = await res.json(); setPartnerTxs(prev => ({ ...prev, [partnerId]: data })) }
    } finally { setLoadingTxId(null) }
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  const totalPartnerBalance = partners.reduce((s, p) => s + (p.balance?.partner_balance_try ?? 0), 0)
  const totalDistributed    = partners.reduce((s, p) => s + (p.balance?.total_distributed_try ?? 0), 0)
  const hasPartners         = partners.length > 0
  const totalDebt           = waterfall?.total_debt_try ?? 0

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4 max-w-4xl">

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight">Ortak Finans Merkezi</h1>
          <p className="text-xs text-gray-400 mt-0.5">Sermaye · Borç · Eşitleme · Geri Dönüş</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-xl p-0.5">
            {([
              { id: 'partners',     label: 'Ortaklar'      },
              { id: 'ledger',       label: 'Defter'         },
              { id: 'waterfall',    label: 'Geri Ödeme'     },
              { id: 'tranches',     label: 'Trancheler'     },
              { id: 'distribution', label: 'Kâr Dağıtımı'  },
              { id: 'returns',      label: 'Getiri'         },
            ] as { id: TabId; label: string }[]).map(t => (
              <TabBtn key={t.id} id={t.id} active={activeTab === t.id} label={t.label} onClick={setActiveTab} />
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

      {fetchError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 font-medium">
          {fetchError}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB 1: ORTAKLAR                                                       */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'partners' && (
        <>
          {loading ? (
            <div className="grid grid-cols-3 gap-2">
              {[1,2,3].map(i => <Skeleton key={i} />)}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Toplam Bakiye',    value: fmt(totalPartnerBalance),              color: 'text-primary-600' },
                { label: 'Toplam Dağıtılan', value: fmt(totalDistributed),                 color: 'text-emerald-600' },
                { label: 'Eşitleme Gereken', value: fmt(equalization.total_equalization),  color: equalization.total_equalization > 0 ? 'text-amber-600' : 'text-gray-400' },
              ].map(c => (
                <div key={c.label} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                  <div className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${c.color}`}>{c.label}</div>
                  <div className="text-2xl font-black tabular-nums text-gray-900 leading-none">{c.value}</div>
                </div>
              ))}
            </div>
          )}

          {loading && <div className="flex flex-col gap-2"><Skeleton h="h-20" /><Skeleton h="h-20" /></div>}

          {!loading && !hasPartners && !fetchError && (
            <div className="bg-white border border-gray-200 rounded-xl px-6 py-12 text-center">
              <div className="text-3xl mb-3">🤝</div>
              <div className="text-sm font-semibold text-gray-500">Henüz ortak eklenmemiş</div>
            </div>
          )}

          {!loading && hasPartners && (
            <>
              <div className="flex flex-col gap-2">
                {partners.map(p => {
                  const b        = p.balance
                  const contributed = b?.total_contributed_try ?? 0
                  const eqEntry  = equalization.entries.find(e => e.partner_id === p.id)
                  const eqTarget = equalization.baseline_per_unit * p.share_ratio
                  const eqNeeded = equalization.baseline_per_unit > 0 && eqEntry
                    ? Math.max(0, eqTarget - contributed)
                    : 0
                  const isUnderFunded = eqNeeded > 0.01
                  const withdrawable  = eqEntry?.total_payout ?? 0
                  const isEditing     = editId === p.id

                  return (
                    <div key={p.id} className={`bg-white border rounded-xl px-5 py-4 group ${isUnderFunded ? 'border-amber-200' : 'border-gray-200'}`}>
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-bold text-gray-900 text-sm">{p.name}</span>
                            {!p.is_active && <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-lg font-semibold">Pasif</span>}
                            {isUnderFunded && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">⚠ Eşitleme gerekli</span>}
                            {withdrawable > 0.01 && !isUnderFunded && (
                              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">
                                ✓ {fmt(withdrawable)} çekilebilir
                              </span>
                            )}
                          </div>
                          <ShareBar ratio={p.share_ratio} />
                        </div>
                        <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-right shrink-0">
                          <div>
                            <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Bakiye</div>
                            <div className={`text-sm font-black tabular-nums ${(b?.partner_balance_try ?? 0) > 0 ? 'text-primary-700' : 'text-gray-400'}`}>
                              {fmt(b?.partner_balance_try ?? 0)}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Dağıtılan</div>
                            <div className="text-sm font-black tabular-nums text-gray-700">{fmt(b?.total_distributed_try ?? 0)}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Sermaye</div>
                            <div className="text-sm font-black tabular-nums text-gray-900">{fmt(contributed)}</div>
                          </div>
                        </div>
                      </div>

                      {isUnderFunded && equalization.baseline_per_unit > 0 && (
                        <div className="mt-3 pt-3 border-t border-amber-100">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-amber-700 font-semibold">Eşitleme açığı: {fmt(eqNeeded)}</span>
                            <span className="text-gray-400">Hedef: {fmt(eqTarget)}</span>
                          </div>
                          <div className="mt-1.5 bg-amber-50 rounded-full h-1.5">
                            <div
                              className="bg-amber-400 h-1.5 rounded-full transition-all"
                              style={{ width: `${Math.min(100, eqTarget > 0 ? (contributed / eqTarget) * 100 : 0)}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {isEditing ? (
                        <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">İsim</label>
                              <input
                                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                                value={editForm.name}
                                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                                autoFocus
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Pay Oranı (%)</label>
                              <input
                                type="number" min="0.01" max="100" step="0.01"
                                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                                value={editForm.shareRatioPct}
                                onChange={e => setEditForm(f => ({ ...f, shareRatioPct: e.target.value }))}
                              />
                            </div>
                          </div>
                          {editErr && <p className="text-xs text-red-600">{editErr}</p>}
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveEdit(p.id)} disabled={editSaving}
                              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
                            >
                              {editSaving ? 'Kaydediliyor...' : 'Kaydet'}
                            </button>
                            <button onClick={cancelEdit} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                              İptal
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 pt-2 border-t border-gray-50 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(p)} className="text-xs text-gray-400 hover:text-primary-600 px-2 py-1 rounded-lg hover:bg-primary-50 transition-colors">Düzenle</button>
                          <button onClick={() => toggleTxHistory(p.id)} className="text-xs text-gray-400 hover:text-primary-600 px-2 py-1 rounded-lg hover:bg-primary-50 transition-colors">
                            {expandedTxId === p.id ? 'Geçmişi Gizle ↑' : 'Geçmiş ↓'}
                          </button>
                          <button onClick={() => deletePartner(p.id, p.name)} className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">Sil</button>
                        </div>
                      )}

                      {expandedTxId === p.id && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">İşlem Geçmişi</div>
                          {loadingTxId === p.id ? (
                            <div className="py-3 text-xs text-gray-400">Yükleniyor...</div>
                          ) : !partnerTxs[p.id] || partnerTxs[p.id].length === 0 ? (
                            <div className="py-3 text-xs text-gray-400">Kayıtlı işlem yok.</div>
                          ) : (
                            <div className="space-y-1 max-h-48 overflow-y-auto">
                              {partnerTxs[p.id].map(tx => (
                                <div key={tx.id} className="flex items-center justify-between text-xs py-1 border-b border-gray-50 last:border-0">
                                  <div className="min-w-0">
                                    <span className="font-semibold text-gray-700">{TX_TYPE_LABELS[tx.tx_type] ?? tx.tx_type}</span>
                                    {tx.notes && <span className="text-gray-400 ml-1.5">· {tx.notes}</span>}
                                    <div className="text-gray-400">{tx.tx_date?.slice(0, 10)}</div>
                                  </div>
                                  <span className={`shrink-0 font-black tabular-nums ml-4 ${['loan_out','salary','board_fee','dividend'].includes(tx.tx_type) ? 'text-red-600' : 'text-emerald-700'}`}>
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

              {equalization.total_equalization > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-2">Eşitleme Özeti</div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><span className="text-gray-500">Toplam eşitleme gereken: </span><span className="font-bold text-amber-700">{fmt(equalization.total_equalization)}</span></div>
                    <div><span className="text-gray-500">Baz (birim başına): </span><span className="font-bold text-gray-700">{fmt(equalization.baseline_per_unit)}</span></div>
                  </div>
                  <p className="text-xs text-amber-600 mt-2 leading-relaxed">
                    En yüksek sermaye katkısı birim başına {fmt(equalization.baseline_per_unit)}.
                    Altında kalan ortaklar bu tutara ulaşana kadar öncelikli dağıtım alır.
                  </p>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB 2: FİNANSAL DEFTER                                                */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'ledger' && (
        <div className="flex flex-col gap-3">
          {loading ? <Skeleton h="h-40" /> : !ledger ? (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">Finansal defter yüklenemedi.</div>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Toplam Özkaynak',  value: fmt(ledger.summary.total_equity_pool),      color: 'text-primary-600' },
                  { label: 'Net Borç',          value: fmt(ledger.summary.total_debt_to_partners), color: ledger.summary.total_debt_to_partners > 0 ? 'text-amber-600' : 'text-gray-400' },
                  { label: 'Toplam Temettü',    value: fmt(ledger.summary.total_dividends),        color: 'text-emerald-600' },
                  { label: 'Borç/Özkaynak',     value: ledger.summary.debt_to_equity_ratio !== null ? ledger.summary.debt_to_equity_ratio.toFixed(2) + '×' : '—', color: 'text-gray-700' },
                ].map(c => (
                  <div key={c.label} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                    <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${c.color}`}>{c.label}</div>
                    <div className="text-lg font-black tabular-nums text-gray-900 leading-none">{c.value}</div>
                  </div>
                ))}
              </div>
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      {['Ortak','Özkaynak','Verilen Borç','Geri Ödenen','Net Borç','Temettü','Maaş/Huzur','Şirket Borcu'].map(h => (
                        <th key={h} className={`px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400 ${h === 'Ortak' ? 'text-left' : 'text-right'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {ledger.entries.map(e => (
                      <tr key={e.partner_id} className={`hover:bg-gray-50/60 ${!e.is_active ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-3 font-semibold text-gray-900">
                          {e.partner_name}
                          {!e.is_active && <span className="ml-1.5 text-[9px] text-gray-400">(pasif)</span>}
                          <div className="text-[10px] text-gray-400 font-normal">{pct(e.share_ratio)}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-primary-700 font-bold">{fmt(e.equity_contributed)}</td>
                        <td className="px-4 py-3 text-right font-mono text-amber-600">{fmt(e.loans_given)}</td>
                        <td className="px-4 py-3 text-right font-mono text-gray-500">{fmt(e.loans_repaid)}</td>
                        <td className={`px-4 py-3 text-right font-mono font-bold ${e.net_loan_outstanding > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{fmt(e.net_loan_outstanding)}</td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-600">{fmt(e.dividends_received)}</td>
                        <td className="px-4 py-3 text-right font-mono text-gray-500">{fmt(e.salary_received)}</td>
                        <td className="px-4 py-3 text-right font-mono font-black text-primary-800">{fmt(e.company_total_owed)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB 3: GERİ ÖDEME WATERFALL                                           */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'waterfall' && (
        <div className="flex flex-col gap-4">
          {loading ? <Skeleton h="h-32" /> : !waterfall ? (
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-6 text-center text-sm text-gray-400">Waterfall verisi yüklenemedi.</div>
          ) : (
            <>
              {/* Summary row */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Mevcut Nakit</div>
                  <div className="text-2xl font-black tabular-nums text-gray-900">{fmt(waterfall.available_cash_try)}</div>
                </div>
                <div className="bg-white border border-amber-200 rounded-xl px-4 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-1">Toplam Borç</div>
                  <div className={`text-2xl font-black tabular-nums ${totalDebt > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{fmt(totalDebt)}</div>
                </div>
                <div className="bg-white border border-emerald-200 rounded-xl px-4 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-1">Borç Sonrası</div>
                  <div className={`text-2xl font-black tabular-nums ${waterfall.remaining_after_debt >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmt(waterfall.remaining_after_debt)}</div>
                </div>
              </div>

              {/* Clearance projection */}
              {waterfall.debt_clearance_months != null && totalDebt > 0 && (
                <div className={`rounded-xl px-4 py-3 text-sm ${
                  waterfall.debt_clearance_months <= 3  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' :
                  waterfall.debt_clearance_months <= 12 ? 'bg-amber-50 border border-amber-200 text-amber-800' :
                  'bg-red-50 border border-red-200 text-red-800'
                }`}>
                  <span className="font-bold">Borç kapanma tahmini:</span>{' '}
                  Mevcut nakit oranında yaklaşık{' '}
                  <span className="font-black">{waterfall.debt_clearance_months} ay</span>
                  {waterfall.debt_clearance_months > 12 && ' — borç yükü kritik seviyede.'}
                </div>
              )}

              {totalDebt === 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-4 text-sm text-emerald-800 font-semibold text-center">
                  Tüm ortak borçları kapatılmış. Nakit dağıtıma hazır.
                </div>
              )}

              {/* Debt tranches table */}
              {waterfall.tranches.filter(t => t.principal_try > 0).length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                    <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Ortak Borç Pozisyonları</div>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {['Ortak','Toplam Borç','Ödenen','Kalan','Gün','Durum'].map(h => (
                          <th key={h} className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400 ${h === 'Ortak' ? 'text-left' : 'text-right'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {waterfall.tranches.filter(t => t.principal_try > 0).map(t => (
                        <tr key={t.id} className="hover:bg-gray-50/60">
                          <td className="px-4 py-3 font-semibold text-gray-900">{t.partner_name}</td>
                          <td className="px-4 py-3 text-right font-mono text-gray-700">{fmt(t.principal_try)}</td>
                          <td className="px-4 py-3 text-right font-mono text-emerald-600">{fmt(t.actual_repaid_try)}</td>
                          <td className={`px-4 py-3 text-right font-mono font-bold ${t.remaining_principal_try > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{fmt(t.remaining_principal_try)}</td>
                          <td className="px-4 py-3 text-right text-gray-500">{t.days_outstanding}g</td>
                          <td className="px-4 py-3 text-right"><StatusPill status={t.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Allocation steps */}
              {waterfall.steps.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                    <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Dağıtım Adımları (Öncelik Sırası)</div>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {waterfall.steps.map((step, i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-primary-50 text-primary-700 text-[10px] font-black flex items-center justify-center shrink-0">
                            {i + 1}
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-gray-800">{step.description}</div>
                          </div>
                        </div>
                        <div className="text-sm font-black tabular-nums text-primary-700">{fmt(step.allocated_try)}</div>
                      </div>
                    ))}
                    {waterfall.remaining_after_debt > 0 && (
                      <div className="flex items-center justify-between px-4 py-3 bg-emerald-50">
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black flex items-center justify-center shrink-0">
                            {waterfall.steps.length + 1}
                          </div>
                          <div className="text-xs font-semibold text-emerald-800">Dağıtılabilir nakit (temettü)</div>
                        </div>
                        <div className="text-sm font-black tabular-nums text-emerald-700">{fmt(waterfall.remaining_after_debt)}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {waterfall.steps.length === 0 && totalDebt === 0 && (
                <p className="text-xs text-center text-gray-400">Geri ödeme adımı yok — borç mevcut değil.</p>
              )}
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB 4: TRANCHELER                                                      */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'tranches' && (
        <div className="flex flex-col gap-4">
          {loading ? <Skeleton h="h-32" /> : !waterfall ? (
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-6 text-center text-sm text-gray-400">
              Tranche verisi yüklenemedi.
            </div>
          ) : waterfall.tranches.filter(t => t.principal_try > 0).length === 0 ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-6 text-center text-sm text-emerald-700 font-semibold">
              Aktif ortak borç tranche'ı yok.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white border border-amber-200 rounded-xl px-4 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-1">Toplam Açık Borç</div>
                  <div className="text-2xl font-black tabular-nums text-amber-700">{fmt(waterfall.total_debt_try)}</div>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Aktif Tranche Sayısı</div>
                  <div className="text-2xl font-black tabular-nums text-gray-900">
                    {waterfall.tranches.filter(t => t.status !== 'repaid').length}
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Kapanma Tahmini</div>
                  <div className={`text-2xl font-black tabular-nums ${
                    (waterfall.debt_clearance_months ?? 0) > 0
                      ? waterfall.debt_clearance_months! <= 3 ? 'text-emerald-700' : waterfall.debt_clearance_months! <= 12 ? 'text-amber-700' : 'text-red-700'
                      : 'text-gray-400'
                  }`}>
                    {waterfall.debt_clearance_months != null && waterfall.total_debt_try > 0
                      ? `${waterfall.debt_clearance_months} ay`
                      : '—'}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {waterfall.tranches.filter(t => t.principal_try > 0).map(t => {
                  const repaidPct = t.principal_try > 0 ? (t.actual_repaid_try / t.principal_try) * 100 : 0
                  const progressColor = t.status === 'repaid' ? 'bg-emerald-500' : t.status === 'overdue' ? 'bg-red-500' : 'bg-primary-500'
                  return (
                    <div key={t.id} className="bg-white border border-gray-200 rounded-xl px-5 py-4">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-900">{t.partner_name}</span>
                            <StatusPill status={t.status} />
                          </div>
                          <div className="text-[10px] text-gray-400 mt-0.5">{t.days_outstanding} gündür açık</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-lg font-black tabular-nums text-amber-700">{fmt(t.remaining_principal_try)}</div>
                          <div className="text-[10px] text-gray-400">kalan</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mb-3 text-xs">
                        <div>
                          <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Toplam Borç</div>
                          <div className="font-mono font-bold text-gray-700">{fmt(t.principal_try)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Ödenen</div>
                          <div className="font-mono font-bold text-emerald-600">{fmt(t.actual_repaid_try)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-0.5">Geri Ödeme</div>
                          <div className="font-mono font-bold text-gray-700">{fmtPct(repaidPct)}</div>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                          <span>Geri ödeme ilerleme</span>
                          <span>{fmtPct(repaidPct)}</span>
                        </div>
                        <div className="bg-gray-100 rounded-full h-2">
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
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB 5: KÂR DAĞITIMI                                                   */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'distribution' && (
        <div className="flex flex-col gap-4">
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Dağıtım Parametreleri</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Dönem Net Gelir (TL)
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="örn. 500000"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                  value={netIncomeInput}
                  onChange={e => setNetIncomeInput(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Yönetim Kurulu Alıkoyması (TL)
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="örn. 0"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                  value={boardRetainedInput}
                  onChange={e => setBoardRetainedInput(e.target.value)}
                />
              </div>
            </div>
            <button
              onClick={() => loadDistribution(
                parseFloat(netIncomeInput) || 0,
                parseFloat(boardRetainedInput) || 0,
              )}
              disabled={distribLoading}
              className="mt-3 text-xs font-bold px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {distribLoading ? 'Hesaplanıyor...' : 'Dağıtım Hesapla'}
            </button>
          </div>

          {distrib && (
            <>
              {/* 4-Layer Distribution Breakdown */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                  <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">4 Katmanlı Dağıtım Güvenlik Hesabı</div>
                </div>
                <div className="divide-y divide-gray-50">
                  {[
                    { label: 'Brüt Net Gelir',        value: distrib.distribution_layers.gross_net_income_try,    color: 'text-gray-900',    sign: '' },
                    { label: '(−) Yasal Yedek (TTK 519 %5)', value: distrib.distribution_layers.legal_reserve_try, color: 'text-amber-600', sign: '−' },
                    { label: '(−) YK Alıkoyması',      value: distrib.distribution_layers.board_retained_try,     color: 'text-amber-600',   sign: '−' },
                    { label: '(−) Ödenmemiş Huzur H.', value: distrib.distribution_layers.unpaid_compensation_try,color: 'text-amber-600',   sign: '−' },
                    { label: 'Brüt Dağıtılabilir',     value: distrib.distribution_layers.distributable_gross_try,color: 'text-primary-700', sign: '=' },
                    { label: '(−) Stopaj (%10 GVK 94)',value: distrib.distribution_layers.withholding_tax_try,    color: 'text-red-600',     sign: '−' },
                    { label: 'Net Dağıtılabilir',       value: distrib.distribution_layers.distributable_net_try,  color: distrib.distribution_layers.is_distributable ? 'text-emerald-700' : 'text-red-700', sign: '=' },
                  ].map(row => (
                    <div key={row.label} className={`flex items-center justify-between px-4 py-3 ${row.sign === '=' ? 'bg-gray-50' : ''}`}>
                      <div className="text-xs text-gray-600">{row.label}</div>
                      <div className={`text-sm font-black tabular-nums font-mono ${row.color}`}>
                        {row.sign && row.sign !== '=' ? row.sign + ' ' : ''}{fmt(row.value)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Block reason / distribute status */}
              {distrib.distribution_layers.is_distributable ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-bold text-emerald-800">Dağıtım yapılabilir</div>
                    <div className="text-xs text-emerald-700 mt-0.5">
                      Net dağıtılabilir: <span className="font-black">{fmt(distrib.distribution_layers.distributable_net_try)}</span>
                    </div>
                  </div>
                  <button className="text-xs font-bold px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 transition-colors shrink-0">
                    Temettü Beyan Et
                  </button>
                </div>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <div className="text-sm font-bold text-red-700">Dağıtım engellenmiştir</div>
                  <div className="text-xs text-red-600 mt-0.5">{distrib.distribution_layers.block_reason ?? 'Dağıtılabilir net gelir yetersiz (TTK 509).'}</div>
                </div>
              )}

              {/* Per-partner entitlements */}
              {distrib.per_partner_distribution.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                    <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Ortak Bazında Hak Edilenler</div>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {['Ortak', 'Pay', 'Brüt Hak', 'Stopaj', 'Net Hak'].map(h => (
                          <th key={h} className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest text-gray-400 ${h === 'Ortak' ? 'text-left' : 'text-right'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {distrib.per_partner_distribution.map(p => (
                        <tr key={p.partner_id} className="hover:bg-gray-50/60">
                          <td className="px-4 py-3 font-semibold text-gray-900">{p.partner_name}</td>
                          <td className="px-4 py-3 text-right text-gray-500">{pct(p.share_ratio)}</td>
                          <td className="px-4 py-3 text-right font-mono text-gray-700">{fmt(p.gross_entitlement_try)}</td>
                          <td className="px-4 py-3 text-right font-mono text-red-500">{fmt(p.withholding_try)}</td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">{fmt(p.net_entitlement_try)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Compliance warnings */}
              {distrib.compliance_warnings.length > 0 && (
                <div className="flex flex-col gap-2">
                  {distrib.compliance_warnings.map((w, i) => {
                    const cls = w.severity === 'error'
                      ? 'bg-red-50 border-red-200 text-red-700'
                      : w.severity === 'warning'
                      ? 'bg-amber-50 border-amber-200 text-amber-700'
                      : 'bg-blue-50 border-blue-200 text-blue-700'
                    return (
                      <div key={i} className={`border rounded-xl px-4 py-3 text-xs ${cls}`}>
                        <span className="font-bold uppercase tracking-wide">[{w.type}]</span>{' '}{w.message}
                        {w.amount != null && <span className="font-black ml-1">{fmt(w.amount)}</span>}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {!distrib && !distribLoading && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-8 text-center text-sm text-gray-400">
              Dönem net gelirini girin ve hesapla butonuna basın.
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB 6: SERMAYE GETİRİSİ                                               */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'returns' && (
        <div className="flex flex-col gap-4">
          {loading ? <Skeleton h="h-32" /> : returns.length === 0 ? (
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-6 text-center text-sm text-gray-400">
              Getiri verisi hesaplanamadı.
            </div>
          ) : (
            <>
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                  <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Ortak Bazında Sermaye Getirisi</div>
                </div>
                <div className="divide-y divide-gray-50">
                  {returns.map(r => (
                    <div key={r.partner_id} className="px-4 py-4">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div>
                          <div className="text-sm font-bold text-gray-900">{r.partner_name}</div>
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            Yatırılan: <span className="font-semibold text-gray-600">{fmt(r.total_invested_try)}</span>
                            {' '}· Geri alınan: <span className="font-semibold text-emerald-600">{fmt(r.total_returned_try)}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`text-lg font-black tabular-nums ${r.roi_to_date_pct >= 100 ? 'text-emerald-600' : r.roi_to_date_pct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                            {fmtPct(r.roi_to_date_pct)}
                          </div>
                          <div className="text-[10px] text-gray-400">ROI</div>
                        </div>
                      </div>
                      <RoiBar pct={r.roi_to_date_pct} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700 leading-relaxed">
                <span className="font-bold">Not:</span> ROI = (Geri Alınan / Yatırılan) × 100.
                Geri alınan = geri ödemeler + temettü + maaş/huzur. %100 üzeri tam geri dönüş anlamına gelir.
                Faiz izleme ve IRR hesaplaması için gelişmiş borç takibi gereklidir.
              </div>
            </>
          )}
        </div>
      )}

    </div>
  )
}

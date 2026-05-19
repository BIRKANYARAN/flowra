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
//   7. Risk           — 6-dimension PCLE risk scoring + compliance warnings
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'

import {
  TabId, LedgerSortCol,
  PartnerRow, EqResult, LedgerData, LedgerEntry,
  WaterfallData, CapitalReturn, TxRow, DistribState,
  ZERO_EQ,
} from '@/app/dashboard/partners/_components/types'
import { PartnersTab }    from '@/app/dashboard/partners/_components/PartnersTab'
import { LedgerTab }      from '@/app/dashboard/partners/_components/LedgerTab'
import { WaterfallTab }   from '@/app/dashboard/partners/_components/WaterfallTab'
import { TranchesTab }    from '@/app/dashboard/partners/_components/TranchesTab'
import { DistributionTab } from '@/app/dashboard/partners/_components/DistributionTab'
import { ReturnsTab }     from '@/app/dashboard/partners/_components/ReturnsTab'
import { RiskTab }        from '@/app/dashboard/partners/_components/RiskTab'
import { PartnersContextBar } from '@/app/dashboard/partners/_shared/PartnersContextBar'
import { PartnerFinanceActions } from '@/app/dashboard/partners/_components/PartnerFinanceActions'

interface EditForm { name: string; shareRatioPct: string }

export default function PartnersPage() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  // Tab state is URL-driven (?tab=partners|ledger|waterfall|tranches|distribution|returns).
  // URL = source of truth → deep-linkable, browser back/forward works, refresh persists tab.
  const activeTab = (searchParams.get('tab') ?? 'partners') as TabId
  function setActiveTab(id: TabId) {
    router.replace(`/dashboard/partners?tab=${id}`, { scroll: false })
  }

  const [partners,     setPartners]     = useState<PartnerRow[]>([])
  const [equalization, setEqualization] = useState<EqResult>(ZERO_EQ)
  const [ledger,       setLedger]       = useState<LedgerData | null>(null)
  const [waterfall,    setWaterfall]    = useState<WaterfallData | null>(null)
  const [returns,      setReturns]      = useState<CapitalReturn[]>([])
  const [distrib,      setDistrib]      = useState<DistribState | null>(null)
  const [distribLoading, setDistribLoading] = useState(false)
  const [netIncomeInput, setNetIncomeInput] = useState('')
  const [boardRetainedInput, setBoardRetainedInput] = useState('')
  const [dividendConfirm, setDividendConfirm] = useState(false)
  const [dividendLoading, setDividendLoading] = useState(false)
  const [dividendError,   setDividendError]   = useState<string | null>(null)
  const [dividendSuccess, setDividendSuccess] = useState(false)
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

  // Ledger sort
  const [ledgerSort, setLedgerSort] = useState<{ col: LedgerSortCol; dir: 'asc' | 'desc' }>({ col: 'company_total_owed', dir: 'desc' })

  function toggleLedgerSort(col: LedgerSortCol) {
    setLedgerSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' })
  }
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

  const handleDeclareDividend = useCallback(async () => {
    if (!distrib) return
    setDividendLoading(true)
    setDividendError(null)
    try {
      const today = new Date().toISOString().slice(0, 10)
      // Single server-side request — atomic orchestration (no N×parallel client POSTs).
      const res = await fetch('/api/partners/dividend/declare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          declarations: distrib.per_partner_distribution.map(p => ({
            partner_id:      p.partner_id,
            gross_try:       p.gross_entitlement_try,
            withholding_try: p.withholding_try,
            net_try:         p.net_entitlement_try,
            tx_date:         today,
          })),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Bilinmeyen hata' }))
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      setDividendConfirm(false)
      setDividendSuccess(true)
      setTimeout(() => setDividendSuccess(false), 4000)
    } catch (err) {
      setDividendError(err instanceof Error ? err.message : 'Temettü kaydedilemedi')
    }
    setDividendLoading(false)
  }, [distrib])

  const reloadAll = useCallback(async () => {
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

      setPartners(pJson as PartnerRow[])
      setEqualization(eJson as EqResult)
      setLedger(ledgerData)
      setAvailCash(cashDistributable)

      // Waterfall + returns
      const wRes = await fetch(`/api/partners/waterfall?available_cash=${cashDistributable}`)
      if (wRes.ok) {
        const wJson = await wRes.json()
        setWaterfall(wJson.waterfall ?? null)
        setReturns(wJson.projections ?? [])
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Veri yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    reloadAll().finally(() => { if (cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [reloadAll])

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
      // Reload everything — share_ratio change affects equalization, waterfall, ledger
      await reloadAll()
    } catch { setEditErr('Ağ hatası') }
    setEditSaving(false)
  }

  async function deletePartner(partnerId: string, name: string) {
    if (!confirm(`"${name}" ortağını silmek istediğinizden emin misiniz?`)) return
    try {
      const res = await fetch(`/api/partners/${partnerId}`, { method: 'DELETE' })
      if (res.ok) {
        setPartners(prev => prev.filter(p => p.id !== partnerId))
      } else {
        const d = await res.json().catch(() => ({})) as { error?: string }
        setFetchError(d.error ?? `Ortak silinemedi (HTTP ${res.status})`)
      }
    } catch {
      setFetchError('Ağ hatası — ortak silinemedi. Lütfen tekrar deneyin.')
    }
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

  const sortedLedgerEntries = useMemo(() => {
    if (!ledger) return []
    return [...ledger.entries].sort((a, b) => {
      const { col, dir } = ledgerSort
      const av = col === 'partner_name' ? a[col] : (a[col as keyof LedgerEntry] as number)
      const bv = col === 'partner_name' ? b[col] : (b[col as keyof LedgerEntry] as number)
      if (typeof av === 'string' && typeof bv === 'string') {
        return dir === 'asc' ? av.localeCompare(bv, 'tr') : bv.localeCompare(av, 'tr')
      }
      return dir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  }, [ledger, ledgerSort])

  const totalPartnerBalance = partners.reduce((s, p) => s + (p.balance?.partner_balance_try ?? 0), 0)
  const totalDistributed    = partners.reduce((s, p) => s + (p.balance?.total_distributed_try ?? 0), 0)
  const hasPartners         = partners.length > 0
  const totalDebt           = waterfall?.total_debt_try ?? 0

  // ── Tab metadata ──────────────────────────────────────────────────────────────

  const TAB_META: Record<TabId, { title: string; sub: string }> = {
    partners:     { title: 'Ortak Pozisyonları', sub: 'Sermaye · Pay oranı · Net bakiye · Eşitleme durumu' },
    ledger:       { title: 'Finansal Defter',    sub: 'Sermaye · Borç · Dağıtım · Tüm hareketler' },
    waterfall:    { title: 'Geri Ödeme',         sub: 'Normalleştirilmiş iki aşamalı waterfall · Borç baskısı' },
    tranches:     { title: 'Borç Tranşeleri',    sub: 'Aktif trancheler · Faiz tahakkuku · Geri ödeme takvimi' },
    distribution: { title: 'Kâr Dağıtımı',      sub: '4 katmanlı güvenlik · Yasal yedek · TTK 509 uyumu' },
    returns:      { title: 'Getiri Analizi',     sub: 'ROI · Sermaye geri dönüşü · Ortak bazlı performans' },
    risk:         { title: 'Risk Haritası',      sub: '6 boyutlu PCLE risk skoru · Yasal uyum · Öneriler' },
  }

  const TABS: { id: TabId; label: string }[] = [
    { id: 'partners',     label: 'Ortaklar'     },
    { id: 'ledger',       label: 'Defter'       },
    { id: 'waterfall',    label: 'Geri Ödeme'   },
    { id: 'tranches',     label: 'Borç Dilimleri' },
    { id: 'distribution', label: 'Kâr Dağıtımı' },
    { id: 'returns',      label: 'Getiri'       },
    { id: 'risk',         label: 'Risk'         },
  ]

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5 max-w-5xl">

      {/* PAGE HERO */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Ortak Finans Merkezi</div>
          <h1 className="text-2xl font-black tracking-tight text-[#0f172a] leading-tight">
            {TAB_META[activeTab]?.title ?? 'Ortaklar'}
          </h1>
          <p className="text-sm text-[#94a3b8] mt-1">{TAB_META[activeTab]?.sub ?? ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/admin/governance"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded border border-[#e2e8f0] text-[#64748b] text-xs font-semibold hover:border-[#e2e8f0] hover:bg-[#f8fafc] transition-colors whitespace-nowrap"
            title="Aylık yönetişim raporları ve ortak onay sistemi"
          >
            🏛️ Yönetişim
          </Link>
          <Link
            href="/dashboard/partners/new"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700 transition-colors whitespace-nowrap"
          >
            + Ortak Ekle
          </Link>
        </div>
      </div>

      {/* Sticky tab nav + context bar */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm -mx-4">
        <div className="px-5 pt-1 border-b border-[#e2e8f0]">
          <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={[
                  'relative px-3 py-2.5 text-[13px] transition-colors whitespace-nowrap flex-shrink-0 bg-transparent border-0 cursor-pointer',
                  activeTab === t.id
                    ? 'text-[#0f172a] font-semibold border-b-2 border-[#0f172a] -mb-px'
                    : 'text-[#94a3b8] hover:text-[#334155] font-medium',
                ].join(' ')}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="px-5">
          <PartnersContextBar />
        </div>
      </div>

      {fetchError && (
        <div className="bg-neg-light border border-neg-light rounded px-4 py-3 text-sm text-neg-text font-medium">
          {fetchError}
        </div>
      )}

      {/* ── Quick Finance Action Panel ────────────────────────────────────────── */}
      <PartnerFinanceActions partners={partners} onRefresh={reloadAll} />

      {activeTab === 'partners' && (
        <PartnersTab
          loading={loading}
          fetchError={fetchError}
          partners={partners}
          equalization={equalization}
          availCash={availCash}
          totalPartnerBalance={totalPartnerBalance}
          totalDistributed={totalDistributed}
          hasPartners={hasPartners}
          editId={editId}
          editForm={editForm}
          editSaving={editSaving}
          editErr={editErr}
          expandedTxId={expandedTxId}
          loadingTxId={loadingTxId}
          partnerTxs={partnerTxs}
          onOpenEdit={openEdit}
          onCancelEdit={cancelEdit}
          onSaveEdit={saveEdit}
          onDeletePartner={deletePartner}
          onToggleTxHistory={toggleTxHistory}
          onEditFormChange={setEditForm}
        />
      )}

      {activeTab === 'ledger' && (
        <LedgerTab
          loading={loading}
          ledger={ledger}
          sortedLedgerEntries={sortedLedgerEntries}
          ledgerSort={ledgerSort}
          onToggleSort={toggleLedgerSort}
        />
      )}

      {activeTab === 'waterfall' && (
        <WaterfallTab
          loading={loading}
          waterfall={waterfall}
          totalDebt={totalDebt}
          availCash={availCash}
          onCashChange={setAvailCash}
          onLoadWaterfall={loadWaterfall}
        />
      )}

      {activeTab === 'tranches' && (
        <TranchesTab
          loading={loading}
          waterfall={waterfall}
          partners={partners}
          onRefresh={reloadAll}
        />
      )}

      {activeTab === 'distribution' && (
        <DistributionTab
          distrib={distrib}
          distribLoading={distribLoading}
          netIncomeInput={netIncomeInput}
          boardRetainedInput={boardRetainedInput}
          dividendConfirm={dividendConfirm}
          dividendLoading={dividendLoading}
          dividendError={dividendError}
          dividendSuccess={dividendSuccess}
          onNetIncomeChange={setNetIncomeInput}
          onBoardRetainedChange={setBoardRetainedInput}
          onLoadDistribution={loadDistribution}
          onSetDividendConfirm={setDividendConfirm}
          onDeclareDividend={handleDeclareDividend}
        />
      )}

      {activeTab === 'returns' && (
        <ReturnsTab
          loading={loading}
          returns={returns}
        />
      )}

      {activeTab === 'risk' && (
        <RiskTab loading={loading} />
      )}

    </div>
  )
}

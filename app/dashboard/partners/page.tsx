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
//   8. Sermaye Hesabı — per-partner capital account + exit waterfall simulation
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ObservationRail } from '@/app/dashboard/_shared/ObservationRail'
import { DetailSection } from '@/components/dashboard/DetailSection'

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
import { LoanCovenantPanel } from '@/app/dashboard/partners/_components/LoanCovenantPanel'
import { CapitalAccountTab } from '@/app/dashboard/partners/_components/CapitalAccountTab'
import { DividendTab } from '@/app/dashboard/partners/_components/DividendTab'
import { CompensationTab } from '@/app/dashboard/partners/_components/CompensationTab'
import { EquityDilutionTab } from '@/app/dashboard/partners/_components/EquityDilutionTab'
import { AmortizationTab }  from '@/app/dashboard/partners/_components/AmortizationTab'
import { DividendLedgerTab } from '@/app/dashboard/partners/_components/DividendLedgerTab'
import { CapitalStatementTab } from '@/app/dashboard/partners/_components/CapitalStatementTab'
import { DistributionSimulatorTab } from '@/app/dashboard/partners/_components/DistributionSimulatorTab'
import { ContributionTimelineTab }  from '@/app/dashboard/partners/_components/ContributionTimelineTab'
import { EquityWaterfallTab }       from '@/app/dashboard/partners/_components/EquityWaterfallTab'
import { RiskCompositeTab }         from '@/app/dashboard/partners/_components/RiskCompositeTab'
import { PartnersContextBar } from '@/app/dashboard/partners/_shared/PartnersContextBar'
import { PartnerFinanceActions } from '@/app/dashboard/partners/_components/PartnerFinanceActions'

interface EditForm { name: string; shareRatioPct: string }

export default function PartnersPage() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  // Tab state is URL-driven (?tab=partners|ledger|waterfall|tranches|distribution|returns).
  // URL = source of truth → deep-linkable, browser back/forward works, refresh persists tab.
  // Tabs co-located into a host tab (UX simplification — content preserved as
  // sections within the host). Old deep-links resolve to the host tab.
  const TAB_ALIAS: Record<string, TabId> = {
    tranches:      'ledger',    // loan tranches now a "Detaylı" panel under Krediler
    amortization:  'ledger',    // loan payment schedule co-located under Krediler
    'capital-statement': 'capital', // capital statement now a "Detaylı" panel under Sermaye
    contributions: 'capital',   // capital commitments shown with the capital account
    dilution:      'capital',   // dilution analysis shown with the capital account
    'risk-composite': 'risk',   // composite risk score co-located with the risk view
    // Faz 3 merge — Dağıtım 8 sekme → 3. Old deep-links resolve to the canonical tab.
    distribution:            'dividend',   // Kâr Dağıtımı now under Temettü
    'distribution-simulator':'dividend',   // Simülatör now under Temettü (Detaylı)
    'dividend-ledger':       'dividend',   // Dağıtım Geçmişi now under Temettü (Detaylı)
    'equity-waterfall':      'waterfall',  // Getiri Projeksiyonu now under Geri Ödeme
    returns:                 'waterfall',  // Getiri now under Geri Ödeme (Detaylı)
  }
  const rawTab    = searchParams.get('tab') ?? 'partners'
  const activeTab = (TAB_ALIAS[rawTab] ?? rawTab) as TabId
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
    ledger:       { title: 'Krediler',           sub: 'Ortak kredileri defteri · borç dilimleri · faiz · ödeme planı' },
    waterfall:    { title: 'Geri Ödeme',         sub: 'Normalleştirilmiş iki aşamalı waterfall · Borç baskısı' },
    tranches:     { title: 'Borç Tranşeleri',    sub: 'Aktif trancheler · Faiz tahakkuku · Geri ödeme takvimi' },
    distribution: { title: 'Kâr Dağıtımı',      sub: '4 katmanlı güvenlik · Yasal yedek · TTK 509 uyumu' },
    returns:      { title: 'Getiri Analizi',     sub: 'ROI · Sermaye geri dönüşü · Ortak bazlı performans' },
    risk:         { title: 'Risk Haritası',      sub: '6 boyutlu PCLE risk skoru · Yasal uyum · Öneriler' },
    capital:      { title: 'Sermaye',            sub: 'Ortak sermaye hesabı · taahhüt takvimi · seyreltme · sermaye ekstresi' },
    dividend:     { title: 'Temettü',            sub: 'TTK 509/519 uyum hesabı · GVK 94 stopaj · Onay akışı' },
    compensation: { title: 'Huzur Hakkı',        sub: 'TTK 394 · Aylık ortak tazminatı · GVK 94 stopaj · Takvim yönetimi' },
    dilution:     { title: 'Sermaye Seyreltme',  sub: 'Yeni sermaye artışı senaryoları · Pay oranı değişimi · Ortak hisse alımı' },
    amortization:     { title: 'Amortisman Takvimi',  sub: 'Tranche bazında aylık ödeme planı · Faiz · Anapara · Kapanış tarihi' },
    'dividend-ledger':     { title: 'Dağıtım Geçmişi',      sub: 'Tüm temettü hareketleri · TTK 509/519 uyum takibi · Ortak bazında toplamlar' },
    'capital-statement':   { title: 'Sermaye Hesap Özeti',  sub: 'Ortak bazında sermaye hesabı · Katkılar · Kâr payı dağılımı · Temettü · Huzur hakkı' },
    'distribution-simulator': { title: 'Kâr Dağıtımı Simülatörü', sub: 'TTK 519 yasal yedek · GVK 94 stopaj · 4 katmanlı dağıtım güvenliği · Senaryo karşılaştırması' },
    contributions: { title: 'Taahhüt Takvimi', sub: 'Sermaye taahhüt doluluk oranı · TTK 588 yasal faiz riski · Ortak bazlı katkı geçmişi' },
    'equity-waterfall': { title: 'Getiri Projeksiyonu', sub: 'Sermaye riski · Geri dönüş oranı · MOIC · Başa baş süre · 24 aylık projeksiyon' },
    'risk-composite':   { title: 'Risk Kompozit Skorlama', sub: '6 boyutlu ağırlıklı risk değerlendirmesi · Ortak bazında kompozit skor ve derece' },
  }

  // Two-level grouped navigation: 18 flat tabs → 4 clear sections. Every tab is
  // preserved (deep links via ?tab=<id> still work); the top bar shows 4 groups,
  // the second row shows the active group's sub-tabs. Duplicate labels fixed.
  // 7 clean, distinct tabs. Sermaye Ekstresi folds into Sermaye, Borç Dilimleri
  // into Krediler (each as a "Detaylı" panel) — see render below. Deep links to the
  // folded tabs resolve via TAB_ALIAS.
  const TAB_GROUPS: { label: string; tabs: { id: TabId; label: string }[] }[] = [
    { label: 'Sermaye', tabs: [
      { id: 'partners',     label: 'Ortaklar'    },
      { id: 'capital',      label: 'Sermaye'     },
    ] },
    { label: 'Krediler', tabs: [
      { id: 'ledger',       label: 'Krediler'    },
    ] },
    { label: 'Dağıtım', tabs: [
      { id: 'dividend',     label: 'Temettü'     },
      { id: 'waterfall',    label: 'Geri Ödeme'  },
      { id: 'compensation', label: 'Huzur Hakkı' },
    ] },
    { label: 'Risk', tabs: [
      { id: 'risk',         label: 'Risk'        },
    ] },
  ]

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5 max-w-5xl">

      {/* ── Partner intelligence signals ─────────────────────────────────────── */}
      <ObservationRail context="partners" maxItems={3} />

      {/* PAGE HERO */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">Ortak Finans Merkezi</div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0f172a] leading-tight">
            {TAB_META[activeTab]?.title ?? 'Ortaklar'}
          </h1>
          <p className="text-xs text-[#94a3b8] mt-0.5">{TAB_META[activeTab]?.sub ?? ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/admin/governance"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded border border-[#e8eaef] text-[#64748b] text-xs font-semibold hover:border-[#e8eaef] hover:bg-[#f8fafc] transition-colors whitespace-nowrap"
            title="Aylık yönetişim raporları ve ortak onay sistemi"
          >
            Yönetişim
          </Link>
          <Link
            href="/dashboard/partners/new"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-brand-light text-white text-xs font-semibold hover:bg-brand transition-colors whitespace-nowrap"
          >
            + Ortak Ekle
          </Link>
        </div>
      </div>

      {/* Sticky tab nav + context bar */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm -mx-4">
        {/* Single flat tab row — every section in one scrollable bar (consistent
            with the other hubs: left = area, top = one row of that area's views). */}
        <div className="px-4 pt-1 border-b border-[#e8eaef]">
          <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none">
            {TAB_GROUPS.flatMap(g => g.tabs).map(t => {
              const isActive = activeTab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={[
                    'relative px-3 py-2.5 text-[13px] transition-colors duration-150 whitespace-nowrap flex-shrink-0 border-0 cursor-pointer rounded-t-md',
                    isActive
                      ? 'text-[#0f172a] font-semibold bg-transparent'
                      : 'text-[#94a3b8] hover:text-[#334155] hover:bg-[#f8fafc] font-medium bg-transparent',
                  ].join(' ')}
                >
                  {t.label}
                  {isActive && (
                    <span
                      aria-hidden
                      className="flowra-tab-underline absolute left-1.5 right-1.5 -bottom-px h-[2px] rounded-full bg-[#0f172a]"
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>
        <div className="px-4">
          <PartnersContextBar />
        </div>
      </div>

      {fetchError && (
        <div className="bg-neg-light border border-neg-light rounded px-4 py-3 text-xs text-neg-text font-medium">
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
        <div className="space-y-5">
          <LedgerTab
            loading={loading}
            ledger={ledger}
            sortedLedgerEntries={sortedLedgerEntries}
            ledgerSort={ledgerSort}
            onToggleSort={toggleLedgerSort}
          />
          {/* Borç Dilimleri + Amortisman folded here (was its own tab) */}
          <DetailSection title="Borç Dilimleri & Amortisman" subtitle="Aktif tranşeler · faiz tahakkuku · ödeme planı">
            <TranchesTab
              loading={loading}
              waterfall={waterfall}
              partners={partners}
              onRefresh={reloadAll}
            />
            <AmortizationTab />
          </DetailSection>
        </div>
      )}

      {activeTab === 'waterfall' && (
        <div className="space-y-5">
          <WaterfallTab
            loading={loading}
            waterfall={waterfall}
            totalDebt={totalDebt}
            availCash={availCash}
            partners={partners}
            onCashChange={setAvailCash}
            onLoadWaterfall={loadWaterfall}
          />
          {/* Faz 3 merge — Getiri Projeksiyonu + Getiri co-located under Geri Ödeme */}
          <DetailSection title="Getiri & Projeksiyon" subtitle="Özkaynak getiri şelalesi · ortak getirileri">
            <EquityWaterfallTab companyId="" />
            <ReturnsTab loading={loading} returns={returns} />
          </DetailSection>
        </div>
      )}

      {activeTab === 'risk' && (
        <div className="space-y-5">
          <LoanCovenantPanel companyId="" />
          <RiskTab loading={loading} />
          {/* Risk Skoru (composite scorer) — co-located advisory view */}
          <RiskCompositeTab companyId="" />
        </div>
      )}

      {activeTab === 'capital' && (
        <div className="space-y-5">
          <CapitalAccountTab />
          {/* Taahhüt Takvimi (capital commitments) + Seyreltme (dilution) — co-located with the capital account */}
          <ContributionTimelineTab companyId="" />
          <EquityDilutionTab />
          {/* Sermaye Ekstresi folded here (was its own tab) */}
          <DetailSection title="Sermaye Ekstresi" subtitle="Ortak bazında sermaye hesabı · katkılar · dağılım">
            <CapitalStatementTab />
          </DetailSection>
        </div>
      )}

      {activeTab === 'dividend' && (
        <div className="space-y-5">
          <DividendTab />
          {/* Faz 3 merge — Kâr Dağıtımı + Simülatör + Dağıtım Geçmişi under Temettü */}
          <DetailSection title="Diğer Dağıtım Araçları" subtitle="Kâr dağıtımı · simülatör · dağıtım geçmişi">
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
            <DistributionSimulatorTab />
            <DividendLedgerTab />
          </DetailSection>
        </div>
      )}

      {activeTab === 'compensation' && (
        <CompensationTab partners={partners} />
      )}

    </div>
  )
}

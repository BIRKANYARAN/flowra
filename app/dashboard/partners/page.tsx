export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// /dashboard/partners — Partner Finance Hub  (FAZ 21 rev-3)
//
// SERVER COMPONENT.
//
// Layout:
//   Inner tabs:
//     Özet       — command strip, partner cards, debt burden, equalization, ledger
//     Sermaye    — capital_in transactions + add form
//     Borçlar    — loan_to_company / loan_repayment transactions + form
//     Huzur Hakkı— board_fee / salary transactions + form
//
// Tab selection: searchParams.tab (URL param, no JS required for switching)
// ─────────────────────────────────────────────────────────────────────────────

import { createClient }       from '@/lib/supabase-server'
import { redirect }           from 'next/navigation'
import { resolveCompanyId }   from '@/lib/resolve-company'
import Link                   from 'next/link'
import { PageHeader }         from '@/components/ui'
import { PartnerService }     from '@/lib/services/partner.service'
import { getDistributableCash } from '@/lib/finance/financial-core'
import { PartnerActionsMenu } from '@/components/dashboard/partners/PartnerActionsMenu'
import { PartnerTxPanel, type TxRow, type TxTypeOption } from './PartnerTxPanel'

// ── Inner tab config ──────────────────────────────────────────────────────────

type InnerTab = 'ozet' | 'sermaye' | 'borclar' | 'huzur' | 'temettu' | 'duzeltme'

const INNER_TABS: { key: InnerTab; label: string }[] = [
  { key: 'ozet',     label: 'Genel Bakış'  },
  { key: 'sermaye',  label: 'Sermaye'      },
  { key: 'borclar',  label: 'Borç / Kredi' },
  { key: 'huzur',    label: 'Huzur Hakkı'  },
  { key: 'temettu',  label: 'Temettü'      },
  { key: 'duzeltme', label: 'Düzeltme'     },
]

const SERMAYE_TYPES: TxTypeOption[] = [
  { value: 'capital_in', label: 'Sermaye Girişi', tone: 'positive' },
]

const BORCLAR_TYPES: TxTypeOption[] = [
  { value: 'loan_to_company', label: 'Ortak Borç Verdi',     tone: 'negative' },
  { value: 'loan_repayment',  label: 'Şirket Geri Ödedi',    tone: 'positive' },
]

const HUZUR_TYPES: TxTypeOption[] = [
  { value: 'board_fee', label: 'Huzur Hakkı', tone: 'neutral' },
  { value: 'salary',    label: 'Maaş/Ücret',  tone: 'neutral' },
]

// FAZ 2 new tabs
const TEMETTU_TYPES: TxTypeOption[] = [
  { value: 'dividend',     label: 'Kâr Payı (Temettü)',   tone: 'positive' },
  { value: 'equalization', label: 'Sermaye Eşitleme',      tone: 'positive' },
]

const DUZELTME_TYPES: TxTypeOption[] = [
  { value: 'correction', label: 'Düzeltme / İptal', tone: 'correction' },
]

// ── TX type labels & tones for the Özet movement ledger ──────────────────────

const TX_META: Record<string, { label: string; color: string }> = {
  capital_in:      { label: 'Sermaye',       color: 'text-primary-700' },
  loan_to_company: { label: 'Borç (Verdi)',  color: 'text-amber-700'   },
  loan_in:         { label: 'Borç (Verdi)',  color: 'text-amber-700'   },
  loan_repayment:  { label: 'Geri Ödeme',    color: 'text-emerald-700' },
  loan_out:        { label: 'Geri Ödeme',    color: 'text-emerald-700' },
  dividend:        { label: 'Temettü',       color: 'text-emerald-700' },
  equalization:    { label: 'Eşitleme',      color: 'text-emerald-700' },
  board_fee:       { label: 'Huzur Hakkı',  color: 'text-gray-600'    },
  salary:          { label: 'Maaş',          color: 'text-gray-600'    },
  huzur_hakki:     { label: 'Huzur Hakkı',  color: 'text-gray-600'    },
  correction:      { label: 'Düzeltme',      color: 'text-orange-600'  },
}

// ── Formatters ────────────────────────────────────────────────────────────────

const _TRY = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
function fmt(n: number) {
  const abs = Math.abs(Number(n || 0))
  const sign = n < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${sign}₺${(abs / 1_000_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}M`
  if (abs >= 10_000)    return `${sign}₺${(abs / 1_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`
  return `${sign}₺${_TRY.format(abs)}`
}
function pct(r: number) { return `%${Math.round(r * 10000) / 100}` }

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function ShareBar({ ratio }: { ratio: number }) {
  return (
    <div className="relative h-1.5 w-full bg-gray-100 rounded-full overflow-hidden mt-1">
      <div className="absolute inset-y-0 left-0 bg-primary-400 rounded-full" style={{ width: `${ratio * 100}%` }} />
    </div>
  )
}

function KpiCell({ label, value, tone = 'neutral' }: {
  label: string; value: string
  tone?: 'positive' | 'negative' | 'warning' | 'neutral'
}) {
  const color = { positive: 'text-emerald-700', negative: 'text-red-600', warning: 'text-amber-600', neutral: 'text-gray-900' }[tone]
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">{label}</div>
      <div className={`text-xl font-black tabular-nums leading-none ${color}`}>{value}</div>
    </div>
  )
}

// ── Inner tab strip (server-rendered links — no JS needed) ────────────────────

function PartnerInnerTabs({ active }: { active: InnerTab }) {
  return (
    <div className="flex items-center gap-0.5 border-b border-gray-200 mb-5">
      {INNER_TABS.map(t => (
        <Link
          key={t.key}
          href={`/dashboard/partners?tab=${t.key}`}
          className={`
            px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap
            ${t.key === active
              ? 'text-primary-700 border-b-2 border-primary-600 -mb-px'
              : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50 rounded-t-md'
            }
          `}
        >
          {t.label}
        </Link>
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: { tab?: string }
}) {
  const tab: InnerTab = (
    ['ozet', 'sermaye', 'borclar', 'huzur', 'temettu', 'duzeltme'].includes(searchParams.tab ?? '')
      ? (searchParams.tab as InnerTab)
      : 'ozet'
  )

  const supabase = createClient()
  let uid: string
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error || !data?.user) redirect('/auth')
    uid = data.user.id
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
    redirect('/auth')
  }

  let companyId: string
  try { companyId = await resolveCompanyId(uid!, supabase) }
  catch { redirect('/auth') }

  function sq<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    return fn().catch(() => fallback)
  }

  // ── Always load balances (needed for partner selector on all tabs) ──────────
  const balances = await sq(
    () => PartnerService.getPartnerBalances(uid!, companyId),
    [],
  )

  const partnersList = balances.map(b => ({ id: b.partner_id, name: b.partner_name }))
  const partnerIds   = partnersList.map(p => p.id)

  // ── Helper: fetch transactions for a tab ───────────────────────────────────
  async function fetchTxs(txTypes: string[]): Promise<TxRow[]> {
    if (partnerIds.length === 0) return []
    const { data } = await supabase
      .from('partner_transactions')
      .select('id, partner_id, tx_type, amount, currency, amount_try, tx_date, notes, partners(name)')
      .in('partner_id', partnerIds)
      .in('tx_type', txTypes)
      .is('deleted_at', null)
      .order('tx_date', { ascending: false })
      .limit(200)
    return ((data ?? []) as unknown as Array<{
      id: string; partner_id: string; tx_type: string;
      amount: number; currency: string; amount_try: number;
      tx_date: string; notes: string | null;
      partners: { name: string } | { name: string }[] | null
    }>).map(r => ({
      id:           r.id,
      partner_id:   r.partner_id,
      partner_name: (Array.isArray(r.partners) ? r.partners[0]?.name : r.partners?.name) ?? '—',
      tx_type:      r.tx_type,
      amount:       r.amount,
      currency:     r.currency,
      amount_try:   r.amount_try,
      tx_date:      r.tx_date,
      notes:        r.notes,
    }))
  }

  // ── Tab-specific data loading ──────────────────────────────────────────────
  let debtBurden: Awaited<ReturnType<typeof PartnerService.calculateDebtBurden>> = { entries: [], summary: { total_loans_given: 0, total_loans_repaid: 0, total_outstanding: 0, weighted_avg_per_unit: 0, is_balanced: true, equalization_needed: 0, partner_count: 0 } }
  let ledger: Awaited<ReturnType<typeof PartnerService.getLedger>> = { entries: [], summary: { total_equity_pool: 0, total_debt_to_partners: 0, total_dividends: 0, total_salary_legacy: 0, debt_to_equity_ratio: null as number | null, partner_count: 0, active_partner_count: 0 } }
  let distCash   = { cash_distributable: 0, breakdown: { payments_received: 0, paid_expenses: 0, cash_balance: 0, unpaid_expenses: 0, outstanding_obligations: 0 } }
  let equalization = { baseline_per_unit: 0, total_equalization: 0, distributable: 0, remaining_after_eq: 0, entries: [] as { partner_id: string; partner_name: string; share_ratio: number; equalization_amount: number; pro_rata_share: number; total_payout: number }[] }
  let tabTxs: TxRow[] = []
  // FAZ 2: chronological full movement ledger for Özet tab
  let recentMovements: TxRow[] = []

  if (tab === 'ozet') {
    ;[debtBurden, ledger, distCash] = await Promise.all([
      sq(() => PartnerService.calculateDebtBurden(uid!, companyId), debtBurden),
      sq(() => PartnerService.getLedger(uid!, companyId), ledger),
      sq(() => getDistributableCash(companyId), distCash),
    ])
    ;[equalization, recentMovements] = await Promise.all([
      sq(
        () => PartnerService.calculateEqualization(uid!, companyId, distCash.cash_distributable),
        equalization,
      ),
      sq(() => fetchTxs([
        'capital_in', 'loan_to_company', 'loan_repayment', 'dividend',
        'board_fee', 'salary', 'huzur_hakki', 'equalization',
        'loan_in', 'loan_out', 'correction',
      ]), []),
    ])
  } else if (tab === 'sermaye') {
    tabTxs = await fetchTxs(['capital_in'])
  } else if (tab === 'borclar') {
    tabTxs = await fetchTxs(['loan_to_company', 'loan_repayment', 'loan_in', 'loan_out'])
  } else if (tab === 'huzur') {
    tabTxs = await fetchTxs(['board_fee', 'salary', 'huzur_hakki'])
  } else if (tab === 'temettu') {
    tabTxs = await fetchTxs(['dividend', 'equalization'])
  } else if (tab === 'duzeltme') {
    tabTxs = await fetchTxs(['correction'])
  }

  const ls = ledger.summary
  const db = debtBurden.summary
  const debtToEq = ls.debt_to_equity_ratio

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl space-y-0">

      <PageHeader
        title="Ortak Finansmanı"
        sub="Sermaye · Borç · Temettü · Eşitleme · Huzur Hakkı"
        action={
          <Link
            href="/dashboard/partners/new"
            className="text-sm font-bold bg-primary-600 text-white px-4 py-2 rounded-xl hover:bg-primary-700 transition-colors"
          >
            + Ortak Ekle
          </Link>
        }
      />

      {/* ── Inner tab strip ──────────────────────────────────────────────── */}
      <PartnerInnerTabs active={tab} />

      {/* ════════════════════════════════════════════════════════════════════
          TAB: ÖZET
      ════════════════════════════════════════════════════════════════════ */}
      {tab === 'ozet' && (
        <div className="space-y-4">

          {/* Zone 1: Command Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCell label="Toplam Özkaynak"    value={fmt(ls.total_equity_pool)}    tone="neutral"  />
            <KpiCell label="Net Ortak Borcu"     value={fmt(ls.total_debt_to_partners)} tone={ls.total_debt_to_partners > 0 ? 'warning' : 'positive'} />
            <KpiCell label="Dağıtılabilir Nakit" value={fmt(distCash.cash_distributable)} tone={distCash.cash_distributable > 0 ? 'positive' : 'neutral'} />
            <KpiCell label={db.is_balanced ? 'Borç Dengesi' : 'Eşitleme Gerekli'} value={db.is_balanced ? 'Dengeli ✓' : fmt(db.equalization_needed)} tone={db.is_balanced ? 'positive' : 'warning'} />
          </div>

          {/* Debt/Equity alert */}
          {debtToEq !== null && debtToEq > 2 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700 font-semibold">
              ⚠ Borç/Özkaynak oranı {debtToEq.toFixed(2)}× — Yüksek kaldıraç. Ortak geri ödemeleri önceliklendirilmeli.
            </div>
          )}

          {/* Zone 2: Partner Cards */}
          {balances.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl px-6 py-10 text-center">
              <div className="text-2xl mb-2">👤</div>
              <div className="text-sm font-bold text-gray-700">Henüz ortak eklenmemiş</div>
              <div className="text-xs text-gray-400 mt-1">
                İlk ortağı eklemek için yukarıdaki butonu kullanın.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {balances.map(b => {
                const shareRatioPct  = Math.round(b.share_ratio * 10000) / 100
                const netLoan        = b.net_loan_try
                const dbEntry        = debtBurden.entries.find((e: { partner_id: string }) => e.partner_id === b.partner_id)
                const priority       = (dbEntry as { repayment_priority?: number } | undefined)?.repayment_priority ?? null
                const isOverBurdened = dbEntry
                  ? (dbEntry as { overfunding_ratio: number }).overfunding_ratio > 1.05
                  : false

                return (
                  <div key={b.partner_id} className="group bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-colors">
                    {/* Partner header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-gray-900 text-sm truncate">{b.partner_name}</span>
                          {priority !== null && (
                            <span className={`shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full ${isOverBurdened ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-500'}`}>
                              #{priority}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          {pct(b.share_ratio)} hisse
                        </div>
                        <ShareBar ratio={b.share_ratio} />
                      </div>
                      <div className={`shrink-0 text-[10px] font-black px-2 py-1 rounded-lg ${b.net_loan_try >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                        {fmt(b.net_loan_try)}
                      </div>
                    </div>

                    {/* Metrics grid */}
                    <div className="grid grid-cols-3 gap-1.5 mt-3">
                      <div className="bg-gray-50 rounded-lg px-2.5 py-2">
                        <div className="text-[10px] text-gray-400 font-semibold">Özkaynak</div>
                        <div className="text-xs font-black tabular-nums text-primary-700">{fmt(b.total_capital_try)}</div>
                      </div>
                      <div className="bg-gray-50 rounded-lg px-2.5 py-2">
                        <div className="text-[10px] text-gray-400 font-semibold">Net Borç</div>
                        <div className={`text-xs font-black tabular-nums ${netLoan > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{fmt(netLoan)}</div>
                      </div>
                      <div className="bg-gray-50 rounded-lg px-2.5 py-2">
                        <div className="text-[10px] text-gray-400 font-semibold">Temettü</div>
                        <div className="text-xs font-black tabular-nums text-emerald-600">{fmt(b.total_distributed_try)}</div>
                      </div>
                    </div>

                    {/* Edit / delete */}
                    <PartnerActionsMenu
                      partnerId={b.partner_id}
                      partnerName={b.partner_name}
                      shareRatioPct={shareRatioPct}
                    />
                  </div>
                )
              })}
            </div>
          )}

          {/* Zone 3: Debt Burden */}
          {debtBurden.entries.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-black text-gray-800">Borç Dengesi & Geri Ödeme Önceliği</h2>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Hisse oranına normalize edilmiş borç analizi
                  </p>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${db.is_balanced ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {db.is_balanced ? 'Dengeli' : 'Dengesiz'}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-0 divide-x divide-gray-100 border-b border-gray-100">
                {[
                  { label: 'Toplam Verilen', value: fmt(db.total_loans_given),   color: 'text-amber-600'  },
                  { label: 'Geri Ödenen',   value: fmt(db.total_loans_repaid),   color: 'text-emerald-600'},
                  { label: 'Kalan',          value: fmt(db.total_outstanding),    color: db.total_outstanding > 0 ? 'text-red-600' : 'text-gray-400' },
                  { label: 'Ort. Birim',     value: fmt(db.weighted_avg_per_unit), color: 'text-gray-700' },
                ].map(c => (
                  <div key={c.label} className="px-4 py-2.5">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400">{c.label}</div>
                    <div className={`text-sm font-black tabular-nums ${c.color}`}>{c.value}</div>
                  </div>
                ))}
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Sıra</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Ortak</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-amber-400">Net Borç</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Kaldıraç</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-primary-400">Eşitleme</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[...debtBurden.entries]
                    .sort((a: { repayment_priority: number }, b: { repayment_priority: number }) => a.repayment_priority - b.repayment_priority)
                    .map((e: { partner_id: string; partner_name: string; share_ratio: number; net_loan: number; overfunding_ratio: number; equalization_repayment: number; repayment_priority: number }) => {
                      const isOver = e.overfunding_ratio > 1.05
                      return (
                        <tr key={e.partner_id} className="hover:bg-gray-50/60">
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black ${e.repayment_priority === 1 && isOver ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-500'}`}>
                              #{e.repayment_priority}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-gray-900">{e.partner_name}</div>
                            <div className="text-[10px] text-gray-400">{pct(e.share_ratio)}</div>
                          </td>
                          <td className={`px-4 py-3 text-right font-mono font-bold ${e.net_loan > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{fmt(e.net_loan)}</td>
                          <td className={`px-4 py-3 text-right font-mono font-bold ${isOver ? 'text-amber-700' : 'text-emerald-600'}`}>{e.overfunding_ratio.toFixed(2)}×</td>
                          <td className={`px-4 py-3 text-right font-mono font-bold ${e.equalization_repayment > 0 ? 'text-primary-700' : 'text-gray-400'}`}>
                            {e.equalization_repayment > 0 ? fmt(e.equalization_repayment) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          )}

          {/* Zone 4: Equalization */}
          {equalization.entries.length > 0 && equalization.total_equalization > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="text-sm font-black text-gray-800">Sermaye Eşitleme</h2>
                <p className="text-[10px] text-gray-400 mt-0.5">Dağıtım öncesi, daha az sermaye koymuş ortakların farkı kapatılır</p>
              </div>
              <div className="grid grid-cols-3 gap-0 divide-x divide-gray-100 border-b border-gray-100">
                {[
                  { label: 'Dağıtılabilir',   value: fmt(equalization.distributable),      color: 'text-gray-900'   },
                  { label: 'Toplam Eşitleme', value: fmt(equalization.total_equalization), color: 'text-amber-600'  },
                  { label: 'Pro-Rata Kalan',  value: fmt(equalization.remaining_after_eq), color: 'text-emerald-600'},
                ].map(c => (
                  <div key={c.label} className="px-4 py-2.5">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400">{c.label}</div>
                    <div className={`text-sm font-black tabular-nums ${c.color}`}>{c.value}</div>
                  </div>
                ))}
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Ortak</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-amber-400">Eşitleme</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-emerald-400">Pro-Rata</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-primary-600">Toplam Ödeme</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {equalization.entries.map(e => (
                    <tr key={e.partner_id} className="hover:bg-gray-50/60">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">{e.partner_name}</div>
                        <div className="text-[10px] text-gray-400">{pct(e.share_ratio)}</div>
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-bold ${e.equalization_amount > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                        {e.equalization_amount > 0 ? fmt(e.equalization_amount) : '—'}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono ${e.pro_rata_share > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                        {e.pro_rata_share > 0 ? fmt(e.pro_rata_share) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-black text-primary-700">
                        {fmt(e.total_payout)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Zone 5: Ledger */}
          {ledger.entries.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-black text-gray-800">Finansal Defter</h2>
                  <p className="text-[10px] text-gray-400 mt-0.5">Özkaynak · Borç · Geri Ödeme · Temettü · Maaş</p>
                </div>
                {ls.debt_to_equity_ratio !== null && (
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${ls.debt_to_equity_ratio > 2 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                    D/E {ls.debt_to_equity_ratio.toFixed(2)}×
                  </span>
                )}
              </div>
              <div className="grid grid-cols-4 gap-0 divide-x divide-gray-100 border-b border-gray-100">
                {[
                  { label: 'Toplam Özkaynak', value: fmt(ls.total_equity_pool),      color: 'text-primary-600' },
                  { label: 'Net Borç',         value: fmt(ls.total_debt_to_partners), color: ls.total_debt_to_partners > 0 ? 'text-amber-600' : 'text-gray-400' },
                  { label: 'Toplam Temettü',   value: fmt(ls.total_dividends),        color: 'text-emerald-600' },
                  { label: 'Maaş/Huzur',       value: fmt(ls.total_salary_legacy),   color: 'text-gray-600' },
                ].map(c => (
                  <div key={c.label} className="px-4 py-2.5">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400">{c.label}</div>
                    <div className={`text-sm font-black tabular-nums ${c.color}`}>{c.value}</div>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[640px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Ortak</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-primary-400">Özkaynak</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-amber-400">Verilen</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Ödenen</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-amber-600">Net Borç</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-emerald-500">Temettü</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-primary-700">Şirket Borcu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(ledger.entries as Array<{
                      partner_id: string; partner_name: string; share_ratio: number; is_active: boolean;
                      equity_contributed: number; loans_given: number; loans_repaid: number;
                      net_loan_outstanding: number; dividends_received: number; company_total_owed: number
                    }>).map(e => (
                      <tr key={e.partner_id} className={`hover:bg-gray-50/60 ${!e.is_active ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-gray-900">{e.partner_name}</div>
                          <div className="text-[10px] text-gray-400">{pct(e.share_ratio)}{!e.is_active ? ' · pasif' : ''}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-primary-700 font-bold">{fmt(e.equity_contributed)}</td>
                        <td className="px-4 py-3 text-right font-mono text-amber-600">{fmt(e.loans_given)}</td>
                        <td className="px-4 py-3 text-right font-mono text-gray-500">{fmt(e.loans_repaid)}</td>
                        <td className={`px-4 py-3 text-right font-mono font-bold ${e.net_loan_outstanding > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{fmt(e.net_loan_outstanding)}</td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-600">{fmt(e.dividends_received)}</td>
                        <td className="px-4 py-3 text-right font-mono font-black text-primary-800">{fmt(e.company_total_owed)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Zone 6: Chronological Movement Ledger (FAZ 2) */}
          {recentMovements.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="text-sm font-black text-gray-800">Son Hareketler</h2>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Tüm işlem türleri · kronolojik sıra · son {Math.min(recentMovements.length, 200)} hareket
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[560px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Tarih</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Ortak</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Tür</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Tutar (TRY)</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Not</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {recentMovements.map(tx => {
                      const meta = TX_META[tx.tx_type] ?? { label: tx.tx_type, color: 'text-gray-600' }
                      return (
                        <tr key={tx.id} className="hover:bg-gray-50/60">
                          <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                            {new Date(tx.tx_date + 'T00:00:00Z').toLocaleDateString('tr-TR', {
                              day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
                            })}
                          </td>
                          <td className="px-4 py-2.5 font-semibold text-gray-900">{tx.partner_name}</td>
                          <td className="px-4 py-2.5">
                            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[10px] font-bold">
                              {meta.label}
                            </span>
                          </td>
                          <td className={`px-4 py-2.5 text-right font-mono font-bold ${tx.amount_try < 0 ? 'text-orange-600' : meta.color}`}>
                            {fmt(tx.amount_try)}
                            {tx.currency !== 'TRY' && (
                              <span className="text-gray-400 font-normal ml-1 text-[10px]">
                                ({tx.currency} {Math.abs(tx.amount).toLocaleString('tr-TR')})
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-gray-400 max-w-[160px] truncate">{tx.notes ?? '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: SERMAYE
      ════════════════════════════════════════════════════════════════════ */}
      {tab === 'sermaye' && (
        <PartnerTxPanel
          partners={partnersList}
          transactions={tabTxs}
          txTypes={SERMAYE_TYPES}
          description="Ortakların şirkete yaptığı özkaynak katkıları. Geri ödeme yükümlülüğü yoktur."
          emptyLabel="Henüz sermaye girişi kaydedilmemiş"
        />
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: BORÇLAR
      ════════════════════════════════════════════════════════════════════ */}
      {tab === 'borclar' && (
        <PartnerTxPanel
          partners={partnersList}
          transactions={tabTxs}
          txTypes={BORCLAR_TYPES}
          description="Ortakların şirkete verdiği borçlar ve şirketin yaptığı geri ödemeler."
          emptyLabel="Henüz borç/kredi işlemi kaydedilmemiş"
        />
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: HUZUR HAKKI
      ════════════════════════════════════════════════════════════════════ */}
      {tab === 'huzur' && (
        <PartnerTxPanel
          partners={partnersList}
          transactions={tabTxs}
          txTypes={HUZUR_TYPES}
          description="Yönetim kurulu üyelerine ödenen huzur hakkı ve ücret kayıtları."
          emptyLabel="Henüz huzur hakkı / ücret kaydedilmemiş"
        />
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: TEMETTÜ  (FAZ 2)
      ════════════════════════════════════════════════════════════════════ */}
      {tab === 'temettu' && (
        <PartnerTxPanel
          partners={partnersList}
          transactions={tabTxs}
          txTypes={TEMETTU_TYPES}
          description="Ortaklara dağıtılan kâr payları ve sermaye eşitleme ödemeleri."
          emptyLabel="Henüz temettü / kâr payı kaydedilmemiş"
        />
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: DÜZELTME  (FAZ 2 — immutable ledger)
      ════════════════════════════════════════════════════════════════════ */}
      {tab === 'duzeltme' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
            <strong>Değişmez Defter İlkesi:</strong> Yanlış kaydedilen işlemler silinmez —
            bu sekmedeki düzeltme girişi yanlış tutarı negatif olarak kaydederek dengeyi düzeltir.
            Her düzeltme notuna orijinal kayıt tarihini yazmanız önerilir.
          </div>
          <PartnerTxPanel
            partners={partnersList}
            transactions={tabTxs}
            txTypes={DUZELTME_TYPES}
            description="Yanlış kaydedilen işlemleri ters yönde düzeltir. Tutar negatif kaydedilir."
            emptyLabel="Henüz düzeltme girişi yok"
            negateAmount
          />
        </div>
      )}

    </div>
  )
}

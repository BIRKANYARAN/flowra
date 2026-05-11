export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// /dashboard/partners — Partner Finance Hub
//
// SERVER COMPONENT — all data loaded directly via PartnerService + financial-core.
// No self-HTTP, no client-side fetches for read-only data.
//
// Zones:
//   1. Command Strip    — total capital, debt-to-equity, distributable, equalization alert
//   2. Partner Cards    — per-partner balance, share, loan status + edit/delete client island
//   3. Debt Burden      — ownership-normalized debt analysis + repayment priority
//   4. Financial Ledger — full equity/debt/distribution breakdown table
// ─────────────────────────────────────────────────────────────────────────────

import { createClient }      from '@/lib/supabase-server'
import { redirect }          from 'next/navigation'
import { resolveCompanyId }  from '@/lib/resolve-company'
import Link                  from 'next/link'
import { PartnerService }    from '@/lib/services/partner.service'
import { getDistributableCash } from '@/lib/finance/financial-core'
import { PartnerActionsMenu } from '@/components/dashboard/partners/PartnerActionsMenu'

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

// ── Share bar ─────────────────────────────────────────────────────────────────

function ShareBar({ ratio }: { ratio: number }) {
  return (
    <div className="relative h-1.5 w-full bg-gray-100 rounded-full overflow-hidden mt-1">
      <div className="absolute inset-y-0 left-0 bg-primary-400 rounded-full" style={{ width: `${ratio * 100}%` }} />
    </div>
  )
}

// ── KPI cell ─────────────────────────────────────────────────────────────────

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

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function PartnersPage() {
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

  // ── Data loading — 4 parallel, no self-HTTP ────────────────────────────────
  function sq<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    return fn().catch(() => fallback)
  }

  const [balances, debtBurden, ledger, distCash] = await Promise.all([
    sq(() => PartnerService.getPartnerBalances(uid!, companyId), []),
    sq(() => PartnerService.calculateDebtBurden(uid!, companyId), { entries: [], summary: { total_loans_given: 0, total_loans_repaid: 0, total_outstanding: 0, weighted_avg_per_unit: 0, is_balanced: true, equalization_needed: 0, partner_count: 0 } }),
    sq(() => PartnerService.getLedger(uid!, companyId), { entries: [], summary: { total_equity_pool: 0, total_debt_to_partners: 0, total_dividends: 0, total_salary_legacy: 0, debt_to_equity_ratio: null, partner_count: 0, active_partner_count: 0 } }),
    sq(() => getDistributableCash(companyId), { cash_distributable: 0, breakdown: { payments_received: 0, paid_expenses: 0, cash_balance: 0, unpaid_expenses: 0, outstanding_obligations: 0 } }),
  ])

  // Compute equalization with real distributable cash
  const equalization = await sq(
    () => PartnerService.calculateEqualization(uid!, companyId, distCash.cash_distributable),
    { baseline_per_unit: 0, total_equalization: 0, distributable: 0, remaining_after_eq: 0, entries: [] },
  )

  const ls = ledger.summary
  const db = debtBurden.summary
  const debtToEq = ls.debt_to_equity_ratio

  return (
    <div className="max-w-5xl space-y-4">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight">Partner Finance Hub</h1>
          <p className="text-xs text-gray-400 mt-0.5">Sermaye · Borç · Eşitleme · Öncelik Analizi</p>
        </div>
        <Link
          href="/dashboard/partners/new"
          className="text-sm font-bold bg-primary-600 text-white px-4 py-2 rounded-xl hover:bg-primary-700 transition-colors"
        >
          + Ortak Ekle
        </Link>
      </div>

      {/* ── Zone 1: Command Strip ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCell
          label="Toplam Özkaynak"
          value={fmt(ls.total_equity_pool)}
          tone="neutral"
        />
        <KpiCell
          label="Net Ortak Borcu"
          value={fmt(ls.total_debt_to_partners)}
          tone={ls.total_debt_to_partners > 0 ? 'warning' : 'positive'}
        />
        <KpiCell
          label="Dağıtılabilir Nakit"
          value={fmt(distCash.cash_distributable)}
          tone={distCash.cash_distributable > 0 ? 'positive' : 'neutral'}
        />
        <KpiCell
          label={db.is_balanced ? 'Borç Dengesi' : 'Eşitleme Gerekli'}
          value={db.is_balanced ? 'Dengeli ✓' : fmt(db.equalization_needed)}
          tone={db.is_balanced ? 'positive' : 'warning'}
        />
      </div>

      {/* Debt/Equity ratio alert */}
      {debtToEq !== null && debtToEq > 2 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700 font-semibold">
          ⚠ Borç/Özkaynak oranı {debtToEq.toFixed(2)}× — Yüksek kaldıraç. Ortak geri ödemeleri önceliklendirilmeli.
        </div>
      )}

      {/* ── Zone 2: Partner Cards ────────────────────────────────────────────── */}
      {balances.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-10 text-center">
          <div className="text-2xl mb-2">👤</div>
          <div className="text-sm font-bold text-gray-700">Henüz ortak eklenmemiş</div>
          <div className="text-xs text-gray-400 mt-1">İlk ortağı eklemek için yukarıdaki butonu kullanın.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {balances.map(b => {
            const shareRatioPct = Math.round(b.share_ratio * 10000) / 100
            const netLoan = b.net_loan_try
            const dbEntry = debtBurden.entries.find(e => e.partner_id === b.partner_id)
            const priority = dbEntry?.repayment_priority ?? null
            const isOverBurdened = dbEntry ? dbEntry.overfunding_ratio > 1.05 : false

            return (
              <div key={b.partner_id} className="group bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-colors">
                {/* Partner header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-gray-900 text-sm truncate">{b.partner_name}</span>
                      {!b.is_active && (
                        <span className="text-[9px] bg-gray-100 text-gray-400 font-semibold px-1.5 py-0.5 rounded-full">Pasif</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400 font-semibold">{pct(b.share_ratio)} pay</span>
                      {isOverBurdened && priority === 1 && (
                        <span className="text-[9px] bg-primary-100 text-primary-700 font-bold px-1.5 py-0.5 rounded-full">Öncelik #1</span>
                      )}
                      {isOverBurdened && priority !== null && priority > 1 && (
                        <span className="text-[9px] bg-gray-100 text-gray-500 font-bold px-1.5 py-0.5 rounded-full">Öncelik #{priority}</span>
                      )}
                    </div>
                    <ShareBar ratio={b.share_ratio} />
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-base font-black tabular-nums leading-tight ${b.partner_balance_try > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                      {fmt(b.partner_balance_try)}
                    </div>
                    <div className="text-[10px] text-gray-400">Şirket Borcu</div>
                  </div>
                </div>

                {/* Metric grid */}
                <div className="grid grid-cols-3 gap-2 mt-3">
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

                {/* Edit / delete client island */}
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

      {/* ── Zone 3: Debt Burden & Repayment Priority ────────────────────────── */}
      {debtBurden.entries.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black text-gray-800">Borç Dengesi & Geri Ödeme Önceliği</h2>
              <p className="text-[10px] text-gray-400 mt-0.5">
                Hisse oranına normalize edilmiş borç analizi — kaldıraç oranı en yüksek ortak önce geri ödenir
              </p>
            </div>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${db.is_balanced ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {db.is_balanced ? 'Dengeli' : 'Dengesiz'}
            </span>
          </div>

          {/* Summary strip */}
          <div className="grid grid-cols-4 gap-0 divide-x divide-gray-100 border-b border-gray-100">
            {[
              { label: 'Toplam Verilen', value: fmt(db.total_loans_given),   color: 'text-amber-600' },
              { label: 'Geri Ödenen',   value: fmt(db.total_loans_repaid),   color: 'text-emerald-600' },
              { label: 'Kalan',         value: fmt(db.total_outstanding),     color: db.total_outstanding > 0 ? 'text-red-600' : 'text-gray-400' },
              { label: 'Ort. Birim',    value: fmt(db.weighted_avg_per_unit), color: 'text-gray-700' },
            ].map(c => (
              <div key={c.label} className="px-4 py-2.5">
                <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400">{c.label}</div>
                <div className={`text-sm font-black tabular-nums ${c.color}`}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Per-partner debt burden table */}
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Sıra</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Ortak</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-amber-400">Net Borç</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Birim Borç</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-400">Kaldıraç</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-primary-400">Eşitleme</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[...debtBurden.entries]
                .sort((a, b) => a.repayment_priority - b.repayment_priority)
                .map(e => {
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
                      <td className={`px-4 py-3 text-right font-mono font-bold ${e.net_loan > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                        {fmt(e.net_loan)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-600">{fmt(e.per_unit_loan)}</td>
                      <td className={`px-4 py-3 text-right font-mono font-bold ${isOver ? 'text-amber-700' : 'text-emerald-600'}`}>
                        {e.overfunding_ratio.toFixed(2)}×
                      </td>
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

      {/* ── Zone 4: Equalization Panel ──────────────────────────────────────── */}
      {equalization.entries.length > 0 && equalization.total_equalization > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-black text-gray-800">Sermaye Eşitleme</h2>
            <p className="text-[10px] text-gray-400 mt-0.5">
              Dağıtım öncesi, daha az sermaye koymuş ortakların farkı kapatılır
            </p>
          </div>
          <div className="grid grid-cols-3 gap-0 divide-x divide-gray-100 border-b border-gray-100">
            {[
              { label: 'Dağıtılabilir',    value: fmt(equalization.distributable),      color: 'text-gray-900' },
              { label: 'Toplam Eşitleme',  value: fmt(equalization.total_equalization), color: 'text-amber-600' },
              { label: 'Pro-Rata Kalan',   value: fmt(equalization.remaining_after_eq), color: 'text-emerald-600' },
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

      {/* ── Zone 5: Financial Ledger ─────────────────────────────────────────── */}
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
              { label: 'Net Borç',        value: fmt(ls.total_debt_to_partners),  color: ls.total_debt_to_partners > 0 ? 'text-amber-600' : 'text-gray-400' },
              { label: 'Toplam Temettü',  value: fmt(ls.total_dividends),         color: 'text-emerald-600' },
              { label: 'Maaş/Huzur',     value: fmt(ls.total_salary_legacy),     color: 'text-gray-600' },
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
                {ledger.entries.map(e => (
                  <tr key={e.partner_id} className={`hover:bg-gray-50/60 ${!e.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">{e.partner_name}</div>
                      <div className="text-[10px] text-gray-400">{pct(e.share_ratio)}{!e.is_active ? ' · pasif' : ''}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-primary-700 font-bold">{fmt(e.equity_contributed)}</td>
                    <td className="px-4 py-3 text-right font-mono text-amber-600">{fmt(e.loans_given)}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-500">{fmt(e.loans_repaid)}</td>
                    <td className={`px-4 py-3 text-right font-mono font-bold ${e.net_loan_outstanding > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                      {fmt(e.net_loan_outstanding)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-600">{fmt(e.dividends_received)}</td>
                    <td className="px-4 py-3 text-right font-mono font-black text-primary-800">{fmt(e.company_total_owed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}

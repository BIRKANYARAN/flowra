export const dynamic = 'force-dynamic'

// ── /dashboard/insights — AI Analiz Merkezi ──────────────────────────────────
// Üç motor birlikte:
//   1. Durum Özeti      — SituationEngine + AlertEngine + AI narrative
//   2. Anomali Tespiti  — Gelir/gider istatistiksel sapma
//   3. Kopya Gider      — DuplicateDetector (CFO için)
//
// Tüm hesaplamalar server-side (RSC). AI sadece narrative yazar, rakam hesaplamaz.

import Link                    from 'next/link'
import { notFound }            from 'next/navigation'
import { createClient }        from '@/lib/supabase-server'
import { resolveCompanyId }    from '@/lib/resolve-company'
import { fmtTRY as fmt }       from '@/lib/format'
import {
  detectRevenueAnomalies,
  detectExpenseAnomalies,
  scoreCustomerRisk,
  type MonthlyRevenue,
  type MonthlyExpense,
  type CustomerPayment,
  type RevenueAnomaly,
  type ExpenseAnomaly,
  type CustomerRisk,
} from '@/lib/engines/anomaly.engine'
import { detectDuplicates }    from '@/lib/engines/duplicate-detector'
import type { ExpenseRow, DuplicateGroup } from '@/lib/engines/duplicate-detector'
import { FinanceService }      from '@/lib/services/finance.service'
import { computeSituation }    from '@/lib/engines/situation.engine'
import { evaluateAlerts }      from '@/lib/engines/alert.engine'
import { generateSituationSummary } from '@/lib/services/ai-summary.service'
import { getCfoMetrics }       from '@/lib/finance/financial-core'
import type { SituationInputs } from '@/lib/engines/situation.engine'
import type { AlertInputs }    from '@/lib/engines/alert.engine'
import type { DecisionAlert }  from '@/lib/engines/alert.engine'

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  general: 'Genel', rent: 'Kira', salary: 'Maaş', utilities: 'Faturalar',
  marketing: 'Pazarlama', logistics: 'Lojistik', software: 'Yazılım',
  equipment: 'Ekipman', tax: 'Vergi', interest: 'Faiz', other: 'Diğer',
}
function catLabel(c: string) { return CATEGORY_LABELS[c] ?? c }

const SEVERITY_CFG = {
  high:   { cls: 'bg-neg-light border-neg-light text-neg-text',    dot: 'bg-neg',        label: 'Yüksek' },
  medium: { cls: 'bg-warn-light border-warn-light text-warn-text', dot: 'bg-warn',       label: 'Orta'   },
  low:    { cls: 'bg-[#f8fafc] border-[#e2e8f0] text-[#64748b]',  dot: 'bg-[#94a3b8]', label: 'Düşük'  },
} as const

const STATUS_CFG = {
  healthy:  { cls: 'text-pos-text',  bg: 'bg-pos-light',  label: 'Sağlıklı'        },
  caution:  { cls: 'text-warn-text', bg: 'bg-warn-light', label: 'Dikkat'           },
  'at-risk':{ cls: 'text-warn-text', bg: 'bg-warn-light', label: 'Risk Altında'     },
  critical: { cls: 'text-neg-text',  bg: 'bg-neg-light',  label: 'Kritik'           },
} as const

const ALERT_SEV_CFG = {
  critical: { cls: 'bg-neg-light border-neg-light text-neg-text',    dot: 'bg-neg',   label: 'Kritik' },
  warning:  { cls: 'bg-warn-light border-warn-light text-warn-text', dot: 'bg-warn',  label: 'Uyarı'  },
  info:     { cls: 'bg-[#f0f9ff] border-[#bae6fd] text-[#0369a1]',  dot: 'bg-[#0ea5e9]', label: 'Bilgi' },
} as const

function SectionHeader({ title, sub, badge }: { title: string; sub?: string; badge?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <h2 className="text-xs font-black uppercase tracking-widest text-[#64748b]">{title}</h2>
        {sub && <p className="text-[0.65rem] text-[#94a3b8] mt-0.5">{sub}</p>}
      </div>
      {badge}
    </div>
  )
}

function EmptyState({ icon, msg }: { icon: string; msg: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-2 text-[#94a3b8]">
      <span className="text-2xl">{icon}</span>
      <p className="text-xs">{msg}</p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function InsightsPage() {
  const supabase = createClient()

  const { data: authData } = await supabase.auth.getUser()
  if (!authData?.user) return notFound()
  const user = authData.user

  let companyId: string
  try { companyId = await resolveCompanyId(user.id, supabase) }
  catch { return notFound() }

  const now    = new Date()
  const from   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const to     = now.toISOString().slice(0, 10)
  const period = now.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })

  // ── 1. Build anomaly months ───────────────────────────────────────────────
  const anomalyMonths: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i)
    anomalyMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const anomalyFrom = anomalyMonths[0] + '-01'
  const anomalyTo   = to

  // ── 2. Parallel data fetches ──────────────────────────────────────────────
  const [
    pnlRes, overdueRes, trancheRes, cfoRes,
    salesAnomalyRes, expensesAnomalyRes, customerPayRes,
    duplicatesRes,
  ] = await Promise.allSettled([
    FinanceService.getFinancialSummary(user.id, companyId, { from, to }, undefined, undefined, supabase),
    supabase.from('sales')
      .select('total_try:total, amount_paid:paid_amount, sale_date')
      .eq('company_id', companyId)
      .in('payment_status', ['pending', 'partial', 'overdue'])
      .is('deleted_at', null),
    supabase.from('partner_loan_tranches')
      // outstanding_try / due_date are computed/aliased below (no such columns)
      .select('principal_try, total_repaid_try, expected_repayment_date, partner_id, annual_interest_rate')
      .eq('company_id', companyId)
      .eq('status', 'active'),
    getCfoMetrics(companyId, { from, to }, supabase),
    supabase.from('sales')
      .select('total_try:total, sale_date')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', anomalyFrom)
      .lte('sale_date', anomalyTo),
    supabase.from('expenses')
      .select('amount_try, expense_type, expense_date')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('expense_date', anomalyFrom)
      .lte('expense_date', anomalyTo),
    supabase.from('sales')
      .select('customer_name, sale_date, paid_at, due_date, total_try:total, payment_status')
      .eq('company_id', companyId)
      .is('deleted_at', null),
    supabase.from('expenses')
      // expenses has no vendor_name — `title` is the payee/expense name (aliased)
      .select('id, expense_date, expense_type, amount_try, vendor_name:title, description')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('expense_date', new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10))
      .order('expense_date', { ascending: true }),
  ])

  const pnl      = pnlRes.status    === 'fulfilled' ? pnlRes.value    : null
  const overdue  = overdueRes.status  === 'fulfilled' ? (overdueRes.value.data ?? [])  : []
  const tranches = (trancheRes.status  === 'fulfilled' ? (trancheRes.value.data ?? [])  : [])
    .map((t: Record<string, unknown>) => ({
      partner_id:           t.partner_id,
      annual_interest_rate: t.annual_interest_rate,
      due_date:             t.expected_repayment_date,
      outstanding_try:      Math.max(0, Number(t.principal_try ?? 0) - Number(t.total_repaid_try ?? 0)),
    }))
  const cfo      = cfoRes.status      === 'fulfilled' ? cfoRes.value      : null

  // ── 3. Situation + Alerts ─────────────────────────────────────────────────
  const nowMs = Date.now()
  let ot30 = 0, ot60 = 0, allOutstanding = 0
  for (const s of overdue) {
    if (!s.sale_date) continue
    const age  = Math.round((nowMs - new Date((s.sale_date as string) + 'T00:00:00Z').getTime()) / 86_400_000)
    const owed = Math.max(0, Number(s.total_try ?? 0) - Number(s.amount_paid ?? 0))
    allOutstanding += owed
    if (age > 60) ot60 += owed; else if (age > 30) ot30 += owed
  }
  const totalLoans         = tranches.reduce((s, t) => s + Number(t.outstanding_try ?? 0), 0)
  const monthlyDebtService = tranches.reduce((s, t) => {
    const p = Number(t.outstanding_try ?? 0), r = Number(t.annual_interest_rate ?? 0)
    return s + (r > 0 ? p * r / 12 : p * 0.015)
  }, 0)
  const monthlyNet  = pnl?.net_after_tax_try ?? 0
  const monthlyRevM = pnl?.revenue_try ?? 0
  const dsr = monthlyNet > 0 ? Math.min(1, monthlyDebtService / monthlyNet) : (monthlyDebtService > 0 ? 1.0 : 0)
  const loanByPartner = tranches.reduce((acc: Record<string, number>, t) => {
    const pid = String(t.partner_id ?? 'x')
    acc[pid] = (acc[pid] ?? 0) + Number(t.outstanding_try ?? 0)
    return acc
  }, {})
  const maxPartnerLoan    = totalLoans > 0 ? Math.max(0, ...Object.values(loanByPartner)) : 0
  const loanConcentration = totalLoans > 0 ? maxPartnerLoan / totalLoans : 0
  const overdueRatio      = monthlyRevM > 0 ? (ot30 + ot60) / monthlyRevM : 0

  let nextDueDays = -1, nextAmt = 0
  for (const t of tranches) {
    if (t.due_date) {
      const days = Math.round((new Date(t.due_date as string).getTime() - nowMs) / 86_400_000)
      if (nextDueDays < 0 || days < nextDueDays) { nextDueDays = days; nextAmt = Number(t.outstanding_try ?? 0) }
    }
  }
  const kdvPayable  = pnl?.net_vat_try ?? 0
  const taxDueDays  = kdvPayable > 0 ? (() => {
    const cm = now.getMonth() + 1, cy = now.getFullYear()
    const dm = cm === 12 ? 1 : cm + 1, dy = cm === 12 ? cy + 1 : cy
    return Math.round((new Date(`${dy}-${String(dm).padStart(2,'0')}-24`).getTime() - nowMs) / 86_400_000)
  })() : -1
  const cashRunwayDays = cfo?.burn.runway_days ?? -1

  const sitInputs: SituationInputs = {
    cashRunwayMonths:  cfo?.burn.runway_months ?? 0,
    isProfitable:      monthlyNet >= 0,
    netMarginPct:      monthlyRevM > 0 ? monthlyNet / monthlyRevM : 0,
    debtServiceRatio:  dsr,
    overdueRatioPct:   overdueRatio * 100,
    maxBurdenScoreAbs: 0,
  }
  const situation = computeSituation(sitInputs)

  const alertInputs: AlertInputs = {
    overdueCount30: overdue.filter(s => {
      const age = Math.round((nowMs - new Date(((s.sale_date as string) || '1970-01-01') + 'T00:00:00Z').getTime()) / 86_400_000)
      return age > 30 && age <= 60
    }).length,
    overdueTotal30: ot30,
    overdueCount60: overdue.filter(s => {
      const age = Math.round((nowMs - new Date(((s.sale_date as string) || '1970-01-01') + 'T00:00:00Z').getTime()) / 86_400_000)
      return age > 60
    }).length,
    overdueTotal60:           ot60,
    totalReceivables:         allOutstanding,
    cashRunwayDays,
    monthlyNetIncome:         monthlyNet,
    maxBurdenScoreAbs:        0,
    nextTrancheDueDays:       nextDueDays,
    nextTrancheAmount:        nextAmt,
    openPeriodDaysOverdue:    -1,
    kdvPayable,
    taxDueDays,
    bsImbalanceTry:           0,
    legalReserveDeficit:      0,
    equityGapTry:             0,
    equityCallOverdueDays:    -1,
    debtServiceRatio:         dsr,
    partnerLoanConcentration: loanConcentration,
  }
  const alerts: DecisionAlert[] = evaluateAlerts(alertInputs)

  // ── 4. AI Summary ─────────────────────────────────────────────────────────
  const aiSummary = await generateSituationSummary({
    situation, topAlerts: alerts.slice(0, 3), period,
    revenue:    monthlyRevM,
    netIncome:  monthlyNet,
    cashBalance: 0,
  }).catch(() => null)

  // ── 5. Anomaly detection ──────────────────────────────────────────────────
  const revByMonth: Record<string, number> = {}
  for (const m of anomalyMonths) revByMonth[m] = 0
  if (salesAnomalyRes.status === 'fulfilled' && salesAnomalyRes.value.data) {
    for (const s of salesAnomalyRes.value.data) {
      const m = s.sale_date ? (s.sale_date as string).slice(0, 7) : ''
      if (m) revByMonth[m] = (revByMonth[m] ?? 0) + Number(s.total_try ?? 0)
    }
  }
  const monthlyRevenue: MonthlyRevenue[] = Object.entries(revByMonth)
    .map(([month, revenue]) => ({ month, revenue }))
    .sort((a, b) => a.month.localeCompare(b.month))

  const expMap: Record<string, Record<string, number>> = {}
  if (expensesAnomalyRes.status === 'fulfilled' && expensesAnomalyRes.value.data) {
    for (const e of expensesAnomalyRes.value.data) {
      const m   = (e.expense_date as string).slice(0, 7)
      const cat = (e.expense_type as string) ?? 'general'
      if (!expMap[cat]) expMap[cat] = {}
      expMap[cat][m] = (expMap[cat][m] ?? 0) + Number(e.amount_try ?? 0)
    }
  }
  const monthlyExpenses: MonthlyExpense[] = []
  for (const [category, byMonth] of Object.entries(expMap))
    for (const [month, amount] of Object.entries(byMonth))
      monthlyExpenses.push({ month, category, amount })

  const custPayments: CustomerPayment[] = []
  if (customerPayRes.status === 'fulfilled' && customerPayRes.value.data) {
    for (const s of customerPayRes.value.data)
      custPayments.push({
        customer_name:  (s.customer_name as string) ?? 'Bilinmiyor',
        sale_date:      s.sale_date ? (s.sale_date as string).slice(0, 10) : '',
        paid_date:      s.paid_at as string | null,
        due_date:       s.due_date as string | null,
        total_try:      Number(s.total_try ?? 0),
        payment_status: s.payment_status as string,
      })
  }

  const revenueAnomalies: RevenueAnomaly[]   = detectRevenueAnomalies(monthlyRevenue)
  const expenseAnomalies: ExpenseAnomaly[]   = detectExpenseAnomalies(monthlyExpenses)
  const customerRisks:    CustomerRisk[]     = scoreCustomerRisk(custPayments).filter(r => r.risk_level !== 'low').slice(0, 8)

  // ── 6. Duplicate detection ────────────────────────────────────────────────
  const dupExpenses: ExpenseRow[] = duplicatesRes.status === 'fulfilled' && duplicatesRes.value.data
    ? duplicatesRes.value.data.map(e => ({
        id:           e.id as string,
        expense_date: e.expense_date as string,
        expense_type: (e.expense_type as string) ?? 'general',
        amount_try:   Number(e.amount_try ?? 0),
        vendor_name:  e.vendor_name as string | null ?? null,
        description:  e.description as string | null ?? null,
      }))
    : []
  const duplicates: DuplicateGroup[] = detectDuplicates(dupExpenses)
  const highDups = duplicates.filter(d => d.confidence === 'high')

  // ── 7. Derived totals ─────────────────────────────────────────────────────
  const criticalAlerts  = alerts.filter(a => a.severity === 'critical')
  const warningAlerts   = alerts.filter(a => a.severity === 'warning')
  const allAnomalies    = [...revenueAnomalies, ...expenseAnomalies]
  const highAnomalies   = allAnomalies.filter(a => a.severity === 'high')
  const statusCfg       = STATUS_CFG[situation.status] ?? STATUS_CFG['caution']

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl space-y-6 pb-10">

      {/* ── Breadcrumb ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-[0.65rem] text-[#94a3b8]">
        <Link href="/dashboard" className="hover:text-[#475569]">Komuta</Link>
        <span>/</span>
        <span className="text-[#475569] font-medium">AI Analiz</span>
      </div>

      {/* ── Hero: Durum + AI Narrative ───────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Durum Özeti — {period}</p>
            <div className="flex items-center gap-3">
              <span className={`text-3xl font-black tabular-nums ${statusCfg.cls}`}>{situation.composite}</span>
              <div>
                <span className={`inline-block text-[0.65rem] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${statusCfg.bg} ${statusCfg.cls}`}>
                  {statusCfg.label}
                </span>
                <p className="text-xs text-[#475569] mt-1 font-medium">{situation.situationLine}</p>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[0.65rem] text-[#94a3b8]">
              {aiSummary?.generated_by === 'ai' ? '✦ Claude Haiku' : '⚙ Kural Motoru'}
            </p>
            {criticalAlerts.length > 0 && (
              <p className="text-[0.65rem] font-bold text-neg-text mt-1">{criticalAlerts.length} kritik uyarı</p>
            )}
          </div>
        </div>

        {aiSummary && (
          <div className="border-t border-[#f1f5f9] pt-4 space-y-3">
            <p className="text-sm text-[#1e293b] leading-relaxed">{aiSummary.summary_tr}</p>
            {aiSummary.key_factors.length > 0 && (
              <ul className="space-y-1">
                {aiSummary.key_factors.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-[#475569]">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-[#94a3b8] shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            )}
            {aiSummary.recommendation && (
              <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-lg px-3 py-2">
                <p className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">Önerilen Aksiyon</p>
                <p className="text-xs font-semibold text-[#0f172a]">{aiSummary.recommendation}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Aktif Uyarılar ───────────────────────────────────────────────── */}
      {alerts.length > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
          <SectionHeader
            title="Aktif Uyarılar"
            sub={`${criticalAlerts.length} kritik · ${warningAlerts.length} uyarı`}
            badge={
              <span className="text-[0.65rem] text-[#94a3b8]">{alerts.length} toplam</span>
            }
          />
          <div className="space-y-2">
            {alerts.slice(0, 6).map((a, i) => {
              const cfg = ALERT_SEV_CFG[a.severity] ?? ALERT_SEV_CFG['info']
              return (
                <div key={i} className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border ${cfg.cls}`}>
                  <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[0.6rem] font-black uppercase tracking-wider opacity-70">{cfg.label}</span>
                      <span className="text-xs font-bold">{a.title}</span>
                    </div>
                    <p className="text-[0.65rem] mt-0.5 opacity-80">{a.detail}</p>
                  </div>
                  {a.actionLabel && a.actionHref && (
                    <Link href={a.actionHref}
                      className="shrink-0 text-[0.6rem] font-bold underline underline-offset-2 opacity-80 hover:opacity-100 whitespace-nowrap">
                      {a.actionLabel}
                    </Link>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Anomali Tespiti ───────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
        <SectionHeader
          title="Anomali Tespiti"
          sub="Son 6 aylık veriden istatistiksel sapma — ±2σ eşiği"
          badge={
            highAnomalies.length > 0
              ? <span className="text-[0.6rem] font-bold text-neg-text bg-neg-light px-2 py-0.5 rounded-full">{highAnomalies.length} yüksek</span>
              : <span className="text-[0.6rem] text-pos-text bg-pos-light px-2 py-0.5 rounded-full">Anormallik yok</span>
          }
        />

        {allAnomalies.length === 0 ? (
          <EmptyState icon="✓" msg="Son 6 ayda istatistiksel anormallik tespit edilmedi" />
        ) : (
          <div className="space-y-2">
            {allAnomalies.slice(0, 8).map((a, i) => {
              const cfg = SEVERITY_CFG[a.severity] ?? SEVERITY_CFG['low']
              const isRev = a.type === 'revenue'
              const dirLabel = a.direction === 'spike' ? '▲ Ani artış' : '▼ Ani düşüş'
              return (
                <div key={i} className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border ${cfg.cls}`}>
                  <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[0.6rem] font-black uppercase tracking-wider opacity-70">
                        {isRev ? 'Gelir' : catLabel((a as ExpenseAnomaly).category)}
                      </span>
                      <span className="text-[0.65rem] font-bold">{a.month}</span>
                      <span className="text-[0.6rem] font-semibold opacity-70">{dirLabel}</span>
                    </div>
                    <p className="text-[0.65rem] mt-0.5 opacity-80">{a.message}</p>
                    <p className="text-[0.6rem] mt-0.5 opacity-60 tabular-nums">
                      Gerçekleşen {fmt(a.actual)} · Ortalama {fmt(a.mean)} · Sapma %{Math.abs(a.deviation_pct).toFixed(0)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Müşteri Risk Profili ──────────────────────────────────────────── */}
      {customerRisks.length > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
          <SectionHeader
            title="Müşteri Risk Profili"
            sub="Orta ve yüksek riskli müşteriler — ödeme gecikmesi ve tutara göre"
          />
          <div className="space-y-2">
            {customerRisks.map((r, i) => {
              const level = r.risk_level === 'high' ? SEVERITY_CFG.high : SEVERITY_CFG.medium
              return (
                <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${level.cls}`}>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${level.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold truncate">{r.customer_name}</span>
                      <span className="text-[0.6rem] opacity-70">Ort. {r.avg_days_late.toFixed(0)} gün gecikme</span>
                    </div>
                    <p className="text-[0.6rem] mt-0.5 opacity-70">{r.message}</p>
                  </div>
                  {r.total_overdue > 0 && (
                    <span className="text-xs font-black tabular-nums shrink-0">{fmt(r.total_overdue)}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Kopya Gider Tespiti ───────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
        <SectionHeader
          title="Kopya Gider Tespiti"
          sub="Son 90 günde aynı tutar/kategori/tarihte girilmiş olası kopyalar"
          badge={
            highDups.length > 0
              ? <span className="text-[0.6rem] font-bold text-neg-text bg-neg-light px-2 py-0.5 rounded-full">{highDups.length} yüksek güven</span>
              : duplicates.length > 0
              ? <span className="text-[0.6rem] font-bold text-warn-text bg-warn-light px-2 py-0.5 rounded-full">{duplicates.length} şüpheli</span>
              : <span className="text-[0.6rem] text-pos-text bg-pos-light px-2 py-0.5 rounded-full">Temiz</span>
          }
        />

        {duplicates.length === 0 ? (
          <EmptyState icon="✓" msg="Son 90 günde kopya gider tespit edilmedi" />
        ) : (
          <div className="space-y-3">
            {duplicates.slice(0, 6).map((g, i) => {
              const isHigh = g.confidence === 'high'
              const borderCls = isHigh
                ? 'border-neg-light bg-neg-light/30'
                : 'border-warn-light bg-warn-light/30'
              const badgeCls = isHigh
                ? 'bg-neg-light text-neg-text'
                : 'bg-warn-light text-warn-text'
              return (
                <div key={i} className={`rounded-lg border px-3 py-3 ${borderCls}`}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <span className={`text-[0.6rem] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${badgeCls}`}>
                        {isHigh ? 'Yüksek Güven' : 'Orta Güven'}
                      </span>
                      <span className="ml-2 text-xs font-bold text-[#0f172a]">{catLabel(g.expense_type)}</span>
                    </div>
                    <span className="text-sm font-black tabular-nums text-[#0f172a]">{fmt(g.amount_try)}</span>
                  </div>
                  <p className="text-[0.65rem] text-[#475569] mb-2">{g.message}</p>
                  <div className="flex flex-wrap gap-2">
                    {g.rows.map((row, j) => (
                      <span key={j} className="text-[0.6rem] font-mono bg-white/80 border border-[#e2e8f0] rounded px-1.5 py-0.5 text-[#475569]">
                        {row.expense_date}{row.vendor_name ? ` · ${row.vendor_name}` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
            <div className="pt-1">
              <Link href="/dashboard/operations?tab=expenses"
                className="text-[0.65rem] font-bold text-brand-light hover:text-brand underline underline-offset-2">
                Gider listesinde incele →
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer bağlantılar ────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 divide-x divide-[#f1f5f9] bg-white border border-[#e2e8f0] rounded-xl overflow-hidden">
        {[
          { href: '/dashboard/finance?tab=risks',  title: 'Risk Analizi',    desc: 'Alacak yaşlandırma · HHI' },
          { href: '/dashboard/finance?tab=pnl',    title: 'P&L Detayı',      desc: 'Gelir tablosu · Marjlar' },
          { href: '/dashboard/commercial?tab=collections', title: 'Tahsilat', desc: 'Vadesi geçen alacaklar'  },
        ].map(item => (
          <Link key={item.href} href={item.href}
            className="px-4 py-3.5 hover:bg-[#f8fafc] transition-colors">
            <p className="text-xs font-bold text-[#0f172a] mb-0.5">{item.title}</p>
            <p className="text-[0.65rem] text-[#94a3b8]">{item.desc}</p>
          </Link>
        ))}
      </div>

    </div>
  )
}

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// CFO Cockpit — Financial Accuracy & Period Management
//
// Zones:
//   1. Financial Health Score  — composite index (margin, ratio, runway)
//   2. Accounting Accuracy     — real-time integrity checks
//   3. Balance Sheet Preview   — assets / liabilities / equity snapshot
//   4. Tax Obligations         — KDV + corporate tax timeline
//   5. Receivables Position    — aging + collection status
//   6. Period Close Checklist  — current period status
// ─────────────────────────────────────────────────────────────────────────────

import { createClient }          from '@/lib/supabase-server'
import { redirect }              from 'next/navigation'
import { resolveCompanyId }      from '@/lib/resolve-company'
import { BalanceSheetService }   from '@/lib/services/balance-sheet.service'
import { TaxService }            from '@/lib/services/tax.service'
import { FinanceService }        from '@/lib/services/finance.service'
import { PartnerService }        from '@/lib/services/partner.service'
import Link                      from 'next/link'
import { fmtTRY, fmtPct, fmtDate, fmtCompact } from '@/lib/format'
import { makeRequestContext }    from '@/lib/logger'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function sq<T>(p: Promise<T>): Promise<T | null> {
  try { return await p } catch { return null }
}

function fmt(n: number | null | undefined) {
  return fmtTRY(n ?? 0)
}

function pct(n: number | null | undefined, d = 1) {
  return fmtPct(n ?? 0, d)
}

// ── Financial Health Score ────────────────────────────────────────────────────

function computeHealthScore(metrics: {
  grossMarginPct:    number
  netMarginPct:      number
  runwayMonths:      number | null
  debtToEquity:      number
  collectionRatePct: number
}): { score: number; grade: 'A' | 'B' | 'C' | 'D' | 'F' } {
  let score = 0

  // Gross margin (benchmark: ≥30% → full score)
  if (metrics.grossMarginPct >= 30)      score += 25
  else if (metrics.grossMarginPct >= 15) score += 15
  else if (metrics.grossMarginPct >= 0)  score += 5

  // Net margin (benchmark: ≥10%)
  if (metrics.netMarginPct >= 10)      score += 20
  else if (metrics.netMarginPct >= 5)  score += 12
  else if (metrics.netMarginPct >= 0)  score += 5

  // Runway (benchmark: ≥6 months)
  const r = metrics.runwayMonths
  if (r === null || r > 18)     score += 25
  else if (r >= 6)              score += 18
  else if (r >= 3)              score += 10
  else                          score += 0

  // Debt/Equity (benchmark: ≤1)
  if (metrics.debtToEquity <= 0.5)    score += 15
  else if (metrics.debtToEquity <= 1) score += 10
  else if (metrics.debtToEquity <= 2) score += 5

  // Collection rate (benchmark: ≥85%)
  if (metrics.collectionRatePct >= 85)      score += 15
  else if (metrics.collectionRatePct >= 60) score += 8
  else if (metrics.collectionRatePct >= 0)  score += 3

  const grade: 'A' | 'B' | 'C' | 'D' | 'F' =
    score >= 85 ? 'A' :
    score >= 70 ? 'B' :
    score >= 55 ? 'C' :
    score >= 40 ? 'D' : 'F'

  return { score, grade }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CfoCockpit() {
  const supabase = createClient()
  const today    = new Date().toISOString().slice(0, 10)
  const yearStart = today.slice(0, 4) + '-01-01'

  let userId:    string | null = null
  let companyId: string | null = null

  try {
    const { data: authData } = await supabase.auth.getUser()
    if (!authData?.user) redirect('/auth')
    userId    = authData.user.id
    companyId = await resolveCompanyId(userId, supabase)
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
    redirect('/auth')
  }

  if (!companyId) {
    return <div className="p-8 text-gray-500">Şirket bulunamadı.</div>
  }

  const period = { from: yearStart, to: today }

  // Parallel data fetch
  const ctx = makeRequestContext(userId)
  const [balanceSheet, financialSummary, kdvResult, corporateTaxResult, partnerBalances, kpiData, receivableAging] =
    await Promise.all([
      sq(BalanceSheetService.compute(userId!, companyId, today, supabase)),
      sq(FinanceService.getFinancialSummary(userId!, companyId, period, undefined, ctx)),
      sq(TaxService.getKdvNet(userId!, companyId, period, ctx)),
      sq(TaxService.getCorporateTax(userId!, companyId, period, undefined, ctx)),
      sq(PartnerService.getPartnerBalances(userId!, companyId, ctx)),
      sq(fetch(`${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/api/analytics/kpi?from=${yearStart}&to=${today}`, {
        headers: { cookie: (await import('next/headers').then(m => m.cookies()))?.toString() ?? '' }
      }).then(r => r.json()).catch(() => null)),
      sq(fetch(`${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/api/analytics/receivable-aging`, {
        headers: { cookie: (await import('next/headers').then(m => m.cookies()))?.toString() ?? '' }
      }).then(r => r.json()).catch(() => null)),
    ])

  // ── Derived metrics ─────────────────────────────────────────────────────────

  const revenue = financialSummary?.revenue_try ?? 0
  const grossProfit = financialSummary?.gross_profit_try ?? 0
  const netAfterTax = financialSummary?.net_after_tax_try ?? 0
  const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0
  const netMarginPct   = revenue > 0 ? (netAfterTax / revenue) * 100 : 0

  const totalPartnerLoans = (partnerBalances ?? []).reduce((s, b) => s + Math.max(0, b.net_loan_try), 0)
  const totalEquity = balanceSheet?.equity.total_equity_try ?? 0
  const debtToEquity = totalEquity > 0 ? totalPartnerLoans / totalEquity : 0

  const totalCollected = kpiData?.total_collected ?? 0
  const totalRevenue   = kpiData?.total_revenue   ?? 0
  const collectionRate = totalRevenue > 0 ? (totalCollected / totalRevenue) * 100 : 100

  const runwayMonths = kpiData?.runway_months ?? null

  const healthScore = computeHealthScore({
    grossMarginPct,
    netMarginPct,
    runwayMonths,
    debtToEquity,
    collectionRatePct: collectionRate,
  })

  // ── Accounting checks ───────────────────────────────────────────────────────

  const bsBalanced = balanceSheet?.balanced ?? false
  const fifoOk     = (balanceSheet?.assets.inventory_try ?? 0) >= 0
  const loansOk    = totalPartnerLoans >= 0

  const checks = [
    {
      name:   'Bilanço dengesi',
      passed: bsBalanced,
      detail: bsBalanced
        ? 'Aktif = Pasif + Özkaynak ✓'
        : `Fark: ${fmt(balanceSheet?.imbalance_try ?? 0)}`,
    },
    {
      name:   'FIFO stok bütünlüğü',
      passed: fifoOk,
      detail: fifoOk ? 'Negatif stok lot yok ✓' : 'Negatif stok lot var — kontrol edin',
    },
    {
      name:   'Ortak borç mutabakatı',
      passed: loansOk,
      detail: loansOk
        ? `Net borç: ${fmt(totalPartnerLoans)} ✓`
        : 'Negatif net borç — kontrol edin',
    },
    {
      name:   'Tahsilat oranı',
      passed: collectionRate >= 60,
      detail: `${pct(collectionRate, 0)} tahsilat oranı${collectionRate >= 85 ? ' — sağlıklı ✓' : ' — takip gerekli'}`,
    },
  ]

  const checksPassedCount = checks.filter(c => c.passed).length

  // ── Grade color ─────────────────────────────────────────────────────────────
  const gradeColor = {
    A: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    B: 'text-blue-700 bg-blue-50 border-blue-200',
    C: 'text-amber-700 bg-amber-50 border-amber-200',
    D: 'text-orange-700 bg-orange-50 border-orange-200',
    F: 'text-red-700 bg-red-50 border-red-200',
  }[healthScore.grade]

  return (
    <div className="max-w-5xl space-y-4">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight">CFO Paneli</h1>
          <p className="text-sm text-gray-400 mt-0.5">Finansal doğruluk ve dönem yönetimi — {fmtDate(today)}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard/analytics"
            className="text-xs font-semibold text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Finansal Analitik →
          </Link>
          <Link
            href="/dashboard/tax"
            className="text-xs font-semibold text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Vergi Merkezi →
          </Link>
        </div>
      </div>

      {/* Row 1: Health Score + Accuracy Checks */}
      <div className="grid grid-cols-3 gap-3">

        {/* Financial Health Score */}
        <div className={`border rounded-xl p-4 flex flex-col items-center justify-center text-center ${gradeColor}`}>
          <div className="text-[10px] font-black uppercase tracking-widest mb-2 opacity-60">
            Finansal Sağlık
          </div>
          <div className="text-6xl font-black">{healthScore.grade}</div>
          <div className="text-2xl font-bold mt-1">{healthScore.score}/100</div>
          <div className="text-[11px] mt-2 opacity-70">
            {healthScore.grade === 'A' ? 'Mükemmel' :
             healthScore.grade === 'B' ? 'İyi' :
             healthScore.grade === 'C' ? 'Orta' :
             healthScore.grade === 'D' ? 'Dikkat gerekli' : 'Kritik'}
          </div>
        </div>

        {/* Component scores */}
        <div className="border border-gray-200 rounded-xl p-4 bg-white col-span-2">
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">
            Bileşen Skorları
          </div>
          <div className="space-y-2">
            {[
              { label: 'Brüt Marj', value: pct(grossMarginPct), ok: grossMarginPct >= 15 },
              { label: 'Net Marj', value: pct(netMarginPct), ok: netMarginPct >= 5 },
              { label: 'Nakit Pisti', value: runwayMonths ? `${Math.round(runwayMonths)} ay` : '∞', ok: (runwayMonths ?? 99) >= 6 },
              { label: 'Borç/Özkaynak', value: debtToEquity.toFixed(2) + 'x', ok: debtToEquity <= 1 },
              { label: 'Tahsilat Oranı', value: pct(collectionRate, 0), ok: collectionRate >= 60 },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{row.label}</span>
                <span className={`font-bold ${row.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                  {row.ok ? '✓' : '!'} {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Accounting Accuracy Checks */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">
            Muhasebe Doğruluk Kontrolleri
          </div>
          <span className={`text-xs font-bold px-2 py-1 rounded-full ${
            checksPassedCount === checks.length
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-amber-50 text-amber-700'
          }`}>
            {checksPassedCount}/{checks.length} geçti
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {checks.map(c => (
            <div key={c.name} className={`rounded-lg px-3 py-2.5 border text-sm ${
              c.passed
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-red-50 border-red-200'
            }`}>
              <div className={`font-semibold ${c.passed ? 'text-emerald-700' : 'text-red-700'}`}>
                {c.passed ? '✓' : '✗'} {c.name}
              </div>
              <div className={`text-[11px] mt-0.5 ${c.passed ? 'text-emerald-600' : 'text-red-600'}`}>
                {c.detail}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Row 3: Balance Sheet preview */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">
            Bilanço Özeti — {fmtDate(today)}
          </div>
          <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
            bsBalanced ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
          }`}>
            {bsBalanced ? 'DENGELENMIŞ' : 'FARK VAR'}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {/* Assets */}
          <div>
            <div className="text-xs font-bold text-gray-500 mb-2">AKTİFLER</div>
            <div className="space-y-1.5 text-sm">
              <BalanceLine label="Nakit"      value={balanceSheet?.assets.cash_try ?? 0} />
              <BalanceLine label="Alacaklar"  value={balanceSheet?.assets.receivables_try ?? 0} />
              <BalanceLine label="Stok"       value={balanceSheet?.assets.inventory_try ?? 0} />
              <div className="pt-1.5 border-t border-gray-100">
                <BalanceLine label="TOPLAM AKTİF" value={balanceSheet?.assets.total_assets_try ?? 0} bold />
              </div>
            </div>
          </div>
          {/* Liabilities */}
          <div>
            <div className="text-xs font-bold text-gray-500 mb-2">PASİFLER</div>
            <div className="space-y-1.5 text-sm">
              <BalanceLine label="Ortak Borçları"  value={balanceSheet?.liabilities.partner_loans_try ?? 0} negative />
              <BalanceLine label="Vergi Borcu"     value={balanceSheet?.liabilities.tax_payable_try ?? 0} negative />
              <div className="pt-1.5 border-t border-gray-100">
                <BalanceLine label="TOPLAM PASİF" value={balanceSheet?.liabilities.total_liabilities_try ?? 0} bold negative />
              </div>
            </div>
          </div>
          {/* Equity */}
          <div>
            <div className="text-xs font-bold text-gray-500 mb-2">ÖZKAYNAK</div>
            <div className="space-y-1.5 text-sm">
              <BalanceLine label="Ortak Sermayesi"  value={balanceSheet?.equity.total_partner_capital_try ?? 0} />
              <BalanceLine label="Geçmiş Yıl Karı"  value={balanceSheet?.equity.retained_earnings_try ?? 0} />
              <BalanceLine label="Dönem Kar/Zararı" value={balanceSheet?.equity.current_period_profit_try ?? 0} />
              <div className="pt-1.5 border-t border-gray-100">
                <BalanceLine label="TOPLAM ÖZKAYNAK" value={balanceSheet?.equity.total_equity_try ?? 0} bold />
              </div>
            </div>
          </div>
        </div>
        {!bsBalanced && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
            <strong>Fark:</strong> {fmt(balanceSheet?.imbalance_try ?? 0)} — Nakit pozisyonu yaklaşık hesaplanmaktadır.
            Gerçek banka mutabakatı yapıldığında fark kapanacaktır.
          </div>
        )}
      </div>

      {/* Row 4: Tax Obligations + Receivable Aging */}
      <div className="grid grid-cols-2 gap-3">

        {/* Tax */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">
            Vergi Yükümlülükleri ({today.slice(0, 4)})
          </div>
          <div className="space-y-2.5">
            <TaxRow
              label="KDV (Net)"
              amount={kdvResult?.net_vat_try ?? 0}
              sign={kdvResult?.net_vat_try ?? 0}
              detail={(kdvResult?.net_vat_try ?? 0) > 0 ? 'Ödenecek' : 'İade edilecek'}
            />
            <TaxRow
              label="Kurumlar Vergisi"
              amount={corporateTaxResult?.tax_try ?? 0}
              sign={corporateTaxResult?.tax_try ?? 0}
              detail="Tahmini yıllık vergi"
            />
            <div className="pt-2 border-t border-gray-100">
              <TaxRow
                label="Toplam Vergi Yükü"
                amount={(kdvResult?.net_vat_try ?? 0) + (corporateTaxResult?.tax_try ?? 0)}
                sign={1}
                detail="KDV + KV toplamı"
                bold
              />
            </div>
          </div>
          <Link
            href="/dashboard/tax"
            className="mt-3 block text-center text-xs font-semibold text-primary-600 hover:text-primary-700"
          >
            Vergi detayı →
          </Link>
        </div>

        {/* Receivable aging */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">
            Alacak Yaşlandırma
          </div>
          <div className="space-y-2">
            {[
              { label: '0–30 gün (Cari)',     bucket: 'current',    color: 'text-emerald-700' },
              { label: '31–60 gün',           bucket: 'aged_30_60', color: 'text-amber-700'   },
              { label: '60+ gün (Gecikmiş)',  bucket: 'aged_60_plus', color: 'text-red-700'   },
            ].map(row => {
              const b = receivableAging?.[row.bucket]
              return (
                <div key={row.bucket} className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">{row.label}</span>
                  <div className="text-right">
                    <div className={`font-bold ${row.color}`}>{fmt(b?.total_try ?? 0)}</div>
                    <div className="text-[10px] text-gray-400">{b?.count ?? 0} adet</div>
                  </div>
                </div>
              )
            })}
            <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-sm font-bold">
              <span className="text-gray-700">Toplam Alacak</span>
              <span className="text-gray-900">{fmt(receivableAging?.total?.total_try ?? 0)}</span>
            </div>
          </div>
          <Link
            href="/dashboard/collections"
            className="mt-3 block text-center text-xs font-semibold text-primary-600 hover:text-primary-700"
          >
            Tahsilatlar →
          </Link>
        </div>
      </div>

      {/* Row 5: P&L Summary */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">
          Gelir Tablosu Özeti — {today.slice(0, 4)} YTD
        </div>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Satış Geliri',  value: revenue,                         color: 'text-gray-900' },
            { label: 'SMST',          value: -(financialSummary?.cost_try ?? 0), color: 'text-red-700' },
            { label: 'Brüt Kâr',     value: grossProfit,                     color: grossProfit >= 0 ? 'text-emerald-700' : 'text-red-700' },
            { label: 'Net Kâr (VD)', value: netAfterTax,                     color: netAfterTax >= 0 ? 'text-emerald-700' : 'text-red-700' },
          ].map(k => (
            <div key={k.label} className="text-center">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{k.label}</div>
              <div className={`text-lg font-black tabular-nums ${k.color}`}>
                {fmtCompact(Math.abs(k.value))}
              </div>
              {k.label !== 'Satış Geliri' && (
                <div className="text-[10px] text-gray-400">{fmt(Math.abs(k.value))}</div>
              )}
            </div>
          ))}
        </div>
        <Link
          href="/dashboard/analytics"
          className="mt-3 block text-center text-xs font-semibold text-primary-600 hover:text-primary-700"
        >
          Detaylı P&L raporu →
        </Link>
      </div>

      {/* ── GL Accounting Tools ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        {[
          {
            href:    '/dashboard/cfo/trial-balance',
            title:   'Mizan',
            desc:    'Tüm hesap kodları ve bakiyeler',
            icon:    '📒',
            color:   'hover:border-primary-300',
          },
          {
            href:    '/dashboard/cfo/period-close',
            title:   'Dönem Kapanışı',
            desc:    'Dönemleri kapat ve kilitle',
            icon:    '🔒',
            color:   'hover:border-amber-300',
          },
          {
            href:    '/dashboard/cfo/journal-entries',
            title:   'Journal Kayıtları',
            desc:    'Çift taraflı muhasebe denetim izi',
            icon:    '📋',
            color:   'hover:border-emerald-300',
          },
        ].map(item => (
          <Link
            key={item.href + item.title}
            href={item.href}
            className={`bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-start gap-3 transition-colors ${item.color}`}
          >
            <span className="text-xl mt-0.5">{item.icon}</span>
            <div>
              <div className="text-xs font-bold text-gray-900">{item.title}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">{item.desc}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* ── Finansal Raporlar ────────────────────────────────────────────────── */}
      <div>
        <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Finansal Raporlar</div>
        <div className="grid grid-cols-3 gap-2">
          {[
            {
              href:  '/dashboard/reports/income-statement',
              title: 'Gelir Tablosu',
              desc:  'P&L — Brüt kâr, EBITDA, net kâr',
              icon:  '📈',
              color: 'hover:border-emerald-300',
            },
            {
              href:  '/dashboard/reports/balance-sheet',
              title: 'Bilanço',
              desc:  'Varlıklar = Kaynaklar + Özkaynak',
              icon:  '⚖️',
              color: 'hover:border-blue-300',
            },
            {
              href:  '/dashboard/reports/cash-flow',
              title: 'Nakit Akışı',
              desc:  'Faaliyet / Yatırım / Finansman',
              icon:  '💧',
              color: 'hover:border-cyan-300',
            },
            {
              href:  '/dashboard/reports/executive-summary',
              title: 'Yönetici Özeti',
              desc:  '1 sayfa CEO raporu — PDF hazır',
              icon:  '📄',
              color: 'hover:border-violet-300',
            },
            {
              href:  '/dashboard/cfo/tax/kdv',
              title: 'KDV Özeti',
              desc:  'Hesaplanan − İndirilecek = Net KDV',
              icon:  '🧾',
              color: 'hover:border-orange-300',
            },
          ].map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-start gap-3 transition-colors ${item.color}`}
            >
              <span className="text-xl mt-0.5">{item.icon}</span>
              <div>
                <div className="text-xs font-bold text-gray-900">{item.title}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{item.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>

    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BalanceLine({ label, value, bold, negative }: {
  label: string; value: number; bold?: boolean; negative?: boolean
}) {
  return (
    <div className={`flex items-center justify-between ${bold ? 'font-bold text-gray-900' : 'text-gray-600'}`}>
      <span className={bold ? 'text-xs' : 'text-xs'}>{label}</span>
      <span className={`tabular-nums ${negative && value > 0 ? 'text-red-700' : value < 0 ? 'text-red-700' : ''}`}>
        {fmtTRY(value)}
      </span>
    </div>
  )
}

function TaxRow({ label, amount, sign, detail, bold }: {
  label: string; amount: number; sign: number; detail: string; bold?: boolean
}) {
  return (
    <div className={`flex items-start justify-between ${bold ? 'font-bold' : ''}`}>
      <div>
        <div className={`text-sm ${bold ? 'text-gray-900' : 'text-gray-700'}`}>{label}</div>
        <div className="text-[11px] text-gray-400">{detail}</div>
      </div>
      <div className={`text-sm font-bold tabular-nums ${sign > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
        {fmtTRY(amount)}
      </div>
    </div>
  )
}

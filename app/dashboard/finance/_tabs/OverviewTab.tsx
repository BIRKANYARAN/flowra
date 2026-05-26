// ── OverviewTab — CEO Likidite Kokpiti ───────────────────────────────────────
//
// Zones:
//   1. Liquidity Cockpit (4 KPIs)
//   2. Tahsilat Sağlığı + Risk Matrisi (5/5 col grid)
//   3. Finansal Özet (5 KPIs)
//   4. 12 Ay Nakit Projeksiyonu (bar chart)

import Link from 'next/link'
import { getCfoMetrics, getRunwayForecast } from '@/lib/finance/financial-core'
import type { CfoMetrics }             from '@/lib/finance/cfo-metrics'
import type { RunwayForecastResponse } from '@/lib/finance/financial-core'
import { fmtTRY as fmt }               from '@/lib/format'
import { FinanceService }              from '@/lib/services/finance.service'
import { periodForMonth }              from '@/lib/services/finance-rules'
import { createClient }                from '@/lib/supabase-server'
import { PeriodService }               from '@/lib/services/period.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

function runwayColor(months: number | null): string {
  if (months === null) return 'text-[#94a3b8]'
  if (months <= 2)     return 'text-neg'
  if (months <= 6)     return 'text-warn'
  if (months <= 12)    return 'text-warn-text'
  return 'text-pos-text'
}
function sq<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  return fn().catch(() => fallback)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiBlock({ label, value, sub, tone = 'neutral', href }: {
  label: string; value: string; sub?: string
  tone?: 'positive' | 'negative' | 'warning' | 'critical' | 'neutral'
  href?: string
}) {
  const valueColor = {
    positive: 'text-pos-text', negative: 'text-neg',
    warning: 'text-warn-text', critical: 'text-neg-text', neutral: 'text-[#0f172a]',
  }[tone]
  const content = (
    <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm hover:shadow-[0_2px_4px_rgba(17,24,39,0.07)] transition-shadow">
      <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{label}</div>
      <div className={`text-xl font-black tabular-nums leading-none ${valueColor}`}>{value}</div>
      {sub && <div className="text-[10px] text-[#94a3b8] mt-1 leading-tight">{sub}</div>}
    </div>
  )
  return href ? <Link href={href}>{content}</Link> : content
}

function RiskPill({ label, value, level }: { label: string; value: string; level: 'ok' | 'warn' | 'critical' }) {
  const colors = {
    ok:       'bg-pos-light border-pos-light text-pos-text',
    warn:     'bg-warn-light border-warn-light text-warn-text',
    critical: 'bg-neg-light border-neg-light text-neg-text',
  }[level]
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded border ${colors}`}>
      <span className="text-xs font-semibold">{label}</span>
      <span className="text-xs font-black tabular-nums">{value}</span>
    </div>
  )
}

// ── GL Mode badge ─────────────────────────────────────────────────────────────

function GlModeBadge({ mode }: { mode: string }) {
  const cfg: Record<string, { label: string; colors: string }> = {
    shadow:     { label: 'Shadow',     colors: 'bg-[#f1f5f9] border-[#e2e8f0] text-[#64748b]' },
    parallel:   { label: 'Paralel',    colors: 'bg-blue-50 border-blue-200 text-blue-700' },
    gl_primary: { label: 'GL Birincil', colors: 'bg-pos-light border-pos-light text-pos-text' },
  }
  const { label, colors } = cfg[mode] ?? cfg['shadow']
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wide ${colors}`}>
      <span className="w-1 h-1 rounded-full bg-current opacity-60" />
      GL: {label}
    </span>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { userId: string; companyId: string; glMode?: string }

export async function OverviewTab({ userId, companyId, glMode = 'shadow' }: Props) {
  const supabase = createClient()
  const now   = new Date()
  const today = now.toISOString().slice(0, 10)
  const year  = now.getFullYear()
  const mon   = String(now.getMonth() + 1).padStart(2, '0')
  const from  = `${year}-${mon}-01`
  const ytdFrom = `${year}-01-01`

  const ZERO_METRICS: CfoMetrics = {
    cash:        { true_cash_position: 0, operational_cash: 0, restricted_cash: 0, distributable_cash: 0 },
    burn:        { monthly_burn_rate: 0, runway_months: null, runway_days: null, cash_exhaustion_date: null },
    receivables: { total_outstanding: 0, overdue_30d: 0, overdue_60d: 0, overdue_90d: 0, collection_rate_pct: 100 },
    tax:         { kdv_net: 0, corporate_tax_estimate: 0, total_fiscal_obligation: 0 },
    partner:     { total_equity: 0, total_loans: 0, total_dividends: 0, company_owes: 0 },
    stock:       { fifo_value: 0, coverage_months: null },
  }
  const ZERO_RUNWAY: RunwayForecastResponse = {
    months: [], exhaustion_month: null, exhaustion_date: null, safe_months: 0,
    inputs: { starting_cash: 0, monthly_burn: 0, outstanding_total: 0, horizon_months: 12 },
  }

  // Previous month range — for C6 operational memory layer
  const prevEnd   = new Date(year, now.getMonth(), 0)  // last day of previous month
  const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1)
  const prevFrom  = prevStart.toISOString().slice(0, 10)
  const prevTo    = prevEnd.toISOString().slice(0, 10)

  // Parallel: current + previous month metrics + YTD financial summary + period
  // Sequential: runway forecast must wait for current metrics (needs taxObligation)
  const currentYM = `${year}-${mon}`
  const [metrics, prevMetrics, ytdSummary, currentPeriod] = await Promise.all([
    sq(() => getCfoMetrics(companyId, { from, to: today }),        ZERO_METRICS),
    sq(() => getCfoMetrics(companyId, { from: prevFrom, to: prevTo }), ZERO_METRICS),
    sq(() => FinanceService.getFinancialSummary(userId, companyId, periodForMonth(currentYM)), null),
    sq(() => PeriodService.getCurrent(companyId, supabase), null),
  ])
  const runway = await sq(
    () => getRunwayForecast(companyId, {
      from, to: today, months: 12,
      taxObligation: metrics.tax.total_fiscal_obligation,
    }),
    ZERO_RUNWAY,
  )

  const m = metrics
  const r = runway
  const runwayMonths = m.burn.runway_months
  const runwayTone   = runwayMonths === null ? 'neutral'
    : runwayMonths <= 2  ? 'critical'
    : runwayMonths <= 6  ? 'warning'
    : 'positive'
  const collectionRisk = m.receivables.overdue_60d > 5000 ? 'critical'
    : m.receivables.overdue_30d > 2000 ? 'warn' : 'ok'
  const taxRisk     = m.tax.total_fiscal_obligation > 10000 ? 'warn' : 'ok'
  const partnerRisk = m.partner.total_equity === 0
    ? (m.partner.total_loans > 0 ? 'critical' : 'ok')
    : m.partner.total_loans > m.partner.total_equity * 0.5 ? 'warn' : 'ok'
  const stockRisk   = m.stock.coverage_months !== null && m.stock.coverage_months < 2 ? 'warn' : 'ok'

  const chartMonths = r.months.slice(0, 12)
  const maxCash     = Math.max(1, ...chartMonths.map(mo => Math.max(0, mo.end_cash)))

  // ── C6: Operational Memory Layer — month-over-month narrative ─────────────
  const prevM      = prevMetrics
  const memoryLines: string[] = []

  const cashDelta = m.cash.true_cash_position - prevM.cash.true_cash_position
  if (Math.abs(cashDelta) >= 500) {
    memoryLines.push(cashDelta > 0
      ? `Nakit pozisyonu geçen aya kıyasla ${fmt(cashDelta)} arttı.`
      : `Nakit pozisyonu geçen aya kıyasla ${fmt(Math.abs(cashDelta))} eridi — runway baskısı izlenmeli.`
    )
  }

  const prevBurn  = prevM.burn.monthly_burn_rate
  const burnDelta = m.burn.monthly_burn_rate - prevBurn
  if (prevBurn > 0 && m.burn.monthly_burn_rate > 0 && Math.abs(burnDelta) >= 500) {
    const burnPct = Math.round(Math.abs(burnDelta / prevBurn) * 100)
    if (burnPct >= 5) {
      memoryLines.push(burnDelta > 0
        ? `Aylık burn ${burnPct}% arttı (${fmt(prevBurn)} → ${fmt(m.burn.monthly_burn_rate)}) — gider artışı nakit ömrünü kısaltıyor.`
        : `Aylık burn ${burnPct}% düştü (${fmt(prevBurn)} → ${fmt(m.burn.monthly_burn_rate)}) — gider disiplini nakit ömrünü uzatıyor.`
      )
    }
  }

  const overdue      = m.receivables.overdue_30d    + m.receivables.overdue_60d    + m.receivables.overdue_90d
  const prevOverdue  = prevM.receivables.overdue_30d + prevM.receivables.overdue_60d + prevM.receivables.overdue_90d
  const overdueDelta = overdue - prevOverdue
  if (overdueDelta >= 500) {
    memoryLines.push(`Vadesi geçmiş alacaklar ${fmt(overdueDelta)} büyüdü — tahsilat baskısı artıyor.`)
  } else if (overdueDelta <= -500) {
    memoryLines.push(`Vadesi geçmiş alacaklar ${fmt(Math.abs(overdueDelta))} azaldı — tahsilat süreçleri işliyor.`)
  }

  if (memoryLines.length === 0) {
    memoryLines.push('Nakit, burn ve alacak yapısı geçen ay seviyesinde — operasyonel istikrar korunuyor.')
  }

  // ── Derived P&L values ─────────────────────────────────────────────────────
  const ytdRevenue    = Number(ytdSummary?.revenue_try       ?? 0)
  const ytdGrossProfit = Number(ytdSummary?.gross_profit_try  ?? 0)
  const ytdNetIncome  = Number(ytdSummary?.net_after_tax_try  ?? 0)

  // Period display
  const periodLabel = currentPeriod
    ? `${new Date(currentPeriod.period_start + 'T00:00:00Z').toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' })} – ${new Date(currentPeriod.period_end + 'T00:00:00Z').toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' })}`
    : `${year} ${new Date(now.setDate(1)).toLocaleDateString('tr-TR', { month: 'long' })}`
  const periodStatus = currentPeriod?.status ?? null

  return (
    <div className="space-y-4">

      {/* ── GL Mode + Period header strip ─────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          <GlModeBadge mode={glMode} />
          {glMode === 'shadow' && (
            <span className="text-[10px] text-[#94a3b8]">Muhasebe kaydı oluşturulmuyor — GL modu shadow</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {periodStatus && (
            <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${
              periodStatus === 'locked' ? 'bg-neg-light border-neg-light text-neg-text' :
              periodStatus === 'closed' ? 'bg-[#f1f5f9] border-[#e2e8f0] text-[#64748b]' :
              'bg-pos-light border-pos-light text-pos-text'
            }`}>
              {periodStatus === 'open' ? 'Açık' : periodStatus === 'closed' ? 'Kapalı' : 'Kilitli'}
            </span>
          )}
          <Link href="/dashboard/cfo?tab=period"
            className="text-[10px] text-brand-light font-semibold hover:text-brand">
            {periodLabel} →
          </Link>
        </div>
      </div>

      {/* ── P&L KPI cards (Revenue YTD, Gross Profit, Net Income, Cash) ──────── */}
      <div>
        <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">Dönem P&L Özeti</div>
        <div className="grid grid-cols-4 gap-2">
          <KpiBlock label="Ciro (YTD)" value={fmt(ytdRevenue)}
            sub={`${year} yılı kümülatif`}
            tone={ytdRevenue > 0 ? 'positive' : 'neutral'} />
          <KpiBlock label="Brüt Kâr" value={fmt(ytdGrossProfit)}
            sub={ytdRevenue > 0 ? `Marj: %${((ytdGrossProfit / ytdRevenue) * 100).toFixed(1)}` : undefined}
            tone={ytdGrossProfit >= 0 ? 'positive' : 'negative'} />
          <KpiBlock label="Net Gelir" value={fmt(ytdNetIncome)}
            sub={ytdNetIncome >= 0 ? 'Kârlı dönem' : 'Zararlı dönem'}
            tone={ytdNetIncome >= 0 ? 'positive' : 'negative'} />
          <KpiBlock label="Nakit Pozisyonu" value={fmt(m.cash.true_cash_position)}
            sub="Tahsilat − ödenen giderler"
            tone={m.cash.true_cash_position > 0 ? 'positive' : 'critical'}
            href="/dashboard/finance?tab=cashflow" />
        </div>
      </div>

      {runwayTone === 'critical' && (
        <div className="bg-neg-light border border-neg rounded px-4 py-3 text-xs text-neg-text font-semibold flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-neg shrink-0 animate-pulse" />
          Kritik: Runway {runwayMonths?.toFixed(1)} ay — acil aksiyon gerekiyor.
        </div>
      )}

      {/* High overdue receivables alert — fires when 60d+ overdue exceeds 20% of total outstanding */}
      {m.receivables.total_outstanding > 0 &&
       m.receivables.overdue_60d + m.receivables.overdue_90d > m.receivables.total_outstanding * 0.2 && (
        <div className="bg-warn-light border border-warn/30 rounded px-4 py-3 flex items-start gap-3">
          <span className="w-1.5 h-1.5 rounded-full bg-warn shrink-0 mt-1.5" />
          <div className="flex-1">
            <div className="text-[11px] font-black uppercase tracking-wide text-warn-text">
              Alacak Yaşlanması Yüksek
            </div>
            <div className="text-xs text-warn-text mt-0.5">
              60+ gün vadesi geçmiş: <strong>{fmt(m.receivables.overdue_60d + m.receivables.overdue_90d)}</strong>{' '}
              (toplam alacağın %{Math.round(((m.receivables.overdue_60d + m.receivables.overdue_90d) / m.receivables.total_outstanding) * 100)}&apos;i).
              Tahsilat baskısı nakit pozisyonunu olumsuz etkiliyor.
            </div>
          </div>
          <Link href="/dashboard/commercial?tab=collections"
            className="text-[10px] font-bold text-warn-text hover:text-warn-text underline underline-offset-2 shrink-0 mt-0.5 whitespace-nowrap">
            Tahsilat →
          </Link>
        </div>
      )}

      {/* Zone 1 — Likidite Kontrol Merkezi */}
      <div>
        <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">Likidite Kontrol Merkezi</div>
        <div className="grid grid-cols-4 gap-2">
          <KpiBlock label="Nakit Pozisyonu" value={fmt(m.cash.true_cash_position)}
            sub="Tahsilat − ödenen giderler"
            tone={m.cash.true_cash_position > 0 ? 'positive' : 'critical'} />
          <KpiBlock label="Dağıtılabilir Nakit"
            value={m.cash.distributable_cash > 0 ? fmt(m.cash.distributable_cash) : '—'}
            sub={m.cash.restricted_cash > 0 ? `${fmt(m.cash.restricted_cash)} taahhüt var` : 'Yükümlülük yok'}
            tone={m.cash.distributable_cash > 0 ? 'positive' : 'negative'}
            href="/dashboard/partners" />
          <KpiBlock label="Aylık Burn"
            value={m.burn.monthly_burn_rate > 0 ? fmt(m.burn.monthly_burn_rate) : '—'}
            sub="3 aylık ortalama" tone="neutral" href="/dashboard/operations?tab=expenses" />
          <div className={`rounded px-4 py-3 border-2 ${
            runwayTone === 'critical' ? 'bg-neg-light border-neg' :
            runwayTone === 'warning'  ? 'bg-warn-light border-warn' :
            runwayTone === 'positive' ? 'bg-pos-light border-pos-light' :
            'bg-[#f8fafc] border-[#e2e8f0]'
          }`}>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Runway</div>
            <div className={`text-xl font-black tabular-nums leading-none ${runwayColor(runwayMonths)}`}>
              {runwayMonths !== null ? `${runwayMonths.toFixed(1)} ay` : '∞'}
            </div>
            {m.burn.cash_exhaustion_date && (
              <div className="text-[10px] text-[#64748b] mt-1">
                {new Date(m.burn.cash_exhaustion_date + 'T00:00:00Z').toLocaleDateString('tr-TR', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Zone 2 — Tahsilat + Risk */}
      <div className="grid grid-cols-5 gap-2">
        <div className="col-span-3">
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">Tahsilat Sağlığı</div>
          <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 space-y-2 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#64748b]">Toplam Açık Alacak</span>
              <span className="text-sm font-black tabular-nums text-[#0f172a]">{fmt(m.receivables.total_outstanding)}</span>
            </div>
            {[
              { label: '+30 gün (Risk)',        value: m.receivables.overdue_30d, color: 'bg-warn' },
              { label: '+60 gün (Yüksek Risk)', value: m.receivables.overdue_60d, color: 'bg-warn' },
              { label: '+90 gün (Kritik)',      value: m.receivables.overdue_90d, color: 'bg-neg'   },
            ].map(({ label, value, color }) => {
              const pct = m.receivables.total_outstanding > 0
                ? Math.min(100, (value / m.receivables.total_outstanding) * 100) : 0
              return (
                <div key={label}>
                  <div className="flex items-center justify-between text-[10px] text-[#64748b] mb-0.5">
                    <span>{label}</span><span className="font-semibold tabular-nums">{fmt(value)}</span>
                  </div>
                  <div className="h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
                    <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
            <div className="flex items-center justify-between pt-1 border-t border-[#e2e8f0]">
              <span className="text-[10px] text-[#64748b] font-semibold">Tahsilat Oranı</span>
              <span className={`text-xs font-black tabular-nums ${
                m.receivables.collection_rate_pct >= 80 ? 'text-pos-text' :
                m.receivables.collection_rate_pct >= 50 ? 'text-warn-text' : 'text-neg'
              }`}>%{m.receivables.collection_rate_pct.toFixed(1)}</span>
            </div>
          </div>
        </div>
        <div className="col-span-2">
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">Risk Matrisi</div>
          <div className="space-y-1.5">
            <RiskPill label="Runway"
              value={runwayMonths !== null ? `${runwayMonths.toFixed(1)} ay` : '∞'}
              level={runwayTone === 'critical' ? 'critical' : runwayTone === 'warning' ? 'warn' : 'ok'} />
            <RiskPill label="Vadesi Geçmiş" value={fmt(m.receivables.overdue_30d)} level={collectionRisk} />
            <RiskPill label="Vergi Yükümlülüğü" value={fmt(m.tax.total_fiscal_obligation)} level={taxRisk} />
            <RiskPill label="Ortak Borç/Özsermaye"
              value={m.partner.total_equity > 0
                ? `%${Math.round((m.partner.total_loans / m.partner.total_equity) * 100)}` : '—'}
              level={partnerRisk} />
            <RiskPill label="Stok Karşılama"
              value={m.stock.coverage_months !== null ? `${m.stock.coverage_months.toFixed(1)} ay` : '—'}
              level={stockRisk} />
          </div>
        </div>
      </div>

      {/* C6: Operasyonel Bellek — geçen ay kıyaslaması */}
      <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Operasyonel Bellek</span>
          <span className="text-[9px] text-[#94a3b8]">Geçen ay kıyaslaması · Nakit · Burn · Alacaklar</span>
        </div>
        <div className="space-y-0.5">
          {memoryLines.map((line, i) => (
            <div key={i} className="text-[11px] text-[#64748b] leading-snug">
              <span className="text-[#cbd5e1] mr-1.5">—</span>{line}
            </div>
          ))}
        </div>
      </div>

      {/* Zone 3 — Finansal Özet */}
      <div>
        <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">Finansal Özet</div>
        <div className="grid grid-cols-5 gap-2">
          <KpiBlock label="Özsermaye" value={fmt(m.partner.total_equity)}
            sub="Toplam capital_in" href="/dashboard/partners" />
          <KpiBlock label="Ortak Kredileri" value={fmt(m.partner.total_loans)}
            sub="Net borç (ödenmemiş)" href="/dashboard/partners" />
          <KpiBlock label="Stok Değeri (FIFO)" value={fmt(m.stock.fifo_value)}
            sub={m.stock.coverage_months ? `${m.stock.coverage_months.toFixed(1)} ay karşılık` : undefined}
            href="/dashboard/operations?tab=stock" />
          <KpiBlock label="KDV Net"
            value={fmt(Math.abs(m.tax.kdv_net))}
            sub={m.tax.kdv_net > 0 ? 'Ödenecek' : 'Devredilecek'}
            tone={m.tax.kdv_net > 0 ? 'warning' : 'neutral'}
            href="/dashboard/finance?tab=tax" />
          <KpiBlock label="KV Tahmini"
            value={fmt(m.tax.corporate_tax_estimate)}
            sub="YTD kâr × %25"
            tone={m.tax.corporate_tax_estimate > 0 ? 'warning' : 'neutral'}
            href="/dashboard/finance?tab=quarterly" />
        </div>
      </div>

      {/* Zone 4 — Runway Chart */}
      {chartMonths.length > 0 && (
        <div>
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">12 Aylık Nakit Projeksiyonu</div>
          <div className="bg-white border border-[#e2e8f0] rounded px-4 py-4 shadow-sm">
            <div className="flex items-end gap-1.5 h-24">
              {chartMonths.map((mo) => {
                const barH    = maxCash > 0 ? Math.max(2, Math.round((Math.max(0, mo.end_cash) / maxCash) * 100)) : 0
                const isNeg   = mo.end_cash <= 0
                const isLow   = !isNeg && mo.end_cash < maxCash * 0.2
                const barColor = isNeg ? 'bg-neg' : isLow ? 'bg-warn' : 'bg-pos'
                return (
                  <div key={mo.month} className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
                    <div className="w-full flex items-end justify-center" style={{ height: '88px' }}>
                      <div className={`w-full rounded-sm ${barColor} opacity-90`}
                        style={{ height: `${isNeg ? 4 : barH}%` }}
                        title={`${mo.month_label}: ${fmt(mo.end_cash)}`} />
                    </div>
                    <span className="text-[8px] text-[#94a3b8] font-medium truncate w-full text-center leading-none">
                      {mo.month_label.split(' ')[0]}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center justify-between mt-2 text-[10px] text-[#94a3b8]">
              <span>Başlangıç: {fmt(r.inputs.starting_cash)}</span>
              {r.exhaustion_month !== null ? (
                <span className="text-neg font-semibold">⚠ Ay {r.exhaustion_month}&apos;de nakit tükenebilir</span>
              ) : (
                <span className="text-pos-text font-semibold">12 ay boyunca nakit sağlıklı</span>
              )}
              <span>Burn: {fmt(r.inputs.monthly_burn)}/ay</span>
            </div>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 pt-1">
        <Link href="/dashboard/commercial?tab=collections"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-brand-light text-white text-xs font-semibold hover:bg-brand transition-colors">
          Tahsilat Yönet
        </Link>
        <Link href="/dashboard/operations?tab=expenses"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-[#f1f5f9] text-[#334155] text-xs font-semibold hover:bg-[#e2e8f0] transition-colors">
          Giderleri Gözden Geçir
        </Link>
        <Link href="/dashboard/partners"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-[#f1f5f9] text-[#334155] text-xs font-semibold hover:bg-[#e2e8f0] transition-colors">
          Ortak Dengesi
        </Link>
        <Link href="/dashboard/planning?tab=unit-profit"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-[#f1f5f9] text-[#334155] text-xs font-semibold hover:bg-[#e2e8f0] transition-colors">
          Senaryo Simülasyonu
        </Link>
      </div>
    </div>
  )
}

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// CEO Dashboard — Executive Financial Command Center
//
// Zones:
//   1. Liquidity Cockpit     — runway, burn, cash position, distributable
//   2. Revenue Health        — collected vs invoiced, overdue aging, collection rate
//   3. Risk Matrix           — tax, partner imbalance, stock exposure
//   4. Runway Forecast       — 12-month monthly cash projection bar chart
// ─────────────────────────────────────────────────────────────────────────────

import { createClient }     from '@/lib/supabase-server'
import { redirect }         from 'next/navigation'
import { resolveCompanyId } from '@/lib/resolve-company'
import { cookies, headers } from 'next/headers'
import Link                 from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CfoMetrics {
  cash: {
    true_cash_position:   number
    operational_cash:     number
    restricted_cash:      number
    distributable_cash:   number
  }
  burn: {
    monthly_burn_rate:    number
    runway_months:        number | null
    runway_days:          number | null
    cash_exhaustion_date: string | null
  }
  receivables: {
    total_outstanding:    number
    overdue_30d:          number
    overdue_60d:          number
    overdue_90d:          number
    collection_rate_pct:  number
  }
  tax: {
    kdv_net:                  number
    corporate_tax_estimate:   number
    total_fiscal_obligation:  number
  }
  partner: {
    total_equity:   number
    total_loans:    number
    total_dividends: number
    company_owes:   number
  }
  stock: {
    fifo_value:      number
    coverage_months: number | null
  }
}

interface RunwayMonth {
  month:        number
  month_label:  string
  cash_in:      number
  cash_out:     number
  end_cash:     number
  is_exhausted: boolean
}

interface RunwayForecast {
  months:           RunwayMonth[]
  exhaustion_month: number | null
  exhaustion_date:  string | null
  safe_months:      number
  inputs: {
    starting_cash:     number
    monthly_burn:      number
    outstanding_total: number
    horizon_months:    number
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TRY_FMT = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

function fmt(n: number): string {
  const abs = Math.abs(Number(n || 0))
  const sign = n < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${sign}₺${(abs / 1_000_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}M`
  if (abs >= 10_000)    return `${sign}₺${(abs / 1_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`
  return `${sign}₺${TRY_FMT.format(abs)}`
}

function fmtFull(n: number): string {
  const abs = Math.abs(Number(n || 0))
  return (n < 0 ? '−' : '') + '₺' + TRY_FMT.format(abs)
}

function runwayColor(months: number | null): string {
  if (months === null) return 'text-gray-400'
  if (months <= 2)     return 'text-red-600'
  if (months <= 6)     return 'text-orange-600'
  if (months <= 12)    return 'text-amber-600'
  return 'text-emerald-600'
}

function sq<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  return fn().catch(() => fallback)
}

// ── Inline KPI card ───────────────────────────────────────────────────────────

function KpiBlock({
  label, value, sub, tone = 'neutral', href,
}: {
  label: string
  value: string
  sub?: string
  tone?: 'positive' | 'negative' | 'warning' | 'critical' | 'neutral'
  href?: string
}) {
  const valueColor = {
    positive: 'text-emerald-700',
    negative: 'text-red-600',
    warning:  'text-amber-600',
    critical: 'text-red-700',
    neutral:  'text-gray-900',
  }[tone]

  const content = (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-gray-300 transition-colors">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">{label}</div>
      <div className={`text-xl font-black tabular-nums leading-none ${valueColor}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-1 leading-tight">{sub}</div>}
    </div>
  )
  return href ? <Link href={href}>{content}</Link> : content
}

// ── Risk pill ─────────────────────────────────────────────────────────────────

function RiskPill({ label, value, level }: { label: string; value: string; level: 'ok' | 'warn' | 'critical' }) {
  const colors = {
    ok:       'bg-emerald-50 border-emerald-200 text-emerald-700',
    warn:     'bg-amber-50 border-amber-200 text-amber-700',
    critical: 'bg-red-50 border-red-200 text-red-700',
  }[level]
  const icons = { ok: '✓', warn: '⚠', critical: '🔴' }[level]

  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-xl border ${colors}`}>
      <span className="text-xs font-semibold">{icons} {label}</span>
      <span className="text-xs font-black tabular-nums">{value}</span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CeoDashboardPage() {
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

  try { await resolveCompanyId(uid!, supabase) }
  catch { redirect('/auth') }

  const now   = new Date()
  const today = now.toISOString().slice(0, 10)
  const year  = now.getFullYear()
  const mon   = String(now.getMonth() + 1).padStart(2, '0')
  const from  = `${year}-${mon}-01`

  const cookieHeader = cookies().getAll().map(c => `${c.name}=${c.value}`).join('; ')
  const reqHeaders   = headers()
  const host         = reqHeaders.get('x-forwarded-host') ?? reqHeaders.get('host') ?? 'localhost:3000'
  const proto        = reqHeaders.get('x-forwarded-proto') ?? 'http'
  const base         = `${proto}://${host}`

  const apiFetch = (path: string) =>
    fetch(`${base}${path}`, { headers: { Cookie: cookieHeader }, cache: 'no-store' })

  const ZERO_METRICS: CfoMetrics = {
    cash:        { true_cash_position: 0, operational_cash: 0, restricted_cash: 0, distributable_cash: 0 },
    burn:        { monthly_burn_rate: 0, runway_months: null, runway_days: null, cash_exhaustion_date: null },
    receivables: { total_outstanding: 0, overdue_30d: 0, overdue_60d: 0, overdue_90d: 0, collection_rate_pct: 100 },
    tax:         { kdv_net: 0, corporate_tax_estimate: 0, total_fiscal_obligation: 0 },
    partner:     { total_equity: 0, total_loans: 0, total_dividends: 0, company_owes: 0 },
    stock:       { fifo_value: 0, coverage_months: null },
  }
  const ZERO_RUNWAY: RunwayForecast = {
    months: [], exhaustion_month: null, exhaustion_date: null, safe_months: 0,
    inputs: { starting_cash: 0, monthly_burn: 0, outstanding_total: 0, horizon_months: 12 },
  }

  const [metrics, runway] = await Promise.all([
    sq(async (): Promise<CfoMetrics> => {
      const r = await apiFetch(`/api/cfo-metrics?from=${from}&to=${today}`)
      if (!r.ok) throw new Error(`cfo-metrics ${r.status}`)
      return r.json() as Promise<CfoMetrics>
    }, ZERO_METRICS),

    sq(async (): Promise<RunwayForecast> => {
      const r = await apiFetch(`/api/simulation/runway?from=${from}&to=${today}&months=12`)
      if (!r.ok) throw new Error(`simulation/runway ${r.status}`)
      return r.json() as Promise<RunwayForecast>
    }, ZERO_RUNWAY),
  ])

  const m = metrics
  const r = runway

  // ── Derived signals ─────────────────────────────────────────────────────────
  const runwayMonths = m.burn.runway_months
  const runwayTone   = runwayMonths === null ? 'neutral'
    : runwayMonths <= 2  ? 'critical'
    : runwayMonths <= 6  ? 'warning'
    : 'positive'

  const collectionRisk = m.receivables.overdue_60d > 5000 ? 'critical'
    : m.receivables.overdue_30d > 2000 ? 'warn' : 'ok'

  const taxRisk = m.tax.total_fiscal_obligation > 10000 ? 'warn' : 'ok'
  const partnerRisk = m.partner.total_loans > m.partner.total_equity * 0.5 ? 'warn' : 'ok'
  const stockRisk   = m.stock.coverage_months !== null && m.stock.coverage_months < 2 ? 'warn' : 'ok'

  // ── Runway chart (ASCII-style bar — no client JS needed) ───────────────────
  const chartMonths = r.months.slice(0, 12)
  const maxCash     = Math.max(1, ...chartMonths.map(m => Math.max(0, m.end_cash)))

  const monthLabel = now.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })

  return (
    <div className="max-w-5xl space-y-3">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-black text-gray-900 tracking-tight">CEO Özeti</h1>
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-semibold capitalize">
            {monthLabel}
          </span>
          {runwayTone === 'critical' && (
            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold animate-pulse">
              🔴 Kritik
            </span>
          )}
        </div>
        <Link href="/dashboard"
          className="text-xs text-primary-600 font-semibold hover:text-primary-700">
          ← Dashboard
        </Link>
      </div>

      {/* Zone 1 — Liquidity Cockpit */}
      <div>
        <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1.5">
          Likidite Kontrol Merkezi
        </div>
        <div className="grid grid-cols-4 gap-2">
          <KpiBlock
            label="Nakit Pozisyonu"
            value={fmt(m.cash.true_cash_position)}
            sub="Tüm zamanlı tahsilat − ödenen giderler"
            tone={m.cash.true_cash_position > 0 ? 'positive' : 'critical'}
          />
          <KpiBlock
            label="Dağıtılabilir Nakit"
            value={m.cash.distributable_cash > 0 ? fmt(m.cash.distributable_cash) : '—'}
            sub={m.cash.restricted_cash > 0 ? `${fmt(m.cash.restricted_cash)} taahhüt var` : 'Yükümlülük yok'}
            tone={m.cash.distributable_cash > 0 ? 'positive' : 'negative'}
            href="/dashboard/partners"
          />
          <KpiBlock
            label="Aylık Burn"
            value={m.burn.monthly_burn_rate > 0 ? fmt(m.burn.monthly_burn_rate) : '—'}
            sub="3 aylık ortalama operasyonel"
            tone="neutral"
            href="/dashboard/expenses"
          />
          <div className={`rounded-xl px-4 py-3 border-2 ${
            runwayTone === 'critical' ? 'bg-red-50 border-red-300' :
            runwayTone === 'warning'  ? 'bg-amber-50 border-amber-300' :
            runwayTone === 'positive' ? 'bg-emerald-50 border-emerald-200' :
            'bg-gray-50 border-gray-200'
          }`}>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Runway</div>
            <div className={`text-xl font-black tabular-nums leading-none ${runwayColor(runwayMonths)}`}>
              {runwayMonths !== null ? `${runwayMonths.toFixed(1)} ay` : '∞'}
            </div>
            {m.burn.cash_exhaustion_date && (
              <div className="text-[10px] text-gray-500 mt-1">
                {new Date(m.burn.cash_exhaustion_date + 'T00:00:00Z').toLocaleDateString('tr-TR', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })}
              </div>
            )}
            {runwayMonths !== null && runwayMonths <= 6 && (
              <div className="text-[10px] font-bold text-red-600 mt-0.5">
                Nakit tükeniyor!
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Zone 2 — Revenue Health + Receivables */}
      <div className="grid grid-cols-5 gap-2">
        <div className="col-span-3">
          <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1.5">
            Tahsilat Sağlığı
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-600">Toplam Açık Alacak</span>
              <span className="text-sm font-black tabular-nums text-gray-900">
                {fmt(m.receivables.total_outstanding)}
              </span>
            </div>

            {/* Aging bars */}
            {[
              { label: '+30 gün (Risk)',       value: m.receivables.overdue_30d, color: 'bg-amber-400' },
              { label: '+60 gün (Yüksek Risk)',value: m.receivables.overdue_60d, color: 'bg-orange-500' },
              { label: '+90 gün (Kritik)',     value: m.receivables.overdue_90d, color: 'bg-red-600'   },
            ].map(({ label, value, color }) => {
              const pct = m.receivables.total_outstanding > 0
                ? Math.min(100, (value / m.receivables.total_outstanding) * 100)
                : 0
              return (
                <div key={label}>
                  <div className="flex items-center justify-between text-[10px] text-gray-500 mb-0.5">
                    <span>{label}</span>
                    <span className="font-semibold tabular-nums">{fmt(value)}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}

            <div className="flex items-center justify-between pt-1 border-t border-gray-100">
              <span className="text-[10px] text-gray-500 font-semibold">Tahsilat Oranı (dönem)</span>
              <span className={`text-xs font-black tabular-nums ${
                m.receivables.collection_rate_pct >= 80 ? 'text-emerald-600' :
                m.receivables.collection_rate_pct >= 50 ? 'text-amber-600' : 'text-red-600'
              }`}>
                %{m.receivables.collection_rate_pct.toFixed(1)}
              </span>
            </div>
          </div>
        </div>

        <div className="col-span-2">
          <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1.5">
            Risk Matrisi
          </div>
          <div className="space-y-1.5">
            <RiskPill
              label="Runway"
              value={runwayMonths !== null ? `${runwayMonths.toFixed(1)} ay` : '∞'}
              level={runwayTone === 'critical' ? 'critical' : runwayTone === 'warning' ? 'warn' : 'ok'}
            />
            <RiskPill
              label="Vadesi Geçmiş Alacak"
              value={fmt(m.receivables.overdue_30d)}
              level={collectionRisk}
            />
            <RiskPill
              label="Vergi Yükümlülüğü"
              value={fmt(m.tax.total_fiscal_obligation)}
              level={taxRisk}
            />
            <RiskPill
              label="Ortak Borç / Özsermaye"
              value={m.partner.total_equity > 0
                ? `%${Math.round((m.partner.total_loans / m.partner.total_equity) * 100)}`
                : '—'}
              level={partnerRisk}
            />
            <RiskPill
              label="Stok Karşılama"
              value={m.stock.coverage_months !== null ? `${m.stock.coverage_months.toFixed(1)} ay` : '—'}
              level={stockRisk}
            />
          </div>
        </div>
      </div>

      {/* Zone 3 — Financial Summary Row */}
      <div>
        <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1.5">
          Finansal Özet
        </div>
        <div className="grid grid-cols-5 gap-2">
          <KpiBlock label="Özsermaye" value={fmt(m.partner.total_equity)}
            sub="Toplam capital_in" href="/dashboard/partners" />
          <KpiBlock label="Ortak Kredileri" value={fmt(m.partner.total_loans)}
            sub="Net borç (ödenmemiş)" href="/dashboard/partners" />
          <KpiBlock label="Stok Değeri (FIFO)" value={fmt(m.stock.fifo_value)}
            sub={m.stock.coverage_months ? `${m.stock.coverage_months.toFixed(1)} ay karşılık` : undefined}
            href="/dashboard/stocks" />
          <KpiBlock label="KDV Net"
            value={fmtFull(Math.abs(m.tax.kdv_net))}
            sub={m.tax.kdv_net > 0 ? 'Ödenecek' : 'Devredilecek'}
            tone={m.tax.kdv_net > 0 ? 'warning' : 'neutral'}
            href="/dashboard/tax" />
          <KpiBlock label="KV Tahmini"
            value={fmt(m.tax.corporate_tax_estimate)}
            sub={`YTD kâr × %25`}
            tone={m.tax.corporate_tax_estimate > 0 ? 'warning' : 'neutral'}
            href="/dashboard/analytics" />
        </div>
      </div>

      {/* Zone 4 — Runway Forecast Chart */}
      {chartMonths.length > 0 && (
        <div>
          <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1.5">
            12 Aylık Nakit Projeksiyonu
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-4">
            <div className="flex items-end gap-1.5 h-24">
              {chartMonths.map((mo) => {
                const barH    = maxCash > 0 ? Math.max(2, Math.round((Math.max(0, mo.end_cash) / maxCash) * 100)) : 0
                const isNeg   = mo.end_cash <= 0
                const isLow   = !isNeg && mo.end_cash < maxCash * 0.2
                const barColor = isNeg ? 'bg-red-400' : isLow ? 'bg-amber-400' : 'bg-emerald-400'
                return (
                  <div key={mo.month} className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
                    <div className="w-full flex items-end justify-center" style={{ height: '88px' }}>
                      <div
                        className={`w-full rounded-sm ${barColor} opacity-90`}
                        style={{ height: `${isNeg ? 4 : barH}%` }}
                        title={`${mo.month_label}: ${fmt(mo.end_cash)}`}
                      />
                    </div>
                    <span className="text-[8px] text-gray-400 font-medium truncate w-full text-center leading-none">
                      {mo.month_label.split(' ')[0]}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center justify-between mt-2 text-[10px] text-gray-400">
              <span>Başlangıç: {fmt(r.inputs.starting_cash)}</span>
              {r.exhaustion_month !== null ? (
                <span className="text-red-500 font-semibold">
                  ⚠ Ay {r.exhaustion_month}&apos;de nakit tükenebilir
                </span>
              ) : (
                <span className="text-emerald-600 font-semibold">12 ay boyunca nakit sağlıklı</span>
              )}
              <span>Burn: {fmt(r.inputs.monthly_burn)}/ay</span>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2 pt-1">
        <Link href="/dashboard/collections"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700 transition-colors">
          Tahsilat Yönet
        </Link>
        <Link href="/dashboard/expenses"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 transition-colors">
          Giderleri Gözden Geçir
        </Link>
        <Link href="/dashboard/partners"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 transition-colors">
          Ortak Dengesi
        </Link>
        <Link href="/dashboard/simulation"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 transition-colors">
          Senaryo Simülasyonu
        </Link>
      </div>

    </div>
  )
}

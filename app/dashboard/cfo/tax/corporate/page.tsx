// ── Kurumlar Vergisi Tahmini ──────────────────────────────────────────────────
// /dashboard/cfo/tax/corporate
//
// Geçici vergi takvimi + YTD kurumlar vergisi tahmini.
// Türk vergi takvimi:
//   Q1 → Geçici Vergi 1  → 17 Mayıs'a kadar beyan
//   Q2 → Geçici Vergi 2  → 17 Ağustos'a kadar beyan
//   Q3 → Geçici Vergi 3  → 17 Kasım'a kadar beyan
//   Yıllık KV            → 30 Nisan (ertesi yıl)
//
// Server component — no client state needed.

export const dynamic = 'force-dynamic'

import Link             from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import {
  getQuarterlyReport,
  type QuarterResult,
} from '@/lib/finance/financial-core'
import { fmtTRY as fmt } from '@/lib/format'

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtDate(d: string): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
  return `${day} ${months[Number(m) - 1]} ${y}`
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

// ── Status badge helpers ──────────────────────────────────────────────────────

type GeciciStatus = 'overdue' | 'urgent' | 'upcoming' | 'paid' | 'future' | 'n/a'

function getGeciciStatus(q: QuarterResult, today: string): GeciciStatus {
  if (!q.gecici_due_date) return 'n/a'
  if (!q.is_past_quarter && q.gecici_due_date > today) return 'future'
  if (q.gecici_due_date < today)               return 'overdue'
  if (q.gecici_due_date <= addDays(today, 14)) return 'urgent'
  if (q.gecici_due_date <= addDays(today, 45)) return 'upcoming'
  return 'paid'
}

const STATUS_META: Record<GeciciStatus, { label: string; cls: string }> = {
  overdue:  { label: 'Vadesi Geçti',  cls: 'bg-neg-light text-neg-text border-neg-light'              },
  urgent:   { label: '14 Gün İçinde', cls: 'bg-orange-100 text-orange-700 border-orange-200'     },
  upcoming: { label: 'Yaklaşıyor',    cls: 'bg-yellow-100 text-yellow-700 border-yellow-200'     },
  paid:     { label: 'Ödendi',        cls: 'bg-pos-light text-pos-text border-pos-light'  },
  future:   { label: 'Henüz Yok',     cls: 'bg-[#f1f5f9] text-[#64748b] border-[#e2e8f0]'           },
  'n/a':    { label: 'Geçici Yok',    cls: 'bg-[#f8fafc] text-[#94a3b8] border-[#e2e8f0]'            },
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string
  value: string
  sub?:  string
  tone?: 'neutral' | 'warning' | 'positive' | 'critical'
}) {
  const valueColor = {
    neutral:  'text-[#0f172a]',
    warning:  'text-warn-text',
    positive: 'text-pos-text',
    critical: 'text-neg-text',
  }[tone]

  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 border-r border-[#e2e8f0] last:border-r-0">
      <div className="text-[10px] font-black uppercase tracking-widest text-[#94a3b8]">{label}</div>
      <div className={`text-lg font-black tabular-nums leading-tight ${valueColor}`}>{value}</div>
      {sub && <div className="text-[10px] text-[#94a3b8] mt-0.5">{sub}</div>}
    </div>
  )
}

// ── Error fallback ────────────────────────────────────────────────────────────

function ErrorState({ href, label }: { href: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
      <div className="text-3xl">⚠️</div>
      <p className="text-sm text-[#64748b]">{label}</p>
      <a href={href} className="text-sm text-primary-600 font-semibold hover:underline">Yeniden Dene</a>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CorporateTaxPage() {
  const supabase = createClient()

  // ── Auth ──────────────────────────────────────────────────────────────────
  let userId: string | null = null
  try {
    const { data, error } = await supabase.auth.getUser()
    if (!error && data?.user) userId = data.user.id
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
  }
  if (!userId) return <ErrorState href="/dashboard/cfo/tax/corporate" label="Oturum bilgisi alınamadı." />

  let companyId: string | null = null
  try { companyId = await resolveCompanyId(userId, supabase) } catch { /* non-fatal */ }
  if (!companyId) return <ErrorState href="/dashboard/cfo/tax/corporate" label="Şirket bilgisi yüklenemedi." />

  // ── Date constants ────────────────────────────────────────────────────────
  const today         = new Date().toISOString().slice(0, 10)
  const currentYear   = new Date().getFullYear()
  const monthsElapsed = new Date().getMonth() + 1

  // ── Fetch quarterly report ────────────────────────────────────────────────
  const ZERO_REPORT = {
    year:     currentYear,
    quarters: [] as QuarterResult[],
    ytd:      {
      revenue: 0, gross_profit: 0, net_profit: 0,
      matrah: 0, corporate_tax: 0, net_after_tax: 0, total_gecici: 0,
    },
  }

  let report = ZERO_REPORT
  try {
    report = await getQuarterlyReport(userId, companyId, currentYear)
  } catch {
    // fallback to zeros if service unavailable
  }

  const { ytd, quarters } = report

  // ── Computed KPIs ─────────────────────────────────────────────────────────
  const projectedMatrah = monthsElapsed > 0 ? (ytd.matrah / monthsElapsed) * 12 : 0
  const projectedKv     = Math.max(0, projectedMatrah * 0.25)
  const kvRemaining     = Math.max(0, ytd.corporate_tax - ytd.total_gecici)
  const annualDueDate   = `${currentYear + 1}-04-30`

  const nextDue = quarters
    .filter(q => q.gecici_due_date && q.gecici_due_date >= today && q.gecici_vergi > 0)
    .sort((a, b) => a.gecici_due_date.localeCompare(b.gecici_due_date))[0]

  return (
    <div className="flex flex-col gap-5 max-w-3xl">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-black text-[#0f172a] tracking-tight">
            Kurumlar Vergisi Tahmini
          </h1>
          <p className="text-xs text-[#94a3b8] mt-0.5">
            {currentYear} yılı geçici vergi takvimi + YTD kurumlar vergisi tahmini
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/dashboard/cfo/tax/kdv"
            className="text-xs font-semibold text-[#94a3b8] hover:text-primary-600 transition-colors">
            KDV Özeti →
          </Link>
          <Link href="/dashboard/cfo"
            className="text-xs font-semibold text-[#94a3b8] hover:text-primary-600 transition-colors">
            ← CFO
          </Link>
        </div>
      </div>

      {/* ── KPI Strip ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-0 bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
        <KpiCard
          label="YTD Matrah"
          value={ytd.matrah > 0 ? fmt(ytd.matrah) : '—'}
          sub="Vergi öncesi kâr"
        />
        <KpiCard
          label="Tahmini KV (%25)"
          value={ytd.corporate_tax > 0 ? fmt(ytd.corporate_tax) : '—'}
          sub={`${monthsElapsed} aylık YTD`}
          tone={ytd.corporate_tax > 0 ? 'warning' : 'neutral'}
        />
        <KpiCard
          label="Ödenen Geçici"
          value={ytd.total_gecici > 0 ? fmt(ytd.total_gecici) : '—'}
          sub="Q1+Q2+Q3 geçici"
        />
        <KpiCard
          label="Kalan KV Bakiyesi"
          value={kvRemaining > 0 ? fmt(kvRemaining) : ytd.corporate_tax > 0 ? '₺0' : '—'}
          sub={kvRemaining > 0 ? `30 Nis ${currentYear + 1}'e kadar` : 'Geçici karşılandı'}
          tone={kvRemaining > 50_000 ? 'critical' : kvRemaining > 0 ? 'warning' : 'positive'}
        />
      </div>

      {/* ── Alert banner for upcoming gecici ───────────────────────────────── */}
      {nextDue && (
        <div className={`rounded px-4 py-3 border text-sm flex items-center justify-between ${
          nextDue.gecici_due_date <= addDays(today, 14)
            ? 'bg-orange-50 border-orange-200 text-orange-800'
            : 'bg-warn-light border-warn-light text-warn-text'
        }`}>
          <span>
            <span className="font-black">{nextDue.label} Geçici Vergisi</span>
            {' '}— {fmtDate(nextDue.gecici_due_date)}{`'`}a kadar beyan:{' '}
            <span className="font-black">{fmt(nextDue.gecici_vergi)}</span>
          </span>
          {nextDue.gecici_due_date <= addDays(today, 14) && (
            <span className="text-xs font-black bg-orange-200 text-orange-900 rounded px-2 py-0.5">ACİL</span>
          )}
        </div>
      )}

      {/* ── Quarterly Breakdown ─────────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
        <div className="px-4 py-2.5 bg-[#f8fafc] border-b border-[#e2e8f0]">
          <div className="text-[10px] font-black uppercase tracking-widest text-[#94a3b8]">
            Geçici Vergi Takvimi — {currentYear}
          </div>
        </div>

        <div className="divide-y divide-[#e2e8f0]">
          {/* Column headers */}
          <div className="grid grid-cols-[80px_1fr_1fr_1fr_110px] px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[#94a3b8]">
            <div>Dönem</div>
            <div className="text-right">Matrah</div>
            <div className="text-right">Tahmini KV</div>
            <div className="text-right">Geçici Vade</div>
            <div className="text-right">Durum</div>
          </div>

          {quarters.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-[#94a3b8]">
              Bu yıla ait çeyrek verisi bulunamadı
            </div>
          )}

          {quarters.map(q => {
            const isQ4   = q.label.startsWith('Q4')
            const status = isQ4 ? ('n/a' as GeciciStatus) : getGeciciStatus(q, today)
            const meta   = STATUS_META[status]

            return (
              <div
                key={q.label}
                className={`grid grid-cols-[80px_1fr_1fr_1fr_110px] px-4 py-3 items-center ${
                  isQ4 ? 'bg-primary-50' : ''
                }`}
              >
                {/* Quarter label */}
                <div>
                  <div className="text-sm font-black text-[#1e293b]">{q.label}</div>
                  <div className="text-[10px] text-[#94a3b8]">
                    {q.period.from.slice(5).replace('-', '/')} — {q.period.to.slice(5).replace('-', '/')}
                  </div>
                </div>

                {/* Matrah */}
                <div className="text-right">
                  <div className={`tabular-nums text-sm font-semibold ${q.matrah > 0 ? 'text-[#0f172a]' : 'text-[#cbd5e1]'}`}>
                    {q.matrah > 0 ? fmt(q.matrah) : '—'}
                  </div>
                </div>

                {/* Corporate Tax */}
                <div className="text-right">
                  <div className={`tabular-nums text-sm font-semibold ${q.corporate_tax > 0 ? 'text-warn-text' : 'text-[#cbd5e1]'}`}>
                    {q.corporate_tax > 0 ? fmt(q.corporate_tax) : '—'}
                  </div>
                </div>

                {/* Due date */}
                <div className="text-right">
                  {isQ4 ? (
                    <div className="text-xs text-primary-600 font-semibold">
                      30 Nis {currentYear + 1}
                      <br />
                      <span className="text-[10px] text-[#94a3b8] font-normal">(Yıllık Beyan)</span>
                    </div>
                  ) : q.gecici_due_date ? (
                    <div className="text-xs text-[#334155]">{fmtDate(q.gecici_due_date)}</div>
                  ) : (
                    <div className="text-xs text-[#cbd5e1]">—</div>
                  )}
                </div>

                {/* Status badge */}
                <div className="flex justify-end">
                  {isQ4 ? (
                    <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-black uppercase tracking-wide rounded border bg-primary-100 text-primary-700 border-primary-200">
                      Yıllık KV
                    </span>
                  ) : (
                    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-black uppercase tracking-wide rounded border ${meta.cls}`}>
                      {meta.label}
                    </span>
                  )}
                </div>
              </div>
            )
          })}

          {/* YTD totals row */}
          {quarters.length > 0 && (
            <div className="grid grid-cols-[80px_1fr_1fr_1fr_110px] px-4 py-3 items-center bg-[#f8fafc] border-t-2 border-[#e2e8f0]">
              <div className="text-[10px] font-black uppercase tracking-widest text-[#64748b]">YTD</div>
              <div className="text-right tabular-nums text-sm font-black text-[#0f172a]">
                {ytd.matrah > 0 ? fmt(ytd.matrah) : '—'}
              </div>
              <div className="text-right tabular-nums text-sm font-black text-warn-text">
                {ytd.corporate_tax > 0 ? fmt(ytd.corporate_tax) : '—'}
              </div>
              <div className="text-right" />
              <div className="flex justify-end">
                <span className="text-[10px] font-black text-[#64748b] uppercase tracking-wide">
                  Geçici: {ytd.total_gecici > 0 ? fmt(ytd.total_gecici) : '—'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Yıllık Projeksiyon ──────────────────────────────────────────────── */}
      {monthsElapsed < 12 && projectedMatrah > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
          <div className="px-4 py-2.5 bg-[#f8fafc] border-b border-[#e2e8f0]">
            <div className="text-[10px] font-black uppercase tracking-widest text-[#94a3b8]">
              Yıllık Projeksiyon (Extrapolasyon)
            </div>
          </div>
          <div className="px-4 py-4 space-y-2">
            <div className="text-[10px] text-[#64748b] mb-3">
              {monthsElapsed} aylık gerçekleşen ÷ {monthsElapsed} × 12 — yıl sonu tahmini
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#64748b]">Tahmini Yıllık Matrah</span>
              <span className="tabular-nums text-sm font-black text-[#0f172a]">{fmt(projectedMatrah)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-[#e2e8f0] pt-2">
              <span className="text-xs text-[#64748b]">Tahmini Yıllık KV (%25)</span>
              <span className="tabular-nums text-sm font-black text-warn-text">{fmt(projectedKv)}</span>
            </div>
            {ytd.total_gecici > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#64748b]">Ödenen Geçici YTD</span>
                <span className="tabular-nums text-sm font-semibold text-pos-text">−{fmt(ytd.total_gecici)}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t-2 border-[#e2e8f0] pt-2">
              <span className="text-xs font-black text-[#1e293b]">Tahmini Kalan Yükümlülük</span>
              <span className={`tabular-nums text-sm font-black ${Math.max(0, projectedKv - ytd.total_gecici) > 0 ? 'text-orange-700' : 'text-pos-text'}`}>
                {fmt(Math.max(0, projectedKv - ytd.total_gecici))}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Hesaplama özeti ─────────────────────────────────────────────────── */}
      {ytd.matrah > 0 && (
        <div className="bg-warn-light border border-warn-light rounded px-4 py-3 text-xs text-warn-text leading-relaxed space-y-1">
          <div>
            <span className="font-black">KV Formülü:</span>{' '}
            Matrah ({fmt(ytd.matrah)}) × %25 ={' '}
            <span className="font-black">{fmt(ytd.corporate_tax)}</span> tahmini KV
          </div>
          {ytd.total_gecici > 0 && (
            <div>
              Ödenen Geçici: {fmt(ytd.total_gecici)} → Kalan:{' '}
              <span className="font-black">{fmt(kvRemaining)}</span>{' '}
              ({fmtDate(annualDueDate)}{`'`}a kadar)
            </div>
          )}
        </div>
      )}

      {/* ── Disclaimer ─────────────────────────────────────────────────────── */}
      <div className="bg-info-light border border-info-light rounded px-4 py-3 text-xs text-info-text leading-relaxed">
        <span className="font-black">Not:</span>{' '}
        Bu sayfa tahmini hesaplama içerir. Kesin kurumlar vergisi beyanı muhasebeci tarafından
        hazırlanmalıdır. Geçici vergi dönemleri: Q1 → 17 Mayıs, Q2 → 17 Ağustos, Q3 → 17 Kasım.
        Yıllık KV beyannamesi → 30 Nisan.
      </div>

      {/* Cross-navigation */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] text-[#94a3b8] leading-relaxed">
          Kurumlar vergisi gelir tablosu ve KDV beyanıyla birlikte değerlendirilmeli.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link href="/dashboard/cfo/tax/kdv" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            KDV Beyanı →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/finance?tab=quarterly" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Geçici Vergi →
          </Link>
          <span className="text-[#e2e8f0]">|</span>
          <Link href="/dashboard/reports/income-statement" className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap">
            Gelir Tablosu →
          </Link>
        </div>
      </div>

    </div>
  )
}

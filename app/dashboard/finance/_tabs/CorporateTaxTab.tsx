// ─────────────────────────────────────────────────────────────────────────────
// app/dashboard/finance/_tabs/CorporateTaxTab.tsx
//
// Corporate tax timeline view (Kurumlar Vergisi + Geçici Vergi takvimi)
// Displays annual tax estimate, quarterly provisional tax schedule, and
// the upcoming 90-day tax calendar.
// ─────────────────────────────────────────────────────────────────────────────

import {
  computeEffectiveTaxRate,
  computeRemainingTaxLiability,
  generateQuarterlySchedule,
  daysUntilEvent,
} from '@/lib/services/tax/tax-compliance.service'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CorporateTaxTabProps {
  userId:    string
  companyId: string
  glMode?:   string
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtTRY(n: number): string {
  return '₺' + n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtPct(n: number): string {
  return '%' + n.toFixed(1)
}

const TR_MONTHS_SHORT = [
  'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
  'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara',
]

function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${TR_MONTHS_SHORT[m - 1]}`
}

// ── Calendar event helpers ────────────────────────────────────────────────────

function daysLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)} gün gecikti`
  if (days === 0) return 'Bugün son gün'
  return `${days} gün kaldı`
}

// ── Demo data (replace with real data fetch in production) ───────────────────

const CURRENT_YEAR = 2025
const TODAY = '2025-05-30'

// Hardcoded demo figures — in production fetch from TaxComplianceService
const ANNUAL_TAX_ESTIMATE = 378_750
const GROSS_PROFIT = ANNUAL_TAX_ESTIMATE / 0.25  // 25% rate → grossProfit = estimate / rate
const EFFECTIVE_RATE = computeEffectiveTaxRate(ANNUAL_TAX_ESTIMATE, GROSS_PROFIT)

// Q1 is paid in this demo
const Q1_PAID = ANNUAL_TAX_ESTIMATE / 4
const REMAINING = computeRemainingTaxLiability(ANNUAL_TAX_ESTIMATE, [Q1_PAID])

const SCHEDULE = generateQuarterlySchedule(CURRENT_YEAR, ANNUAL_TAX_ESTIMATE, TODAY)
// Override Q1 as paid
SCHEDULE[0].status = 'paid'

// ── Calendar events (next 90 days) ────────────────────────────────────────────

interface CalendarEvent {
  due_date: string
  label:    string
}

function buildCalendarEvents(today: string): CalendarEvent[] {
  const events: CalendarEvent[] = []
  // Generate KDV and Geçici Vergi events for next 90 days
  const [y] = today.split('-').map(Number)

  // KDV — 26th of each following month
  for (let m = 1; m <= 12; m++) {
    const nextM = m === 12 ? 1  : m + 1
    const nextY = m === 12 ? y + 1 : y
    const dStr = `${nextY}-${String(nextM).padStart(2, '0')}-26`
    const days = daysUntilEvent(dStr, today)
    if (days >= 0 && days <= 90) {
      events.push({ due_date: dStr, label: 'KDV Beyannamesi' })
    }
  }

  // Geçici Vergi quarters: Feb 15, May 15, Aug 15, Nov 15
  const qDates = [
    `${y}-02-15`, `${y}-05-15`, `${y}-08-15`, `${y}-11-15`,
  ]
  const qLabels = [
    'Geçici KV 1. Taksit', 'Geçici KV 2. Taksit',
    'Geçici KV 3. Taksit', 'Geçici KV 4. Taksit',
  ]
  for (let i = 0; i < qDates.length; i++) {
    const days = daysUntilEvent(qDates[i], today)
    if (days >= 0 && days <= 90) {
      events.push({ due_date: qDates[i], label: qLabels[i] })
    }
  }

  return events.sort((a, b) => a.due_date.localeCompare(b.due_date))
}

const CALENDAR_EVENTS = buildCalendarEvents(TODAY)

// ── Quarter status badge ──────────────────────────────────────────────────────

function QuarterBadge({ status, dueDate }: { status: string; dueDate: string }) {
  const days = daysUntilEvent(dueDate, TODAY)

  if (status === 'paid') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
        ÖDENDİ ✓
      </span>
    )
  }
  if (days === 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
        BUGÜN SON GÜN ⚠
      </span>
    )
  }
  if (days < 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
        GECİKTİ {Math.abs(days)}g
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
      {days} gün kaldı
    </span>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export async function CorporateTaxTab(_props: CorporateTaxTabProps) {
  return (
    <div className="space-y-5">

      {/* ── ANNUAL SUMMARY CARD ─────────────────────────────────────────────── */}
      <div className="rounded-lg border border-[#e2e8f0] bg-white overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#e2e8f0] bg-[#f8fafc]">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">
                Kurumlar Vergisi
              </div>
              <h2 className="text-base font-black text-[#0f172a]">
                KURUMLAR VERGİSİ {CURRENT_YEAR}
              </h2>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-[0.65rem] text-[#94a3b8] uppercase tracking-wide">Tahmini Yıllık Vergi</div>
                <div className="text-xl font-black text-[#0f172a]">{fmtTRY(ANNUAL_TAX_ESTIMATE)}</div>
              </div>
              <div className="text-right">
                <div className="text-[0.65rem] text-[#94a3b8] uppercase tracking-wide">Efektif Oran</div>
                <div className="text-xl font-black text-[#0f172a]">{fmtPct(EFFECTIVE_RATE)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Quarterly Schedule */}
        <div className="px-5 py-4">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
            Geçici Vergi Takvimi
          </div>
          <div className="space-y-2">
            {SCHEDULE.map((q) => (
              <div
                key={q.quarter}
                className="flex items-center justify-between gap-3 py-2 border-b border-[#f1f5f9] last:border-0"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-[#64748b] w-5">Q{q.quarter}</span>
                  <span className="text-sm text-[#334155]">{fmtDate(q.due_date)} {CURRENT_YEAR}</span>
                  <span className="text-sm font-semibold text-[#0f172a]">{fmtTRY(q.amount)}</span>
                </div>
                <QuarterBadge status={q.status} dueDate={q.due_date} />
              </div>
            ))}
          </div>

          {/* Totals row */}
          <div className="mt-3 pt-3 border-t border-[#e2e8f0] flex items-center justify-between text-sm">
            <span className="text-[#64748b]">
              Ödenen: <span className="font-semibold text-[#0f172a]">{fmtTRY(Q1_PAID)}</span>
            </span>
            <span className="text-[#64748b]">
              Kalan: <span className="font-semibold text-[#0f172a]">{fmtTRY(REMAINING)}</span>
            </span>
          </div>
        </div>
      </div>

      {/* ── UPCOMING 90-DAY CALENDAR ──────────────────────────────────────────── */}
      <div className="rounded-lg border border-[#e2e8f0] bg-white overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#e2e8f0] bg-[#f8fafc]">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">
            Vergi Takvimi
          </div>
          <h2 className="text-base font-black text-[#0f172a]">Sonraki 90 Gün</h2>
        </div>
        <div className="px-5 py-4">
          {CALENDAR_EVENTS.length === 0 ? (
            <p className="text-sm text-[#94a3b8]">Önümüzdeki 90 gün içinde vergi yükümlülüğü bulunmuyor.</p>
          ) : (
            <div className="space-y-2">
              {CALENDAR_EVENTS.map((ev, i) => {
                const days = daysUntilEvent(ev.due_date, TODAY)
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 py-2 border-b border-[#f1f5f9] last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-[#334155] w-14">
                        {fmtDate(ev.due_date)}
                      </span>
                      <span className="text-sm text-[#64748b]">→</span>
                      <span className="text-sm text-[#0f172a]">{ev.label}</span>
                    </div>
                    <span className={`text-xs font-medium ${days <= 7 ? 'text-amber-600' : 'text-[#64748b]'}`}>
                      [{daysLabel(days)}]
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Disclaimer */}
          <div className="mt-4 flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
            <span className="mt-0.5">⚠</span>
            <span>
              <strong>Uyarı:</strong> Bu bilgiler yalnızca bilgi amaçlıdır.
              Kesin vergi yükümlülükleri için mali müşavirinizle doğrulayın.
            </span>
          </div>
        </div>
      </div>

    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// app/dashboard/finance/_tabs/CorporateTaxTab.tsx
//
// Corporate tax timeline view (Kurumlar Vergisi + Geçici Vergi takvimi).
// Real data: TaxComplianceService.getDashboard(companyId) — real YTD corporate
// tax provision, real Geçici Vergi obligations (dates/amounts/statuses), and the
// upcoming 90-day obligation calendar. No hardcoded figures or dates.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase-server'
import {
  TaxComplianceService,
  type TaxObligation,
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

const TR_MONTHS_SHORT = [
  'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
  'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara',
]

function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${TR_MONTHS_SHORT[m - 1]}`
}

function daysLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)} gün gecikti`
  if (days === 0) return 'Bugün son gün'
  return `${days} gün kaldı`
}

function quarterOf(o: TaxObligation): string {
  const m = o.obligation_id.match(/_q(\d)/)
  return m ? `Q${m[1]}` : o.period_label
}

// ── Obligation status badge (driven by real obligation status) ────────────────

function StatusBadge({ status, days }: { status: TaxObligation['status']; days: number }) {
  if (status === 'paid') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
        ÖDENDİ ✓
      </span>
    )
  }
  if (status === 'overdue' || days < 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
        GECİKTİ {Math.abs(days)}g
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
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
      {days} gün kaldı
    </span>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export async function CorporateTaxTab({ companyId }: CorporateTaxTabProps) {
  const supabase  = createClient()
  const dashboard = await new TaxComplianceService(supabase)
    .getDashboard(companyId)
    .catch(() => null)

  if (!dashboard) {
    return (
      <div className="rounded-lg border border-[#e8eaef] bg-white px-5 py-10 text-center">
        <p className="text-sm font-semibold text-[#334155]">Vergi takvimi verisi yüklenemedi.</p>
        <p className="text-xs text-[#94a3b8] mt-1">Lütfen sayfayı yenileyin veya daha sonra tekrar deneyin.</p>
      </div>
    )
  }

  const today        = dashboard.as_of_date
  const year         = parseInt(today.slice(0, 4), 10)
  const geciciSched  = dashboard.obligations.filter(o => o.obligation_type === 'gecici_vergi')
  const calendar     = dashboard.obligations
    .filter(o => o.days_until_due >= 0 && o.days_until_due <= 90)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
  const paidTry      = geciciSched
    .filter(o => o.status === 'paid')
    .reduce((s, o) => s + (o.amount_try ?? 0), 0)

  return (
    <div className="space-y-5">

      {/* ── ANNUAL SUMMARY CARD ─────────────────────────────────────────────── */}
      <div className="rounded-lg border border-[#e8eaef] bg-white overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#e8eaef] bg-[#f8fafc]">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">
                Kurumlar Vergisi
              </div>
              <h2 className="text-base font-black text-[#0f172a]">
                KURUMLAR VERGİSİ {year}
              </h2>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-[0.65rem] text-[#94a3b8] uppercase tracking-wide">YTD Vergi Karşılığı</div>
                <div className="text-xl font-black text-[#0f172a]">{fmtTRY(dashboard.corporate_tax_provision_try)}</div>
              </div>
              <div className="text-right">
                <div className="text-[0.65rem] text-[#94a3b8] uppercase tracking-wide">Uyum Skoru</div>
                <div className="text-xl font-black text-[#0f172a]">{dashboard.compliance_score} / 100</div>
              </div>
            </div>
          </div>
        </div>

        {/* Quarterly Schedule */}
        <div className="px-5 py-4">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
            Geçici Vergi Takvimi
          </div>
          {geciciSched.length === 0 ? (
            <p className="text-sm text-[#94a3b8]">Bu yıl için geçici vergi yükümlülüğü bulunmuyor.</p>
          ) : (
            <div className="space-y-2">
              {geciciSched.map((q) => (
                <div
                  key={q.obligation_id}
                  className="flex items-center justify-between gap-3 py-2 border-b border-[#f1f5f9] last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-[#64748b] w-7">{quarterOf(q)}</span>
                    <span className="text-sm text-[#334155]">{fmtDate(q.due_date)} {q.due_date.slice(0, 4)}</span>
                    <span className="text-sm font-semibold text-[#0f172a]">
                      {q.amount_try != null ? fmtTRY(q.amount_try) : '—'}
                    </span>
                  </div>
                  <StatusBadge status={q.status} days={q.days_until_due} />
                </div>
              ))}
            </div>
          )}

          {/* Totals row */}
          <div className="mt-3 pt-3 border-t border-[#e8eaef] flex items-center justify-between text-sm">
            <span className="text-[#64748b]">
              Ödenen: <span className="font-semibold text-[#0f172a]">{fmtTRY(paidTry)}</span>
            </span>
            <span className="text-[#64748b]">
              Bekleyen: <span className="font-semibold text-[#0f172a]">{fmtTRY(dashboard.total_pending_try)}</span>
            </span>
          </div>
        </div>
      </div>

      {/* ── UPCOMING 90-DAY CALENDAR ──────────────────────────────────────────── */}
      <div className="rounded-lg border border-[#e8eaef] bg-white overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#e8eaef] bg-[#f8fafc]">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">
            Vergi Takvimi
          </div>
          <h2 className="text-base font-black text-[#0f172a]">Sonraki 90 Gün</h2>
        </div>
        <div className="px-5 py-4">
          {calendar.length === 0 ? (
            <p className="text-sm text-[#94a3b8]">Önümüzdeki 90 gün içinde vergi yükümlülüğü bulunmuyor.</p>
          ) : (
            <div className="space-y-2">
              {calendar.map((ev) => (
                <div
                  key={ev.obligation_id}
                  className="flex items-center justify-between gap-3 py-2 border-b border-[#f1f5f9] last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-[#334155] w-14">
                      {fmtDate(ev.due_date)}
                    </span>
                    <span className="text-sm text-[#64748b]">→</span>
                    <span className="text-sm text-[#0f172a]">{ev.period_label}</span>
                  </div>
                  <span className={`text-xs font-medium ${ev.days_until_due <= 7 ? 'text-amber-600' : 'text-[#64748b]'}`}>
                    [{daysLabel(ev.days_until_due)}]
                  </span>
                </div>
              ))}
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

'use client'

// ─────────────────────────────────────────────────────────────────────────────
// PayablesManagementClient
//
// Borç Yönetimi (Accounts Payable Management)
//
// Displays:
//   - Overdue alert banner
//   - KPI cards: toplam borç / vadesi geçmiş / 7 gün / 30 gün
//   - DPO gauge with health badge
//   - Aging buckets bar chart
//   - Vendor profiles table
//   - Urgent payables queue
//   - Payables health badge
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }  from '@tanstack/react-query'
import { fmtTRY, fmtPct } from '@/lib/format'
import type {
  PayablesManagementReport,
  PayableItem,
  VendorPayableProfile,
} from '@/lib/services/finance/payables-management.service'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

// ── Health Badge ──────────────────────────────────────────────────────────────

type Health = 'healthy' | 'watch' | 'concern' | 'critical'

function HealthBadge({ value }: { value: Health }) {
  const cfg: Record<Health, { label: string; cls: string }> = {
    healthy:  { label: 'Sağlıklı',       cls: 'bg-[#dcfce7] text-[#166534] border-[#86efac]' },
    watch:    { label: 'İzleniyor',       cls: 'bg-[#fef9c3] text-[#854d0e] border-[#fde047]' },
    concern:  { label: 'Endişe Verici',   cls: 'bg-[#ffedd5] text-[#9a3412] border-[#fdba74]' },
    critical: { label: 'Kritik',          cls: 'bg-[#fee2e2] text-[#991b1b] border-[#fca5a5]' },
  }
  const c = cfg[value]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-bold ${c.cls}`}>
      {c.label}
    </span>
  )
}

// ── DPO Health Badge ──────────────────────────────────────────────────────────

type DpoHealth = 'excellent' | 'good' | 'adequate' | 'slow' | 'critical' | 'insufficient_data'

function DpoHealthBadge({ value }: { value: DpoHealth }) {
  const cfg: Record<DpoHealth, { label: string; cls: string }> = {
    excellent:         { label: 'Mükemmel (30-60g)',  cls: 'bg-[#dcfce7] text-[#166534] border-[#86efac]' },
    good:              { label: 'İyi',                cls: 'bg-[#d1fae5] text-[#065f46] border-[#6ee7b7]' },
    adequate:          { label: 'Yeterli',            cls: 'bg-[#fef9c3] text-[#854d0e] border-[#fde047]' },
    slow:              { label: 'Yavaş (>120g)',      cls: 'bg-[#ffedd5] text-[#9a3412] border-[#fdba74]' },
    critical:          { label: 'Kritik (<7g)',       cls: 'bg-[#fee2e2] text-[#991b1b] border-[#fca5a5]' },
    insufficient_data: { label: 'Veri Yetersiz',      cls: 'bg-[#f1f5f9] text-[#64748b] border-[#cbd5e1]' },
  }
  const c = cfg[value]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-bold ${c.cls}`}>
      {c.label}
    </span>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  alert,
}: {
  label: string
  value: string
  sub?: string
  alert?: boolean
}) {
  return (
    <div className={`rounded-xl border p-4 bg-white shadow-sm ${alert ? 'border-red-300 bg-red-50' : 'border-[#e2e8f0]'}`}>
      <p className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-black ${alert ? 'text-red-700' : 'text-[#0f172a]'}`}>{value}</p>
      {sub && <p className="text-[11px] text-[#94a3b8] mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Aging Bucket Bar ──────────────────────────────────────────────────────────

function AgingBucketBar({
  bucket,
}: {
  bucket: {
    label: string
    total_outstanding: number
    pct_of_total: number
    count: number
  }
}) {
  const barWidth = Math.min(100, bucket.pct_of_total)
  const isOverdue = bucket.label !== 'Vadesi Gelmemiş'

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] font-semibold text-[#374151]">{bucket.label}</span>
        <span className="text-[11px] text-[#6b7280]">
          {fmtTRY(bucket.total_outstanding)} · {bucket.count} kalem · %{bucket.pct_of_total.toFixed(1)}
        </span>
      </div>
      <div className="h-2.5 bg-[#f1f5f9] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${isOverdue ? 'bg-red-400' : 'bg-[#3b82f6]'}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PayablesManagementClient({ companyId }: Props) {
  const { data, isLoading, isError } = useQuery<{ report: PayablesManagementReport }>({
    queryKey: ['payables-management', companyId],
    queryFn:  () => fetch(`/api/finance/payables-management?company_id=${companyId}`).then(r => r.json()),
    staleTime: 300_000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-[#94a3b8] text-sm">
        Borç verileri yükleniyor…
      </div>
    )
  }

  if (isError || !data?.report) {
    return (
      <div className="flex items-center justify-center py-16 text-red-500 text-sm">
        Borç yönetimi verileri yüklenemedi.
      </div>
    )
  }

  const r = data.report

  return (
    <div className="space-y-6 p-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-[#0f172a]">Borç Yönetimi</h2>
          <p className="text-[12px] text-[#94a3b8] mt-0.5">
            {r.as_of_date} itibarıyla · {r.payable_items.length} kalem
          </p>
        </div>
        <HealthBadge value={r.payables_health} />
      </div>

      {/* ── Overdue Alert Banner ── */}
      {r.overdue_amount_try > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <span className="text-red-500 text-lg mt-0.5">⚠</span>
          <div>
            <p className="text-[13px] font-bold text-red-800">Vadesi Geçmiş Ödeme Uyarısı</p>
            <p className="text-[12px] text-red-700 mt-0.5">{r.narrative}</p>
          </div>
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Toplam Açık Borç"
          value={fmtTRY(r.total_outstanding_try)}
          sub={`${r.payable_items.length} kalem`}
        />
        <KpiCard
          label="Vadesi Geçmiş"
          value={fmtTRY(r.overdue_amount_try)}
          sub={`%${r.overdue_pct.toFixed(1)} toplam`}
          alert={r.overdue_amount_try > 0}
        />
        <KpiCard
          label="7 Gün İçinde"
          value={fmtTRY(r.due_next_7_days)}
          sub="Nakit ihtiyacı"
        />
        <KpiCard
          label="30 Gün İçinde"
          value={fmtTRY(r.due_next_30_days)}
          sub="Yaklaşan ödemeler"
        />
      </div>

      {/* ── DPO Section ── */}
      <div className="rounded-xl border border-[#e2e8f0] bg-white shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[13px] font-bold text-[#374151]">Borç Ödeme Süresi (DPO)</h3>
          <DpoHealthBadge value={r.dpo_health} />
        </div>
        <div className="flex items-center gap-4">
          <span className="text-3xl font-black text-[#0f172a]">
            {r.dpo !== null ? `${r.dpo.toFixed(0)}` : '—'}
          </span>
          <span className="text-[12px] text-[#6b7280]">
            {r.dpo !== null ? 'gün ortalama ödeme süresi' : 'Hesaplamak için yeterli veri yok'}
          </span>
        </div>
        <p className="text-[11px] text-[#94a3b8] mt-2">
          Türk KOBİ için optimal DPO: 30-60 gün
        </p>
      </div>

      {/* ── Aging Buckets ── */}
      <div className="rounded-xl border border-[#e2e8f0] bg-white shadow-sm p-4">
        <h3 className="text-[13px] font-bold text-[#374151] mb-4">Borç Yaşlandırma Analizi</h3>
        {r.aging_buckets.map(bucket => (
          <AgingBucketBar key={bucket.label} bucket={bucket} />
        ))}
        {r.aging_buckets.every(b => b.count === 0) && (
          <p className="text-[12px] text-[#94a3b8] text-center py-4">Açık borç kalemi bulunamadı.</p>
        )}
      </div>

      {/* ── Top Urgent Payables Queue ── */}
      {r.top_urgent_payables.length > 0 && (
        <div className="rounded-xl border border-[#e2e8f0] bg-white shadow-sm p-4">
          <h3 className="text-[13px] font-bold text-[#374151] mb-3">Acil Ödeme Sırası</h3>
          <div className="space-y-2">
            {r.top_urgent_payables.map((p) => (
              <UrgentPayableRow key={p.id} item={p} />
            ))}
          </div>
        </div>
      )}

      {/* ── Vendor Profiles Table ── */}
      {r.vendor_profiles.length > 0 && (
        <div className="rounded-xl border border-[#e2e8f0] bg-white shadow-sm p-4">
          <h3 className="text-[13px] font-bold text-[#374151] mb-3">Tedarikçi Profilleri</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[#f1f5f9]">
                  <th className="text-left py-2 text-[#64748b] font-semibold">Tedarikçi</th>
                  <th className="text-right py-2 text-[#64748b] font-semibold">Toplam Borç</th>
                  <th className="text-right py-2 text-[#64748b] font-semibold">Gecikmiş</th>
                  <th className="text-right py-2 text-[#64748b] font-semibold">30g İçinde</th>
                  <th className="text-right py-2 text-[#64748b] font-semibold">Kalem</th>
                  <th className="text-right py-2 text-[#64748b] font-semibold">En Eski</th>
                </tr>
              </thead>
              <tbody>
                {r.vendor_profiles.map((v) => (
                  <VendorRow key={v.vendor_name} vendor={v} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Empty State ── */}
      {r.payable_items.length === 0 && (
        <div className="rounded-xl border border-[#e2e8f0] bg-white shadow-sm p-8 text-center">
          <p className="text-[#94a3b8] text-sm">Açık borç kalemi bulunamadı.</p>
        </div>
      )}
    </div>
  )
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function UrgentPayableRow({
  item,
}: {
  item: PayableItem & { urgency_score: number }
}) {
  const isOverdue = item.days_until_due !== null && item.days_until_due < 0

  return (
    <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${isOverdue ? 'bg-red-50 border border-red-100' : 'bg-[#f8fafc] border border-[#e2e8f0]'}`}>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold text-[#1e293b] truncate">
          {item.vendor_name ?? 'Bilinmeyen Tedarikçi'}
        </p>
        <p className="text-[11px] text-[#94a3b8]">
          {item.category ?? item.source === 'purchase' ? 'Satın Alma' : 'Gider'}
          {item.due_date ? ` · Vade: ${item.due_date}` : ''}
          {isOverdue && item.days_until_due !== null
            ? ` · ${Math.abs(item.days_until_due)} gün gecikmiş`
            : ''}
        </p>
      </div>
      <div className="text-right ml-3 flex-shrink-0">
        <p className={`text-[13px] font-black ${isOverdue ? 'text-red-700' : 'text-[#0f172a]'}`}>
          {fmtTRY(item.outstanding_try)}
        </p>
        <p className="text-[10px] text-[#94a3b8]">
          Öncelik: {item.urgency_score}
        </p>
      </div>
    </div>
  )
}

function VendorRow({ vendor }: { vendor: VendorPayableProfile }) {
  return (
    <tr className="border-b border-[#f8fafc] hover:bg-[#f8fafc] transition-colors">
      <td className="py-2 font-medium text-[#1e293b]">{vendor.vendor_name}</td>
      <td className="py-2 text-right font-bold text-[#0f172a]">{fmtTRY(vendor.total_outstanding)}</td>
      <td className={`py-2 text-right font-semibold ${vendor.overdue_amount > 0 ? 'text-red-600' : 'text-[#94a3b8]'}`}>
        {vendor.overdue_amount > 0 ? fmtTRY(vendor.overdue_amount) : '—'}
      </td>
      <td className="py-2 text-right text-[#6b7280]">
        {vendor.upcoming_amount > 0 ? fmtTRY(vendor.upcoming_amount) : '—'}
      </td>
      <td className="py-2 text-right text-[#6b7280]">{vendor.payable_count}</td>
      <td className="py-2 text-right text-[#6b7280]">
        {vendor.oldest_payable_days > 0 ? `${vendor.oldest_payable_days}g` : '—'}
      </td>
    </tr>
  )
}

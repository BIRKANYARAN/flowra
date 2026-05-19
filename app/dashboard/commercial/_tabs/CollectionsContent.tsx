// ── CollectionsContent — Commercial hub / collections tab ─────────────────────

import Link from 'next/link'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase-server'
import CollectionsClient, { type CollectionRow } from '@/app/dashboard/collections/CollectionsClient'
import { CollectionsCommandBar } from '@/app/dashboard/collections/_components/CollectionsCommandBar'
import { fmtTRY as fmt } from '@/lib/format'

function CommandBarSkeleton() {
  return (
    <div className="flex items-center gap-2 animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-8 w-28 bg-gray-100 rounded" />
      ))}
    </div>
  )
}

interface AgingBucket { label: string; count: number; total: number; color: string; sub: string }

function AgingStrip({ buckets, grandTotal }: { buckets: AgingBucket[]; grandTotal: number }) {
  if (grandTotal === 0) return null
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 bg-white border border-gray-100 rounded overflow-hidden shadow-sm">
      {buckets.map((b, i) => (
        <div key={b.label} className={`p-3 ${i < 3 ? 'border-b sm:border-b-0 sm:border-r border-gray-100' : ''}`}>
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{b.label}</div>
          <div className={`text-lg font-black tabular-nums leading-none ${b.color}`}>
            {b.total > 0 ? fmt(b.total) : '—'}
          </div>
          <div className="text-[10px] text-gray-400 mt-1">{b.sub}</div>
        </div>
      ))}
    </div>
  )
}

interface Props { companyId: string }

export async function CollectionsContent({ companyId }: Props) {
  const supabase = createClient()
  const today    = new Date().toISOString().slice(0, 10)

  const [rowsRes, agingRes] = await Promise.all([
    supabase
      .from('sales')
      .select('id, customer_name, currency, total_try:total, sale_date, created_at, due_date, amount_paid:paid_amount, proforma_id, payment_status, paid_at, proformas(proforma_no)')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('payment_status', ['pending', 'partial', 'overdue'])
      .order('sale_date', { ascending: false })
      .range(0, 49),

    // Full dataset for aging + debtor ranking — lightweight select
    supabase
      .from('sales')
      .select('customer_name, total:total, paid_amount, due_date, sale_date')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('payment_status', ['pending', 'partial', 'overdue']),
  ])

  const initialRows: CollectionRow[] = (rowsRes.data ?? []).map(r => ({
    id:             r.id,
    customer_name:  r.customer_name,
    currency:       r.currency,
    total:          r.total_try,
    total_try:      r.total_try,
    sale_date:      r.sale_date,
    created_at:     r.created_at,
    due_date:       r.due_date,
    amount_paid:    r.amount_paid,
    proforma_id:    r.proforma_id,
    payment_status: r.payment_status as CollectionRow['payment_status'],
    paid_at:        r.paid_at,
    proformas:      (Array.isArray(r.proformas) ? r.proformas[0] ?? null : r.proformas) as CollectionRow['proformas'],
  }))

  // ── Aging computation ──────────────────────────────────────────────────────
  const bucketData = [
    { label: 'Güncel (0-30g)',    maxDays: 30,  count: 0, total: 0, color: 'text-amber-700',   sub: '' },
    { label: '31-60 Gün',         maxDays: 60,  count: 0, total: 0, color: 'text-orange-700',  sub: '' },
    { label: '61-90 Gün',         maxDays: 90,  count: 0, total: 0, color: 'text-red-600',     sub: '' },
    { label: '90+ Gün (Kritik)',  maxDays: Infinity, count: 0, total: 0, color: 'text-red-800 font-black', sub: '' },
  ]

  let grandTotal = 0

  for (const row of (agingRes.data ?? [])) {
    const remaining = Math.max(0, Number(row.total ?? 0) - Number(row.paid_amount ?? 0))
    if (remaining <= 0) continue

    // Reference date: use due_date if set, else sale_date; compare against today
    const refDate = (row.due_date ?? row.sale_date ?? '') as string
    const daysOverdue = refDate
      ? Math.max(0, Math.round((new Date(today).getTime() - new Date(refDate.slice(0, 10)).getTime()) / 86_400_000))
      : 0

    const bucketIdx = daysOverdue <= 30 ? 0 : daysOverdue <= 60 ? 1 : daysOverdue <= 90 ? 2 : 3
    bucketData[bucketIdx].count += 1
    bucketData[bucketIdx].total += remaining
    grandTotal += remaining
  }

  const agingBuckets: AgingBucket[] = bucketData.map(b => ({
    label: b.label,
    count: b.count,
    total: b.total,
    color: b.color,
    sub:   b.count > 0 ? `${b.count} fatura` : 'Yok',
  }))

  // ── Top outstanding debtors ────────────────────────────────────────────────
  const debtorMap = new Map<string, { total: number; count: number; maxDays: number }>()
  for (const row of (agingRes.data ?? [])) {
    const remaining = Math.max(0, Number(row.total ?? 0) - Number(row.paid_amount ?? 0))
    if (remaining <= 0) continue
    const name = ((row as { customer_name?: string | null }).customer_name) ?? 'Bilinmiyor'
    const refDate = (((row as { due_date?: string | null }).due_date ?? (row as { sale_date?: string | null }).sale_date) ?? '') as string
    const daysOverdue = refDate
      ? Math.max(0, Math.round((new Date(today).getTime() - new Date(refDate.slice(0, 10)).getTime()) / 86_400_000))
      : 0
    const prev = debtorMap.get(name) ?? { total: 0, count: 0, maxDays: 0 }
    debtorMap.set(name, {
      total: prev.total + remaining,
      count: prev.count + 1,
      maxDays: Math.max(prev.maxDays, daysOverdue),
    })
  }
  const topDebtors = Array.from(debtorMap.entries())
    .map(([name, d]) => ({ name, ...d }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
  const maxDebtorTotal = topDebtors[0]?.total ?? 1

  // ── Alert thresholds ─────────────────────────────────────────────────────────
  const overdue90Total      = agingBuckets[3]?.total ?? 0
  const overdue90Count      = agingBuckets[3]?.count ?? 0
  const topDebtorShare      = grandTotal > 0 && topDebtors.length > 0 ? topDebtors[0].total / grandTotal : 0
  const overdue60PlusTotal  = (agingBuckets[2]?.total ?? 0) + overdue90Total
  const criticalRate        = grandTotal > 0 ? overdue60PlusTotal / grandTotal : 0

  return (
    <div className="max-w-5xl space-y-3">
      <Suspense fallback={<CommandBarSkeleton />}>
        <CollectionsCommandBar companyId={companyId} />
      </Suspense>

      {/* 90+ day overdue critical alert */}
      {overdue90Total > 0 && (
        <div className="bg-red-50 border border-red-200 rounded px-4 py-3 flex items-start gap-3">
          <span className="text-base mt-0.5">🔴</span>
          <div className="flex-1">
            <div className="text-[11px] font-black uppercase tracking-wide text-red-800">
              90+ Gün Vadesi Geçmiş — {overdue90Count} Fatura
            </div>
            <div className="text-xs text-red-700 mt-0.5">
              <strong>{fmt(overdue90Total)}</strong> tutarında alacak 90 günü aşmış.
              Hukuki süreç veya şüpheli alacak karşılığı değerlendirilmeli.
            </div>
          </div>
          <Link href="/dashboard/finance?tab=risks" className="text-[10px] font-bold text-red-700 hover:text-red-800 underline underline-offset-2 shrink-0 mt-0.5 whitespace-nowrap">
            Risk Analizi →
          </Link>
        </div>
      )}

      {/* High debtor concentration alert (top debtor > 40% of total outstanding) */}
      {topDebtorShare > 0.40 && grandTotal > 0 && (
        <div className={`rounded border px-4 py-3 flex items-start gap-3 ${
          topDebtorShare > 0.60 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
        }`}>
          <span className="text-base mt-0.5">⚠</span>
          <div className="flex-1">
            <div className={`text-[11px] font-black uppercase tracking-wide ${topDebtorShare > 0.60 ? 'text-red-800' : 'text-amber-800'}`}>
              Tahsilat Konsantrasyonu — {topDebtors[0].name}
            </div>
            <div className={`text-xs mt-0.5 ${topDebtorShare > 0.60 ? 'text-red-700' : 'text-amber-700'}`}>
              Bu müşteri toplam açık alacağın <strong>%{Math.round(topDebtorShare * 100)}'ini</strong> oluşturuyor ({fmt(topDebtors[0].total)}).
              {topDebtors[0].maxDays > 60 && ` ${topDebtors[0].maxDays} gündür ödeme bekliyor.`}
            </div>
          </div>
        </div>
      )}

      {/* 60+ day overdue rate warning (only if no 90+ critical already shown) */}
      {overdue90Total === 0 && criticalRate > 0.30 && grandTotal > 0 && (
        <div className="bg-orange-50 border border-orange-300 rounded px-4 py-3 flex items-start gap-3">
          <span className="text-base mt-0.5">⚠</span>
          <div className="flex-1">
            <div className="text-[11px] font-black uppercase tracking-wide text-orange-800">
              Tahsilat Yaşlanıyor — %{Math.round(criticalRate * 100)} Gecikmiş
            </div>
            <div className="text-xs text-orange-700 mt-0.5">
              Açık alacakların {fmt(overdue60PlusTotal)} tutarındaki kısmı 60 günü aşmış.
              Tahsilat sürecini hızlandırın.
            </div>
          </div>
        </div>
      )}

      {/* Aging KPI strip */}
      <AgingStrip buckets={agingBuckets} grandTotal={grandTotal} />

      {/* Top outstanding debtors */}
      {topDebtors.length > 0 && grandTotal > 0 && (
        <div className="bg-white border border-gray-100 rounded p-4 shadow-sm">
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">En Yüksek Bakiyeli Müşteriler</div>
          <div className="space-y-2.5">
            {topDebtors.map(d => {
              const barPct   = (d.total / maxDebtorTotal) * 100
              const sharePct = grandTotal > 0 ? (d.total / grandTotal) * 100 : 0
              const urgency  = d.maxDays > 60 ? 'text-red-600' : d.maxDays > 30 ? 'text-amber-600' : 'text-gray-400'
              return (
                <div key={d.name} className="flex items-center gap-3">
                  <div className="w-32 text-xs text-gray-700 font-medium shrink-0 truncate" title={d.name}>{d.name}</div>
                  <div className="flex-1">
                    <div className="h-5 bg-gray-100 rounded overflow-hidden">
                      <div
                        className={`h-5 rounded ${d.maxDays > 60 ? 'bg-red-400' : d.maxDays > 30 ? 'bg-amber-400' : 'bg-primary-400'}`}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                  <div className="w-36 text-right shrink-0">
                    <span className="text-xs font-bold tabular-nums text-gray-800">{fmt(d.total)}</span>
                    <span className="text-[10px] text-gray-400 ml-1">%{sharePct.toFixed(0)}</span>
                    {d.maxDays > 0 && (
                      <span className={`text-[9px] ml-1 font-semibold ${urgency}`}>{d.maxDays}g</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-3 text-[9px] text-gray-300">
            Bar rengi: kırmızı = 60+ gün · sarı = 30–60 gün · mavi = güncel
          </div>
        </div>
      )}

      <CollectionsClient initialRows={initialRows} />

      {/* Cross-navigation */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] text-gray-400 leading-relaxed">
          Tahsilat yaşlandırması alacak risk analizinin temelini oluşturur.
        </p>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <Link
            href="/dashboard/commercial?tab=customers"
            className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap"
          >
            Müşteri Riskleri →
          </Link>
          <span className="text-gray-200">|</span>
          <Link
            href="/dashboard/finance?tab=risks"
            className="text-[11px] font-bold text-primary-600 hover:text-primary-700 underline underline-offset-2 whitespace-nowrap"
          >
            Alacak Risk Analizi →
          </Link>
        </div>
      </div>
    </div>
  )
}

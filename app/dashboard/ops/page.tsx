// ── /dashboard/ops — OPS Komuta Merkezi ──────────────────────────────────────
//
// Server component. Real-time daily operations command center.
// Shows: overdue collections, critical stock, open purchase orders,
//        pending workflow approvals, today's sales summary.
//
// No client state needed — everything is SSR with parallel Supabase queries.

export const dynamic = 'force-dynamic'

import Link             from 'next/link'
import { Suspense }     from 'react'
import { createClient } from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import { fmtTRY, fmtDate } from '@/lib/format'

// ── Type helpers ──────────────────────────────────────────────────────────────

type PaymentStatus = 'unpaid' | 'partial' | 'overdue' | 'paid'

interface OverdueSale {
  id:             string
  total_try:      number
  amount_paid:    number | null
  payment_status: PaymentStatus
  due_date:       string | null
  sale_date:      string
  customers:      { name: string } | null
}

interface StockRow {
  product_id: string
  qty:        number
  name:       string
  sku:        string | null
  unit:       string
}

interface PendingWorkflow {
  id:            string
  workflow_type: string
  resource_type: string | null
  created_at:    string
  payload:       Record<string, unknown> | null
}

interface OpenOrder {
  id:            string
  supplier_name: string
  total_try:     number | null
  status:        'draft' | 'ordered'
  order_date:    string
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function daysOverdue(dueDateStr: string | null, saleDateStr: string): number {
  const ref  = dueDateStr ?? saleDateStr
  const diff = Date.now() - new Date(ref).getTime()
  return Math.max(0, Math.floor(diff / 86_400_000))
}

const WFLOW_LABEL: Record<string, string> = {
  large_expense:   'Büyük Masraf Onayı',
  partner_loan:    'Ortak Borç Girişi',
  dividend_declare:'Temettü Beyanı',
  period_close:    'Dönem Kapanışı',
}

const STATUS_LABEL: Record<string, string> = {
  draft:   'Taslak',
  ordered: 'Sipariş Verildi',
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, tone = 'neutral', href,
}: {
  label: string; value: string; sub?: string
  tone?: 'ok' | 'warn' | 'critical' | 'neutral'
  href?: string
}) {
  const valueColor = {
    ok:       'text-pos-text',
    warn:     'text-warn-text',
    critical: 'text-neg',
    neutral:  'text-[#0f172a]',
  }[tone]

  const inner = (
    <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 hover:border-[#e2e8f0] transition-colors">
      <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{label}</div>
      <div className={`text-xl font-black tabular-nums leading-none ${valueColor}`}>{value}</div>
      {sub && <div className="text-[10px] text-[#94a3b8] mt-1">{sub}</div>}
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

// ── Section title ─────────────────────────────────────────────────────────────

function SectionTitle({ label, count, href }: { label: string; count?: number; href: string }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        <h2 className="text-xs font-black uppercase tracking-widest text-[#64748b]">{label}</h2>
        {count !== undefined && count > 0 && (
          <span className="text-[10px] font-bold bg-neg-light text-neg-text rounded px-1.5 py-0.5">{count}</span>
        )}
      </div>
      <Link href={href} className="text-[10px] font-semibold text-brand-light hover:text-brand">
        Tümünü Gör →
      </Link>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyRow({ message }: { message: string }) {
  return (
    <div className="px-4 py-4 text-xs text-[#94a3b8] text-center">{message}</div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function OpsCommandPage() {
  const supabase = createClient()

  let userId: string | null = null
  try {
    const { data, error } = await supabase.auth.getUser()
    if (!error && data?.user) userId = data.user.id
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
  }
  if (!userId) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
      <div className="text-3xl">⚠️</div>
      <p className="text-sm text-[#64748b]">Oturum bilgisi alınamadı. Lütfen sayfayı yenileyin.</p>
      <a href="/dashboard/ops" className="text-sm text-brand-light font-semibold hover:underline">Yeniden Dene</a>
    </div>
  )

  let companyId: string | null = null
  try { companyId = await resolveCompanyId(userId, supabase) } catch { /* non-fatal */ }
  if (!companyId) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
      <div className="text-3xl">⚠️</div>
      <p className="text-sm text-[#64748b]">Şirket bilgisi yüklenemedi. Lütfen sayfayı yenileyin.</p>
      <a href="/dashboard/ops" className="text-sm text-brand-light font-semibold hover:underline">Yeniden Dene</a>
    </div>
  )

  const todayISO = new Date().toISOString().slice(0, 10)

  // ── Parallel data fetching ─────────────────────────────────────────────────
  const [
    overdueRes,
    todaySalesRes,
    stockLotsRes,
    productsRes,
    pendingRes,
    openOrdersRes,
  ] = await Promise.allSettled([
    // Overdue / unpaid collections (top 5 most urgent)
    supabase
      .from('sales')
      .select('id, total_try:total, amount_paid:paid_amount, payment_status, due_date, sale_date, customers(name)')
      .eq('company_id', companyId)
      .in('payment_status', ['unpaid', 'partial', 'overdue'])
      .is('deleted_at', null)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(5),

    // Today's confirmed sales
    supabase
      .from('sales')
      .select('id, total_try:total, payment_status')
      .eq('company_id', companyId)
      .gte('sale_date', todayISO)
      .is('deleted_at', null),

    // Stock lots — aggregate per product
    supabase
      .from('stock_lots')
      .select('product_id, qty_remaining')
      .eq('company_id', companyId)
      .gt('qty_remaining', 0),

    // Products catalog (for name + sku lookup)
    supabase
      .from('products')
      .select('id, name, sku, unit')
      .eq('company_id', companyId)
      .is('deleted_at', null),

    // Pending workflow approvals
    supabase
      .from('workflow_instances')
      .select('id, workflow_type, resource_type, created_at, payload')
      .eq('company_id', companyId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(5),

    // Open purchase orders (draft + ordered)
    supabase
      .from('purchase_orders')
      .select('id, supplier_name, total_try, status, order_date')
      .eq('company_id', companyId)
      .in('status', ['draft', 'ordered'])
      .is('deleted_at', null)
      .order('order_date', { ascending: false })
      .limit(5),
  ])

  // ── Extract results safely ─────────────────────────────────────────────────
  const overdue   = (overdueRes.status   === 'fulfilled' ? overdueRes.value.data   : null) as OverdueSale[] | null
  const todaySales = (todaySalesRes.status === 'fulfilled' ? todaySalesRes.value.data : null) as { id: string; total_try: number; payment_status: string }[] | null
  const stockLots  = (stockLotsRes.status === 'fulfilled' ? stockLotsRes.value.data  : null) as { product_id: string; qty_remaining: number }[] | null
  const products   = (productsRes.status  === 'fulfilled' ? productsRes.value.data   : null) as { id: string; name: string; sku: string | null; unit: string }[] | null
  const pending    = (pendingRes.status   === 'fulfilled' ? pendingRes.value.data     : null) as PendingWorkflow[] | null
  const openOrders = (openOrdersRes.status=== 'fulfilled' ? openOrdersRes.value.data  : null) as OpenOrder[] | null

  // ── Derived KPIs ──────────────────────────────────────────────────────────
  const todayCount  = todaySales?.length ?? 0
  const todayRevenue = (todaySales ?? []).reduce((s, r) => s + (r.total_try ?? 0), 0)
  const overdueCount = overdue?.length ?? 0
  const pendingCount = pending?.length ?? 0
  const openOrderCount = openOrders?.length ?? 0

  // Low stock: products where total qty_remaining ≤ 5
  const qtyByProduct: Record<string, number> = {}
  for (const lot of stockLots ?? []) {
    qtyByProduct[lot.product_id] = (qtyByProduct[lot.product_id] ?? 0) + lot.qty_remaining
  }
  const productMap: Record<string, { name: string; sku: string | null; unit: string }> = {}
  for (const p of products ?? []) productMap[p.id] = { name: p.name, sku: p.sku, unit: p.unit }

  const lowStock: StockRow[] = Object.entries(qtyByProduct)
    .filter(([, qty]) => qty <= 5)
    .sort(([, a], [, b]) => a - b)
    .slice(0, 5)
    .map(([pid, qty]) => ({
      product_id: pid,
      qty,
      name: productMap[pid]?.name  ?? '—',
      sku:  productMap[pid]?.sku   ?? null,
      unit: productMap[pid]?.unit  ?? 'adet',
    }))

  const todayDate = new Date().toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric', weekday: 'long',
  })

  return (
    <div className="max-w-5xl space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-lg font-black text-[#0f172a] tracking-tight">OPS Komuta</h1>
          <p className="text-xs text-[#94a3b8] mt-0.5">{todayDate}</p>
        </div>
        <Link href="/dashboard/commercial?tab=sales"
          className="text-xs font-semibold text-brand-light hover:text-brand">
          Yeni Satış →
        </Link>
      </div>

      {/* ── KPI Strip ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        <KpiCard
          label="Bugünkü Satışlar"
          value={todayCount > 0 ? `${todayCount} satış` : '—'}
          sub={todayCount > 0 ? fmtTRY(todayRevenue) : 'Henüz satış yok'}
          tone={todayCount > 0 ? 'ok' : 'neutral'}
          href="/dashboard/commercial?tab=sales"
        />
        <KpiCard
          label="Vadesi Geçmiş"
          value={overdueCount > 0 ? `${overdueCount} tahsilat` : 'Temiz'}
          sub={overdueCount > 0 ? 'Acil aksiyon gerekiyor' : 'Gecikmiş alacak yok'}
          tone={overdueCount > 2 ? 'critical' : overdueCount > 0 ? 'warn' : 'ok'}
          href="/dashboard/commercial?tab=collections"
        />
        <KpiCard
          label="Açık Siparişler"
          value={openOrderCount > 0 ? `${openOrderCount} sipariş` : '—'}
          sub={openOrderCount > 0 ? 'Takip gerektiriyor' : 'Açık sipariş yok'}
          tone={openOrderCount > 0 ? 'warn' : 'neutral'}
          href="/dashboard/operations?tab=orders"
        />
        <KpiCard
          label="Onay Bekleyen"
          value={pendingCount > 0 ? `${pendingCount} işlem` : 'Temiz'}
          sub={pendingCount > 0 ? 'Aksiyon gerektiriyor' : 'Bekleyen onay yok'}
          tone={pendingCount > 0 ? 'warn' : 'ok'}
          href="/dashboard/admin/workflows"
        />
      </div>

      {/* ── Main content: two-column ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">

        {/* LEFT: Overdue collections */}
        <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <SectionTitle
              label="Vadesi Geçmiş Tahsilatlar"
              count={overdueCount}
              href="/dashboard/commercial?tab=collections"
            />
          </div>
          {(overdue ?? []).length === 0 ? (
            <EmptyRow message="Gecikmiş tahsilat yok" />
          ) : (
            <div className="divide-y divide-[#e2e8f0]">
              {(overdue as OverdueSale[]).map(s => {
                const remaining = (s.total_try ?? 0) - (s.amount_paid ?? 0)
                const days      = daysOverdue(s.due_date, s.sale_date)
                const tone      = days > 60 ? 'text-neg' : days > 30 ? 'text-warn-text' : 'text-[#334155]'
                return (
                  <div key={s.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-[#f8fafc]">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-[#1e293b] truncate">
                        {(s.customers as { name: string } | null)?.name ?? '—'}
                      </div>
                      <div className={`text-[10px] font-bold ${tone}`}>
                        {days} gün gecikmiş
                      </div>
                    </div>
                    <div className="text-sm font-black text-right ml-3 text-neg tabular-nums">
                      {fmtTRY(remaining)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div className="px-4 py-2 border-t border-[#e2e8f0]">
            <Link href="/dashboard/commercial?tab=collections"
              className="text-[10px] font-semibold text-brand-light hover:text-brand">
              Tam Tahsilat Listesi →
            </Link>
          </div>
        </div>

        {/* RIGHT: Critical stock */}
        <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <SectionTitle
              label="Kritik Stok Seviyeleri"
              count={lowStock.length}
              href="/dashboard/operations?tab=stock"
            />
          </div>
          {lowStock.length === 0 ? (
            <EmptyRow message="Tüm ürünlerde yeterli stok mevcut" />
          ) : (
            <div className="divide-y divide-[#e2e8f0]">
              {lowStock.map(p => (
                <div key={p.product_id}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-[#f8fafc]">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-[#1e293b] truncate">{p.name}</div>
                    {p.sku && (
                      <div className="text-[10px] text-[#94a3b8]">{p.sku}</div>
                    )}
                  </div>
                  <div className="ml-3 text-right">
                    <span className={`text-sm font-black tabular-nums ${
                      p.qty === 0 ? 'text-neg' : p.qty <= 2 ? 'text-warn' : 'text-warn-text'
                    }`}>
                      {p.qty} {p.unit}
                    </span>
                    {p.qty === 0 && (
                      <div className="text-[10px] font-bold text-neg mt-0.5">Tükendi</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="px-4 py-2 border-t border-[#e2e8f0]">
            <Link href="/dashboard/operations?tab=orders"
              className="text-[10px] font-semibold text-brand-light hover:text-brand">
              Satın Alma Emri Ver →
            </Link>
          </div>
        </div>
      </div>

      {/* ── Open purchase orders ─────────────────────────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <SectionTitle
            label="Açık Satın Alma Emirleri"
            count={openOrderCount}
            href="/dashboard/operations?tab=orders"
          />
        </div>
        {(openOrders ?? []).length === 0 ? (
          <EmptyRow message="Açık satın alma emri yok" />
        ) : (
          <div className="divide-y divide-[#e2e8f0]">
            {(openOrders as OpenOrder[]).map(o => (
              <div key={o.id}
                className="grid grid-cols-3 gap-4 items-center px-4 py-2.5 hover:bg-[#f8fafc]">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[#1e293b] truncate">{o.supplier_name}</div>
                  <div className="text-[10px] text-[#94a3b8]">{fmtDate(o.order_date)}</div>
                </div>
                <div className="text-center">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    o.status === 'ordered'
                      ? 'bg-info-light text-info-text'
                      : 'bg-[#f1f5f9] text-[#64748b]'
                  }`}>
                    {STATUS_LABEL[o.status] ?? o.status}
                  </span>
                </div>
                <div className="text-right text-sm font-black tabular-nums text-[#1e293b]">
                  {o.total_try != null ? fmtTRY(o.total_try) : '—'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Pending workflow approvals ───────────────────────────────────── */}
      {(pending ?? []).length > 0 && (
        <div className="bg-warn-light border border-warn-light rounded overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <SectionTitle
              label="Onay Bekleyen İşlemler"
              count={pendingCount}
              href="/dashboard/admin/workflows"
            />
          </div>
          <div className="divide-y divide-amber-100">
            {(pending as PendingWorkflow[]).map(w => (
              <div key={w.id}
                className="flex items-center justify-between px-4 py-2.5 hover:bg-warn-light/50">
                <div>
                  <div className="text-sm font-semibold text-warn-text">
                    {WFLOW_LABEL[w.workflow_type] ?? w.workflow_type}
                  </div>
                  <div className="text-[10px] text-warn-text">
                    {fmtDate(w.created_at)}
                  </div>
                </div>
                <Link href="/dashboard/admin/workflows"
                  className="text-[10px] font-bold text-warn-text bg-warn-light rounded px-3 py-1 hover:bg-warn transition-colors">
                  İncele
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Quick action links ───────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Proforma Oluştur',  href: '/dashboard/commercial?tab=proformas',  emoji: '📋' },
          { label: 'Gider Ekle',        href: '/dashboard/operations?tab=expenses',   emoji: '💸' },
          { label: 'Stok Güncelle',     href: '/dashboard/operations?tab=catalog',    emoji: '📦' },
          { label: 'Müşteri Listesi',   href: '/dashboard/commercial?tab=customers',  emoji: '👥' },
        ].map(({ label, href, emoji }) => (
          <Link key={href} href={href}
            className="bg-white border border-[#e2e8f0] rounded px-4 py-3 hover:border-[#e2e8f0] hover:bg-brand-subtle transition-colors flex items-center gap-2">
            <span className="text-lg">{emoji}</span>
            <span className="text-xs font-semibold text-[#334155]">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

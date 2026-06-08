// ── PipelineContent — Commercial hub / pipeline tab ──────────────────────────

import Link from 'next/link'
import { Suspense } from 'react'
import { NarrativeFooter } from '@/components/ds'
import { createClient } from '@/lib/supabase-server'
import PipelineVelocityClient from './_pipeline/PipelineVelocityClient'
import { DetailSection } from '@/components/dashboard/DetailSection'
import SalesFlowClient, {
  type Proforma,
  type Sale,
  type StockLot,
} from '@/app/dashboard/sales-flow/SalesFlowClient'
import { SalesFlowCommandBar } from '@/app/dashboard/sales-flow/_components/SalesFlowCommandBar'
import { fmtMonthShort as fmtMonth } from '@/lib/format'
import { detectRevenueAnomalies, type MonthlyRevenue } from '@/lib/engines/anomaly.engine'
import { SalesFunnelService, type FunnelStage } from '@/lib/services/commercial/sales-funnel.service'
import {
  computeConversionRate,
  computeAvgDealSize,
  classifyPipelineHealth,
  computePortfolioDiscountPressure,
} from '@/lib/services/finance/pricing-intelligence.service'

function CommandBarSkeleton() {
  return (
    <div className="flex items-center gap-2 animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-8 w-28 bg-[#f1f5f9] rounded" />
      ))}
    </div>
  )
}

function serverFmt(n: number): string {
  const abs  = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (abs >= 1_000_000)
    return `${sign}₺${(abs / 1_000_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}M`
  if (abs >= 10_000)
    return `${sign}₺${(abs / 1_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`
  return `${sign}₺${Math.abs(n).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Taslak', sent: 'Gönderildi', accepted: 'Onaylandı',
  rejected: 'Reddedildi', converted: 'Satışa Döndü',
}
const STATUS_COLOR: Record<string, string> = {
  draft:     'bg-[#f1f5f9] text-[#64748b]',
  sent:      'bg-info-light text-info-text',
  accepted:  'bg-pos-light text-pos-text',
  rejected:  'bg-neg-light text-neg',
  converted: 'bg-brand-subtle text-brand',
}

type ProformaWithFx = Proforma & { fx_try?: number | null }

interface Props { companyId: string }

export async function PipelineContent({ companyId }: Props) {
  const supabase = createClient()

  const [pfRes, salesRes, lotRes, funnelResult] = await Promise.all([
    supabase
      .from('proformas')
      .select('id, customer_name, status, total, fx_try, currency, created_at, updated_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('sales')
      .select('id, customer_name, total_try:total, payment_status, sale_date, created_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('sale_date', { ascending: false }),
    supabase
      .from('stock_lots')
      .select('qty_remaining, cost_price_try, product_name, lot_no, created_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gt('qty_remaining', 0),

    new SalesFunnelService(supabase).getReport(companyId).catch(() => null),
  ])

  const proformas = (pfRes.data  ?? []) as Proforma[]
  const stockLots = (lotRes.data ?? []) as unknown as StockLot[]
  const rawSales  = (salesRes.data ?? []) as (Omit<Sale, 'cost_try'> & { sale_date?: string | null })[]
  const sales: Sale[] = rawSales.map(r => ({
    id:             r.id,
    customer_name:  r.customer_name,
    total_try:      r.total_try,
    cost_try:       0, // cogs column does not exist on live DB
    payment_status: r.payment_status,
    sale_date:      r.sale_date ?? null,
    created_at:     r.created_at,
  }))

  const stockValue   = stockLots.reduce((s, l) => s + (Number(l.qty_remaining) || 0) * (Number((l as { cost_price_try?: number | null }).cost_price_try) || 0), 0)
  const pipelineVal  = proformas.filter(p => p.status === 'sent' || p.status === 'accepted').reduce((s, p) => s + (Number(p.total) || 0) * (Number((p as ProformaWithFx).fx_try) || 1), 0)
  const totalRevenue = sales.reduce((s, r) => s + (Number(r.total_try) || 0), 0)
  const totalCogs    = sales.reduce((s, r) => s + (Number(r.cost_try)  || 0), 0)
  const grossProfit  = totalRevenue - totalCogs

  // ── Pipeline analytics derived metrics ────────────────────────────────────
  const convertedCount  = proformas.filter(p => p.status === 'converted').length
  const totalPfCount    = proformas.length
  const conversionRate  = computeConversionRate(convertedCount, totalPfCount)
  const pfTotalValue    = proformas.reduce((s, p) => s + (Number(p.total) || 0) * (Number((p as ProformaWithFx).fx_try) || 1), 0)
  const avgDealSize     = computeAvgDealSize(pfTotalValue, totalPfCount)

  // Estimate avg cycle days from created_at → updated_at for converted proformas
  const convertedPfs = proformas.filter(p => p.status === 'converted')
  const avgCycleDays = convertedPfs.length > 0
    ? convertedPfs.reduce((s, p) => {
        const created = p.created_at ? new Date(p.created_at).getTime() : 0
        const updated = (p as Proforma & { updated_at?: string | null }).updated_at
          ? new Date((p as Proforma & { updated_at?: string | null }).updated_at!).getTime()
          : created
        return s + Math.max(0, (updated - created) / 86_400_000)
      }, 0) / convertedPfs.length
    : 30

  const pipelineHealth = classifyPipelineHealth(conversionRate, avgCycleDays)

  // Portfolio discount pressure from proformas (compare total vs fx_try-adjusted total)
  const portfolioDiscountItems = proformas
    .filter(p => Number(p.total) > 0)
    .map(p => ({
      list_price:      (Number(p.total) || 0) * (Number((p as ProformaWithFx).fx_try) || 1),
      effective_price: (Number(p.total) || 0) * (Number((p as ProformaWithFx).fx_try) || 1),
    }))
  const discountPressure = computePortfolioDiscountPressure(portfolioDiscountItems)

  // Status swimlane counts
  const pfByStatus: Record<string, number> = {
    draft:     proformas.filter(p => p.status === 'draft').length,
    sent:      proformas.filter(p => p.status === 'sent').length,
    accepted:  proformas.filter(p => p.status === 'accepted').length,
    converted: proformas.filter(p => p.status === 'converted').length,
    rejected:  proformas.filter(p => p.status === 'rejected').length,
  }

  const HEALTH_BADGE: Record<string, { label: string; cls: string }> = {
    strong:  { label: 'Güçlü',    cls: 'bg-pos-light text-pos-text' },
    healthy: { label: 'Sağlıklı', cls: 'bg-info-light text-info-text' },
    weak:    { label: 'Zayıf',    cls: 'bg-warn-light text-warn-text' },
    stalled: { label: 'Durgun',   cls: 'bg-neg-light text-neg' },
  }
  const healthBadge = HEALTH_BADGE[pipelineHealth]
  const grossMargin  = totalRevenue > 0 ? ((totalRevenue - totalCogs) / totalRevenue) * 100 : 0
  const unpaidTotal  = sales.filter(s => s.payment_status !== 'paid').reduce((s, r) => s + (Number(r.total_try) || 0), 0)
  const recentPf     = proformas.slice(0, 5)

  // ── Monthly revenue trend + anomaly detection ─────────────────────────────
  const revByMonth = new Map<string, number>()
  for (const s of sales) {
    const ym = ((s.sale_date ?? s.created_at) ?? '').slice(0, 7)
    if (!ym) continue
    revByMonth.set(ym, (revByMonth.get(ym) ?? 0) + (Number(s.total_try) || 0))
  }
  const monthlyRevenues: MonthlyRevenue[] = Array.from(revByMonth.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, revenue]) => ({ month, revenue }))
  const recentMonths = monthlyRevenues.slice(-6)
  const maxRevMonth  = Math.max(...recentMonths.map(m => m.revenue), 1)

  const revenueAnomalies = detectRevenueAnomalies(monthlyRevenues)
    .filter(a => a.severity === 'high')
    .slice(0, 3)

  const funnelReport = funnelResult ?? null
  const funnelStages = funnelReport?.stages ?? []
  const funnelMaxCount = Math.max(...funnelStages.map(s => s.count), 1)

  return (
    <div className="space-y-4">

      {/* ── TİCARİ BORU HATTI ANALİZİ ─────────────────────────────────────── */}
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">
        {/* Header */}
        <div className="px-4 py-2.5 border-b border-[#e8eaef] flex items-center justify-between">
          <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Ticari Boru Hattı Analizi
          </span>
          {healthBadge && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${healthBadge.cls}`}>
              {healthBadge.label}
            </span>
          )}
        </div>

        {/* KPI Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-[#f1f5f9] border-b border-[#e8eaef]">
          {[
            {
              label: 'Toplam Proforma',
              value: String(totalPfCount),
              sub:   `${convertedCount} dönüştürüldü`,
              color: 'text-[#0f172a]',
            },
            {
              label: 'Dönüşüm Oranı',
              value: `%${conversionRate.toFixed(0)}`,
              sub:   `${convertedCount} / ${totalPfCount}`,
              color: conversionRate >= 30 ? 'text-pos-text' : conversionRate >= 15 ? 'text-warn-text' : 'text-neg',
            },
            {
              label: 'Ort. Teklif Tutarı',
              value: avgDealSize > 0 ? serverFmt(avgDealSize) : '—',
              sub:   'teklif başına',
              color: 'text-info-text',
            },
            {
              label: 'Toplam Boru Hattı',
              value: pfTotalValue > 0 ? serverFmt(pfTotalValue) : '—',
              sub:   discountPressure > 0 ? `%${discountPressure.toFixed(1)} indirim baskısı` : 'indirim yok',
              color: 'text-[#0f172a]',
            },
          ].map((tile, i) => (
            <div key={tile.label} className="px-3 py-2.5">
              <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">{tile.label}</div>
              <div className={`text-xl font-black tabular-nums leading-none ${tile.color}`}>{tile.value}</div>
              <div className="text-[10px] text-[#94a3b8] mt-0.5">{tile.sub}</div>
            </div>
          ))}
        </div>

        {/* Status Swimlanes */}
        <div className="px-4 py-3 border-b border-[#f1f5f9]">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">Durum Özeti</div>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { key: 'draft',     label: 'Taslak',         cls: 'bg-[#f1f5f9] text-[#64748b]' },
              { key: 'sent',      label: 'Gönderildi',     cls: 'bg-info-light text-info-text' },
              { key: 'accepted',  label: 'Onaylandı',      cls: 'bg-pos-light text-pos-text' },
              { key: 'converted', label: 'Dönüştürüldü',   cls: 'bg-brand-subtle text-brand' },
              { key: 'rejected',  label: 'Süresi Geçmiş',  cls: 'bg-neg-light text-neg' },
            ].map(s => (
              <div key={s.key} className={`flex items-center gap-1.5 px-2.5 py-1 rounded ${s.cls}`}>
                <span className="text-[10px] font-bold">{s.label}</span>
                <span className="text-[10px] font-black tabular-nums">({pfByStatus[s.key] ?? 0})</span>
              </div>
            ))}
          </div>
          {/* Swimlane flow indicator */}
          <div className="flex items-center gap-1 mt-2 overflow-x-auto">
            {(['draft', 'sent', 'accepted', 'converted'] as const).map((key, idx) => (
              <div key={key} className="flex items-center gap-1 shrink-0">
                {idx > 0 && <span className="text-[#cbd5e1] text-xs">→</span>}
                <div className="text-center">
                  <div className="text-[9px] text-[#94a3b8] font-semibold">{STATUS_LABEL[key]}</div>
                  <div className="text-sm font-black text-[#1e293b] tabular-nums">{pfByStatus[key] ?? 0}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Proforma List */}
        {proformas.length > 0 ? (
          <div>
            <div className="px-4 py-2 border-b border-[#f1f5f9]">
              <span className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">Proforma Listesi</span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] border-b border-[#e8eaef]">
                  <th className="text-left px-4 py-2">Müşteri</th>
                  <th className="text-right px-4 py-2">Tutar</th>
                  <th className="text-left px-4 py-2">Durum</th>
                  <th className="text-right px-4 py-2">Oluşturma</th>
                  <th className="text-right px-4 py-2">İndirim %</th>
                  <th className="text-right px-4 py-2">Aksiyon</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f8fafc]">
                {proformas.slice(0, 8).map(p => {
                  const pfWithFx = p as ProformaWithFx
                  const tryTotal = (Number(p.total) || 0) * (Number(pfWithFx.fx_try) || 1)
                  return (
                    <tr key={p.id} className="hover:bg-[#f8fafc] transition-colors">
                      <td className="px-4 py-2.5 font-medium text-[#1e293b] max-w-[160px] truncate">
                        {p.customer_name ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-[#334155]">
                        {serverFmt(tryTotal)}
                        {p.currency && p.currency !== 'TRY' && (
                          <span className="text-[9px] text-[#94a3b8] ml-1">{p.currency}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${STATUS_COLOR[p.status] ?? 'bg-[#f1f5f9] text-[#64748b]'}`}>
                          {STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-[#94a3b8] tabular-nums">
                        {p.created_at
                          ? new Date(p.created_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[#94a3b8]">
                        —
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/dashboard/commercial/proformas/${p.id}`}
                            className="text-[10px] font-bold text-info-text hover:underline whitespace-nowrap"
                          >
                            Görüntüle
                          </Link>
                          {p.status === 'accepted' && (
                            <Link
                              href={`/dashboard/commercial/proformas/${p.id}/convert`}
                              className="text-[10px] font-bold text-brand hover:underline whitespace-nowrap ml-2"
                            >
                              Satışa Dönüştür
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 py-6 text-center text-[11px] text-[#94a3b8]">
            Henüz proforma kaydı bulunmuyor.
          </div>
        )}
      </div>

      {/* ── Pipeline Velocity Analysis (secondary — folded, lazy-mounts) ──── */}
      <DetailSection title="Proforma & Hız Analizi" subtitle="Kazanma oranı · yaşlandırma · dönüşüm hızı — son 90 gün">
        <PipelineVelocityClient companyId={companyId} />
      </DetailSection>

      <Suspense fallback={<CommandBarSkeleton />}>
        <SalesFlowCommandBar companyId={companyId} />
      </Suspense>

      {/* ── Satış Hunisi ─────────────────────────────────────────────────── */}
      {funnelReport && funnelStages.length > 0 && (
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">
          {/* Header */}
          <div className="px-4 py-2.5 border-b border-[#e8eaef] flex items-center justify-between">
            <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Satış Hunisi — {funnelReport.analysis_period === 'last_90_days' ? 'Son 90 Gün' : 'Son 30 Gün'}
            </span>
            {funnelReport.metrics.overall_conversion_rate > 0 && (
              <span className="text-[10px] font-bold text-brand">
                Genel dönüşüm: %{funnelReport.metrics.overall_conversion_rate.toFixed(1)}
              </span>
            )}
          </div>

          {/* Bottleneck alert */}
          {funnelReport.bottleneck_stage && (
            <div className="px-4 py-2 bg-warn-light border-b border-warn-light">
              <span className="text-[10px] font-bold text-warn-text">
                ⚠ Darboğaz: {funnelStages.find(s => s.stage_id === funnelReport.bottleneck_stage)?.stage_name ?? funnelReport.bottleneck_stage}
              </span>
            </div>
          )}

          {/* Funnel bars */}
          <div className="px-4 pt-4 pb-2 space-y-2">
            {funnelStages.map((stage: FunnelStage, idx: number) => {
              const barPct = funnelMaxCount > 0 ? Math.max(4, (stage.count / funnelMaxCount) * 100) : 4
              const prevStage = idx > 0 ? funnelStages[idx - 1] : null
              const convRate = prevStage && prevStage.count > 0
                ? (stage.count / prevStage.count) * 100
                : null
              return (
                <div key={stage.stage_id}>
                  {/* Conversion arrow between stages */}
                  {idx > 0 && convRate !== null && (
                    <div className="flex items-center gap-2 mb-1 ml-2">
                      <div className="w-3 h-3 text-[#94a3b8]">↓</div>
                      <span className={`text-[10px] font-bold ${
                        convRate >= 70 ? 'text-pos-text' :
                        convRate >= 50 ? 'text-warn-text' : 'text-neg'
                      }`}>
                        %{convRate.toFixed(0)} dönüşüm
                      </span>
                    </div>
                  )}
                  {/* Stage row */}
                  <div className="flex items-center gap-3">
                    <div className="w-36 shrink-0">
                      <div className="text-[10px] font-semibold text-[#334155] truncate">{stage.stage_name}</div>
                      <div className="text-[9px] text-[#94a3b8]">{stage.count} kayıt</div>
                    </div>
                    <div className="flex-1 h-6 bg-[#f8fafc] rounded overflow-hidden">
                      <div
                        className={`h-full rounded transition-all ${
                          idx === 0 ? 'bg-brand' :
                          idx === 1 ? 'bg-info-text' :
                          idx === 2 ? 'bg-pos-text' :
                          idx === 3 ? 'bg-warn-text' :
                          'bg-brand'
                        } opacity-80`}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                    <div className="w-24 text-right shrink-0">
                      <div className="text-[10px] font-bold text-[#1e293b] tabular-nums">
                        {stage.value_try > 0 ? serverFmt(stage.value_try) : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Metrics strip */}
          <div className="border-t border-[#e8eaef] grid grid-cols-2 sm:grid-cols-4 divide-x divide-[#f1f5f9]">
            {[
              {
                label: 'Açık Pipeline',
                value: funnelReport.open_pipeline_value_try > 0
                  ? serverFmt(funnelReport.open_pipeline_value_try) : '—',
                color: 'text-info-text',
              },
              {
                label: 'Ağırlıklı Pipeline',
                value: funnelReport.weighted_pipeline_value_try > 0
                  ? serverFmt(funnelReport.weighted_pipeline_value_try) : '—',
                color: 'text-[#0f172a]',
              },
              {
                label: 'Toplam Kayıp',
                value: funnelReport.total_leakage_try > 0
                  ? serverFmt(funnelReport.total_leakage_try) : '—',
                color: 'text-neg',
              },
              {
                label: '30G Tahmin',
                value: funnelReport.pipeline_30d_forecast_try !== null
                  ? serverFmt(funnelReport.pipeline_30d_forecast_try) : '—',
                color: 'text-pos-text',
              },
            ].map(card => (
              <div key={card.label} className="px-3 py-2.5">
                <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">{card.label}</div>
                <div className={`text-sm font-black tabular-nums leading-none ${card.color}`}>{card.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Satış Akışı — {proformas.length} teklif · {sales.length} satış
        </span>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
        {[
          { label: 'Stok Değeri',  value: serverFmt(stockValue),   sub: `${stockLots.length} aktif lot`,                color: 'text-[#0f172a]' },
          { label: 'Pipeline',     value: pipelineVal > 0 ? serverFmt(pipelineVal) : '—', sub: 'gönderildi · onaylandı', color: 'text-info-text' },
          { label: 'Toplam Ciro',  value: totalRevenue > 0 ? serverFmt(totalRevenue) : '—', sub: unpaidTotal > 0 ? `${serverFmt(unpaidTotal)} tahsilat bekliyor` : 'tahsilat tamamlandı', color: 'text-[#0f172a]' },
          { label: 'Brüt Kâr',    value: totalRevenue > 0 ? serverFmt(grossProfit) : '—', sub: totalRevenue <= 0 ? 'veri yok' : totalCogs > 0 ? `%${grossMargin.toFixed(1)} marj` : 'maliyet girilmedi', color: grossProfit >= 0 ? 'text-pos-text' : 'text-neg' },
        ].map((card, i) => (
          <div key={card.label} className={`p-3 ${i < 3 ? 'border-b sm:border-b-0 sm:border-r border-[#e8eaef]' : ''}`}>
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{card.label}</div>
            <div className={`text-xl font-black tabular-nums leading-none ${card.color}`}>{card.value}</div>
            <div className="text-[10px] text-[#94a3b8] mt-1">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Recent proformas */}
      {recentPf.length > 0 && (
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
          <div className="px-4 py-2 border-b border-[#e8eaef]">
            <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Son Teklifler</span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] border-b border-[#e8eaef]">
                <th className="text-left px-4 py-2">Müşteri</th>
                <th className="text-left px-4 py-2">Durum</th>
                <th className="text-right px-4 py-2">Tutar</th>
                <th className="text-right px-4 py-2">Tarih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {recentPf.map(p => (
                <tr key={p.id}>
                  <td className="px-4 py-2.5 font-medium text-[#1e293b] max-w-[200px] truncate">{p.customer_name ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${STATUS_COLOR[p.status] ?? 'bg-[#f1f5f9] text-[#64748b]'}`}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-[#334155]">
                    {serverFmt(Number(p.total ?? 0))}
                    <span className="text-[10px] text-[#94a3b8] ml-1">{p.currency}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-[#94a3b8]">
                    {p.created_at ? new Date(p.created_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Revenue anomaly alerts */}
      {revenueAnomalies.length > 0 && (
        <div className="bg-warn-light border border-warn-light rounded px-4 py-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[0.65rem] font-black uppercase tracking-widest text-warn-text">Anormal Gelir Hareketi</span>
            <span className="text-[9px] text-warn-text">(istatistiksel eşik aşıldı)</span>
          </div>
          <div className="space-y-1">
            {revenueAnomalies.map((a, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded shrink-0 ${
                  a.direction === 'drop' ? 'bg-neg-light text-neg-text' : 'bg-warn-light text-warn-text'
                }`}>
                  {fmtMonth(a.month)}
                </span>
                <span className="text-[10px] text-warn-text">{a.message}</span>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-warn-text mt-1.5">
            Detaylı analiz için Finans → Risk sekmesini inceleyin.
          </div>
        </div>
      )}

      {/* Monthly revenue trend */}
      {recentMonths.length > 1 && (
        <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4 shadow-sm">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-4">Aylık Ciro Trendi — Son 6 Ay</div>
          <div className="flex items-end gap-2 h-20">
            {recentMonths.map(m => {
              const heightPct = Math.max(4, (m.revenue / maxRevMonth) * 100)
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div className="w-full bg-brand-subtle group-hover:bg-brand-light rounded-t transition-all" style={{ height: `${heightPct}%` }} />
                  <div className="text-[9px] text-[#94a3b8] font-semibold">{fmtMonth(m.month)}</div>
                  <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 bg-[#0f172a] text-white rounded px-2 py-1 text-[10px] whitespace-nowrap">
                    <div className="font-bold">{fmtMonth(m.month)}</div>
                    <div className="text-brand-light">{serverFmt(m.revenue)}</div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex items-center justify-between mt-2 text-[10px] text-[#94a3b8]">
            <span>En düşük: {serverFmt(Math.min(...recentMonths.map(m => m.revenue)))}</span>
            <span>En yüksek: {serverFmt(Math.max(...recentMonths.map(m => m.revenue)))}</span>
          </div>
        </div>
      )}

      {/* Interactive pipeline */}
      <SalesFlowClient
        initialProformas={proformas}
        initialSales={sales}
        initialStockLots={stockLots}
      />

      {/* Cross-navigation */}
      <NarrativeFooter
        narrative="Pipeline değeri tahsilata dönmeden nakit etkisi olmaz — tahsilat ve müşteri riskiyle birlikte değerlendirin."
        links={[
          { label: 'Tahsilat',            href: '/dashboard/commercial?tab=collections' },
          { label: 'Müşteri Riskleri',    href: '/dashboard/commercial?tab=customers' },
          { label: 'P&L Analizi',         href: '/dashboard/finance?tab=pnl' },
        ]}
      />
    </div>
  )
}

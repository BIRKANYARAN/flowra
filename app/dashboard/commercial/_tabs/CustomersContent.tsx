// ── CustomersContent — Commercial hub / customers tab ─────────────────────────
// Upgraded with Customer Payment Behavior intelligence:
//   • Portfolio risk summary (4 KPI tiles)
//   • Per-customer sortable intelligence table with risk tiers, payment metrics, trends
//   • Expandable detail modal per customer
//   • Original sections (revenue concentration, top customers, legacy risk scores) preserved

import { NarrativeFooter } from '@/components/ds'
import { createClient } from '@/lib/supabase-server'
import type { Customer } from '@/types'
import CustomersClient from '@/app/dashboard/customers/CustomersClient'
import { fmtTRY as fmt, fmtDate } from '@/lib/format'
import { scoreCustomerRisk, type CustomerPayment } from '@/lib/engines/anomaly.engine'
import {
  CustomerIntelligenceService,
  type CustomerPaymentProfile,
  type PortfolioRisk,
} from '@/lib/services/commercial/customer-intelligence.service'
import {
  ConcentrationRiskService,
  type ConcentrationRiskReport,
} from '@/lib/services/commercial/concentration-risk.service'
import CustomerIntelligenceTable from './_intelligence/CustomerIntelligenceTable'
import RfmSegmentationClient from './_rfm/RfmSegmentationClient'
import CustomerSegmentProfitabilityClient from './_segment/SegmentProfitabilityClient'
import CustomerLtvClient from './_ltv/CustomerLtvClient'
import CustomerConcentrationClient from './_concentration/CustomerConcentrationClient'
import SegmentProfitabilityClient from './_segments/SegmentProfitabilityClient'
import CohortRetentionClient from './_cohort/CohortRetentionClient'
import CustomerCreditClient from './_credit/CustomerCreditClient'
import { DetailSection } from '@/components/dashboard/DetailSection'

interface Props { companyId: string }


interface SaleAgg {
  customer_name:  string
  total_try:      number
  payment_status: string
  sale_date:      string | null
  paid_at:        string | null
  due_date:       string | null
}

const RISK_CFG = {
  high:   { label: 'Yüksek Risk',  bg: 'bg-neg-light',    border: 'border-neg-light',    text: 'text-neg-text',    badge: 'bg-neg-light text-neg-text'    },
  medium: { label: 'Orta Risk',    bg: 'bg-warn-light',  border: 'border-warn-light',  text: 'text-warn-text',  badge: 'bg-warn-light text-warn-text'  },
  low:    { label: 'Düşük Risk',   bg: 'bg-pos-light',border: 'border-pos-light',text: 'text-pos-text',badge: 'bg-pos-light text-pos-text'},
} as const

export async function CustomersContent({ companyId }: Props) {
  const supabase = createClient()

  // Default period: current year
  const now = new Date()
  const periodFrom = `${now.getFullYear()}-01-01`
  const periodTo   = now.toISOString().slice(0, 10)

  const [customersRes, salesRes, intelligenceProfiles, concentrationReport] = await Promise.all([
    supabase
      .from('customers')
      .select('*')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('name'),
    supabase
      .from('sales')
      .select('customer_name, total_try:total, payment_status, sale_date, paid_at, due_date')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(500),
    CustomerIntelligenceService.getProfiles(companyId, supabase).catch(() => [] as CustomerPaymentProfile[]),
    ConcentrationRiskService.getReport(companyId, supabase, { from: periodFrom, to: periodTo })
      .catch(() => null as ConcentrationRiskReport | null),
  ])

  const customers = (customersRes.data ?? []) as Customer[]
  const sales     = (salesRes.data     ?? []) as SaleAgg[]

  const billed      = sales.reduce((s, r) => s + Number(r.total_try ?? 0), 0)
  const outstanding = sales.filter(r => r.payment_status !== 'paid').reduce((s, r) => s + Number(r.total_try ?? 0), 0)
  const paidTotal   = sales.filter(s => s.payment_status === 'paid').reduce((s, r) => s + Number(r.total_try ?? 0), 0)
  const collectionRate = billed > 0 ? Math.round((paidTotal / billed) * 100) : 0

  const topMap = new Map<string, number>()
  for (const s of sales) {
    const key = s.customer_name ?? 'Bilinmiyor'
    topMap.set(key, (topMap.get(key) ?? 0) + Number(s.total_try ?? 0))
  }
  const topCustomers = Array.from(topMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, total]) => ({ name, total }))
  const maxTopTotal = topCustomers[0]?.total ?? 1

  // ── Customer payment risk scoring (legacy anomaly engine) ─────────────────
  const payments: CustomerPayment[] = sales.map(s => ({
    customer_name:  s.customer_name ?? 'Bilinmiyor',
    sale_date:      s.sale_date ?? new Date().toISOString().slice(0, 10),
    paid_date:      s.paid_at   ?? null,
    due_date:       s.due_date  ?? null,
    total_try:      Number(s.total_try ?? 0),
    payment_status: s.payment_status ?? 'pending',
  }))
  const riskScores      = scoreCustomerRisk(payments)
  const atRiskCustomers = riskScores.filter(r => r.risk_level !== 'low').slice(0, 8)

  // ── New intelligence portfolio summary ───────────────────────────────────
  const portfolio: PortfolioRisk = CustomerIntelligenceService.computePortfolioRisk(intelligenceProfiles)

  const hhiStatusColor = {
    low:      { badge: 'bg-pos-light text-pos-text',  label: 'Düşük' },
    moderate: { badge: 'bg-warn-light text-warn-text', label: 'Orta'  },
    high:     { badge: 'bg-neg-light text-neg-text',   label: 'Yüksek' },
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Müşteriler — {customers.length} kayıt · {sales.length} satış analiz edildi
        </span>
      </div>

      {/* ── Detaylı Müşteri Analizi — collapsed by default (load on demand) ── */}
      <DetailSection title="Detaylı Müşteri Analizi" subtitle="Segment · kohort · RFM · LTV · kredi · yoğunlaşma">
        {/* Segment Kârlılık Analizi */}
        <SegmentProfitabilityClient companyId={companyId} />
        {/* Kohort Tutma & Churn Analizi */}
        <CohortRetentionClient companyId={companyId} />
        {/* Müşteri RFM Segmentasyonu */}
        <RfmSegmentationClient companyId={companyId} />
        {/* Müşteri Segment Kârlılığı (Tip Bazlı) */}
        <CustomerSegmentProfitabilityClient companyId={companyId} />
        {/* Müşteri Yaşam Boyu Değeri (CLV / LTV) */}
        <CustomerLtvClient />
        {/* Müşteri Kredi Skoru */}
        <CustomerCreditClient companyId={companyId} />
        {/* Müşteri Yoğunlaşma Analizi (HHI) */}
        <CustomerConcentrationClient />
      </DetailSection>

      {/* ── Müşteri Yoğunlaşma Riski (HHI) ──────────────────────────────── */}
      {concentrationReport && concentrationReport.customer_count > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Müşteri Yoğunlaşma Riski
            </span>
            <span className={`text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded ${hhiStatusColor[concentrationReport.hhi_status].badge}`}>
              HHI {concentrationReport.hhi.toFixed(3)} — {hhiStatusColor[concentrationReport.hhi_status].label}
            </span>
          </div>

          {/* Dominant customer warning */}
          {concentrationReport.has_dominant_customer && (
            <div className="bg-neg-light border border-neg-light rounded px-3 py-2">
              <div className="text-[11px] font-black uppercase tracking-wide text-neg-text">
                Dominant Müşteri Riski
              </div>
              <div className="text-xs text-neg-text mt-0.5">
                <strong>{concentrationReport.top_customer_name}</strong> gelirin{' '}
                <strong>%{concentrationReport.top_customer_share_pct.toFixed(0)}&apos;ini</strong>{' '}
                oluşturuyor. Bu müşterinin kaybı şirketi ciddi şekilde etkiler.
              </div>
            </div>
          )}

          {/* Top 3 share sentence */}
          <p className="text-xs text-[#64748b]">
            Top 3 müşteri gelirin{' '}
            <strong className="text-[#1e293b]">%{concentrationReport.top_3_share_pct.toFixed(0)}&apos;ini</strong>{' '}
            oluşturuyor
            {concentrationReport.customer_count > 3 && (
              <span> · {concentrationReport.customer_count} aktif müşteri</span>
            )}
          </p>

          {/* Concentration bars */}
          <div className="space-y-2">
            {concentrationReport.customers.slice(0, 6).map(c => {
              const barColor =
                c.risk_label === 'dominant'    ? 'bg-neg'
                : c.risk_label === 'major'     ? 'bg-warn'
                : c.risk_label === 'significant' ? 'bg-brand-light'
                : 'bg-[#cbd5e1]'
              return (
                <div key={c.customer_name} className="flex items-center gap-3">
                  <div className="w-32 text-xs text-[#334155] font-medium shrink-0 truncate" title={c.customer_name}>
                    {c.customer_name}
                  </div>
                  <div className="flex-1 h-4 bg-[#f1f5f9] rounded overflow-hidden">
                    <div
                      className={`h-4 rounded ${barColor}`}
                      style={{ width: `${Math.min(c.revenue_share_pct, 100)}%` }}
                    />
                  </div>
                  <div className="w-16 text-right shrink-0">
                    <span className="text-xs font-bold tabular-nums text-[#334155]">
                      %{c.revenue_share_pct.toFixed(0)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Intelligence Portfolio KPI Strip ─────────────────────────────── */}
      {intelligenceProfiles.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden">
          {[
            {
              label: 'Toplam Müşteri',
              value: String(portfolio.total_customers),
              sub: `${portfolio.critical_count > 0 ? `${portfolio.critical_count} kritik · ` : ''}${portfolio.high_risk_count} yüksek risk`,
              color: portfolio.critical_count > 0 ? 'text-neg' : 'text-[#0f172a]',
            },
            {
              label: 'Kritik Risk',
              value: portfolio.critical_count > 0 ? String(portfolio.critical_count) : '—',
              sub: portfolio.critical_count > 0 ? 'Acil aksiyon gerekiyor' : 'Kritik risk yok',
              color: portfolio.critical_count > 0 ? 'text-neg' : 'text-pos-text',
            },
            {
              label: 'Vadesi Geçmiş',
              value: portfolio.total_overdue_try > 0 ? fmt(portfolio.total_overdue_try) : '—',
              sub: portfolio.total_overdue_try > 0 ? 'Tahsilat bekliyor' : 'Vadesi geçmiş yok',
              color: portfolio.total_overdue_try > 0 ? 'text-neg' : 'text-pos-text',
            },
            {
              label: 'Zamanında Ödeme',
              value: portfolio.portfolio_on_time_rate > 0
                ? `%${Math.round(portfolio.portfolio_on_time_rate * 100)}`
                : '—',
              sub: portfolio.avg_days_to_pay_portfolio !== null
                ? `Ort. ${Math.round(portfolio.avg_days_to_pay_portfolio)}g ödeme`
                : 'Vade verisi yok',
              color: portfolio.portfolio_on_time_rate >= 0.8 ? 'text-pos-text'
                : portfolio.portfolio_on_time_rate >= 0.5 ? 'text-warn-text'
                : 'text-neg',
            },
          ].map((card, i) => (
            <div key={card.label} className={`p-3 ${i < 3 ? 'border-b sm:border-b-0 sm:border-r border-[#e2e8f0]' : ''}`}>
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{card.label}</div>
              <div className={`text-xl font-black tabular-nums leading-none ${card.color}`}>{card.value}</div>
              <div className="text-[10px] text-[#94a3b8] mt-1">{card.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Customer Intelligence Table (client component for interactivity) ── */}
      {intelligenceProfiles.length > 0 && (
        <CustomerIntelligenceTable profiles={intelligenceProfiles} />
      )}

      {/* ── Legacy KPI strip (shown only when intelligence data unavailable) ── */}
      {intelligenceProfiles.length === 0 && sales.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden">
          {[
            { label: 'Toplam Müşteri', value: String(customers.length), sub: `${sales.length} satış kaydı`,        color: 'text-[#0f172a]' },
            { label: 'Toplam Ciro',    value: billed > 0 ? fmt(billed) : '—', sub: 'Tüm satışlar (TRY)',           color: 'text-brand' },
            { label: 'Bekleyen Tahsilat', value: outstanding > 0 ? fmt(outstanding) : '—', sub: outstanding > 0 ? 'Ödenmemiş + kısmi' : 'Tamamı tahsil edildi', color: outstanding > 0 ? 'text-neg' : 'text-pos-text' },
            { label: 'Tahsilat Oranı', value: billed > 0 ? `%${collectionRate}` : '—', sub: billed > 0 ? `${fmt(paidTotal)} / ${fmt(billed)} tahsil edildi` : 'Satış yok', color: collectionRate >= 80 ? 'text-pos-text' : collectionRate >= 50 ? 'text-warn-text' : 'text-neg' },
          ].map((card, i) => (
            <div key={card.label} className={`p-3 ${i < 3 ? 'border-b sm:border-b-0 sm:border-r border-[#e2e8f0]' : ''}`}>
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{card.label}</div>
              <div className={`text-xl font-black tabular-nums leading-none ${card.color}`}>{card.value}</div>
              <div className="text-[10px] text-[#94a3b8] mt-1">{card.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Revenue concentration alert — top customer > 40% of total billed */}
      {topCustomers.length > 0 && billed > 0 && topCustomers[0].total / billed > 0.4 && (
        <div className={`rounded border px-4 py-3 ${
          topCustomers[0].total / billed > 0.6
            ? 'bg-neg-light border-neg-light'
            : 'bg-warn-light border-warn-light'
        }`}>
          <div>
            <div className={`text-[11px] font-black uppercase tracking-wide ${
              topCustomers[0].total / billed > 0.6 ? 'text-neg-text' : 'text-warn-text'
            }`}>
              Yüksek Müşteri Konsantrasyonu
            </div>
            <div className={`text-xs mt-0.5 ${
              topCustomers[0].total / billed > 0.6 ? 'text-neg-text' : 'text-warn-text'
            }`}>
              <strong>{topCustomers[0].name}</strong> toplam cironun{' '}
              <strong>%{Math.round((topCustomers[0].total / billed) * 100)}&apos;ini</strong>{' '}
              oluşturuyor ({fmt(topCustomers[0].total)}). Bu müşterinin kaybı ciddi gelir riski yaratır.
            </div>
          </div>
        </div>
      )}

      {/* Top customers bar chart */}
      {topCustomers.length > 0 && billed > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft px-4 py-3">
          <h3 className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">En Yüksek Cirolu Müşteriler</h3>
          <div className="space-y-2.5">
            {topCustomers.map(tc => {
              const barPct   = (tc.total / maxTopTotal) * 100
              const sharePct = billed > 0 ? (tc.total / billed) * 100 : 0
              return (
                <div key={tc.name} className="flex items-center gap-3">
                  <div className="w-36 text-xs text-[#334155] font-medium shrink-0 truncate" title={tc.name}>{tc.name}</div>
                  <div className="flex-1">
                    <div className="h-5 bg-[#f1f5f9] rounded overflow-hidden">
                      <div className="h-5 bg-brand-light rounded" style={{ width: `${barPct}%` }} />
                    </div>
                  </div>
                  <div className="w-28 text-right shrink-0">
                    <span className="text-xs font-bold tabular-nums text-brand">{fmt(tc.total)}</span>
                    <span className="text-[10px] text-[#94a3b8] ml-1">%{sharePct.toFixed(0)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Customer Payment Risk Panel (legacy anomaly engine) ────────────── */}
      {atRiskCustomers.length > 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9]">
            <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Müşteri Ödeme Riski
            </span>
            <span className="text-[9px] text-[#94a3b8]">
              {atRiskCustomers.filter(r => r.risk_level === 'high').length > 0 && (
                <span className="text-neg font-semibold">{atRiskCustomers.filter(r => r.risk_level === 'high').length} yüksek</span>
              )}
              {atRiskCustomers.filter(r => r.risk_level === 'high').length > 0 && atRiskCustomers.filter(r => r.risk_level === 'medium').length > 0 && ' · '}
              {atRiskCustomers.filter(r => r.risk_level === 'medium').length > 0 && (
                <span className="text-warn-text">{atRiskCustomers.filter(r => r.risk_level === 'medium').length} orta</span>
              )}
            </span>
          </div>
          <div className="divide-y divide-[#f1f5f9]">
            {atRiskCustomers.map(r => {
              const cfg = RISK_CFG[r.risk_level]
              return (
                <div key={r.customer_name} className="flex items-center gap-4 px-4 py-3 hover:bg-[#f8fafc]/40">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full border-2 flex items-center justify-center"
                    style={{ borderColor: r.risk_level === 'high' ? '#f87171' : r.risk_level === 'medium' ? '#fb923c' : '#34d399' }}>
                    <span className={`text-[11px] font-black tabular-nums ${cfg.text}`}>{r.risk_score}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#1e293b] truncate">{r.customer_name}</span>
                      <span className={`text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${cfg.badge}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="text-[10px] text-[#94a3b8] mt-0.5 flex items-center gap-3">
                      {r.overdue_count > 0 && (
                        <span>{r.overdue_count} gecikmiş işlem</span>
                      )}
                      {r.avg_days_late > 0 && (
                        <span>ort. {Math.round(r.avg_days_late)}g geç ödeme</span>
                      )}
                      {r.total_overdue > 0 && (
                        <span className="text-neg font-semibold">{fmt(r.total_overdue)} vadesi geçmiş</span>
                      )}
                    </div>
                  </div>
                  <div className="w-20 flex-shrink-0 hidden sm:block">
                    <div className="h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${r.risk_level === 'high' ? 'bg-neg' : r.risk_level === 'medium' ? 'bg-warn' : 'bg-pos'}`}
                        style={{ width: `${r.risk_score}%` }} />
                    </div>
                    <div className={`text-[9px] font-semibold mt-0.5 text-right ${cfg.text}`}>{r.risk_score}/100</div>
                  </div>
                </div>
              )
            })}
          </div>
          {riskScores.filter(r => r.risk_level !== 'low').length > 8 && (
            <div className="px-4 py-2 text-[10px] text-[#94a3b8] border-t border-[#f1f5f9]">
              +{riskScores.filter(r => r.risk_level !== 'low').length - 8} daha · Tüm risk analizi tahsilat sekmesinde
            </div>
          )}
        </div>
      )}

      <CustomersClient initialCustomers={customers} />

      <NarrativeFooter
        narrative="Risk skoru geç ödeme geçmişi ve konsantrasyon baskısına dayanır — tahsilat gecikmesi doğrudan nakit pozisyonunu etkiler."
        links={[
          { label: 'Tahsilat',            href: '/dashboard/commercial?tab=collections' },
          { label: 'Alacak Risk Analizi', href: '/dashboard/finance?tab=risks' },
        ]}
      />
    </div>
  )
}

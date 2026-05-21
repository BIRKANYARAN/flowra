// ═══════════════════════════════════════════════════════════════════════════════
// app/dashboard/admin/reconciliation/[id]/page.tsx
//
// Full 19-section institutional shareholder reconciliation document view.
// Server component that fetches the snapshot and renders all sections.
// ═══════════════════════════════════════════════════════════════════════════════

import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type {
  ReconciliationSnapshot,
  ReconciliationData,
  ReconSection2_Treasury,
  ReconSection3_Receivables,
  ReconSection4_Payables,
  ReconSection5_Inventory,
  ReconSection6_FixedAssets,
  ReconSection7_TaxPosition,
  ReconSection8_Financing,
  ReconSection9_EquityStructure,
  ReconSection10_PartnerReceivables,
  ReconSection11_PartnerLiabilities,
  ReconSection12_DebtTranches,
  ReconSection13_Distributions,
  ReconSection14_BalanceSheet,
  ReconSection15_PnL,
  ReconSection16_GovernanceRisks,
  GovernanceFinding,
} from '@/types/reconciliation'
import SignoffPanel from './SignoffPanel'

// ── Helpers ───────────────────────────────────────────────────────────────────

const tryFmt = new Intl.NumberFormat('tr-TR', {
  style: 'currency', currency: 'TRY', maximumFractionDigits: 0,
})
function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  return tryFmt.format(n)
}
function pct(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toFixed(2) + '%'
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
  } catch { return iso }
}

// ── SectionBlock helper ───────────────────────────────────────────────────────

function SectionBlock({
  number, title, children,
}: {
  number: number
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-[#e2e8f0] bg-[#f8fafc]">
        <div className="w-6 h-6 rounded bg-[#0f172a] flex items-center justify-center flex-shrink-0">
          <span className="text-[10px] font-black text-white">
            {String(number).padStart(2, '0')}
          </span>
        </div>
        <span className="text-xs font-black text-[#0f172a] uppercase tracking-widest">{title}</span>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

// ── KV row for labeled field pairs ───────────────────────────────────────────

function KV({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex gap-2 py-1.5 border-b border-[#f1f5f9] last:border-0">
      <span className="text-xs text-[#94a3b8] w-40 flex-shrink-0">{label}</span>
      <span className="text-xs font-medium text-[#0f172a]">{value ?? '—'}</span>
    </div>
  )
}

// ── Simple table ──────────────────────────────────────────────────────────────

function SimpleTable({
  cols, rows,
}: {
  cols: string[]
  rows: (string | number | null | undefined)[][]
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-[#0f172a]">
            {cols.map((c, i) => (
              <th key={i} className="px-3 py-2 text-left text-[10px] font-black text-white uppercase tracking-wide first:rounded-tl last:rounded-tr">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-[#f8fafc]'}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-[#334155] border-b border-[#f1f5f9]">
                  {cell ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Aging sub-table ───────────────────────────────────────────────────────────

function AgingTable({ aging }: { aging: { bucket_0_30: number; bucket_31_60: number; bucket_61_90: number; bucket_90plus: number } }) {
  return (
    <SimpleTable
      cols={['0-30 Gün', '31-60 Gün', '61-90 Gün', '90+ Gün']}
      rows={[[fmt(aging.bucket_0_30), fmt(aging.bucket_31_60), fmt(aging.bucket_61_90), fmt(aging.bucket_90plus)]]}
    />
  )
}

// ── Data fetch ────────────────────────────────────────────────────────────────

interface SnapshotDetail extends ReconciliationSnapshot {
  signoffs: Array<{
    partner_name:  string
    ownership_pct: number
    status:        'pending' | 'approved' | 'rejected'
    signed_at:     string | null
    comments:      string | null
  }>
}

async function fetchSnapshot(id: string): Promise<SnapshotDetail | null> {
  try {
    const cookieStore = cookies()
    const base = process.env.NEXT_PUBLIC_APP_URL ?? ''
    const res = await fetch(`${base}/api/reconciliation/snapshots/${id}`, {
      headers: { cookie: cookieStore.toString() },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.snapshot ?? null
  } catch {
    return null
  }
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ReconciliationSnapshot['status'] }) {
  const map = {
    draft:            { label: 'Taslak',        cls: 'bg-[#f1f5f9] text-[#64748b] border border-[#e2e8f0]' },
    pending_approval: { label: 'Onay Bekliyor', cls: 'bg-amber-50 text-amber-700 border border-amber-200'   },
    approved:         { label: 'Onaylandı',     cls: 'bg-green-50 text-green-700 border border-green-200'   },
    archived:         { label: 'Arşiv',         cls: 'bg-[#f8fafc] text-[#94a3b8] border border-[#e2e8f0]'  },
  }
  const { label, cls } = map[status] ?? map.draft
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold ${cls}`}>
      {label}
    </span>
  )
}

// ── Confidence badge ──────────────────────────────────────────────────────────

function ConfidenceBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-[#94a3b8] text-xs">—</span>
  const cls =
    score >= 80 ? 'text-green-700 bg-green-50 border border-green-200' :
    score >= 60 ? 'text-amber-700 bg-amber-50 border border-amber-200' :
                  'text-red-700 bg-red-50 border border-red-200'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${cls}`}>
      {score}/100
    </span>
  )
}

// ── Governance finding severity badge ─────────────────────────────────────────

function SeverityBadge({ severity }: { severity: GovernanceFinding['severity'] }) {
  const map = {
    critical: 'bg-red-100 text-red-700 border border-red-200',
    warning:  'bg-amber-100 text-amber-700 border border-amber-200',
    info:     'bg-blue-50 text-blue-700 border border-blue-200',
  }
  const label = { critical: 'Kritik', warning: 'Uyarı', info: 'Bilgi' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${map[severity]}`}>
      {label[severity]}
    </span>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default async function ReconciliationDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const snapshot = await fetchSnapshot(params.id)
  if (!snapshot) notFound()

  const s = snapshot.sections as ReconciliationData

  return (
    <div className="min-h-screen bg-[#f8fafc]">

      {/* ── HEADER BAR ──────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-[#e2e8f0] sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/admin/reconciliation"
              className="text-[#94a3b8] hover:text-[#64748b] transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </Link>
            <div>
              <p className="text-sm font-black text-[#0f172a] leading-none">{snapshot.title}</p>
              <p className="text-[11px] text-[#94a3b8] mt-0.5">{fmtDate(snapshot.reconciliation_date)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={snapshot.status} />
            <Link
              href={`/dashboard/admin/reconciliation/${snapshot.id}/pdf`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#f1f5f9] text-[#334155] text-xs font-semibold rounded hover:bg-[#e2e8f0] transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              PDF İndir
            </Link>
          </div>
        </div>
      </div>

      {/* ── DOCUMENT IDENTIFIER STRIP ────────────────────────────────────────── */}
      <div className="bg-[#0f172a]">
        <div className="max-w-5xl mx-auto px-6 py-3 flex flex-wrap items-center gap-x-8 gap-y-1">
          <div>
            <span className="text-[10px] text-[#475569] uppercase tracking-widest">SHA-256</span>
            <p className="text-[11px] font-mono text-[#94a3b8]">
              {snapshot.data_hash ? `${snapshot.data_hash.slice(0, 16)}…` : '—'}
            </p>
          </div>
          <div>
            <span className="text-[10px] text-[#475569] uppercase tracking-widest">Oluşturma</span>
            <p className="text-[11px] text-[#94a3b8]">{fmtDate(snapshot.created_at)}</p>
          </div>
          <div>
            <span className="text-[10px] text-[#475569] uppercase tracking-widest">Dönem</span>
            <p className="text-[11px] text-[#94a3b8]">{snapshot.period_label ?? '—'}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] text-[#475569] uppercase tracking-widest">Güven</span>
            <ConfidenceBadge score={snapshot.confidence_score} />
          </div>
        </div>
      </div>

      {/* ── SECTIONS ─────────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-4">

        {/* S1 — Company Identity */}
        <SectionBlock number={1} title="Şirket Kimliği">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <div>
              <KV label="Şirket Adı"   value={s.section1.company_name} />
              <KV label="VKN"          value={s.section1.tax_number} />
              <KV label="Vergi Dairesi" value={s.section1.tax_office} />
              <KV label="MERSIS No"    value={s.section1.mersis_no} />
              <KV label="Ticaret Sicil" value={s.section1.trade_registry} />
            </div>
            <div>
              <KV label="Adres"        value={s.section1.address} />
              <KV label="Telefon"      value={s.section1.phone} />
              <KV label="E-posta"      value={s.section1.email} />
              <KV label="Website"      value={s.section1.website} />
              <KV label="Dönem"        value={s.section1.period_label} />
            </div>
          </div>
        </SectionBlock>

        {/* S2 — Treasury */}
        <SectionBlock number={2} title="Hazine & Nakit">
          {(() => {
            const t2 = s.section2 as ReconSection2_Treasury
            return (
              <>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Toplam Nakit</p>
                    <p className="text-sm font-black text-[#0f172a]">{fmt(t2.total_cash_try)}</p>
                  </div>
                  <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Kullanılabilir</p>
                    <p className="text-sm font-black text-[#0f172a]">{fmt(t2.available_cash_try)}</p>
                  </div>
                  <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Bloke</p>
                    <p className="text-sm font-black text-[#0f172a]">{fmt(t2.restricted_cash_try)}</p>
                  </div>
                </div>
                {t2.bank_accounts.length > 0 && (
                  <SimpleTable
                    cols={['Banka', 'Hesap Tipi', 'Bakiye (TRY)', 'Döviz']}
                    rows={t2.bank_accounts.map(b => [
                      b.bank_name,
                      b.account_type,
                      fmt(b.balance_try),
                      b.currency,
                    ])}
                  />
                )}
                {t2.fx_exposure.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wide mb-2">Döviz Pozisyonu</p>
                    <SimpleTable
                      cols={['Döviz', 'Tutar', 'TRY Karşılığı']}
                      rows={t2.fx_exposure.map(fx => [fx.currency, fx.amount.toLocaleString('tr-TR'), fmt(fx.try_equiv)])}
                    />
                  </div>
                )}
                {t2.treasury_note && (
                  <p className="text-xs text-[#64748b] mt-3 italic">{t2.treasury_note}</p>
                )}
              </>
            )
          })()}
        </SectionBlock>

        {/* S3 — Receivables */}
        <SectionBlock number={3} title="Alacaklar">
          {(() => {
            const t3 = s.section3 as ReconSection3_Receivables
            return (
              <>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Toplam Alacak</p>
                    <p className="text-sm font-black text-[#0f172a]">{fmt(t3.total_receivables_try)}</p>
                  </div>
                  <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Vadesi Geçmiş</p>
                    <p className="text-sm font-black text-red-700">{fmt(t3.overdue_receivables_try)}</p>
                  </div>
                  <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Şüpheli Alacak</p>
                    <p className="text-sm font-black text-amber-700">{fmt(t3.doubtful_try)}</p>
                  </div>
                </div>
                <p className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wide mb-2">Yaşlandırma Analizi</p>
                <AgingTable aging={t3.aging} />
                {t3.top_customers.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wide mb-2">Önemli Müşteriler</p>
                    <SimpleTable
                      cols={['Müşteri', 'Bakiye', 'Yaş (Gün)', 'Durum']}
                      rows={t3.top_customers.map(c => [
                        c.name,
                        fmt(c.outstanding),
                        c.oldest_days,
                        c.status,
                      ])}
                    />
                  </div>
                )}
                <div className="flex gap-4 mt-3">
                  <KV label="Konsantrasyon %" value={pct(t3.concentration_pct)} />
                </div>
                {t3.collection_risk_note && (
                  <p className="text-xs text-[#64748b] mt-2 italic">{t3.collection_risk_note}</p>
                )}
              </>
            )
          })()}
        </SectionBlock>

        {/* S4 — Payables */}
        <SectionBlock number={4} title="Borçlar (Ticari)">
          {(() => {
            const t4 = s.section4 as ReconSection4_Payables
            return (
              <>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Toplam Borç</p>
                    <p className="text-sm font-black text-[#0f172a]">{fmt(t4.total_payables_try)}</p>
                  </div>
                  <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">7 Gün İçinde</p>
                    <p className="text-sm font-black text-red-700">{fmt(t4.upcoming_7d_try)}</p>
                  </div>
                  <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">30 Gün İçinde</p>
                    <p className="text-sm font-black text-amber-700">{fmt(t4.upcoming_30d_try)}</p>
                  </div>
                </div>
                <p className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wide mb-2">Yaşlandırma Analizi</p>
                <AgingTable aging={t4.aging} />
                {t4.top_suppliers.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wide mb-2">Önemli Tedarikçiler</p>
                    <SimpleTable
                      cols={['Tedarikçi', 'Bakiye', 'Vade']}
                      rows={t4.top_suppliers.map(sup => [
                        sup.name,
                        fmt(sup.balance),
                        fmtDate(sup.due_date),
                      ])}
                    />
                  </div>
                )}
                {t4.critical_note && (
                  <p className="text-xs text-[#64748b] mt-2 italic">{t4.critical_note}</p>
                )}
              </>
            )
          })()}
        </SectionBlock>

        {/* S5 — Inventory */}
        <SectionBlock number={5} title="Stok">
          {(() => {
            const t5 = s.section5 as ReconSection5_Inventory
            return (
              <>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Toplam Değer</p>
                    <p className="text-sm font-black text-[#0f172a]">{fmt(t5.total_inventory_try)}</p>
                  </div>
                  <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Ürün Sayısı</p>
                    <p className="text-sm font-black text-[#0f172a]">{t5.item_count}</p>
                  </div>
                  <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Kritik Stok</p>
                    <p className="text-sm font-black text-red-700">{t5.critical_stock_count}</p>
                  </div>
                </div>
                {t5.top_items.length > 0 && (
                  <SimpleTable
                    cols={['Ürün', 'Adet', 'Birim Maliyet', 'Toplam Değer']}
                    rows={t5.top_items.map(it => [
                      it.name,
                      it.qty.toLocaleString('tr-TR'),
                      fmt(it.unit_cost),
                      fmt(it.total_value),
                    ])}
                  />
                )}
                {t5.last_count_date && (
                  <p className="text-[11px] text-[#94a3b8] mt-2">Son sayım: {fmtDate(t5.last_count_date)}</p>
                )}
              </>
            )
          })()}
        </SectionBlock>

        {/* S6 — Fixed Assets */}
        <SectionBlock number={6} title="Sabit Kıymetler">
          {(() => {
            const t6 = s.section6 as ReconSection6_FixedAssets
            return (
              <>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Brüt Değer</p>
                    <p className="text-sm font-black text-[#0f172a]">{fmt(t6.total_gross_try)}</p>
                  </div>
                  <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Birikim Amortisman</p>
                    <p className="text-sm font-black text-[#64748b]">{fmt(t6.accumulated_depreciation)}</p>
                  </div>
                  <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Net Defter Değeri</p>
                    <p className="text-sm font-black text-[#0f172a]">{fmt(t6.net_carrying_value)}</p>
                  </div>
                </div>
                {t6.assets.length > 0 && (
                  <SimpleTable
                    cols={['Varlık', 'Kategori', 'Brüt Değer', 'Net Değer']}
                    rows={t6.assets.map(a => [
                      a.description,
                      a.category,
                      fmt(a.gross_value),
                      fmt(a.net_value),
                    ])}
                  />
                )}
              </>
            )
          })()}
        </SectionBlock>

        {/* S7 — Tax Position */}
        <SectionBlock number={7} title="Vergi Pozisyonu">
          {(() => {
            const t7 = s.section7 as ReconSection7_TaxPosition
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                <div>
                  <KV label="KDV Çıktı"        value={fmt(t7.kdv_output_try)} />
                  <KV label="KDV Girdi"         value={fmt(t7.kdv_input_try)} />
                  <KV label="Net KDV"           value={fmt(t7.net_kdv_try)} />
                  <KV label="Kurumlar Vergisi"  value={fmt(t7.corporate_tax_try)} />
                </div>
                <div>
                  <KV label="Stopaj"            value={fmt(t7.withholding_try)} />
                  <KV label="Gecikmiş Vergi"    value={fmt(t7.overdue_tax_try)} />
                  <KV label="SGK Yükümlülüğü"   value={fmt(t7.sgk_obligation_try)} />
                </div>
                {t7.pending_declarations.length > 0 && (
                  <div className="md:col-span-2 mt-3">
                    <p className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wide mb-1">Bekleyen Beyannameler</p>
                    <div className="flex flex-wrap gap-1.5">
                      {t7.pending_declarations.map((d, i) => (
                        <span key={i} className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 text-[11px] rounded">
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {t7.note && (
                  <p className="md:col-span-2 text-xs text-[#64748b] mt-2 italic">{t7.note}</p>
                )}
              </div>
            )
          })()}
        </SectionBlock>

        {/* S8 — Financing */}
        <SectionBlock number={8} title="Finansman">
          {(() => {
            const t8 = s.section8 as ReconSection8_Financing
            return (
              <>
                <div className="grid grid-cols-1 gap-4 mb-4">
                  <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-3 py-2 inline-block">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Toplam Borç</p>
                    <p className="text-sm font-black text-[#0f172a]">{fmt(t8.total_debt_try)}</p>
                  </div>
                </div>
                {t8.items.length > 0 && (
                  <SimpleTable
                    cols={['Borç Veren', 'Tür', 'Bakiye', 'Aylık Yük', 'Vade']}
                    rows={t8.items.map(item => [
                      item.lender,
                      item.type,
                      fmt(item.balance_try),
                      fmt(item.monthly_burden),
                      fmtDate(item.maturity_date),
                    ])}
                  />
                )}
                {t8.note && (
                  <p className="text-xs text-[#64748b] mt-2 italic">{t8.note}</p>
                )}
              </>
            )
          })()}
        </SectionBlock>

        {/* S9 — Equity Structure */}
        <SectionBlock number={9} title="Özsermaye Yapısı">
          {(() => {
            const t9 = s.section9 as ReconSection9_EquityStructure
            return (
              <>
                <div className="mb-4">
                  <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-3 py-2 inline-block">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Toplam Sermaye</p>
                    <p className="text-sm font-black text-[#0f172a]">{fmt(t9.total_capital_try)}</p>
                  </div>
                </div>
                {t9.shareholders.length > 0 && (
                  <SimpleTable
                    cols={['Ortak', 'Hisse %', 'Ödenen Sermaye', 'Özsermaye Payı']}
                    rows={t9.shareholders.map(sh => [
                      sh.name,
                      pct(sh.ownership_pct),
                      fmt(sh.paid_capital_try),
                      fmt(sh.equity_value_try),
                    ])}
                  />
                )}
              </>
            )
          })()}
        </SectionBlock>

        {/* S10 — Partner Receivables */}
        <SectionBlock number={10} title="Ortak Alacakları (Şirkete Borçlar)">
          {(() => {
            const t10 = s.section10 as ReconSection10_PartnerReceivables
            return (
              <>
                <div className="mb-4">
                  <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-3 py-2 inline-block">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Toplam Ortak Borçları</p>
                    <p className="text-sm font-black text-[#0f172a]">{fmt(t10.total_partner_loans_try)}</p>
                  </div>
                </div>
                {t10.partners.length > 0 && (
                  <SimpleTable
                    cols={['Ortak', 'Hisse %', 'Toplam Borç', 'Ödenen', 'Bakiye', 'Faiz']}
                    rows={t10.partners.map(p => [
                      p.partner_name,
                      pct(p.ownership_pct),
                      fmt(p.loan_total_try),
                      fmt(p.repaid_try),
                      fmt(p.outstanding_try),
                      fmt(p.accrued_interest),
                    ])}
                  />
                )}
              </>
            )
          })()}
        </SectionBlock>

        {/* S11 — Partner Liabilities */}
        <SectionBlock number={11} title="Ortak Borçları (Şirkete Alacaklar)">
          {(() => {
            const t11 = s.section11 as ReconSection11_PartnerLiabilities
            return (
              <>
                <div className="mb-4">
                  <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-3 py-2 inline-block">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Toplam Ortak Borçları</p>
                    <p className="text-sm font-black text-[#0f172a]">{fmt(t11.total_partner_debt_try)}</p>
                  </div>
                </div>
                {t11.partners.length > 0 && (
                  <SimpleTable
                    cols={['Ortak', 'Bakiye', 'Not']}
                    rows={t11.partners.map(p => [
                      p.partner_name,
                      fmt(p.outstanding_try),
                      p.repayment_note ?? '—',
                    ])}
                  />
                )}
              </>
            )
          })()}
        </SectionBlock>

        {/* S12 — Debt Tranches */}
        <SectionBlock number={12} title="Borç Dilimleri">
          {(() => {
            const t12 = s.section12 as ReconSection12_DebtTranches
            return (
              <>
                <div className="mb-4">
                  <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-3 py-2 inline-block">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Toplam Dilim Borcu</p>
                    <p className="text-sm font-black text-[#0f172a]">{fmt(t12.total_tranches_try)}</p>
                  </div>
                </div>
                {t12.tranches.length > 0 && (
                  <SimpleTable
                    cols={['Ortak', 'Dilim', 'Açılış', 'Kalan', 'Faiz %', 'Vade', 'Durum']}
                    rows={t12.tranches.map(tr => [
                      tr.partner_name,
                      tr.tranche_label,
                      fmt(tr.opening_try),
                      fmt(tr.remaining_try),
                      pct(tr.interest_rate),
                      fmtDate(tr.maturity_date),
                      tr.status,
                    ])}
                  />
                )}
              </>
            )
          })()}
        </SectionBlock>

        {/* S13 — Distributions */}
        <SectionBlock number={13} title="Dağıtımlar & Temettü">
          {(() => {
            const t13 = s.section13 as ReconSection13_Distributions
            return (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">YTD Dağıtılan</p>
                    <p className="text-sm font-black text-[#0f172a]">{fmt(t13.total_distributed_try)}</p>
                  </div>
                  <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Bekleyen</p>
                    <p className="text-sm font-black text-amber-700">{fmt(t13.pending_distributions_try)}</p>
                  </div>
                  <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Dağıtılabilir</p>
                    <p className="text-sm font-black text-green-700">{fmt(t13.distributable_profit_try)}</p>
                  </div>
                  <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Geçmiş Yıl Kârı</p>
                    <p className="text-sm font-black text-[#0f172a]">{fmt(t13.retained_earnings_try)}</p>
                  </div>
                </div>
                {t13.history.length > 0 && (
                  <SimpleTable
                    cols={['Tarih', 'Tür', 'Brüt', 'Stopaj', 'Net']}
                    rows={t13.history.map(h => [
                      fmtDate(h.date),
                      h.type,
                      fmt(h.gross_try),
                      fmt(h.withholding_try),
                      fmt(h.net_try),
                    ])}
                  />
                )}
              </>
            )
          })()}
        </SectionBlock>

        {/* S14 — Balance Sheet */}
        <SectionBlock number={14} title="Bilanço">
          {(() => {
            const t14 = s.section14 as ReconSection14_BalanceSheet
            return (
              <>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-[10px] font-black text-[#0f172a] uppercase tracking-wide mb-2 border-b border-[#e2e8f0] pb-1">AKTİF</p>
                    <KV label="Dönen Varlıklar"      value={fmt(t14.current_assets_try)} />
                    <KV label="Duran Varlıklar"      value={fmt(t14.non_current_assets_try)} />
                    <div className="flex gap-2 py-1.5 mt-1 border-t border-[#0f172a]">
                      <span className="text-xs font-black text-[#0f172a] w-40 flex-shrink-0">TOPLAM AKTİF</span>
                      <span className="text-xs font-black text-[#0f172a]">{fmt(t14.total_assets_try)}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-[#0f172a] uppercase tracking-wide mb-2 border-b border-[#e2e8f0] pb-1">PASİF</p>
                    <KV label="Kısa Vadeli Borçlar"  value={fmt(t14.short_term_liabilities)} />
                    <KV label="Uzun Vadeli Borçlar"  value={fmt(t14.long_term_liabilities)} />
                    <KV label="Toplam Yükümlülükler" value={fmt(t14.total_liabilities_try)} />
                    <KV label="Özsermaye"            value={fmt(t14.equity_try)} />
                    <div className="flex gap-2 py-1.5 mt-1 border-t border-[#0f172a]">
                      <span className="text-xs font-black text-[#0f172a] w-40 flex-shrink-0">TOPLAM PASİF</span>
                      <span className="text-xs font-black text-[#0f172a]">{fmt(t14.total_liabilities_try + t14.equity_try)}</span>
                    </div>
                  </div>
                </div>
                <div className={`mt-3 px-3 py-2 rounded border text-xs font-semibold ${
                  t14.balanced
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-red-50 border-red-200 text-red-700'
                }`}>
                  {t14.balanced
                    ? 'Bilanço dengeli'
                    : `Bilanço dengeli değil — fark: ${fmt(t14.imbalance_try)}`}
                </div>
              </>
            )
          })()}
        </SectionBlock>

        {/* S15 — P&L */}
        <SectionBlock number={15} title="Gelir Tablosu">
          {(() => {
            const t15 = s.section15 as ReconSection15_PnL
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                <div>
                  <KV label="Gelir"               value={fmt(t15.revenue_try)} />
                  <KV label="SMM"                 value={fmt(t15.cogs_try)} />
                  <KV label="Brüt Kâr"            value={fmt(t15.gross_profit_try)} />
                  <KV label="Brüt Marj"           value={pct(t15.gross_margin_pct)} />
                </div>
                <div>
                  <KV label="Faaliyet Giderleri"  value={fmt(t15.operating_expenses)} />
                  <KV label="FAVÖK"               value={fmt(t15.ebitda_try)} />
                  <KV label="FAVÖK Marjı"         value={pct(t15.ebitda_margin_pct)} />
                  <KV label="Net Kâr"             value={fmt(t15.net_profit_try)} />
                  <KV label="Net Marj"            value={pct(t15.net_margin_pct)} />
                </div>
              </div>
            )
          })()}
        </SectionBlock>

        {/* S16 — Governance Risks */}
        <SectionBlock number={16} title="Yönetişim Riskleri">
          {(() => {
            const t16 = s.section16 as ReconSection16_GovernanceRisks
            return (
              <>
                <div className="flex gap-4 mb-4">
                  <span className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-1 rounded">
                    {t16.total_critical} Kritik
                  </span>
                  <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded">
                    {t16.total_warning} Uyarı
                  </span>
                  <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1 rounded">
                    {t16.total_info} Bilgi
                  </span>
                </div>
                {t16.findings.length === 0 ? (
                  <p className="text-sm text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded">
                    Tespit edilen yönetişim riski bulunmamaktadır.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {t16.findings.map((f, i) => (
                      <div key={i} className="border border-[#e2e8f0] rounded p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            <SeverityBadge severity={f.severity} />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-[#0f172a]">{f.title}</p>
                              <p className="text-[11px] text-[#64748b] mt-0.5">{f.description}</p>
                              <p className="text-[11px] text-[#94a3b8] mt-1 italic">{f.recommended_action}</p>
                            </div>
                          </div>
                          {f.financial_impact != null && (
                            <span className="text-xs font-semibold text-red-700 flex-shrink-0">
                              {fmt(f.financial_impact)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )
          })()}
        </SectionBlock>

        {/* S17 — Management Declaration */}
        <SectionBlock number={17} title="Yönetim Beyannamesi">
          <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded p-4">
            <p className="text-xs text-[#334155] leading-relaxed whitespace-pre-wrap">
              {s.section17.declaration_text}
            </p>
            <div className="mt-4 pt-3 border-t border-[#e2e8f0] flex items-center justify-between">
              <p className="text-[11px] text-[#94a3b8]">
                Hazırlayan: <span className="font-medium text-[#64748b]">{s.section17.prepared_by}</span>
              </p>
              <p className="text-[11px] text-[#94a3b8]">
                Tarih: {fmtDate(s.section17.reconciliation_date)}
              </p>
            </div>
          </div>
          <p className="text-[11px] text-[#94a3b8] mt-2 italic">
            Bu döküman otomatik olarak hesaplanmıştır ve kriptografik parmak izi ile korunmaktadır.
          </p>
        </SectionBlock>

        {/* S18 — Shareholder Declaration */}
        <SectionBlock number={18} title="Hissedar Beyannamesi">
          <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded p-4">
            <p className="text-xs text-[#334155] leading-relaxed whitespace-pre-wrap">
              {s.section18.declaration_text}
            </p>
            {s.section18.items_reviewed.length > 0 && (
              <div className="mt-3">
                <p className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wide mb-2">İncelenen Maddeler</p>
                <ul className="space-y-0.5">
                  {s.section18.items_reviewed.map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-[#64748b]">
                      <span className="text-green-600 flex-shrink-0">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </SectionBlock>

        {/* S19 — Signoffs */}
        <SectionBlock number={19} title="Ortak İmzaları">
          <SignoffPanel
            snapshotId={snapshot.id}
            signoffs={snapshot.signoffs}
            isImmutable={snapshot.is_immutable}
          />
        </SectionBlock>

        {/* Confidence factors */}
        {snapshot.confidence_factors && snapshot.confidence_factors.length > 0 && (
          <div className="bg-white border border-[#e2e8f0] rounded">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-[#e2e8f0] bg-[#f8fafc]">
              <span className="text-xs font-black text-[#0f172a] uppercase tracking-widest">Güven Faktörleri</span>
              <ConfidenceBadge score={snapshot.confidence_score} />
            </div>
            <div className="px-5 py-4">
              <div className="space-y-2">
                {snapshot.confidence_factors.map((f, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className={`w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center ${
                      f.passed ? 'bg-green-100' : 'bg-red-100'
                    }`}>
                      <span className={`text-[9px] font-bold ${f.passed ? 'text-green-700' : 'text-red-700'}`}>
                        {f.passed ? '✓' : '✗'}
                      </span>
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-[#0f172a]">{f.name}</p>
                        <span className="text-[11px] text-[#94a3b8] flex-shrink-0">{f.weight} puan</span>
                      </div>
                      <p className="text-[11px] text-[#94a3b8]">{f.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

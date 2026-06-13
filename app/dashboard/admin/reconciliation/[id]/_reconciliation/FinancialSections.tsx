// Reconciliation sections 2–8 (financial position: Treasury, Receivables,
// Payables, Inventory, Fixed Assets, Tax Position, Financing). Extracted
// verbatim from the 1008-line detail page. Pure presentational server component
// driven by the ReconciliationData snapshot; uses the shared section helpers.
import type {
  ReconciliationData,
  ReconSection2_Treasury,
  ReconSection3_Receivables,
  ReconSection4_Payables,
  ReconSection5_Inventory,
  ReconSection6_FixedAssets,
  ReconSection7_TaxPosition,
  ReconSection8_Financing,
} from '@/types/reconciliation'
import { fmtDate } from '@/lib/format'
import { fmt, pct, SectionBlock, KV, SimpleTable, AgingTable } from './components'

export function FinancialSections({ s }: { s: ReconciliationData }) {
  return (
    <>
        {/* S2 — Treasury */}
        <SectionBlock number={2} title="Hazine & Nakit">
          {(() => {
            const t2 = s.section2 as ReconSection2_Treasury
            return (
              <>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="bg-[#f8fafc] border border-[#e8eaef] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Toplam Nakit</p>
                    <p className="text-sm font-bold text-[#0f172a]">{fmt(t2.total_cash_try)}</p>
                  </div>
                  <div className="bg-[#f8fafc] border border-[#e8eaef] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Kullanılabilir</p>
                    <p className="text-sm font-bold text-[#0f172a]">{fmt(t2.available_cash_try)}</p>
                  </div>
                  <div className="bg-[#f8fafc] border border-[#e8eaef] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Bloke</p>
                    <p className="text-sm font-bold text-[#0f172a]">{fmt(t2.restricted_cash_try)}</p>
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
                  <div className="bg-[#f8fafc] border border-[#e8eaef] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Toplam Alacak</p>
                    <p className="text-sm font-bold text-[#0f172a]">{fmt(t3.total_receivables_try)}</p>
                  </div>
                  <div className="bg-[#f8fafc] border border-[#e8eaef] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Vadesi Geçmiş</p>
                    <p className="text-sm font-bold text-red-700">{fmt(t3.overdue_receivables_try)}</p>
                  </div>
                  <div className="bg-[#f8fafc] border border-[#e8eaef] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Şüpheli Alacak</p>
                    <p className="text-sm font-bold text-amber-700">{fmt(t3.doubtful_try)}</p>
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
                  <div className="bg-[#f8fafc] border border-[#e8eaef] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Toplam Borç</p>
                    <p className="text-sm font-bold text-[#0f172a]">{fmt(t4.total_payables_try)}</p>
                  </div>
                  <div className="bg-[#f8fafc] border border-[#e8eaef] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">7 Gün İçinde</p>
                    <p className="text-sm font-bold text-red-700">{fmt(t4.upcoming_7d_try)}</p>
                  </div>
                  <div className="bg-[#f8fafc] border border-[#e8eaef] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">30 Gün İçinde</p>
                    <p className="text-sm font-bold text-amber-700">{fmt(t4.upcoming_30d_try)}</p>
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
                  <div className="bg-[#f8fafc] border border-[#e8eaef] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Toplam Değer</p>
                    <p className="text-sm font-bold text-[#0f172a]">{fmt(t5.total_inventory_try)}</p>
                  </div>
                  <div className="bg-[#f8fafc] border border-[#e8eaef] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Ürün Sayısı</p>
                    <p className="text-sm font-bold text-[#0f172a]">{t5.item_count}</p>
                  </div>
                  <div className="bg-[#f8fafc] border border-[#e8eaef] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Kritik Stok</p>
                    <p className="text-sm font-bold text-red-700">{t5.critical_stock_count}</p>
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
                  <div className="bg-[#f8fafc] border border-[#e8eaef] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Brüt Değer</p>
                    <p className="text-sm font-bold text-[#0f172a]">{fmt(t6.total_gross_try)}</p>
                  </div>
                  <div className="bg-[#f8fafc] border border-[#e8eaef] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Birikim Amortisman</p>
                    <p className="text-sm font-bold text-[#64748b]">{fmt(t6.accumulated_depreciation)}</p>
                  </div>
                  <div className="bg-[#f8fafc] border border-[#e8eaef] rounded px-3 py-2">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Net Defter Değeri</p>
                    <p className="text-sm font-bold text-[#0f172a]">{fmt(t6.net_carrying_value)}</p>
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
                  <div className="bg-[#f8fafc] border border-[#e8eaef] rounded px-3 py-2 inline-block">
                    <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-0.5">Toplam Borç</p>
                    <p className="text-sm font-bold text-[#0f172a]">{fmt(t8.total_debt_try)}</p>
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
    </>
  )
}

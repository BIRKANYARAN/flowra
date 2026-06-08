'use client'

import { getSaleCurrency } from '@/lib/product-adapter'
import { IL, LAB, currSym } from '@/app/dashboard/simulation/_components/types'
import type { Currency, Product } from '@/app/dashboard/simulation/_components/types'

interface InputPanelProps {
  products: Product[]
  productId: string
  manualCost: string
  catalogPrice: string
  monthlyQty: string
  discount: string
  interestRate: string
  saleDate: string
  displayCurrency: Currency
  collectionDelay: string
  extraPartnerDebt: string
  fxRates: { USD: number; EUR: number }
  policyRates: { TRY: number; USD: number; EUR: number }
  selectedProduct: Product | null
  backendRealCost: number | null
  recurringLoading: boolean
  holdingDays: number
  entryDate: string | null
  collectionDelayPct: number
  hasScenario: boolean
  onProductChange: (id: string) => void
  onManualCostChange: (v: string) => void
  onCatalogPriceChange: (v: string) => void
  onMonthlyQtyChange: (v: string) => void
  onDiscountChange: (v: string) => void
  onInterestRateChange: (v: string) => void
  onSaleDateChange: (v: string) => void
  onDisplayCurrencyChange: (c: Currency) => void
  onCollectionDelayChange: (v: string) => void
  onExtraPartnerDebtChange: (v: string) => void
}

export function InputPanel({
  products,
  productId,
  manualCost,
  catalogPrice,
  monthlyQty,
  discount,
  interestRate,
  saleDate,
  collectionDelay,
  extraPartnerDebt,
  policyRates,
  selectedProduct,
  recurringLoading,
  holdingDays,
  entryDate,
  collectionDelayPct,
  hasScenario,
  onProductChange,
  onManualCostChange,
  onCatalogPriceChange,
  onMonthlyQtyChange,
  onDiscountChange,
  onInterestRateChange,
  onSaleDateChange,
  onCollectionDelayChange,
  onExtraPartnerDebtChange,
}: InputPanelProps) {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Parametreler</h2>
        <span className="text-[10px] text-[#94a3b8] italic">Sonuçlar yukarıda otomatik güncellenir ↑</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className={LAB}>Ürün Seç (opsiyonel)</label>
          <select
            className={IL}
            value={productId}
            onChange={e => {
              onProductChange(e.target.value)
            }}
          >
            <option value="">-- Manuel giris --</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.sku || '-'})</option>
            ))}
          </select>
        </div>

        <div>
          <label className={LAB}>Birim Maliyet</label>
          <input
            type="number" min="0" step="0.01"
            className={IL}
            value={manualCost}
            onChange={e => onManualCostChange(e.target.value)}
            placeholder="0.00"
          />
        </div>

        <div>
          <label className={LAB}>Katalog Fiyatı</label>
          <input
            type="number" min="0" step="0.01"
            className={IL}
            value={catalogPrice}
            onChange={e => onCatalogPriceChange(e.target.value)}
            placeholder="0.00"
          />
        </div>

        <div>
          <label className={LAB}>Aylık Satış Adedi</label>
          <input
            type="number" min="0" step="1"
            className={IL}
            value={monthlyQty}
            onChange={e => onMonthlyQtyChange(e.target.value)}
            placeholder="100"
          />
        </div>

        <div>
          <label className={LAB}>İskonto (%)</label>
          <input
            type="number" min="0" max="100" step="0.1"
            className={IL}
            value={discount}
            onChange={e => onDiscountChange(e.target.value)}
            placeholder="0"
          />
        </div>

        <div>
          <label className={LAB}>
            Yıllık Faiz Oranı (%)
            {selectedProduct && (
              <span className="text-brand-light normal-case font-normal ml-1">
                — {getSaleCurrency(selectedProduct) ?? 'TRY'}
              </span>
            )}
          </label>
          <input
            type="number" min="0" step="0.1"
            className={IL}
            value={interestRate}
            onChange={e => onInterestRateChange(e.target.value)}
            placeholder={String(policyRates.TRY)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className={LAB}>Satış Tarihi</label>
          <input
            type="date"
            className={IL}
            value={saleDate}
            onChange={e => onSaleDateChange(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <div className="bg-info-light border border-info-light rounded px-4 py-2.5 text-xs text-info-text w-full">
            ℹ Giderler tekrarlı gider planından otomatik hesaplanır
            {recurringLoading && <span className="ml-2 opacity-60">yükleniyor…</span>}
          </div>
        </div>
        <div className="flex items-end">
          <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-4 py-2.5 text-xs w-full">
            <span className="text-[#94a3b8] uppercase tracking-wide font-semibold block mb-0.5">Stok Tutma Süresi</span>
            <span className="font-bold text-[#334155]">
              {holdingDays} gün
              {holdingDays >= 30 && <span className="text-[#94a3b8] font-normal"> ({(holdingDays / 30).toFixed(1)} ay)</span>}
            </span>
            {!entryDate && !productId && (
              <span className="text-warn-text ml-2">(varsayılan 30 gün)</span>
            )}
            {!entryDate && productId && (
              <span className="text-warn-text ml-2">(stok lotu bulunamadı)</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Senaryo Katmanları ──────────────────────────────────────────────── */}
      <div className="pt-3 border-t border-dashed border-[#e2e8f0]">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Senaryo Katmanları</span>
          <span className="text-[10px] text-[#94a3b8] font-normal">— isteğe bağlı · baskı haritasını etkiler</span>
          {hasScenario && (
            <span className="ml-auto text-[10px] bg-warn-light text-warn-text border border-warn-light rounded px-2 py-0.5 font-bold">
              Senaryo aktif
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={LAB}>
              Tahsilat Gecikmesi — %{collectionDelayPct}
              {collectionDelayPct > 0 && (
                <span className="text-warn normal-case font-normal ml-1">
                  (gelirin %{collectionDelayPct}&apos;i gecikmeli)
                </span>
              )}
            </label>
            <input
              type="range" min="0" max="50" step="5"
              className="w-full accent-amber-500 h-2 cursor-pointer"
              value={collectionDelay}
              onChange={e => onCollectionDelayChange(e.target.value)}
            />
            <div className="flex justify-between text-[10px] text-[#94a3b8] mt-0.5">
              <span>%0 (normal)</span>
              <span>%50 (yarı tahsilat)</span>
            </div>
          </div>
          <div>
            <label className={LAB}>Ek Ortak Borcu (₺)</label>
            <input
              type="number" min="0" step="1000"
              className={IL}
              value={extraPartnerDebt}
              onChange={e => onExtraPartnerDebtChange(e.target.value)}
              placeholder="0"
            />
            <div className="text-[10px] text-[#94a3b8] mt-0.5">
              Hipotetik borç ekle — borç temizleme süresini etkiler
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

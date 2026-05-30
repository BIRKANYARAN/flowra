'use client'

// ── AbcInventoryPanel — Unified ABC + velocity inventory view ─────────────────
// Uses mock data (8 products) demonstrating ABC tiers, velocity profiles,
// urgency badges and stock value.

import { useState, useMemo } from 'react'
import { classifyVelocity, computeWeeksOfStock } from '@/lib/services/inventory/abc-analysis.service'

// ── Types ─────────────────────────────────────────────────────────────────────

type AbcTier = 'A' | 'B' | 'C'
type VelocityClass = 'fast' | 'medium' | 'slow' | 'dead'
type UrgencyLabel = 'KRİTİK' | 'YAKINDA' | 'SAĞLIKLI' | 'DURGUN'

interface MockProduct {
  id:           string
  name:         string
  sku:          string
  tier:         AbcTier
  stockQty:     number
  dailyVelocity: number
  stockValue:   number
  revenueShare: number
}

// ── Mock data (8 products across all tiers) ───────────────────────────────────

const MOCK_PRODUCTS: MockProduct[] = [
  { id: 'p1', name: 'Ahşap Masa 120cm',   sku: 'TBL-120', tier: 'A', stockQty: 45,  dailyVelocity: 3.2,  stockValue: 85_000,  revenueShare: 22.4 },
  { id: 'p2', name: 'Deri Koltuk Takımı', sku: 'SOF-LTH', tier: 'A', stockQty: 28,  dailyVelocity: 2.1,  stockValue: 62_000,  revenueShare: 18.7 },
  { id: 'p3', name: 'Yemek Masası Seti',  sku: 'DIN-SET', tier: 'A', stockQty: 12,  dailyVelocity: 6.8,  stockValue: 54_500,  revenueShare: 16.2 },
  { id: 'p4', name: 'Kitaplık 5 Raflı',   sku: 'BKS-005', tier: 'A', stockQty: 8,   dailyVelocity: 8.4,  stockValue: 38_200,  revenueShare: 14.1 },
  { id: 'p5', name: 'Çalışma Sandalyesi', sku: 'CHR-WRK', tier: 'B', stockQty: 65,  dailyVelocity: 1.4,  stockValue: 28_000,  revenueShare: 7.8  },
  { id: 'p6', name: 'Sehpa Cam Üstlü',    sku: 'TBL-GLS', tier: 'B', stockQty: 32,  dailyVelocity: 0.8,  stockValue: 12_400,  revenueShare: 5.2  },
  { id: 'p7', name: 'Dekoratif Vazo',     sku: 'DEC-VZO', tier: 'C', stockQty: 140, dailyVelocity: 0.05, stockValue: 4_500,   revenueShare: 1.6  },
  { id: 'p8', name: 'Çerçeve 30x40',      sku: 'FRM-304', tier: 'C', stockQty: 220, dailyVelocity: 0,    stockValue: 3_200,   revenueShare: 0.9  },
]

// ── Helper functions ──────────────────────────────────────────────────────────

function getUrgencyLabel(dailyVelocity: number, weeksOfStock: number | null): UrgencyLabel {
  if (dailyVelocity <= 0 || weeksOfStock === null) return 'DURGUN'
  const daysLeft = weeksOfStock * 7
  if (daysLeft <= 14) return 'KRİTİK'
  if (daysLeft <= 28) return 'YAKINDA'
  return 'SAĞLIKLI'
}

function urgencyBadgeClass(urgency: UrgencyLabel): string {
  switch (urgency) {
    case 'KRİTİK': return 'bg-neg-light text-neg-text'
    case 'YAKINDA': return 'bg-orange-50 text-orange-700'
    case 'SAĞLIKLI': return 'bg-pos-light text-pos-text'
    case 'DURGUN':   return 'bg-[#f1f5f9] text-[#64748b]'
  }
}

function urgencyDot(urgency: UrgencyLabel): string {
  switch (urgency) {
    case 'KRİTİK': return 'bg-neg'
    case 'YAKINDA': return 'bg-orange-500'
    case 'SAĞLIKLI': return 'bg-pos'
    case 'DURGUN':   return 'bg-[#94a3b8]'
  }
}

function tierBadgeClass(tier: AbcTier): string {
  switch (tier) {
    case 'A': return 'bg-violet-100 text-violet-700'
    case 'B': return 'bg-blue-100 text-blue-700'
    case 'C': return 'bg-[#f1f5f9] text-[#64748b]'
  }
}

function velocityLabel(v: VelocityClass): string {
  switch (v) {
    case 'fast':   return 'Hızlı'
    case 'medium': return 'Orta'
    case 'slow':   return 'Yavaş'
    case 'dead':   return 'Durgun'
  }
}

function velocityColor(v: VelocityClass): string {
  switch (v) {
    case 'fast':   return 'text-pos-text'
    case 'medium': return 'text-brand'
    case 'slow':   return 'text-warn-text'
    case 'dead':   return 'text-[#94a3b8]'
  }
}

function fmtTurkish(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `₺${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `₺${(n / 1_000).toFixed(0)}B`
  return `₺${n.toFixed(0)}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AbcInventoryPanel() {
  const [tierFilter, setTierFilter] = useState<AbcTier | 'ALL'>('ALL')
  const [search, setSearch]         = useState('')
  const [showUrgentOnly, setShowUrgentOnly] = useState(false)

  const enriched = useMemo(() =>
    MOCK_PRODUCTS.map(p => {
      const weeks        = computeWeeksOfStock(p.stockQty, p.dailyVelocity)
      const vClass       = classifyVelocity(p.dailyVelocity)
      const urgency      = getUrgencyLabel(p.dailyVelocity, weeks)
      return { ...p, weeks, vClass, urgency }
    }),
  [])

  const filtered = useMemo(() => enriched.filter(p => {
    if (tierFilter !== 'ALL' && p.tier !== tierFilter) return false
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) &&
        !p.sku.toLowerCase().includes(search.toLowerCase())) return false
    if (showUrgentOnly && p.urgency !== 'KRİTİK' && p.urgency !== 'YAKINDA') return false
    return true
  }), [enriched, tierFilter, search, showUrgentOnly])

  // Summary counts
  const totalSku     = MOCK_PRODUCTS.length
  const aCount       = MOCK_PRODUCTS.filter(p => p.tier === 'A').length
  const criticalCount = enriched.filter(p => p.urgency === 'KRİTİK').length
  const deadCount     = enriched.filter(p => p.urgency === 'DURGUN').length

  return (
    <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#e2e8f0]">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
              Stok Yonetimi
            </span>
            <span className="ml-2 text-[10px] text-[#94a3b8]">— ABC sinifi + hiz analizi</span>
          </div>
          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Tier filter */}
            <div className="flex items-center gap-1">
              {(['ALL', 'A', 'B', 'C'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTierFilter(t)}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded transition-colors ${
                    tierFilter === t
                      ? t === 'A' ? 'bg-violet-100 text-violet-700'
                        : t === 'B' ? 'bg-blue-100 text-blue-700'
                        : t === 'C' ? 'bg-[#e2e8f0] text-[#475569]'
                        : 'bg-[#0f172a] text-white'
                      : 'bg-[#f8fafc] text-[#94a3b8] hover:bg-[#f1f5f9]'
                  }`}
                >
                  {t === 'ALL' ? 'Tumu' : t}
                </button>
              ))}
            </div>
            {/* Search */}
            <input
              type="text"
              placeholder="Ara..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="text-xs border border-[#e2e8f0] rounded px-2 py-0.5 w-28 text-[#334155] placeholder:text-[#94a3b8] focus:outline-none focus:border-brand"
            />
            {/* Urgent-only toggle */}
            <button
              onClick={() => setShowUrgentOnly(!showUrgentOnly)}
              className={`text-[10px] font-bold px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
                showUrgentOnly ? 'bg-neg-light text-neg-text' : 'bg-[#f8fafc] text-[#94a3b8] hover:bg-[#f1f5f9]'
              }`}
            >
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${showUrgentOnly ? 'bg-neg' : 'bg-[#94a3b8]'}`} />
              Acil Uyari {criticalCount > 0 && <span className="ml-0.5">{criticalCount}</span>}
            </button>
          </div>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#e2e8f0] border-b border-[#e2e8f0]">
        {[
          { label: 'Toplam SKU',  value: String(totalSku),    sub: 'aktif urun',          color: 'text-[#0f172a]' },
          { label: 'A-Urunler',   value: String(aCount),      sub: 'gelirin ~%71\'i',      color: 'text-violet-700' },
          { label: 'Kritik Stok', value: String(criticalCount), sub: '≤14 gun kaldi',      color: criticalCount > 0 ? 'text-neg' : 'text-[#94a3b8]' },
          { label: 'Durgun',      value: String(deadCount),   sub: 'hicbir satisi yok',   color: deadCount > 0 ? 'text-warn-text' : 'text-[#94a3b8]' },
        ].map(card => (
          <div key={card.label} className="px-4 py-3">
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{card.label}</div>
            <div className={`text-xl font-black tabular-nums leading-none ${card.color}`}>{card.value}</div>
            <div className="text-[10px] text-[#94a3b8] mt-0.5">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Stock table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] bg-[#f8fafc] border-b border-[#e2e8f0]">
              <th className="text-left px-5 py-2.5">Urun</th>
              <th className="text-center px-3 py-2.5">Tier</th>
              <th className="text-right px-3 py-2.5">Stok</th>
              <th className="text-right px-3 py-2.5">Gunluk Hiz</th>
              <th className="text-right px-3 py-2.5">Stokout</th>
              <th className="text-center px-3 py-2.5">Durum</th>
              <th className="text-right px-5 py-2.5">Stok Degeri</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f5f9]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-[#94a3b8] text-xs">
                  Filtreye uygun urun bulunamadi
                </td>
              </tr>
            ) : (
              filtered.map(p => {
                const daysLeft = p.weeks !== null ? Math.round(p.weeks * 7) : null
                const stockoutDisplay = daysLeft !== null
                  ? `${daysLeft}g kaldi`
                  : '∞ (durgun)'

                return (
                  <tr key={p.id} className="hover:bg-[#f8fafc]/60">
                    <td className="px-5 py-3">
                      <div className="font-semibold text-[#0f172a]">{p.name}</div>
                      <div className="text-[10px] font-mono text-[#94a3b8]">{p.sku}</div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded ${tierBadgeClass(p.tier)}`}>
                        {p.tier}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-[#334155] font-semibold">
                      {fmtTurkish(p.stockQty)}
                    </td>
                    <td className={`px-3 py-3 text-right tabular-nums font-semibold ${velocityColor(p.vClass)}`}>
                      {p.dailyVelocity > 0
                        ? `${p.dailyVelocity.toFixed(1)}/gun`
                        : '—'}
                      <div className="text-[10px] font-normal text-[#94a3b8]">
                        {velocityLabel(p.vClass)}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-[#64748b]">
                      {stockoutDisplay}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded ${urgencyBadgeClass(p.urgency)}`}>
                        <span className={`w-1.5 h-1.5 rounded-full inline-block ${urgencyDot(p.urgency)}`} />
                        {p.urgency}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold text-brand">
                      {fmtCurrency(p.stockValue)}
                      <div className="text-[10px] font-normal text-[#94a3b8]">
                        %{p.revenueShare.toFixed(1)} gelir
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <div className="px-5 py-3 border-t border-[#e2e8f0] bg-[#f8fafc]">
        <span className="text-[10px] text-[#94a3b8]">
          A sinifi urunler gelirin ~%70\'ini olusturur — stok onceligi bu urunlerde yuksek tutulmalidir.
          {' '}KRiTiK uyarilarda en kisa surede siparis verin.
        </span>
      </div>
    </div>
  )
}
